// windows-agent/src/monitor/monitor_main.cpp
// Interactive Desktop Monitor for CampusFlow Windows Agent.
// Executes in the logged-in user desktop session (WinSta0\Default) to detect
// foreground window titles, process names, focus loss, and prohibited processes.

#include "common/types.h"
#include "common/config_manager.h"
#include "common/logging.h"
#include "common/utf8.h"
#include "monitor/pipe_client.h"
#include "monitor/window_detector.h"
#include "monitor/process_detector.h"

#include <windows.h>
#include <iostream>
#include <atomic>
#include <chrono>

namespace campusflow {

std::atomic<bool> g_MonitorRunning{ true };

BOOL WINAPI ConsoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_CLOSE_EVENT || ctrlType == CTRL_SHUTDOWN_EVENT) {
        Logger::Info("Monitor termination signal received.");
        g_MonitorRunning = false;
        return TRUE;
    }
    return FALSE;
}

} // namespace campusflow

int main(int argc, char* argv[]) {
    using namespace campusflow;

    SetConsoleCtrlHandler(ConsoleCtrlHandler, TRUE);

    Logger::Init(ConfigManager::GetLogPath(L"monitor.log"), true);
    Logger::Info("CampusFlowMonitor.exe started in interactive user session.");

    Config config = ConfigManager::LoadConfig();
    uint32_t pollIntervalMs = config.poll_ms > 100 ? config.poll_ms : 500;

    PipeClient pipeClient;
    pipeClient.Start();

    WindowDetector windowDetector;
    ProcessDetector processDetector;

    std::wstring lastTitleW, lastProcW;

    while (g_MonitorRunning) {
        // 1. Fetch current foreground window details
        std::wstring currentTitleW, currentProcW;
        windowDetector.GetForegroundWindowInfo(currentTitleW, currentProcW);

        std::string currentTitle = WideToUtf8(currentTitleW);
        std::string currentProc = WideToUtf8(currentProcW);

        // Report foreground data periodically to service
        if (currentTitleW != lastTitleW || currentProcW != lastProcW) {
            pipeClient.SendHeartbeatData(currentTitle, currentProc);
            lastTitleW = currentTitleW;
            lastProcW = currentProcW;
        }

        // 2. Query session configuration received from the service
        SessionConfig session = pipeClient.GetSessionConfig();

        // 3. Scan windows and processes if session is active
        if (session.is_active) {
            auto winEvents = windowDetector.PollWindows(session.exam_window_keyword, true);
            for (const auto& ev : winEvents) {
                pipeClient.SendEvent(ev);
            }

            auto procEvents = processDetector.PollProhibitedProcesses(session.prohibited_processes, true);
            for (const auto& ev : procEvents) {
                pipeClient.SendEvent(ev);
            }
        } else {
            windowDetector.PollWindows("", false);
            processDetector.PollProhibitedProcesses({}, false);
        }

        Sleep(pollIntervalMs);
    }

    pipeClient.Stop();
    Logger::Info("CampusFlowMonitor.exe terminated cleanly.");
    return 0;
}

