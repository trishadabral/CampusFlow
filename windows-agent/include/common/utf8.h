#pragma once

#include <string>
#include <windows.h>

namespace campusflow {

// Converts UTF-8 std::string to UTF-16 std::wstring
std::wstring Utf8ToWide(const std::string& str);

// Converts UTF-16 std::wstring to UTF-8 std::string
std::string WideToUtf8(const std::wstring& wstr);

// Truncates a UTF-8 string safely up to max_len characters
std::string TruncateUtf8(const std::string& str, size_t max_len);

// Converts string to lowercase ASCII
std::string ToLowerAscii(std::string str);
std::wstring ToLowerW(std::wstring wstr);

// Returns ISO-8601 formatted UTC timestamp with milliseconds: YYYY-MM-DDTHH:MM:SS.sssZ
std::string GetCurrentIsoTimestamp();

} // namespace campusflow

