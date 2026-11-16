#include "monitor/window_detector.h"
#include "common/logging.h"
#include "common/utf8.h"

#include <psapi.h>
#include <algorithm>

namespace campusflow {

struct EnumContext {
    std::wstring keywordLower;
    HWND foundHwnd = NULL;
};

static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    if (!IsWindowVisible(hwnd)) return TRUE;

    // Check title length
    int len = GetWindowTextLengthW(hwnd);
    if (len == 0) return TRUE;

    std::vector<wchar_t> titleBuf(len + 1);
    GetWindowTextW(hwnd, titleBuf.data(), len + 1);
    std::wstring title = ToLowerW(titleBuf.data());

    EnumContext* ctx = reinterpret_cast<EnumContext*>(lParam);
    if (title.find(ctx->keywordLower) != std::wstring::npos) {
        ctx->foundHwnd = hwnd;
        return FALSE; // found exam window
    }
    return TRUE;
}

WindowDetector::WindowDetector() {
    Reset();
}

void WindowDetector::Reset() {
    m_hadExamWindow = false;
    m_lastExamHwnd = NULL;
    m_wasExamInForeground = false;
    m_wasExamMinimized = false;
    m_closedReported = false;
    m_lastEmittedEventType.clear();
    m_lastEmittedProc.clear();
}

static std::wstring GetProcessNameFromHwnd(HWND hwnd) {
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0) return L"unknown.exe";

    HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!hProc) return L"unknown.exe";

    wchar_t pathBuf[MAX_PATH];
    DWORD size = MAX_PATH;
    std::wstring procName = L"unknown.exe";
    if (QueryFullProcessImageNameW(hProc, 0, pathBuf, &size)) {
        std::wstring p(pathBuf);
        size_t lastSlash = p.find_last_of(L"\\/");
        if (lastSlash != std::wstring::npos) {
            procName = p.substr(lastSlash + 1);
        } else {
            procName = p;
        }
    }
    CloseHandle(hProc);
    return procName;
}

bool WindowDetector::GetForegroundWindowInfo(std::wstring& outTitle, std::wstring& outProcess) {
    HWND fg = GetForegroundWindow();
    if (!fg) {
        outTitle = L"";
        outProcess = L"";
        return false;
    }

    wchar_t titleBuf[512] = { 0 };
    GetWindowTextW(fg, titleBuf, 512);
    outTitle = titleBuf;
    outProcess = GetProcessNameFromHwnd(fg);
    return true;
}

HWND WindowDetector::FindExamWindow(const std::wstring& keywordLower) {
    EnumContext ctx;
    ctx.keywordLower = keywordLower;
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&ctx));
    return ctx.foundHwnd;
}

std::vector<TelemetryEvent> WindowDetector::PollWindows(const std::string& examWindowKeyword, bool isSessionActive) {
    std::vector<TelemetryEvent> events;

    std::wstring fgTitleW, fgProcW;
    GetForegroundWindowInfo(fgTitleW, fgProcW);

    if (!isSessionActive) {
        Reset();
        return events;
    }

    std::wstring keywordW = ToLowerW(Utf8ToWide(examWindowKeyword));
    if (keywordW.empty()) keywordW = L"campusflow";

    HWND examHwnd = FindExamWindow(keywordW);
    auto now = std::chrono::steady_clock::now();
    std::string timestamp = GetCurrentIsoTimestamp();

    std::string currentFgTitle = WideToUtf8(fgTitleW);
    std::string currentFgProc = WideToUtf8(fgProcW);

    // 1. Exam window existence and closure detection
    if (examHwnd != NULL) {
        m_hadExamWindow = true;
        m_lastExamHwnd = examHwnd;
        m_closedReported = false;
        m_examWindowLostTime = std::chrono::steady_clock::time_point();

        // 2. Exam window minimized check
        bool isMinimized = IsIconic(examHwnd) != 0;
        if (isMinimized && !m_wasExamMinimized) {
            TelemetryEvent ev;
            ev.event_type = "WINDOW_MINIMIZED";
            ev.window_title = currentFgTitle;
            ev.process_name = currentFgProc;
            ev.occurred_at = timestamp;
            events.push_back(ev);
            Logger::Info("Detected event: WINDOW_MINIMIZED");
        }
        m_wasExamMinimized = isMinimized;

        // 3. Foreground Focus Lost & Window Switch check
        HWND fgHwnd = GetForegroundWindow();
        bool isExamForeground = (fgHwnd == examHwnd);

        if (!isExamForeground && m_wasExamInForeground) {
            // Focus just left the exam window
            TelemetryEvent focusLost;
            focusLost.event_type = "FOCUS_LOST";
            focusLost.window_title = currentFgTitle;
            focusLost.process_name = currentFgProc;
            focusLost.occurred_at = timestamp;
            events.push_back(focusLost);

            TelemetryEvent winSwitch;
            winSwitch.event_type = "WINDOW_SWITCH";
            winSwitch.window_title = currentFgTitle;
            winSwitch.process_name = currentFgProc;
            winSwitch.occurred_at = timestamp;
            events.push_back(winSwitch);

            Logger::Info("Detected event: FOCUS_LOST & WINDOW_SWITCH (" + currentFgProc + ": " + currentFgTitle + ")");
        }
        m_wasExamInForeground = isExamForeground;

    } else {
        // Exam window not found
        if (m_hadExamWindow && !m_closedReported) {
            if (m_examWindowLostTime == std::chrono::steady_clock::time_point()) {
                m_examWindowLostTime = now;
            } else {
                auto duration = std::chrono::duration_cast<std::chrono::seconds>(now - m_examWindowLostTime).count();
                if (duration >= 3) {
                    m_closedReported = true;
                    TelemetryEvent ev;
                    ev.event_type = "WINDOW_CLOSED";
                    ev.window_title = "Exam Window Closed";
                    ev.process_name = currentFgProc;
                    ev.occurred_at = timestamp;
                    events.push_back(ev);
                    Logger::Info("Detected event: WINDOW_CLOSED (Exam window missing > 3s)");
                }
            }
        }
        m_wasExamInForeground = false;
        m_wasExamMinimized = false;
    }

    return events;
}

} // namespace campusflow

