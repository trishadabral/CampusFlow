#include "service/pipe_server.h"
#include "common/logging.h"
#include "common/utf8.h"
#include <nlohmann/json.hpp>

#include <sddl.h>
#include <chrono>

using json = nlohmann::json;

namespace campusflow {

PipeServer::PipeServer() {}

PipeServer::~PipeServer() {
    Stop();
}

PSECURITY_DESCRIPTOR PipeServer::CreatePipeSecurityDescriptor() {
    // SDDL: Allow SYSTEM (SY) Generic All (GA), Admins (BA) Generic All (GA), Interactive Users (IU) Generic Read/Write (GRGW)
    LPCWSTR sddl = L"D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)";
    PSECURITY_DESCRIPTOR pSD = NULL;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &pSD, NULL)) {
        Logger::Warn("Failed to create pipe security descriptor from SDDL");
        return NULL;
    }
    return pSD;
}

bool PipeServer::Start() {
    m_running = true;
    m_listenerThread = std::thread(&PipeServer::ListenerThread, this);
    return true;
}

void PipeServer::Stop() {
    m_running = false;
    m_queueCv.notify_all();

    {
        std::lock_guard<std::mutex> lock(m_pipeWriteMutex);
        if (m_hCurrentPipe != INVALID_HANDLE_VALUE) {
            CloseHandle(m_hCurrentPipe);
            m_hCurrentPipe = INVALID_HANDLE_VALUE;
        }
    }

    // Connect to named pipe briefly to unblock ConnectNamedPipe if waiting
    HANDLE hDummy = CreateFileW(
        MONITOR_PIPE_NAME,
        GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, 0, NULL
    );
    if (hDummy != INVALID_HANDLE_VALUE) {
        CloseHandle(hDummy);
    }

    if (m_listenerThread.joinable()) {
        m_listenerThread.join();
    }
}

void PipeServer::ListenerThread() {
    Logger::Info("Named pipe listener thread started on " + WideToUtf8(MONITOR_PIPE_NAME));

    SECURITY_ATTRIBUTES sa = { sizeof(sa) };
    sa.bInheritHandle = FALSE;
    PSECURITY_DESCRIPTOR pSD = CreatePipeSecurityDescriptor();
    sa.lpSecurityDescriptor = pSD;

    while (m_running) {
        HANDLE hPipe = CreateNamedPipeW(
            MONITOR_PIPE_NAME,
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_UNLIMITED_INSTANCES,
            MAX_PIPE_MESSAGE_BYTES,
            MAX_PIPE_MESSAGE_BYTES,
            5000,
            pSD ? &sa : NULL
        );

        if (hPipe == INVALID_HANDLE_VALUE) {
            Logger::Error("CreateNamedPipeW failed: " + std::to_string(GetLastError()));
            std::this_thread::sleep_for(std::chrono::seconds(1));
            continue;
        }

        OVERLAPPED ovConnect = { 0 };
        ovConnect.hEvent = CreateEventW(NULL, TRUE, FALSE, NULL);

        BOOL connectOk = ConnectNamedPipe(hPipe, &ovConnect);
        DWORD err = GetLastError();

        if (!connectOk && err == ERROR_IO_PENDING) {
            while (m_running) {
                DWORD waitRes = WaitForSingleObject(ovConnect.hEvent, 500);
                if (waitRes == WAIT_OBJECT_0) {
                    connectOk = TRUE;
                    break;
                }
            }
        } else if (!connectOk && err == ERROR_PIPE_CONNECTED) {
            connectOk = TRUE;
        }

        CloseHandle(ovConnect.hEvent);

        if (connectOk && m_running) {
            Logger::Info("Client connected to named pipe.");
            HandleClientConnection(hPipe);
        } else {
            CloseHandle(hPipe);
        }
    }

    if (pSD) LocalFree(pSD);
    Logger::Info("Named pipe listener thread ended.");
}

void PipeServer::HandleClientConnection(HANDLE hPipe) {
    {
        std::lock_guard<std::mutex> lock(m_pipeWriteMutex);
        m_hCurrentPipe = hPipe;
    }

    std::vector<char> buffer(MAX_PIPE_MESSAGE_BYTES);
    OVERLAPPED ovRead = { 0 };
    ovRead.hEvent = CreateEventW(NULL, TRUE, FALSE, NULL);

    while (m_running) {
        ResetEvent(ovRead.hEvent);
        DWORD bytesRead = 0;
        BOOL readOk = ReadFile(hPipe, buffer.data(), static_cast<DWORD>(buffer.size()) - 1, &bytesRead, &ovRead);

        if (!readOk) {
            DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                while (m_running) {
                    DWORD waitRes = WaitForSingleObject(ovRead.hEvent, 500);
                    if (waitRes == WAIT_OBJECT_0) {
                        readOk = GetOverlappedResult(hPipe, &ovRead, &bytesRead, FALSE);
                        break;
                    }
                }
            } else {
                // Client disconnected or pipe broke
                break;
            }
        }

        if (readOk && bytesRead > 0) {
            buffer[bytesRead] = '\0';
            std::string message(buffer.data(), bytesRead);
            ProcessMessage(message);
        } else if (!m_running) {
            break;
        }
    }

    CloseHandle(ovRead.hEvent);
    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);

    {
        std::lock_guard<std::mutex> lock(m_pipeWriteMutex);
        if (m_hCurrentPipe == hPipe) {
            m_hCurrentPipe = INVALID_HANDLE_VALUE;
        }
    }
    Logger::Info("Client disconnected from named pipe.");
}

