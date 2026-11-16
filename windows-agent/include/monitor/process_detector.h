#pragma once

#include "common/types.h"
#include <windows.h>
#include <string>
#include <vector>
#include <set>
#include <chrono>

namespace campusflow {

class ProcessDetector {
public:
    ProcessDetector();

    // Scans running processes against the prohibited blacklist every 2s
    std::vector<TelemetryEvent> PollProhibitedProcesses(const std::vector<std::string>& prohibitedList, bool isSessionActive);

    void Reset();

private:
    std::set<DWORD> m_reportedPids;
    std::chrono::steady_clock::time_point m_lastScanTime;
};

} // namespace campusflow

