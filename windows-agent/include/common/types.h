#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace campusflow {

struct Config {
    std::string server_url = "http://localhost:5000";
    std::string enrollment_code = "";
    uint32_t poll_ms = 500;
};

struct TelemetryEvent {
    std::string event_type;    // FOCUS_LOST, WINDOW_SWITCH, WINDOW_MINIMIZED, WINDOW_CLOSED, PROHIBITED_PROCESS
    std::string window_title;  // UTF-8, max 255 chars
    std::string process_name;  // UTF-8, max 255 chars
    std::string occurred_at;   // ISO-8601 UTC string (YYYY-MM-DDTHH:MM:SS.sssZ)
};

struct SessionConfig {
    bool is_active = false;
    int session_id = 0;
    std::string student_name;
    std::string exam_window_keyword = "CampusFlow";
    std::string ends_at;
    std::vector<std::string> prohibited_processes;
};

// Named Pipe name for IPC between Service (Session 0) and Monitor (User Session)
constexpr const wchar_t* MONITOR_PIPE_NAME = L"\\\\.\\pipe\\CampusFlowMonitorPipe";
constexpr uint32_t MAX_PIPE_MESSAGE_BYTES = 64 * 1024; // 64 KB protective limit

} // namespace campusflow

