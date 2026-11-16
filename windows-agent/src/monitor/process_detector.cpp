#include "monitor/process_detector.h"
#include "common/logging.h"
#include "common/utf8.h"

#include <tlhelp32.h>
#include <algorithm>

namespace campusflow {

ProcessDetector::ProcessDetector() {
    Reset();
}

void ProcessDetector::Reset() {
    m_reportedPids.clear();
    m_lastScanTime = std::chrono::steady_clock::time_point();
}

std::vector<TelemetryEvent> ProcessDetector::PollProhibitedProcesses(const std::vector<std::string>& prohibitedList, bool isSessionActive) {
    std::vector<TelemetryEvent> events;

    if (!isSessionActive || prohibitedList.empty()) {
        Reset();
        return events;
    }

    auto now = std::chrono::steady_clock::now();
    if (m_lastScanTime != std::chrono::steady_clock::time_point()) {
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - m_lastScanTime).count();
        if (elapsed < 2) {
            return events; // scan every 2 seconds
        }
    }
    m_lastScanTime = now;

    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) {
        Logger::Warn("CreateToolhelp32Snapshot failed: " + std::to_string(GetLastError()));
        return events;
    }

    PROCESSENTRY32W pe = { sizeof(pe) };
    std::set<DWORD> currentRunningPids;
    std::string timestamp = GetCurrentIsoTimestamp();

    if (Process32FirstW(hSnapshot, &pe)) {
        do {
            currentRunningPids.insert(pe.th32ProcessID);

            std::wstring exeNameW = ToLowerW(pe.szExeFile);
            std::string exeName = WideToUtf8(exeNameW);

            // Check if exe is in prohibited blacklist
            bool isProhibited = false;
            for (const auto& prohibited : prohibitedList) {
                if (exeName == prohibited) {
                    isProhibited = true;
                    break;
                }
            }

            if (isProhibited) {
                // Report once per PID instance
                if (m_reportedPids.find(pe.th32ProcessID) == m_reportedPids.end()) {
                    m_reportedPids.insert(pe.th32ProcessID);

                    TelemetryEvent ev;
                    ev.event_type = "PROHIBITED_PROCESS";
                    ev.window_title = exeName;
                    ev.process_name = exeName;
                    ev.occurred_at = timestamp;
                    events.push_back(ev);

                    Logger::Warn("Detected prohibited process: " + exeName + " (PID " + std::to_string(pe.th32ProcessID) + ")");
                }
            }
        } while (Process32NextW(hSnapshot, &pe));
    }

    CloseHandle(hSnapshot);

    // Clean up exited PIDs from tracking set
    for (auto it = m_reportedPids.begin(); it != m_reportedPids.end(); ) {
        if (currentRunningPids.find(*it) == currentRunningPids.end()) {
            it = m_reportedPids.erase(it);
        } else {
            ++it;
        }
    }

    return events;
}

} // namespace campusflow

