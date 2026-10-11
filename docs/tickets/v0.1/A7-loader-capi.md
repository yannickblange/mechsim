# A7: Scene loader and C API

**Agent:** A  **Depends on:** A2–A6 merged  **Branch:** `v0.1/A7-loader-capi`

## Files you own
- `native/engine/io/scene_loader.cpp`
- `native/engine/capi/mechsim_capi.cpp`
- `tests/native/test_scene_loader.cpp`
- new file `tests/native/test_capi.cpp`

## Read only
`io/scene_loader.hpp`, `core/registry.hpp`, `native/include/mechsim.h`,
`contracts/scene.schema.json`, `scenes/*.json`.

## Task
### loadScene(jsonText)
1. Parse; on `nlohmann::json::parse_error` throw `std::runtime_error("invalid JSON: ...")`.
2. `version` must equal `"0.1"`.
3. `gravity` (default `[0,-9.81]`), `solver` fields with the defaults from `SolverSettings`.
4. Bodies first: for each entry check the id is unique (across bodies, elements and
   constraints), `findBodyType(type)` (unknown → throw `"body '<id>': unknown type '<type>'"`),
   create `Body`, set `id`, `pos` (`position`), `phi` (`angle`, default 0), `vel` (`velocity`,
   default 0), `omega` (default 0), then call the init function with `params`.
5. Then elements via `findElementType`, then constraints via `findConstraintType`.
   Wrap factory exceptions so the message starts with the object id.
6. `world->initialize()`, return.
Any `nlohmann::json` exception (missing key, wrong type) becomes a `std::runtime_error`.
The loader does not need full schema validation (Python does that), but it must never crash.

### mechsim_capi.cpp
```cpp
struct ms_world { std::unique_ptr<ms::World> world; std::string frame; };
```
- Wrap every function body in `try { ... } catch (const std::exception& e) { set error } catch (...) { ... }`.
- NULL world → error `"world is NULL"`, return MS_ERR / NULL / -1.0.
- `ms_world_create`: NULL json → error; else `loadScene`.
- `ms_world_step`: `n_steps < 1` → error; `dt <= 0` → `world->solver.dt`; call `step` n times.
- `ms_world_get_state`: `capacity < 6 * N` → error; write x, y, phi, vx, vy, omega per body.
- `ms_world_frame_json`: `frame = world->frame().dump(); return frame.c_str();`
- On success, do NOT clear the last error (only failing calls set it).

## Tests
`test_scene_loader.cpp`: load each file in `scenes/` (path via `MECHSIM_SOURCE_DIR` is not
available, so use `std::string(__FILE__)` to locate `../../scenes/`), check body counts and that
`frame()` works; error cases: bad JSON, wrong version, unknown body type, unknown body id in a
spring, duplicate id. Each error message must contain the offending id or keyword.

`test_capi.cpp` (only through `mechsim.h`): version string; create from a valid scene; step 10
with dt = 0 → time 0.01; get_state with too small capacity fails; reset → time 0; frame JSON
parses with nlohmann and has key `"t"`; create from `"{"` returns NULL and `ms_last_error()` is
non-empty; destroy(NULL) is safe. Link note: the test executable links `ms_engine`, which already
contains everything except `mechsim_capi.cpp`, so add `#include "../../native/engine/capi/mechsim_capi.cpp"`
at the top of `test_capi.cpp` instead of editing CMake.

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build --output-on-failure
```
All native tests pass, none skipped.
