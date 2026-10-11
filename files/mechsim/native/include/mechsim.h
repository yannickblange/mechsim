/*
 * mechsim.h - public C API of the MechSim engine (frozen for v0.1).
 *
 * This is the ONLY interface the Python layer uses (via ctypes). Keep it plain C:
 * no C++ types, no structs passed by value, all strings are UTF-8 and NUL-terminated.
 *
 * Ownership rules:
 *   - ms_world_create() returns a handle owned by the caller; free it with ms_world_destroy().
 *   - Strings returned by the library are owned by the library. ms_world_frame_json() returns a
 *     pointer that stays valid until the next call on the same world or until it is destroyed.
 *   - ms_last_error() is thread-local and describes the most recent failed call.
 */
#ifndef MECHSIM_H
#define MECHSIM_H

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#define MS_API __declspec(dllexport)
#else
#define MS_API __attribute__((visibility("default")))
#endif

#define MS_OK 0
#define MS_ERR (-1)

/* Number of doubles per body written by ms_world_get_state(): x, y, phi, vx, vy, omega. */
#define MS_STATE_STRIDE 6

typedef struct ms_world ms_world;

/* Library version string, e.g. "0.1.0". Never NULL. */
MS_API const char* ms_version(void);

/* Message of the last failed call on this thread ("" if none). Never NULL. */
MS_API const char* ms_last_error(void);

/* Build a world from a scene JSON string (see contracts/scene.schema.json).
 * Returns NULL on error; call ms_last_error() for the reason. */
MS_API ms_world* ms_world_create(const char* scene_json);

/* Free a world. Passing NULL is allowed and does nothing. */
MS_API void ms_world_destroy(ms_world* world);

/* Advance the simulation by n_steps steps of size dt.
 * dt <= 0 means "use solver.dt from the scene". Returns MS_OK or MS_ERR. */
MS_API int ms_world_step(ms_world* world, double dt, int n_steps);

/* Restore the initial state from the scene (t = 0). Returns MS_OK or MS_ERR. */
MS_API int ms_world_reset(ms_world* world);

/* Current simulated time in seconds. Returns -1.0 if world is NULL. */
MS_API double ms_world_time(const ms_world* world);

/* Number of bodies. Returns MS_ERR if world is NULL. */
MS_API int ms_world_body_count(const ms_world* world);

/* Write MS_STATE_STRIDE doubles per body (scene order) into out.
 * capacity is the number of doubles out can hold.
 * Returns the number of doubles written, or MS_ERR if world/out is NULL or capacity is too small. */
MS_API int ms_world_get_state(const ms_world* world, double* out, int capacity);

/* Current frame as JSON (see contracts/state.schema.json). Returns NULL on error. */
MS_API const char* ms_world_frame_json(ms_world* world);

#ifdef __cplusplus
}
#endif

#endif /* MECHSIM_H */
