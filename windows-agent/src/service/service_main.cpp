// windows-agent/src/service/service_main.cpp
// Native Windows Service (Session 0) for CampusFlow Exam Monitoring.
// Manages backend authentication, heartbeats, named pipe IPC, and launches
// the desktop monitor into the interactive user session.

#include "common/types.h"
#include "common/config_manager.h"
#include "common/logging.h"
#include "common/utf8.h"
#include "service/http_client.h"
#include "service/pipe_server.h"
#include "service/session_launcher.h"

#include <windows.h>
#include <iostream>
#include <atomic>
#include <thread>
#include <chrono>

namespace campusflow {

constexpr const wchar_t* SERVICE_NAME = L"CampusFlowService";
constexpr const wchar_t* DISPLAY_NAME = L"CampusFlow Exam Monitoring Service";

SERVICE_STATUS        g_ServiceStatus = { 0 };
SERVICE_STATUS_HANDLE g_StatusHandle = NULL;
std::atomic<bool>     g_ServiceRunning{ false };
HANDLE                g_ServiceStopEvent = INVALID_HANDLE_VALUE;

PipeServer            g_PipeServer;
SessionLauncher       g_SessionLauncher;
HttpClient            g_HttpClient;
std::thread           g_HeartbeatThread;
std::thread           g_EventSenderThread;

std::string GetLocalHostname() {
    char name[256] = { 0 };
    DWORD size = sizeof(name);
    if (GetComputerNameA(name, &size)) {
        return std::string(name);
    }
    return "WINDOWS-PC";
}

std::wstring GetExecutableDir() {
    wchar_t path[MAX_PATH];
    GetModuleFileNameW(NULL, path, MAX_PATH);
    std::wstring p(path);
    size_t lastSlash = p.find_last_of(L"\\/");
    if (lastSlash != std::wstring::npos) {
        return p.substr(0, lastSlash);
    }
    return L".";
}

void EventSenderLoop(const std::string& serverUrl, std::string token) {
    Logger::Info("Event sender worker thread started.");
    while (g_ServiceRunning) {
        std::vector<TelemetryEvent> batch = g_PipeServer.PopEventBatch(50, 1000);
        if (batch.empty() || !g_ServiceRunning) continue;

        if (token.empty()) {
            token = ConfigManager::LoadToken();
            if (token.empty()) {
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }
        }

        int accepted = 0;
        HttpResponse resp = g_HttpClient.SendEvents(serverUrl, token, batch, accepted);

        if (resp.success) {
            Logger::Info("Dispatched " + std::to_string(batch.size()) + " telemetry events to backend (accepted: " + std::to_string(accepted) + ")");
        } else {
            Logger::Warn("Failed to send events (HTTP " + std::to_string(resp.status_code) + "): " + resp.error_message + ". Re-queuing...");
            if (resp.status_code != 401 && resp.status_code != 400) {
                g_PipeServer.RequeueEvents(batch);
                std::this_thread::sleep_for(std::chrono::seconds(3));
            }
        }
    }
    Logger::Info("Event sender worker thread stopped.");
}

void ServiceWorker() {
    Logger::Info("CampusFlowService worker initializing...");
    Config cfg = ConfigManager::LoadConfig();
    std::string token = ConfigManager::LoadToken();

    // If no token exists, register using enrollment code
    if (token.empty()) {
        if (cfg.enrollment_code.empty()) {
            Logger::Warn("No agent token and no enrollment_code configured in config.json. Waiting for enrollment configuration.");
        } else {
            Logger::Info("Registering with enrollment code: " + cfg.enrollment_code);
            std::string hostname = GetLocalHostname();
            HttpResponse regResp = g_HttpClient.RegisterAgent(cfg.server_url, cfg.enrollment_code, hostname, "1.0.0", token);
            if (regResp.success && !token.empty()) {
                ConfigManager::SaveToken(token);
                Logger::Info("Registered successfully! Token saved to agent.token.");
            } else {
                Logger::Error("Registration failed: " + regResp.error_message + " (HTTP " + std::to_string(regResp.status_code) + ")");
            }
        }
    }

    // Start named pipe server for monitor IPC
    g_PipeServer.Start();

    // Start session launcher (launches CampusFlowMonitor.exe into active interactive user desktop)
    std::wstring monitorPath = GetExecutableDir() + L"\\CampusFlowMonitor.exe";
    g_SessionLauncher.Start(monitorPath);

    // Start event sender thread
    g_EventSenderThread = std::thread(EventSenderLoop, cfg.server_url, token);

    Logger::Info("Entering periodic heartbeat loop (every 5 seconds)...");
    while (g_ServiceRunning) {
        if (token.empty()) {
            token = ConfigManager::LoadToken();
            if (token.empty() && !cfg.enrollment_code.empty()) {
                std::string hostname = GetLocalHostname();
                HttpResponse regResp = g_HttpClient.RegisterAgent(cfg.server_url, cfg.enrollment_code, hostname, "1.0.0", token);
                if (regResp.success && !token.empty()) {
                    ConfigManager::SaveToken(token);
                    Logger::Info("Registered and obtained token.");
                }
            }
        }

        if (!token.empty()) {
            std::string fgTitle, fgProc;
            g_PipeServer.GetLatestForeground(fgTitle, fgProc);

            SessionConfig session;
            HttpResponse hbResp = g_HttpClient.SendHeartbeat(cfg.server_url, token, fgTitle, fgProc, session);

            if (hbResp.success) {
                // Forward authoritative session state to monitor
                g_PipeServer.BroadcastSessionConfig(session);
            } else if (hbResp.status_code == 401) {
                Logger::Error("Token rejected (HTTP 401 Unauthorized). Token revoked or expired.");
                token.clear();
            } else {
                Logger::Warn("Heartbeat failed (HTTP " + std::to_string(hbResp.status_code) + "): " + hbResp.error_message);
            }
        }

        // Sleep 5s or until stop event signaled
        WaitForSingleObject(g_ServiceStopEvent, 5000);
    }

    g_SessionLauncher.Stop();
    g_PipeServer.Stop();
    if (g_EventSenderThread.joinable()) {
        g_EventSenderThread.join();
    }
    Logger::Info("CampusFlowService worker terminated cleanly.");
}

DWORD WINAPI ServiceCtrlHandler(DWORD dwControl, DWORD dwEventType, LPVOID lpEventData, LPVOID lpContext) {
    switch (dwControl) {
        case SERVICE_CONTROL_STOP:
        case SERVICE_CONTROL_SHUTDOWN:
            Logger::Info("Service stop request received.");
            g_ServiceStatus.dwCurrentState = SERVICE_STOP_PENDING;
            SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
            g_ServiceRunning = false;
            SetEvent(g_ServiceStopEvent);
            break;
        case SERVICE_CONTROL_SESSIONCHANGE:
            if (lpEventData) {
                WTSSESSION_NOTIFICATION* notif = reinterpret_cast<WTSSESSION_NOTIFICATION*>(lpEventData);
                g_SessionLauncher.NotifySessionChange(dwEventType, notif->dwSessionId);
            }
            break;
        default:
            break;
    }
    return NO_ERROR;
}

VOID WINAPI ServiceMain(DWORD argc, LPTSTR* argv) {
    g_StatusHandle = RegisterServiceCtrlHandlerExW(SERVICE_NAME, ServiceCtrlHandler, NULL);
    if (!g_StatusHandle) return;

    g_ServiceStatus.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    g_ServiceStatus.dwCurrentState = SERVICE_START_PENDING;
    g_ServiceStatus.dwControlsAccepted = SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN | SERVICE_ACCEPT_SESSIONCHANGE;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    g_ServiceStopEvent = CreateEventW(NULL, TRUE, FALSE, NULL);
    g_ServiceRunning = true;

    Logger::Init(ConfigManager::GetLogPath(L"service.log"), false);
    Logger::Info("CampusFlowService started under Windows SCM.");

    g_ServiceStatus.dwCurrentState = SERVICE_RUNNING;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);

