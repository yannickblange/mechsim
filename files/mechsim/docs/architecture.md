# Architecture

```
 Browser (frontend/)            Python (python/mechsim/)               Native (native/)
 ┌───────────────────┐  REST   ┌──────────────────────────┐  ctypes   ┌──────────────────────┐
 │ main.js           │◄──────► │ server/routes.py         │           │ mechsim.h  (C API)   │
 │ api.js / state.js │   WS    │ server/ws.py, session.py │──────────►│ capi/mechsim_capi.cpp│
 │ canvas/renderer.js│◄─────── │ sim.py  ─ _native.py ────┼──────────►│ io/scene_loader      │
 │ canvas/symbols/*  │ frames  │ server/mock.py (no C++)  │           │ core/world, body     │
 └───────────────────┘         └──────────────────────────┘           │ elements/, constraints│
                                                                       │ solver/ ──► linalg (C)│
                                                                       └──────────────────────┘
```

Data flow per display frame (60 Hz): the server session calls `sim.step(n=…)`, then
`sim.frame()` (a dict matching `contracts/state.schema.json`), and broadcasts it over the
WebSocket. The browser keeps the scene (static geometry, from `/api/scene`) and the latest frame
(poses, spring end points, reactions) and redraws on every animation frame.

## Extension points

Adding a component touches, per layer, one new file pair plus one registration line:

| Layer | New files | Registration (integration ticket) |
|-------|-----------|-----------------------------------|
| Engine | `elements/x.hpp/.cpp` or `constraints/x.hpp/.cpp` | `core/registry.cpp` |
| Schema | – | `contracts/scene.schema.json` |
| Frontend | `canvas/symbols/x.js` | `canvas/symbols/index.js` |
| Tests | `tests/native/.../test_x.cpp` | none (globbed) |

CMake source lists are globbed, so new `.c`/`.cpp` files need no CMake edit.
