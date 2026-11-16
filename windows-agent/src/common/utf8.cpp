#include "common/utf8.h"
#include <algorithm>
#include <iomanip>
#include <sstream>
#include <sys/timeb.h>
#include <ctime>

namespace campusflow {

std::wstring Utf8ToWide(const std::string& str) {
    if (str.empty()) return std::wstring();
    int sizeNeeded = MultiByteToWideChar(CP_UTF8, 0, str.data(), static_cast<int>(str.size()), NULL, 0);
    if (sizeNeeded <= 0) return std::wstring();
    std::wstring result(sizeNeeded, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.data(), static_cast<int>(str.size()), &result[0], sizeNeeded);
    return result;
}

std::string WideToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int sizeNeeded = WideCharToMultiByte(CP_UTF8, 0, wstr.data(), static_cast<int>(wstr.size()), NULL, 0, NULL, NULL);
    if (sizeNeeded <= 0) return std::string();
    std::string result(sizeNeeded, 0);
    WideCharToMultiByte(CP_UTF8, 0, wstr.data(), static_cast<int>(wstr.size()), &result[0], sizeNeeded, NULL, NULL);
    return result;
}

std::string TruncateUtf8(const std::string& str, size_t max_len) {
    if (str.length() <= max_len) return str;
    return str.substr(0, max_len);
}

std::string ToLowerAscii(std::string str) {
    std::transform(str.begin(), str.end(), str.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return str;
}

std::wstring ToLowerW(std::wstring wstr) {
    std::transform(wstr.begin(), wstr.end(), wstr.begin(), [](wchar_t c) {
        return static_cast<wchar_t>(towlower(c));
    });
    return wstr;
}

std::string GetCurrentIsoTimestamp() {
    SYSTEMTIME st;
    GetSystemTime(&st);

    char buf[64];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
             st.wYear, st.wMonth, st.wDay,
             st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
    return std::string(buf);
}

} // namespace campusflow

