# Native tests. New test files are picked up automatically by the globs below.
FetchContent_Declare(Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.7.1
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(Catch2)
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(Catch)

# Plain C test for linalg: exit code 0 = pass, 77 = skipped, anything else = fail.
add_executable(test_linalg test_linalg.c)
target_link_libraries(test_linalg PRIVATE ms_linalg)
add_test(NAME test_linalg COMMAND test_linalg)
set_tests_properties(test_linalg PROPERTIES SKIP_RETURN_CODE 77)

# All C++ tests in one Catch2 executable.
file(GLOB_RECURSE MS_CPP_TESTS CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/*.cpp)
add_executable(ms_tests ${MS_CPP_TESTS})
target_link_libraries(ms_tests PRIVATE ms_engine Catch2::Catch2WithMain)
catch_discover_tests(ms_tests)
