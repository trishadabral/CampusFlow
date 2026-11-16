cmake_minimum_required(VERSION 3.20)
project(CampusFlowWindowsAgent CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compile with UNICODE and wide string APIs
add_compile_definitions(UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)

# Static CRT linkage (/MT and /MTd) so no external VC runtime redistributable is needed
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

if(MSVC)
    add_compile_options(/W4 /permissive- /FS)
endif()

include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party
)

# Common sources shared by both binaries
set(COMMON_SOURCES
    src/common/utf8.cpp
    src/common/logging.cpp
    src/common/config_manager.cpp
)

# -----------------------------------------------------------------------------
# Target 1: CampusFlowService.exe (Session 0 Windows Service & IPC Server)
# -----------------------------------------------------------------------------
add_executable(CampusFlowService
    ${COMMON_SOURCES}
    src/service/http_client.cpp
    src/service/session_launcher.cpp
    src/service/pipe_server.cpp
    src/service/service_main.cpp
)

target_link_libraries(CampusFlowService PRIVATE
    winhttp
    wtsapi32
    userenv
    advapi32
    psapi
)

# -----------------------------------------------------------------------------
# Target 2: CampusFlowMonitor.exe (User Session Interactive Desktop Agent)
# -----------------------------------------------------------------------------
add_executable(CampusFlowMonitor
    ${COMMON_SOURCES}
    src/monitor/pipe_client.cpp
    src/monitor/window_detector.cpp
    src/monitor/process_detector.cpp
    src/monitor/monitor_main.cpp
)

target_link_libraries(CampusFlowMonitor PRIVATE
    advapi32
    psapi
    user32
)

# Custom target / post-build step to copy output binaries into windows-agent/dist/
add_custom_command(TARGET CampusFlowService POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_SOURCE_DIR}/dist
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:CampusFlowService> ${CMAKE_CURRENT_SOURCE_DIR}/dist/
)

add_custom_command(TARGET CampusFlowMonitor POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_CURRENT_SOURCE_DIR}/dist
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:CampusFlowMonitor> ${CMAKE_CURRENT_SOURCE_DIR}/dist/
)

