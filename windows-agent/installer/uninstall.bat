@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  CampusFlow Windows Agent - Service Uninstaller
echo =====================================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This uninstaller must be run as Administrator!
    echo Right-click uninstall.bat and select "Run as administrator".
    pause
    exit /b 1
)

set "INSTALL_DIR=C:\Program Files\CampusFlow"

echo [*] Stopping CampusFlowService...
sc.exe stop CampusFlowService >nul 2>&1
timeout /t 2 /nobreak >nul

echo [*] Terminating any remaining monitor instances...
taskkill /F /IM CampusFlowMonitor.exe >nul 2>&1

echo [*] Unregistering service from SCM...
if exist "%INSTALL_DIR%\CampusFlowService.exe" (
    "%INSTALL_DIR%\CampusFlowService.exe" --uninstall
) else (
    sc.exe delete CampusFlowService >nul 2>&1
)

echo [*] Cleaning installed binaries...
if exist "%INSTALL_DIR%" (
    del /Q "%INSTALL_DIR%\*.*" >nul 2>&1
    rmdir "%INSTALL_DIR%" >nul 2>&1
)

echo.
echo =====================================================================
echo  CampusFlow Agent uninstalled cleanly!
echo  (Note: %ProgramData%\CampusFlow log data preserved for auditing)
echo =====================================================================

