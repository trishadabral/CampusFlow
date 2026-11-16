#include "service/session_launcher.h"
#include "common/logging.h"
#include "common/utf8.h"

#include <wtsapi32.h>
#include <userenv.h>
#include <chrono>

#pragma comment(lib, "wtsapi32.lib")
#pragma comment(lib, "userenv.lib")

namespace campusflow {

// ============================================================================
// WINDOWS SESSION 0 ISOLATION & DESKTOP INTERACTION EXPLANATION
// ============================================================================
// Since Windows Vista, all Windows Services execute strictly in Session 0,
// while interactive logged-in users are allocated Session 1, Session 2, etc.
//
// Key Constraints of Session 0 Isolation:
// 1. Session 0 is completely non-interactive. It is bound to an isolated
//    Window Station ("Service-0x0-3e7$\\Default") rather than the user desktop
//    station ("WinSta0\\Default").
// 2. Win32 desktop APIs such as GetForegroundWindow(), GetWindowText(), and
//    EnumWindows() only operate within the window station and desktop of the
//    calling thread. If called from Session 0, they return NULL or cannot see
//    any windows belonging to the exam examinee.
// 3. To overcome this limitation safely without compromising system security:
//    - The Service (Session 0) detects the active interactive user's console
//      session via WTSGetActiveConsoleSessionId().
//    - It borrows the logged-in user's token using WTSQueryUserToken() and
//      duplicates it as a Primary Token.
//    - It loads the user's desktop environment block via CreateEnvironmentBlock().
//    - It invokes CreateProcessAsUserW(), explicitly specifying lpDesktop =
//      L"WinSta0\\Default" to inject CampusFlowMonitor.exe directly into the
//      user's desktop session.
//    - CampusFlowMonitor.exe collects window and process metrics and transmits
//      them back to the Service over a secure, restricted local Named Pipe.
// ============================================================================

SessionLauncher::SessionLauncher() {}

SessionLauncher::~SessionLauncher() {
    Stop();
}

void SessionLauncher::Start(const std::wstring& monitorExePath) {
    m_monitorPath = monitorExePath;
    m_running = true;
    m_workerThread = std::thread(&SessionLauncher::SupervisorThread, this);
}

void SessionLauncher::Stop() {
    m_running = false;
    TerminateMonitor();
    if (m_workerThread.joinable()) {
        m_workerThread.join();
    }
}

void SessionLauncher::NotifySessionChange(DWORD eventType, DWORD sessionId) {
    Logger::Info("Session change notification: event=" + std::to_string(eventType) +
                 " sessionId=" + std::to_string(sessionId));
    if (eventType == WTS_SESSION_LOGON || eventType == WTS_CONSOLE_CONNECT) {
        TerminateMonitor();
    } else if (eventType == WTS_SESSION_LOGOFF || eventType == WTS_CONSOLE_DISCONNECT) {
        TerminateMonitor();
    }
}

void SessionLauncher::TerminateMonitor() {
    if (m_hProcess != NULL) {
        TerminateProcess(m_hProcess, 0);
        WaitForSingleObject(m_hProcess, 1000);
        CloseHandle(m_hProcess);
        m_hProcess = NULL;
    }
}

bool SessionLauncher::LaunchMonitorInSession(DWORD sessionId) {
    TerminateMonitor();

    HANDLE hUserToken = NULL;
    if (!WTSQueryUserToken(sessionId, &hUserToken)) {
        DWORD err = GetLastError();
        // Fallback for console debugging if running already as the interactive user
        if (err == ERROR_NO_TOKEN || err == ERROR_PRIVILEGE_NOT_HELD) {
            STARTUPINFOW si = { sizeof(si) };
            PROCESS_INFORMATION pi = { 0 };
            std::wstring cmd = L"\"" + m_monitorPath + L"\"";
            if (CreateProcessW(NULL, &cmd[0], NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
                Logger::Info("Launched monitor directly in current user context (PID=" + std::to_string(pi.dwProcessId) + ")");
                CloseHandle(pi.hThread);
                m_hProcess = pi.hProcess;
                m_activeSessionId = sessionId;
                return true;
            }
        }
        Logger::Warn("WTSQueryUserToken failed for session " + std::to_string(sessionId) +
                     " (error " + std::to_string(err) + ")");
        return false;
    }

    HANDLE hPrimaryToken = NULL;
    if (!DuplicateTokenEx(hUserToken, MAXIMUM_ALLOWED, NULL, SecurityIdentification, TokenPrimary, &hPrimaryToken)) {
        Logger::Error("DuplicateTokenEx failed: " + std::to_string(GetLastError()));
        CloseHandle(hUserToken);
        return false;
    }
    CloseHandle(hUserToken);

    LPVOID lpEnv = NULL;
    if (!CreateEnvironmentBlock(&lpEnv, hPrimaryToken, FALSE)) {
        Logger::Warn("CreateEnvironmentBlock failed: " + std::to_string(GetLastError()));
    }

    STARTUPINFOW si = { 0 };
    si.cb = sizeof(si);
    si.lpDesktop = const_cast<LPWSTR>(L"WinSta0\\Default");

    PROCESS_INFORMATION pi = { 0 };
    std::wstring cmd = L"\"" + m_monitorPath + L"\"";

    DWORD creationFlags = CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW;
    BOOL ok = CreateProcessAsUserW(
        hPrimaryToken,
        NULL,
        &cmd[0],
        NULL,
        NULL,
        FALSE,
        creationFlags,
        lpEnv,
        NULL,
        &si,
        &pi
    );

    if (lpEnv) DestroyEnvironmentBlock(lpEnv);
    CloseHandle(hPrimaryToken);

    if (!ok) {
        Logger::Error("CreateProcessAsUserW failed to spawn monitor in Session " +
                      std::to_string(sessionId) + " (error " + std::to_string(GetLastError()) + ")");
        return false;
    }

    Logger::Info("Successfully launched CampusFlowMonitor.exe into Session " +
                 std::to_string(sessionId) + " (PID=" + std::to_string(pi.dwProcessId) + ")");

    CloseHandle(pi.hThread);
    m_hProcess = pi.hProcess;
    m_activeSessionId = sessionId;
    return true;
}

void SessionLauncher::SupervisorThread() {
    Logger::Info("Monitor supervisor thread started.");

    while (m_running) {
        DWORD currentSession = WTSGetActiveConsoleSessionId();

        if (currentSession == 0xFFFFFFFF || currentSession == 0) {
            // No active interactive console session (machine at lock screen or booting)
            TerminateMonitor();
            std::this_thread::sleep_for(std::chrono::seconds(2));
            continue;
        }

        // Check if monitor process is still healthy
        bool needsLaunch = false;
        if (m_hProcess == NULL || currentSession != m_activeSessionId) {
            needsLaunch = true;
        } else {
            DWORD exitCode = 0;
            if (GetExitCodeProcess(m_hProcess, &exitCode) && exitCode != STILL_ACTIVE) {
                Logger::Warn("CampusFlowMonitor.exe exited unexpectedly (code " +
                             std::to_string(exitCode) + "). Restarting...");
                CloseHandle(m_hProcess);
                m_hProcess = NULL;
                needsLaunch = true;
            }
        }

        if (needsLaunch && m_running) {
            LaunchMonitorInSession(currentSession);
        }

        std::this_thread::sleep_for(std::chrono::seconds(2));
    }

    TerminateMonitor();
    Logger::Info("Monitor supervisor thread terminated.");
}

} // namespace campusflow

