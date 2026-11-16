#pragma once

#include <string>

namespace campusflow {

enum class LogLevel {
    Debug,
    Info,
    Warn,
    Error
};

class Logger {
public:
    static void Init(const std::wstring& logFilePath, bool consoleOutput = false);
    static void Log(LogLevel level, const std::string& message);

    static void Info(const std::string& msg)  { Log(LogLevel::Info, msg); }
    static void Warn(const std::string& msg)  { Log(LogLevel::Warn, msg); }
    static void Error(const std::string& msg) { Log(LogLevel::Error, msg); }
    static void Debug(const std::string& msg) { Log(LogLevel::Debug, msg); }
};

} // namespace campusflow

