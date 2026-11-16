#pragma once

#include "common/types.h"
#include <windows.h>
#include <string>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <thread>

namespace campusflow {

class PipeServer {
public:
    PipeServer();
    ~PipeServer();

    bool Start();
    void Stop();

    // Sends session configuration down to the monitor
    bool BroadcastSessionConfig(const SessionConfig& config);

    // Retrieves latest foreground process & title reported by monitor
    void GetLatestForeground(std::string& outTitle, std::string& outProcess);

    // Pops a batch of queued events (up to maxCount, waiting up to waitMs)
    std::vector<TelemetryEvent> PopEventBatch(size_t maxCount = 50, int waitMs = 1000);

    // Push events back into the queue if HTTP transmission fails (retry queue)
    void RequeueEvents(const std::vector<TelemetryEvent>& events);

private:
    void ListenerThread();
    void HandleClientConnection(HANDLE hPipe);
    void ProcessMessage(const std::string& msg);
    PSECURITY_DESCRIPTOR CreatePipeSecurityDescriptor();

    std::atomic<bool> m_running{ false };
    std::thread m_listenerThread;
    HANDLE m_hCurrentPipe = INVALID_HANDLE_VALUE;
    std::mutex m_pipeWriteMutex;

    // Latest foreground window data for heartbeat
    std::mutex m_fgMutex;
    std::string m_latestFgTitle;
    std::string m_latestFgProcess;

    // Producer-consumer bounded queue for events
    std::mutex m_queueMutex;
    std::condition_variable m_queueCv;
    std::deque<TelemetryEvent> m_eventQueue;
    const size_t MAX_QUEUE_SIZE = 500;
};

} // namespace campusflow

