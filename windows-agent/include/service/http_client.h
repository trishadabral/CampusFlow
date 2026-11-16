#pragma once

#include "common/types.h"
#include <string>
#include <vector>

namespace campusflow {

struct HttpResponse {
    int status_code = 0;
    std::string body;
    std::string error_message;
    bool success = false;
};

class HttpClient {
public:
    HttpClient();
    ~HttpClient();

    // POST /api/agent/register
    HttpResponse RegisterAgent(const std::string& baseUrl,
                               const std::string& enrollmentCode,
                               const std::string& hostname,
                               const std::string& agentVersion,
                               std::string& outToken);

    // POST /api/agent/heartbeat
    HttpResponse SendHeartbeat(const std::string& baseUrl,
                              const std::string& token,
                              const std::string& foregroundTitle,
                              const std::string& foregroundProcess,
                              SessionConfig& outSession);

    // POST /api/agent/events
    HttpResponse SendEvents(const std::string& baseUrl,
                            const std::string& token,
                            const std::vector<TelemetryEvent>& events,
                            int& outAcceptedCount);

private:
    HttpResponse Request(const std::string& method,
                         const std::string& fullUrl,
                         const std::string& jsonBody,
                         const std::string& bearerToken);
};

} // namespace campusflow

