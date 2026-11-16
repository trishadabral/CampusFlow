#include "service/http_client.h"
#include "common/logging.h"
#include "common/utf8.h"
#include <nlohmann/json.hpp>

#include <windows.h>
#include <winhttp.h>
#include <iostream>

#pragma comment(lib, "winhttp.lib")

using json = nlohmann::json;

namespace campusflow {

HttpClient::HttpClient() {}
HttpClient::~HttpClient() {}

HttpResponse HttpClient::Request(const std::string& method,
                                 const std::string& fullUrl,
                                 const std::string& jsonBody,
                                 const std::string& bearerToken) {
    HttpResponse resp;

    std::wstring wUrl = Utf8ToWide(fullUrl);
    URL_COMPONENTS urlComp = { 0 };
    urlComp.dwStructSize = sizeof(urlComp);
    urlComp.dwSchemeLength    = (DWORD)-1;
    urlComp.dwHostNameLength  = (DWORD)-1;
    urlComp.dwUrlPathLength   = (DWORD)-1;
    urlComp.dwExtraInfoLength = (DWORD)-1;

    if (!WinHttpCrackUrl(wUrl.c_str(), (DWORD)wUrl.length(), 0, &urlComp)) {
        resp.error_message = "Invalid URL format: " + fullUrl;
        return resp;
    }

    std::wstring hostName(urlComp.lpszHostName, urlComp.dwHostNameLength);
    std::wstring urlPath(urlComp.lpszUrlPath, urlComp.dwUrlPathLength);
    if (urlComp.dwExtraInfoLength > 0) {
        urlPath.append(urlComp.lpszExtraInfo, urlComp.dwExtraInfoLength);
    }
    INTERNET_PORT port = urlComp.nPort;
    bool isHttps = (urlComp.nScheme == INTERNET_SCHEME_HTTPS);

    HINTERNET hSession = WinHttpOpen(L"CampusFlowWindowsAgent/1.0",
                                     WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                     WINHTTP_NO_PROXY_NAME,
                                     WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) {
        resp.error_message = "WinHttpOpen failed: " + std::to_string(GetLastError());
        return resp;
    }

    // Set 5-second timeouts: resolve (5s), connect (5s), send (5s), receive (5s)
    WinHttpSetTimeouts(hSession, 5000, 5000, 5000, 5000);

    HINTERNET hConnect = WinHttpConnect(hSession, hostName.c_str(), port, 0);
    if (!hConnect) {
        resp.error_message = "WinHttpConnect failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hSession);
        return resp;
    }

    std::wstring wMethod = Utf8ToWide(method);
    DWORD flags = isHttps ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, wMethod.c_str(), urlPath.c_str(),
                                           NULL, WINHTTP_NO_REFERER,
                                           WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hRequest) {
        resp.error_message = "WinHttpOpenRequest failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return resp;
    }

    std::wstring headers = L"Content-Type: application/json\r\n";
    if (!bearerToken.empty()) {
        headers += L"Authorization: Bearer " + Utf8ToWide(bearerToken) + L"\r\n";
    }

    BOOL sendOk = WinHttpSendRequest(hRequest,
                                     headers.c_str(), (DWORD)headers.length(),
                                     (LPVOID)jsonBody.data(), (DWORD)jsonBody.length(),
                                     (DWORD)jsonBody.length(), 0);

    if (!sendOk) {
        resp.error_message = "WinHttpSendRequest failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return resp;
    }

    if (!WinHttpReceiveResponse(hRequest, NULL)) {
        resp.error_message = "WinHttpReceiveResponse failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return resp;
    }

    DWORD statusCode = 0;
    DWORD statusSize = sizeof(statusCode);
    WinHttpQueryHeaders(hRequest,
                        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX,
                        &statusCode, &statusSize, WINHTTP_NO_HEADER_INDEX);
    resp.status_code = static_cast<int>(statusCode);

    std::string responseBody;
    DWORD bytesAvailable = 0;
    while (WinHttpQueryDataAvailable(hRequest, &bytesAvailable) && bytesAvailable > 0) {
        std::vector<char> buffer(bytesAvailable);
        DWORD bytesRead = 0;
        if (WinHttpReadData(hRequest, buffer.data(), bytesAvailable, &bytesRead) && bytesRead > 0) {
            responseBody.append(buffer.data(), bytesRead);
        }
    }

