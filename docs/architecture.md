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

## v0.2: the layout editor

```
 frontend/js/editor/
   geometry.js   pure 2D helpers, snap angles (0/30/45/60/90 and mirrors), ids
   snap.js       pointer snapping: body features > surface ends > surface line > interior > grid
   model.js      SceneModel: the scene being edited, creation, edits, cascading delete, undo/redo
   tools.js      tool state machines (rect, circle, surface, spring + ghost, load, supports, select)
   hit.js        what is under the pointer (selection, right-click)
   properties.js right-click forms as data (+ validation)
   preview.js    canvas overlay: snap marker, rubber band, ghost spring, selection
   editor.js     DOM glue: floating "+" toolbox, pointer / keyboard handling, property popup
```

Everything except `editor.js` is DOM-free and unit-tested with Node (`node --test tests/frontend`).
`tests/frontend/export_scenes.mjs` builds layouts through the real tools and `tests/python/test_editor_scenes.py`
runs them in the native engine.

Data flow: the editor works on a local copy of the scene. **Done** / **Play** send it to
`POST /api/scene/apply` (validated, built, probed with one step), **Save** to `POST /api/scene/save`
(`user_scenes/`). Surfaces are drawn from the scene (they are not part of frames); supports carry their own
`params.angle`, so the engine ignores `surfaces`.

Impulses are an optional interface (`elements/impulse_source.hpp`, found with `dynamic_cast`) so the frozen
`Element` interface did not have to change; `World::initialize()` / `reset()` call
`solver/impulse.cpp`.
