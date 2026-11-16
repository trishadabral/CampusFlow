#include "monitor/pipe_client.h"
#include "common/logging.h"
#include "common/utf8.h"
#include <nlohmann/json.hpp>
#include <chrono>

using json = nlohmann::json;

namespace campusflow {

PipeClient::PipeClient() {}

PipeClient::~PipeClient() {
    Stop();
}

bool PipeClient::Start() {
    m_running = true;
    m_readerThread = std::thread(&PipeClient::ReaderThread, this);
    return true;
}

void PipeClient::Stop() {
    m_running = false;
    {
        std::lock_guard<std::mutex> lock(m_pipeMutex);
        if (m_hPipe != INVALID_HANDLE_VALUE) {
            CloseHandle(m_hPipe);
            m_hPipe = INVALID_HANDLE_VALUE;
        }
    }
    if (m_readerThread.joinable()) {
        m_readerThread.join();
    }
}

bool PipeClient::IsConnected() const {
    return m_hPipe != INVALID_HANDLE_VALUE;
}

bool PipeClient::EnsureConnected() {
    std::lock_guard<std::mutex> lock(m_pipeMutex);
    if (m_hPipe != INVALID_HANDLE_VALUE) return true;

    m_hPipe = CreateFileW(
        MONITOR_PIPE_NAME,
        GENERIC_READ | GENERIC_WRITE,
        0, NULL, OPEN_EXISTING, 0, NULL
    );

    if (m_hPipe == INVALID_HANDLE_VALUE) {
        return false;
    }

    DWORD dwMode = PIPE_READMODE_MESSAGE;
    if (!SetNamedPipeHandleState(m_hPipe, &dwMode, NULL, NULL)) {
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
        return false;
    }

    Logger::Info("Connected to CampusFlow Service Named Pipe.");
    return true;
}

bool PipeClient::WriteMessage(const std::string& jsonLine) {
    std::lock_guard<std::mutex> lock(m_pipeMutex);
    if (m_hPipe == INVALID_HANDLE_VALUE) {
        return false;
    }

    DWORD bytesWritten = 0;
    BOOL ok = WriteFile(m_hPipe, jsonLine.data(), static_cast<DWORD>(jsonLine.length()), &bytesWritten, NULL);
    if (!ok) {
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
        return false;
    }
    return true;
}

bool PipeClient::SendHeartbeatData(const std::string& title, const std::string& process) {
    if (!EnsureConnected()) return false;

    json j = {
        {"type", "heartbeat_data"},
        {"foreground_title", title},
        {"foreground_process", process}
    };
    return WriteMessage(j.dump() + "\n");
}

bool PipeClient::SendEvent(const TelemetryEvent& ev) {
    if (!EnsureConnected()) return false;

    json j = {
        {"type", "event"},
        {"event_type", ev.event_type},
        {"window_title", ev.window_title},
        {"process_name", ev.process_name},
        {"occurred_at", ev.occurred_at}
    };
    return WriteMessage(j.dump() + "\n");
}

SessionConfig PipeClient::GetSessionConfig() {
    std::lock_guard<std::mutex> lock(m_sessionMutex);
    return m_currentSession;
}

void PipeClient::ReaderThread() {
    std::vector<char> buffer(MAX_PIPE_MESSAGE_BYTES);

    while (m_running) {
        if (!EnsureConnected()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
            continue;
        }

        HANDLE hPipeCopy = INVALID_HANDLE_VALUE;
        {
            std::lock_guard<std::mutex> lock(m_pipeMutex);
            hPipeCopy = m_hPipe;
        }

        if (hPipeCopy == INVALID_HANDLE_VALUE) continue;

        DWORD bytesRead = 0;
        BOOL readOk = ReadFile(hPipeCopy, buffer.data(), static_cast<DWORD>(buffer.size()) - 1, &bytesRead, NULL);

        if (readOk && bytesRead > 0) {
            buffer[bytesRead] = '\0';
            try {
                json j = json::parse(buffer.data());
                if (j.value("type", "") == "session_config") {
                    std::lock_guard<std::mutex> lock(m_sessionMutex);
                    m_currentSession.is_active = j.value("is_active", false);
                    m_currentSession.session_id = j.value("session_id", 0);
                    m_currentSession.student_name = j.value("student_name", "");
                    m_currentSession.exam_window_keyword = j.value("keyword", "CampusFlow");

                    m_currentSession.prohibited_processes.clear();
                    if (j.contains("prohibited") && j["prohibited"].is_array()) {
                        for (const auto& p : j["prohibited"]) {
                            if (p.is_string()) {
                                m_currentSession.prohibited_processes.push_back(ToLowerAscii(p.get<std::string>()));
                            }
                        }
                    }
                }
            } catch (const std::exception& e) {
                Logger::Warn("Error parsing session config from service: " + std::string(e.what()));
            }
        } else {
            // Disconnected from pipe
            std::lock_guard<std::mutex> lock(m_pipeMutex);
            if (m_hPipe != INVALID_HANDLE_VALUE) {
                CloseHandle(m_hPipe);
                m_hPipe = INVALID_HANDLE_VALUE;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }
    }
}

} // namespace campusflow

