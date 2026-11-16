#pragma once

#include "common/types.h"
#include <windows.h>
#include <string>
#include <vector>
#include <chrono>

namespace campusflow {

struct WindowInfo {
    HWND hwnd = NULL;
    std::wstring title;
    std::wstring process_name;
    bool is_minimized = false;
};

class WindowDetector {
public:
    WindowDetector();

    // Queries current foreground window title and process name
    bool GetForegroundWindowInfo(std::wstring& outTitle, std::wstring& outProcess);

    // Scans window states and evaluates exam window compliance
    std::vector<TelemetryEvent> PollWindows(const std::string& examWindowKeyword, bool isSessionActive);

    void Reset();

private:
    HWND FindExamWindow(const std::wstring& keywordLower);

    bool m_hadExamWindow = false;
    HWND m_lastExamHwnd = NULL;
    bool m_wasExamInForeground = false;
    bool m_wasExamMinimized = false;

    std::chrono::steady_clock::time_point m_examWindowLostTime;
    bool m_closedReported = false;

    // Debouncing cache: event_type + process_name -> last emit time
    std::string m_lastEmittedEventType;
    std::string m_lastEmittedProc;
    std::chrono::steady_clock::time_point m_lastEmitTime;
};

} // namespace campusflow

