// mechsim_capi.cpp - implements include/mechsim.h.
// Rule: no C++ exception may cross this boundary. Catch everything, store the message in the
// thread-local error string, and return MS_ERR / NULL.
#include "mechsim.h"

#include <memory>
#include <string>

#include "../core/world.hpp"
#include "../io/scene_loader.hpp"

struct ms_world {
    std::unique_ptr<ms::World> world;
    std::string frame;  // backing store for ms_world_frame_json()
};

namespace {
thread_local std::string g_last_error;

// Runs fn(); on any exception stores the message and returns `failure`.
template <typename T, typename Fn>
T guarded(T failure, Fn fn) {
    try {
        return fn();
    } catch (const std::exception& e) {
        g_last_error = e.what();
    } catch (...) {
        g_last_error = "unknown error";
    }
    return failure;
}

bool nullWorld(const ms_world* w) {
    if (w && w->world) return false;
    g_last_error = "world is NULL";
    return true;
}
}  // namespace

extern "C" {

const char* ms_version(void) { return "0.1.0"; }

const char* ms_last_error(void) { return g_last_error.c_str(); }

ms_world* ms_world_create(const char* scene_json) {
    return guarded<ms_world*>(nullptr, [&]() -> ms_world* {
        if (!scene_json) {
            g_last_error = "scene_json is NULL";
            return nullptr;
        }
        auto handle = std::make_unique<ms_world>();
        handle->world = ms::loadScene(scene_json);
        return handle.release();
    });
}

void ms_world_destroy(ms_world* world) { delete world; }

int ms_world_step(ms_world* world, double dt, int n_steps) {
    if (nullWorld(world)) return MS_ERR;
    return guarded<int>(MS_ERR, [&] {
        if (n_steps < 1) {
            g_last_error = "n_steps must be >= 1";
            return MS_ERR;
        }
        if (dt <= 0.0) dt = world->world->solver.dt;
        for (int i = 0; i < n_steps; ++i) world->world->step(dt);
        return MS_OK;
    });
}

int ms_world_reset(ms_world* world) {
    if (nullWorld(world)) return MS_ERR;
    return guarded<int>(MS_ERR, [&] {
        world->world->reset();
        return MS_OK;
    });
}

double ms_world_time(const ms_world* world) {
    if (nullWorld(world)) return -1.0;
    return world->world->time;
}

int ms_world_body_count(const ms_world* world) {
    if (nullWorld(world)) return MS_ERR;
    return static_cast<int>(world->world->sceneBodies().size());  // a beam counts once
}

int ms_world_get_state(const ms_world* world, double* out, int capacity) {
    if (nullWorld(world)) return MS_ERR;
    return guarded<int>(MS_ERR, [&] {
        const auto bodies = world->world->sceneBodies();  // scene order; a beam is its midpoint
        const int needed = MS_STATE_STRIDE * static_cast<int>(bodies.size());
        if (!out || capacity < needed) {
            g_last_error = "output buffer is NULL or too small";
            return MS_ERR;
        }
        int i = 0;
        for (const auto& b : bodies) {
            for (double v : b.q) out[i++] = v;
        }
        return needed;
    });
}

const char* ms_world_frame_json(ms_world* world) {
    if (nullWorld(world)) return nullptr;
    return guarded<const char*>(nullptr, [&]() -> const char* {
        world->frame = world->world->frame().dump();
        return world->frame.c_str();
    });
}

}  // extern "C"
