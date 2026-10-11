# v0.1 tickets: minimal vertical slice

Goal: block masses, linear springs and the Festlager simulated in C++, served by Python, and
animated in the browser. All four scenes in `scenes/` run in native mode.

## Assignment and order

Each agent works through its column top to bottom. Every ticket owns a disjoint set of files,
so tickets from different agents never touch the same file.

| Order | Agent A (C / C++)                    | Agent B (Python / web)                  |
|-------|--------------------------------------|-----------------------------------------|
| 1     | A1 Linear algebra kernels (C)        | B1 Scenes, server, mock simulation      |
| 2     | A2 Body and Block                    | B2 api.js + state.js                    |
| 3     | A3 World                             | B3 Camera, renderer, grid, CSS          |
| 4     | A4 Spring (Feder)                    | B4 Drawing symbols + smoke test         |
| 5     | A5 Pin support (Festlager)           | B5 ctypes binding + Simulation (needs A7 merged to run its tests) |
| 6     | A6 Solver: assembler, Lagrange, Euler|                                         |
| 7     | A7 Scene loader + C API              |                                         |
| 8     | A8 Physics validation tests (needs B5 merged) |                                |
| last  |                                      | **INT-1 Integration** (only after everything above is merged) |

INT-1 is the only ticket allowed to edit frozen/shared files. Agent A is idle during INT-1.

## Workflow per ticket

1. `git checkout main && git pull` (or just `git checkout main` for a local repo)
2. `git checkout -b <branch from ticket>`
3. Implement, run the acceptance commands, commit with `[ID] message`.
4. Hand back to the human, who merges into `main`.

## File ownership map

| Ticket | Files |
|--------|-------|
| A1 | `native/linalg/dense.c`, `native/linalg/lu_solve.c`, `tests/native/test_linalg.c` |
| A2 | `native/engine/core/body.cpp`, `native/engine/bodies/block.cpp`, `tests/native/test_body.cpp`, `tests/native/test_block.cpp` |
| A3 | `native/engine/core/world.cpp`, `tests/native/test_world.cpp` |
| A4 | `native/engine/elements/spring.cpp`, `tests/native/elements/test_spring.cpp` |
| A5 | `native/engine/constraints/pin_support.cpp`, `tests/native/constraints/test_pin_support.cpp` |
| A6 | `native/engine/solver/assembler.cpp`, `lagrange.cpp`, `integrators.cpp`, `tests/native/test_solver.cpp`, `tests/native/test_integrators.cpp` |
| A7 | `native/engine/io/scene_loader.cpp`, `native/engine/capi/mechsim_capi.cpp`, `tests/native/test_scene_loader.cpp`, new `tests/native/test_capi.cpp` |
| A8 | `python/mechsim/analysis/energy.py`, `tests/validation/*.py` |
| B1 | `python/mechsim/scene.py`, `python/mechsim/server/{app,session,routes,ws,mock}.py`, `tests/python/test_scene_schema.py`, `tests/python/test_server.py`, `tests/python/test_mock.py` |
| B2 | `frontend/js/api.js`, `frontend/js/state.js` |
| B3 | `frontend/css/main.css`, `frontend/js/canvas/{camera,renderer,grid}.js` |
| B4 | `frontend/js/canvas/symbols/{spring,block,supports}.js`, `tests/frontend/smoke.html` |
| B5 | `python/mechsim/_native.py`, `python/mechsim/sim.py`, `tests/python/test_binding.py` |
| INT-1 | anything, see ticket |