void PipeServer::ProcessMessage(const std::string& msg) {
    try {
        json j = json::parse(msg);
        std::string type = j.value("type", "");

        if (type == "heartbeat_data") {
            std::lock_guard<std::mutex> lock(m_fgMutex);
            m_latestFgTitle = j.value("foreground_title", "");
            m_latestFgProcess = j.value("foreground_process", "");
        } else if (type == "event") {
            TelemetryEvent ev;
            ev.event_type = j.value("event_type", "");
            ev.window_title = TruncateUtf8(j.value("window_title", ""), 255);
            ev.process_name = TruncateUtf8(j.value("process_name", ""), 255);
            ev.occurred_at = j.value("occurred_at", "");

            if (!ev.event_type.empty() && !ev.occurred_at.empty()) {
                std::lock_guard<std::mutex> lock(m_queueMutex);
                if (m_eventQueue.size() >= MAX_QUEUE_SIZE) {
                    m_eventQueue.pop_front(); // drop oldest to maintain bounded capacity
                }
                m_eventQueue.push_back(ev);
                m_queueCv.notify_one();
                Logger::Info("Queued event from monitor: " + ev.event_type + " (" + ev.process_name + ")");
            }
        }
    } catch (const std::exception& e) {
        Logger::Warn("Invalid or malformed pipe JSON received: " + std::string(e.what()));
    }
}

bool PipeServer::BroadcastSessionConfig(const SessionConfig& config) {
    std::lock_guard<std::mutex> lock(m_pipeWriteMutex);
    if (m_hCurrentPipe == INVALID_HANDLE_VALUE) {
        return false;
    }

    json j = {
        {"type", "session_config"},
        {"is_active", config.is_active},
        {"session_id", config.session_id},
        {"student_name", config.student_name},
        {"keyword", config.exam_window_keyword},
        {"prohibited", config.prohibited_processes}
    };

    std::string payload = j.dump() + "\n";
    DWORD bytesWritten = 0;
    OVERLAPPED ovWrite = { 0 };
    ovWrite.hEvent = CreateEventW(NULL, TRUE, FALSE, NULL);

    BOOL ok = WriteFile(m_hCurrentPipe, payload.data(), static_cast<DWORD>(payload.size()), &bytesWritten, &ovWrite);
    if (!ok && GetLastError() == ERROR_IO_PENDING) {
        if (WaitForSingleObject(ovWrite.hEvent, 1000) == WAIT_OBJECT_0) {
            ok = GetOverlappedResult(m_hCurrentPipe, &ovWrite, &bytesWritten, FALSE);
        } else {
            CancelIo(m_hCurrentPipe);
            ok = FALSE;
        }
    }

    CloseHandle(ovWrite.hEvent);
    return ok == TRUE;
}

void PipeServer::GetLatestForeground(std::string& outTitle, std::string& outProcess) {
    std::lock_guard<std::mutex> lock(m_fgMutex);
    outTitle = m_latestFgTitle;
    outProcess = m_latestFgProcess;
}

std::vector<TelemetryEvent> PipeServer::PopEventBatch(size_t maxCount, int waitMs) {
    std::unique_lock<std::mutex> lock(m_queueMutex);
    if (m_eventQueue.empty()) {
        m_queueCv.wait_for(lock, std::chrono::milliseconds(waitMs), [this]() {
            return !m_eventQueue.empty() || !m_running;
        });
    }

    std::vector<TelemetryEvent> batch;
    while (!m_eventQueue.empty() && batch.size() < maxCount) {
        batch.push_back(m_eventQueue.front());
        m_eventQueue.pop_front();
    }
    return batch;
}

void PipeServer::RequeueEvents(const std::vector<TelemetryEvent>& events) {
    if (events.empty()) return;
    std::lock_guard<std::mutex> lock(m_queueMutex);
    // Push back in reverse order to front
    for (auto it = events.rbegin(); it != events.rend(); ++it) {
        if (m_eventQueue.size() >= MAX_QUEUE_SIZE) {
            break;
        }
        m_eventQueue.push_front(*it);
    }
}

} // namespace campusflow

