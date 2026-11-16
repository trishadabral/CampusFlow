@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  CampusFlow Windows Agent - Service Installer
echo =====================================================================

:: Check Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This installer must be run as Administrator!
    echo Right-click install.bat and select "Run as administrator".
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\Program Files\CampusFlow"
set "DATA_DIR=C:\ProgramData\CampusFlow"

echo [*] Creating directories...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\logs" mkdir "%DATA_DIR%\logs"

:: Determine binary source folder (dist\ or current dir)
set "BIN_DIR=%~dp0..\dist"
if not exist "%BIN_DIR%\CampusFlowService.exe" set "BIN_DIR=%~dp0"

if not exist "%BIN_DIR%\CampusFlowService.exe" (
    echo [ERROR] CampusFlowService.exe not found! Please run build.bat first.
    pause
    exit /b 1
)

echo [*] Copying binaries to %INSTALL_DIR%...
copy /Y "%BIN_DIR%\CampusFlowService.exe" "%INSTALL_DIR%\" >nul
copy /Y "%BIN_DIR%\CampusFlowMonitor.exe" "%INSTALL_DIR%\" >nul

:: Copy template config if none exists
if not exist "%DATA_DIR%\config.json" (
    if exist "%~dp0..\config\config.example.json" (
        copy /Y "%~dp0..\config\config.example.json" "%DATA_DIR%\config.json" >nul
        echo [*] Initialized config template at %DATA_DIR%\config.json
    )
)

echo [*] Registering Windows Service with SCM...
"%INSTALL_DIR%\CampusFlowService.exe" --install

echo [*] Starting CampusFlowService...
sc.exe start CampusFlowService

echo.
echo =====================================================================
echo  CampusFlow Agent installed successfully!
echo  Config: %DATA_DIR%\config.json
echo  Logs:   %DATA_DIR%\logs\service.log
echo =====================================================================

