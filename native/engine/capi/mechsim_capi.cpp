// mechsim_capi.cpp - implements include/mechsim.h. TICKET A6 implements this file.
// Rule: no C++ exception may cross this boundary. Catch everything, store the message in the
// thread-local error string, and return MS_ERR / NULL.
#include "mechsim.h"

#include <string>

#include "../io/scene_loader.hpp"

namespace {
thread_local std::string g_last_error;
}

extern "C" {

const char* ms_version(void) { return "0.1.0"; }

const char* ms_last_error(void) { return g_last_error.c_str(); }

ms_world* ms_world_create(const char* scene_json) {
    g_last_error = "not implemented (A6)";
    return nullptr;
}

void ms_world_destroy(ms_world* world) {}

int ms_world_step(ms_world* world, double dt, int n_steps) {
    g_last_error = "not implemented (A6)";
    return MS_ERR;
}

int ms_world_reset(ms_world* world) {
    g_last_error = "not implemented (A6)";
    return MS_ERR;
}

double ms_world_time(const ms_world* world) { return -1.0; }

int ms_world_body_count(const ms_world* world) { return MS_ERR; }

int ms_world_get_state(const ms_world* world, double* out, int capacity) { return MS_ERR; }

const char* ms_world_frame_json(ms_world* world) {
    g_last_error = "not implemented (A6)";
    return nullptr;
}

}  // extern "C"
