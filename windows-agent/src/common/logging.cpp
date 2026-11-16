#include "common/logging.h"
#include "common/utf8.h"
#include <windows.h>
#include <fstream>
#include <iostream>
#include <mutex>

namespace campusflow {

static std::wstring s_logPath;
static bool s_consoleOutput = true;
static std::mutex s_logMutex;
constexpr uintmax_t MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

void Logger::Init(const std::wstring& logFilePath, bool consoleOutput) {
    std::lock_guard<std::mutex> lock(s_logMutex);
    s_logPath = logFilePath;
    s_consoleOutput = consoleOutput;

    // Create directories if necessary
    size_t lastSlash = logFilePath.find_last_of(L"\\/");
    if (lastSlash != std::wstring::npos) {
        std::wstring dir = logFilePath.substr(0, lastSlash);
        CreateDirectoryW(dir.c_str(), NULL);
    }
}

static const char* LevelToString(LogLevel level) {
    switch (level) {
        case LogLevel::Debug: return "DEBUG";
        case LogLevel::Info:  return "INFO";
        case LogLevel::Warn:  return "WARN";
        case LogLevel::Error: return "ERROR";
        default: return "INFO";
    }
}

void Logger::Log(LogLevel level, const std::string& message) {
    std::lock_guard<std::mutex> lock(s_logMutex);
    std::string timestamp = GetCurrentIsoTimestamp();
    std::string line = "[" + timestamp + "] [" + LevelToString(level) + "] " + message + "\n";

    if (s_consoleOutput) {
        std::cout << line;
        std::cout.flush();
    }

    if (!s_logPath.empty()) {
        // Simple rotation check
        WIN32_FILE_ATTRIBUTE_DATA fad;
        if (GetFileAttributesExW(s_logPath.c_str(), GetFileExInfoStandard, &fad)) {
            ULARGE_INTEGER size;
            size.HighPart = fad.nFileSizeHigh;
            size.LowPart = fad.nFileSizeLow;
            if (size.QuadPart > MAX_LOG_SIZE_BYTES) {
                std::wstring backupPath = s_logPath + L".old";
                MoveFileExW(s_logPath.c_str(), backupPath.c_str(), MOVEFILE_REPLACE_EXISTING);
            }
        }

        std::ofstream file(s_logPath, std::ios::app | std::ios::binary);
        if (file.is_open()) {
            file << line;
            file.flush();
        }
    }
}

} // namespace campusflow

