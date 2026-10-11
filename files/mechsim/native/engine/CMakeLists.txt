# Engine core as a static library (used by tests) + the shared library exposing the C API.
file(GLOB_RECURSE MS_ENGINE_SOURCES CONFIGURE_DEPENDS
  ${CMAKE_CURRENT_SOURCE_DIR}/core/*.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/bodies/*.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/elements/*.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/constraints/*.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/solver/*.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/io/*.cpp)

add_library(ms_engine STATIC ${MS_ENGINE_SOURCES})
target_include_directories(ms_engine PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/native/include)
target_link_libraries(ms_engine PUBLIC ms_linalg nlohmann_json::nlohmann_json)
if(NOT MSVC)
  target_compile_options(ms_engine PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

add_library(mechsim SHARED ${CMAKE_CURRENT_SOURCE_DIR}/capi/mechsim_capi.cpp)
target_link_libraries(mechsim PRIVATE ms_engine)
set_target_properties(mechsim PROPERTIES
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON)

# Copy the shared library next to the Python package so ctypes finds it.
add_custom_command(TARGET mechsim POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/python/mechsim/lib
  COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:mechsim> ${CMAKE_SOURCE_DIR}/python/mechsim/lib/
  COMMENT "Copying libmechsim into python/mechsim/lib")
