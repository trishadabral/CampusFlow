#include "common/config_manager.h"
#include "common/logging.h"
#include "common/utf8.h"
#include <nlohmann/json.hpp>

#include <windows.h>
#include <shlobj.h>
#include <sddl.h>
#include <fstream>

using json = nlohmann::json;

namespace campusflow {

std::wstring ConfigManager::GetProgramDataFolder() {
    wchar_t path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_COMMON_APPDATA, NULL, 0, path))) {
        return std::wstring(path) + L"\\CampusFlow";
    }
    return L"C:\\ProgramData\\CampusFlow";
}

std::wstring ConfigManager::GetConfigPath() {
    return GetProgramDataFolder() + L"\\config.json";
}

std::wstring ConfigManager::GetTokenPath() {
    return GetProgramDataFolder() + L"\\agent.token";
}

std::wstring ConfigManager::GetLogPath(const std::wstring& filename) {
    return GetProgramDataFolder() + L"\\logs\\" + filename;
}

bool ConfigManager::EnsureDirectoriesExist() {
    std::wstring base = GetProgramDataFolder();
    CreateDirectoryW(base.c_str(), NULL);
    std::wstring logs = base + L"\\logs";
    CreateDirectoryW(logs.c_str(), NULL);
    return true;
}

Config ConfigManager::LoadConfig() {
    EnsureDirectoriesExist();
    Config cfg;

    std::wstring configPath = GetConfigPath();
    std::ifstream file(configPath);
    if (!file.is_open()) {
        // Fallback: check current directory config.json
        file.open(L"config.json");
    }

    if (file.is_open()) {
        try {
            json j;
            file >> j;
            if (j.contains("server_url") && j["server_url"].is_string()) {
                cfg.server_url = j["server_url"].get<std::string>();
            }
            if (j.contains("enrollment_code") && j["enrollment_code"].is_string()) {
                cfg.enrollment_code = j["enrollment_code"].get<std::string>();
            }
            if (j.contains("poll_ms") && j["poll_ms"].is_number()) {
                cfg.poll_ms = j["poll_ms"].get<uint32_t>();
            }
        } catch (const std::exception& e) {
            Logger::Warn(std::string("Failed to parse config.json, using defaults: ") + e.what());
        }
    } else {
        Logger::Info("No config.json found, creating template with defaults at: " + WideToUtf8(configPath));
        SaveConfig(cfg);
    }

    return cfg;
}

bool ConfigManager::SaveConfig(const Config& config) {
    EnsureDirectoriesExist();
    std::wstring configPath = GetConfigPath();

    json j = {
        {"server_url", config.server_url},
        {"enrollment_code", config.enrollment_code},
        {"poll_ms", config.poll_ms}
    };

    std::ofstream file(configPath, std::ios::trunc);
    if (!file.is_open()) return false;
    file << j.dump(2);
    return true;
}

std::string ConfigManager::LoadToken() {
    std::wstring tokenPath = GetTokenPath();
    std::ifstream file(tokenPath);
    if (!file.is_open()) return "";

    std::string token;
    file >> token;
    return token;
}

bool ConfigManager::SaveToken(const std::string& token) {
    EnsureDirectoriesExist();
    std::wstring tokenPath = GetTokenPath();

    std::ofstream file(tokenPath, std::ios::trunc);
    if (!file.is_open()) {
        Logger::Error("Failed to open agent.token for writing: " + WideToUtf8(tokenPath));
        return false;
    }

    file << token;
    file.close();

    SetRestrictedAcl(tokenPath);
    return true;
}

bool ConfigManager::SetRestrictedAcl(const std::wstring& filePath) {
    // SDDL String: Protected DACL (P), Inherited ACEs removed, Allow SYSTEM (SY) Generic All (GA), Allow Built-in Admins (BA) Generic All (GA)
    LPCWSTR sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;BA)";
    PSECURITY_DESCRIPTOR pSD = NULL;

    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SDDL_REVISION_1, &pSD, NULL)) {
        Logger::Warn("Failed to create security descriptor for agent.token");
        return false;
    }

    BOOL success = SetFileSecurityW(filePath.c_str(), DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, pSD);
    LocalFree(pSD);

    if (!success) {
        Logger::Warn("Failed to set restricted DACL on agent.token");
        return false;
    }

    return true;
}

} // namespace campusflow

