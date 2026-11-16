#pragma once

#include <windows.h>
#include <string>
#include <atomic>
#include <thread>

namespace campusflow {

class SessionLauncher {
public:
    SessionLauncher();
    ~SessionLauncher();

    void Start(const std::wstring& monitorExePath);
    void Stop();

    void NotifySessionChange(DWORD eventType, DWORD sessionId);

private:
    void SupervisorThread();
    bool LaunchMonitorInSession(DWORD sessionId);
    void TerminateMonitor();

    std::wstring m_monitorPath;
    std::atomic<bool> m_running{ false };
    std::thread m_workerThread;
    HANDLE m_hProcess = NULL;
    DWORD m_activeSessionId = 0xFFFFFFFF;
};

} // namespace campusflow