    ServiceWorker();

    g_ServiceStatus.dwCurrentState = SERVICE_STOPPED;
    SetServiceStatus(g_StatusHandle, &g_ServiceStatus);
    CloseHandle(g_ServiceStopEvent);
}

bool InstallService() {
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(NULL, path, MAX_PATH)) {
        std::cout << "Error getting executable path.\n";
        return false;
    }

    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) {
        std::cout << "Failed to open Service Control Manager (run as Administrator). Error: " << GetLastError() << "\n";
        return false;
    }

    SC_HANDLE hService = CreateServiceW(
        hSCM,
        SERVICE_NAME,
        DISPLAY_NAME,
        SERVICE_ALL_ACCESS,
        SERVICE_WIN32_OWN_PROCESS,
        SERVICE_AUTO_START,
        SERVICE_ERROR_NORMAL,
        path,
        NULL, NULL, NULL, NULL, NULL
    );

    if (!hService) {
        DWORD err = GetLastError();
        if (err == ERROR_SERVICE_EXISTS) {
            std::cout << "Service already installed.\n";
        } else {
            std::cout << "Failed to create service. Error: " << err << "\n";
        }
        CloseServiceHandle(hSCM);
        return false;
    }

    std::cout << "CampusFlowService installed successfully (Automatic Startup).\n";
    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return true;
}

