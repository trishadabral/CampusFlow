@echo off
setlocal enabledelayedexpansion

echo =====================================================================
echo  CampusFlow Windows Agent - Build Pipeline (x64 Release /MT)
echo =====================================================================

:: Locate vcvars64.bat and set generator
set "VCVARS="
set "GENERATOR="
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    set "GENERATOR=Visual Studio 17 2022"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
    set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    set "GENERATOR=Visual Studio 16 2019"
) else (
    echo [ERROR] Could not locate vcvars64.bat. Please ensure Visual Studio Build Tools are installed.
    exit /b 1
)

echo [*] Initializing Visual Studio build environment...
call "%VCVARS%"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to initialize MSVC environment.
    exit /b 1
)

:: Locate CMake executable
set "CMAKE_EXE="
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" set "CMAKE_EXE=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
if not defined CMAKE_EXE if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" set "CMAKE_EXE=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
if not defined CMAKE_EXE (
    echo [ERROR] CMake executable not found. Please ensure CMake is installed with Visual Studio.
    exit /b 1
)

:: Change to script directory
cd /d "%~dp0"

:: Clean previous build artifacts
if exist build rmdir /s /q build

:: Configure with Visual Studio generator
"%CMAKE_EXE%" -B build -G "%GENERATOR%" -A x64 .
if %errorlevel% neq 0 (
    echo [ERROR] CMake configure failed.
    exit /b 1
)

:: Build Release configuration
"%CMAKE_EXE%" --build build --config Release
if %errorlevel% neq 0 (
    echo [ERROR] Build compilation failed.
    exit /b 1
)

:: Verify output binaries
if not exist "dist" mkdir "dist"
if exist "build\Release\CampusFlowService.exe" copy /Y "build\Release\CampusFlowService.exe" "dist\" >nul
if exist "build\Release\CampusFlowMonitor.exe" copy /Y "build\Release\CampusFlowMonitor.exe" "dist\" >nul

if exist "dist\CampusFlowService.exe" if exist "dist\CampusFlowMonitor.exe" (
    echo.
    echo =====================================================================
    echo  BUILD SUCCESSFUL!
    echo  Binaries available in: %~dp0dist\
    echo    - CampusFlowService.exe
    echo    - CampusFlowMonitor.exe
    echo =====================================================================
    exit /b 0
) else (
    echo [ERROR] One or more target binaries missing in dist/
    exit /b 1
)
