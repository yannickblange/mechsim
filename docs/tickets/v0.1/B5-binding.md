# B5: ctypes binding and Simulation class

**Agent:** B  **Depends on:** nothing to write it; **A7 merged** to pass the tests
**Branch:** `v0.1/B5-binding`

## Files you own
- `python/mechsim/_native.py`
- `python/mechsim/sim.py`
- `tests/python/test_binding.py`

## Read only
`native/include/mechsim.h` (every function and rule), `python/mechsim/protocol.py`,
`python/mechsim/paths.py`, `tests/conftest.py`.

## Task
### _native.py
- `find_library()`: `MECHSIM_LIB` env var if set (must exist), else in `paths.LIB_DIR` the first
  existing of `libmechsim.dylib`, `libmechsim.so`, `mechsim.dll`. Not found →
  `NativeLibraryNotFound("libmechsim not found in <dir>; run tools/build.sh")`.
- `load()`: `ctypes.CDLL`, cached in a module global. Declare `argtypes` and `restype` for every
  function in `mechsim.h`. Use `ctypes.c_void_p` for `ms_world*`, `c_char_p` for returned strings
  that the library owns (decode UTF-8 yourself), `POINTER(c_double)` for the state buffer.
- Small helper `check(code)` raising `NativeError(last_error())` when `code == MS_ERR`.

### sim.py: Simulation (implements SimulationLike)
- `__init__(scene)`: dict → `json.dumps`, str used as is (parse once to read `solver.dt`,
  default 0.001). `ms_world_create`; NULL → `NativeError` with `ms_last_error()`.
- `step(dt=None, n=1)`: `n < 1` → `ValueError`. Pass `dt` or `0.0` (scene dt) to the library.
- `reset()`, `time`, `dt`, `body_count`.
- `state()`: numpy array `(body_count, 6)` from `ms_world_get_state`.
- `frame()`: `json.loads` of `ms_world_frame_json`.
- `close()`: destroy once, set the handle to None; calling other methods after close →
  `RuntimeError("simulation is closed")`. `__del__` calls `close()` and never raises.

## Tests (`tests/python/test_binding.py`, keep `pytestmark = pytest.mark.native`)
1. `load()` works and version is `"0.1.0"`.
2. `Simulation("{")` raises `NativeError` with a non-empty message.
3. `single_mass_spring`: initial `state()` row 0 equals `[0, 0, 0, 0, 0, 0]`; `step(n=10)` →
   `time ≈ 0.01`; `reset()` → time 0 and initial state.
4. `two_mass_chain`: `state().shape == (2, 6)`.
5. `frame()` validates against `state_schema` for every example scene.
6. `step(n=0)` raises `ValueError`; methods after `close()` raise `RuntimeError`; `close()` twice OK.
7. `isinstance(sim, SimulationLike)` is true.

## Acceptance
```bash
./tools/build.sh && python3 -m pytest tests/python/test_binding.py -v
```
Before A7 is merged, only test 1 can pass; that is expected. After A7: all pass, none skipped.