bool UninstallService() {
    SC_HANDLE hSCM = OpenSCManagerW(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!hSCM) {
        std::cout << "Failed to open SCM (run as Administrator). Error: " << GetLastError() << "\n";
        return false;
    }

    SC_HANDLE hService = OpenServiceW(hSCM, SERVICE_NAME, SERVICE_STOP | DELETE);
    if (!hService) {
        std::cout << "Failed to open service. Error: " << GetLastError() << "\n";
        CloseServiceHandle(hSCM);
        return false;
    }

    SERVICE_STATUS status;
    ControlService(hService, SERVICE_CONTROL_STOP, &status);

    if (DeleteService(hService)) {
        std::cout << "CampusFlowService uninstalled successfully.\n";
    } else {
        std::cout << "DeleteService failed. Error: " << GetLastError() << "\n";
    }

    CloseServiceHandle(hService);
    CloseServiceHandle(hSCM);
    return true;
}

} // namespace campusflow

int main(int argc, char* argv[]) {
    using namespace campusflow;

    if (argc > 1) {
        std::string arg = argv[1];
        if (arg == "--install") {
            return InstallService() ? 0 : 1;
        } else if (arg == "--uninstall") {
            return UninstallService() ? 0 : 1;
        } else if (arg == "--console") {
            Logger::Init(ConfigManager::GetLogPath(L"service.log"), true);
            Logger::Info("Running CampusFlowService in interactive --console mode...");
            g_ServiceRunning = true;
            g_ServiceStopEvent = CreateEventW(NULL, TRUE, FALSE, NULL);

            SetConsoleCtrlHandler([](DWORD fdwCtrlType) -> BOOL {
                Logger::Info("Console interrupt received. Shutting down...");
                g_ServiceRunning = false;
                SetEvent(g_ServiceStopEvent);
                return TRUE;
            }, TRUE);

            ServiceWorker();
            CloseHandle(g_ServiceStopEvent);
            return 0;
        }
    }

    SERVICE_TABLE_ENTRYW ServiceTable[] = {
        { const_cast<LPWSTR>(SERVICE_NAME), ServiceMain },
        { NULL, NULL }
    };

    if (!StartServiceCtrlDispatcherW(ServiceTable)) {
        DWORD err = GetLastError();
        if (err == ERROR_FAILED_SERVICE_CONTROLLER_CONNECT) {
            std::cout << "CampusFlowService must be started by the Service Control Manager.\n";
            std::cout << "Usage:\n";
            std::cout << "  CampusFlowService.exe --console     (Run interactively in console)\n";
            std::cout << "  CampusFlowService.exe --install     (Install as Windows Service)\n";
            std::cout << "  CampusFlowService.exe --uninstall   (Uninstall Windows Service)\n";
        }
        return 1;
    }

    return 0;
}