    resp.body = responseBody;
    resp.success = (resp.status_code >= 200 && resp.status_code < 300);

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return resp;
}

HttpResponse HttpClient::RegisterAgent(const std::string& baseUrl,
                                       const std::string& enrollmentCode,
                                       const std::string& hostname,
                                       const std::string& agentVersion,
                                       std::string& outToken) {
    json payload = {
        {"enrollment_code", enrollmentCode},
        {"hostname", hostname},
        {"agent_version", agentVersion}
    };

    std::string url = baseUrl + "/api/agent/register";
    HttpResponse resp = Request("POST", url, payload.dump(), "");

    if (resp.success) {
        try {
            json resJson = json::parse(resp.body);
            if (resJson.contains("agent_token") && resJson["agent_token"].is_string()) {
                outToken = resJson["agent_token"].get<std::string>();
            } else {
                resp.success = false;
                resp.error_message = "Missing agent_token in response";
            }
        } catch (const std::exception& e) {
            resp.success = false;
            resp.error_message = std::string("JSON parse error: ") + e.what();
        }
    }

    return resp;
}

HttpResponse HttpClient::SendHeartbeat(const std::string& baseUrl,
                                       const std::string& token,
                                       const std::string& foregroundTitle,
                                       const std::string& foregroundProcess,
                                       SessionConfig& outSession) {
    json payload = json::object();
    if (!foregroundTitle.empty()) payload["foreground_title"] = foregroundTitle;
    if (!foregroundProcess.empty()) payload["foreground_process"] = foregroundProcess;

    std::string url = baseUrl + "/api/agent/heartbeat";
    HttpResponse resp = Request("POST", url, payload.dump(), token);

    if (resp.success) {
        try {
            json resJson = json::parse(resp.body);

            // Parse prohibited processes
            outSession.prohibited_processes.clear();
            if (resJson.contains("prohibited_processes") && resJson["prohibited_processes"].is_array()) {
                for (const auto& item : resJson["prohibited_processes"]) {
                    if (item.is_string()) {
                        outSession.prohibited_processes.push_back(ToLowerAscii(item.get<std::string>()));
                    }
                }
            }

            // Parse session – null‑safe extraction of fields
            if (resJson.contains("session") && !resJson["session"].is_null()) {
                const json& s = resJson["session"];
                // Helper for optional string fields (null => default)
                auto getStr = [&s](const char* key, const std::string& def) -> std::string {
                    if (s.contains(key) && s[key].is_string()) return s[key].get<std::string>();
                    return def;
                };
                outSession.is_active = true;
                outSession.session_id = (s.contains("session_id") && s["session_id"].is_number_integer())
                                            ? s["session_id"].get<int>() : 0;
                outSession.student_name = getStr("student_name", "");
                outSession.exam_window_keyword = getStr("exam_window_keyword", "CampusFlow");
                outSession.ends_at = getStr("ends_at", "");
            } else {
                outSession.is_active = false;
                outSession.session_id = 0;
                outSession.student_name = "";
                outSession.exam_window_keyword = "CampusFlow";
            }
        } catch (const std::exception& e) {
            resp.success = false;
            resp.error_message = std::string("JSON parse error: ") + e.what();
        }
    }

    return resp;
}

HttpResponse HttpClient::SendEvents(const std::string& baseUrl,
                                    const std::string& token,
                                    const std::vector<TelemetryEvent>& events,
                                    int& outAcceptedCount) {
    json eventArray = json::array();
    for (const auto& ev : events) {
        eventArray.push_back({
            {"event_type", ev.event_type},
            {"window_title", ev.window_title},
            {"process_name", ev.process_name},
            {"occurred_at", ev.occurred_at}
        });
    }

    json payload = { {"events", eventArray} };
    std::string url = baseUrl + "/api/agent/events";
    HttpResponse resp = Request("POST", url, payload.dump(), token);

    if (resp.success) {
        try {
            json resJson = json::parse(resp.body);
            outAcceptedCount = resJson.value("accepted", 0);
        } catch (...) {
            outAcceptedCount = static_cast<int>(events.size());
        }
    }

    return resp;
}

} // namespace campusflow

