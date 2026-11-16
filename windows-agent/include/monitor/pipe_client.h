#pragma once

#include "common/types.h"
#include <windows.h>
#include <string>
#include <mutex>
#include <atomic>
#include <thread>

namespace campusflow {

class PipeClient {
public:
    PipeClient();
    ~PipeClient();

    bool Start();
    void Stop();

    bool IsConnected() const;

    bool SendHeartbeatData(const std::string& title, const std::string& process);
    bool SendEvent(const TelemetryEvent& ev);

    SessionConfig GetSessionConfig();

private:
    void ReaderThread();
    bool EnsureConnected();
    bool WriteMessage(const std::string& jsonLine);

    std::atomic<bool> m_running{ false };
    std::thread m_readerThread;

    HANDLE m_hPipe = INVALID_HANDLE_VALUE;
    std::mutex m_pipeMutex;

    std::mutex m_sessionMutex;
    SessionConfig m_currentSession;
};

} // namespace campusflow

