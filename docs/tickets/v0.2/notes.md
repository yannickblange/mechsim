# v0.2 notes: layout editor and new components

Branch `v0.2/editor`, commits `[V0.2-1]` to `[V0.2-3]` plus the final polish commit. Not merged.

## What was added

| Layer | Content |
|-------|---------|
| Engine | `disc` body; `fixed_support` (Einspannung, 3 rows); `roller_support` (Loslager, 1 row, frictionless); `load` element (force + moment, constant or impulse); `solver/impulse.cpp` (velocity jump projected onto the constraints) |
| Contracts | scene schema 0.2 (`surfaces`, `disc`, `load`, new supports, `params.angle`, `surface`), state schema (load fields), protocol (`apply`, `save`, user scenes), units, formulation |
| Python | user scenes (`user_scenes/`, `MECHSIM_USER_SCENES`), reference checks in `validate_scene`, `POST /api/scene/apply` and `/save`, `source` in load / scene, mock frames for the new types, apply-time probe step |
| Frontend | `frontend/js/editor/*` (tools, snapping, model + undo, properties, overlay, floating "+" toolbox), symbols for surface / disc / load / fixed / roller (supports rotate with the surface), spring ghost, toolbar (New, Edit/Done, name, Save, undo, redo) |
| Scenes | `incline_roller`, `cantilever_clamp`, `impulse_pendulum`, `disc_spring_moment` |

## Frozen files changed (approved by the user: "treat v0.2 as the integration ticket")

`native/engine/core/registry.cpp`, `contracts/scene.schema.json`, `contracts/state.schema.json`,
`contracts/protocol.md`, `contracts/units.md`, `frontend/index.html`, `frontend/js/main.js`,
`frontend/js/canvas/symbols/index.js`.

Not touched, on purpose: `CMakeLists.txt`, `pyproject.toml`, `native/include/mechsim.h`, `python/mechsim/paths.py`,
`tests/conftest.py`, every `*.hpp` that existed in v0.1 (the impulse hook is the new
`elements/impulse_source.hpp`, found with `dynamic_cast`, so `Element` stayed as it was). The version strings
therefore still say `0.1.0` (`ms_version()`, `/api/health`, `pyproject.toml`); the scene format version is `0.2`.

Other existing files changed: `world.cpp` (calls the impulse solver in `initialize()` / `reset()`),
`scene_loader.cpp` (accepts version "0.1" and "0.2"), `renderer.js`, `state.js`, `api.js`, `main.css`,
`scene.py`, `session.py`, `routes.py`, `mock.py`, and the existing tests that list scenes.

## Behaviour worth knowing

- **Surfaces do not collide.** They are fixed geometry that supports sit on. Nothing stops a body from
  passing through one.
- **A single Loslager lets the body tip over.** Rotation about the contact point is free and the centre
  of mass is above it: an inverted pendulum, which is correct physics. Use two Loslager on the same surface
  (as in `incline_roller`) to make a body slide without tipping. Over-constraining (two fixed Lager on one
  body, two identical Loslager) is reported when the layout is applied ("constraint system is singular").
- **Support angle.** `params.angle` is the surface direction with the body on its left, so the editor
  needs no extra "side" field; the Loslager slides along it and reacts normal to it.
- **Spring ghost = `rest_length`.** The editor stores the ground end first, so the ghost hangs from the
  fixed end. Without a ghost click (Enter) no `rest_length` is stored and the installed length applies.
- **Loads.** The force vector stays fixed in the world, the moment is a pure couple. An impulse is a
  velocity jump at t = 0 and after every reset; it is projected onto the constraints, so a hit on a pinned
  rod gives the angular-momentum result about the pivot, not `J / m`.
- **Loslager symbol** follows the sliding body point; the other supports stay at their fixed world point.
- **Rectangles that start on a sloped surface** are aligned with it (width along the surface). Floors and
  walls keep angle 0 so width and height are what the user dragged.
- **Resizing a mass** in the properties popup scales the points attached to it (spring ends, loads,
  supports), so a corner stays a corner.
- Saved layouts go to `user_scenes/` and are not git-ignored; commit them or add the folder to `.gitignore`.

## Not done / ideas

- No dragging of existing objects, no editing of surface geometry or object positions in the popup
  (delete and redraw; undo exists).
- No collision or contact with surfaces; no friction.
- Saved layouts cannot be deleted from the UI (delete the file).
- Right-click properties rely on the `contextmenu` event (works with mouse and Ctrl+click on macOS);
  there is no long-press equivalent for touch screens yet.
- Version strings were not bumped (see above).

## Tests (`./tools/run_tests.sh -rs`, clean engine build, no compiler warnings)

```
100% tests passed out of 69          (ctest; 21 new: disc, fixed, roller, load, impulse)
169 passed, 1 warning in ~12 s       (pytest; includes the Node run below and editor -> engine tests)
tests 92, pass 92, fail 0            (node --test tests/frontend)
```

New test files: `tests/native/{test_disc,constraints/test_fixed_support,constraints/test_roller_support,elements/test_load}.cpp`,
`tests/validation/test_v02_physics.py` (incline, cantilever reactions, impulse pendulum, flywheel period,
spring direction from the ghost, energy with loads), `tests/python/{test_scene_v02,test_editor_api,test_editor_native,test_editor_scenes,test_frontend_unit}.py`,
`tests/frontend/*.test.mjs` and `tests/frontend/export_scenes.mjs`, `tests/frontend/smoke.html` (manual symbol gallery).

## Manual checks in the browser (native engine)

Built a layout with the mouse (surface, block on it, circle, spring with ghost, force, two Loslager) and ran
it; right-click properties (mass 2 to 5 kg); Save, then run from *My layouts*; Delete cascades and undo /
redo via keyboard; all example scenes render (incline with rotated Loslager symbols, hatched wall with
fixed Lager, ceiling Festlager, moment arcs, dashed impulse arrow). The embedded browser pane does not send a
`contextmenu` event for a synthesized right-click, so that event was dispatched directly.
