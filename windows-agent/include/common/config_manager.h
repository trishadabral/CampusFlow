#pragma once

#include "common/types.h"
#include <string>

namespace campusflow {

class ConfigManager {
public:
    static std::wstring GetProgramDataFolder();
    static std::wstring GetConfigPath();
    static std::wstring GetTokenPath();
    static std::wstring GetLogPath(const std::wstring& filename);

    static bool EnsureDirectoriesExist();

    static Config LoadConfig();
    static bool SaveConfig(const Config& config);

    static std::string LoadToken();
    static bool SaveToken(const std::string& token);

private:
    static bool SetRestrictedAcl(const std::wstring& filePath);
};

} // namespace campusflow

