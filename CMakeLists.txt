# Top-level build. Source lists use globs, so adding a new .c/.cpp file needs NO edit here
# (re-run cmake: tools/build.sh does that). Only the integration ticket may edit this file.
cmake_minimum_required(VERSION 3.20)
project(mechsim VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(MECHSIM_BUILD_TESTS "Build native unit tests" ON)

include(FetchContent)
FetchContent_Declare(json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(json)

add_subdirectory(native/linalg)
add_subdirectory(native/engine)

if(MECHSIM_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests/native)
endif()
