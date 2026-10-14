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
`params.angle`. Since v0.8 the engine also loads `surfaces` (polylines with friction and restitution) and blocks and discs collide with them
(`native/engine/solver/contact.cpp`); the frame then has `contacts`.

Impulses are an optional interface (`elements/impulse_source.hpp`, found with `dynamic_cast`) so the frozen
`Element` interface did not have to change; `World::initialize()` / `reset()` call
`solver/impulse.cpp`.

## v0.3: links, joints and the move tool

- Engine: `constraints/link.cpp` (rope + rod), `constraints/joint.cpp`, `constraints/ground_pin.cpp` (Festlager in free
  space, a `pin_support` with `body: null` that exerts no constraint). Ropes switch on and off, so they implement the
  optional `constraints/unilateral.hpp` interface (found with `dynamic_cast`; `Constraint` itself is unchanged); the
  integrator runs `updateUnilateral()` before and `releaseViolated()` after each solve (`solver/unilateral.cpp`),
  and `solver/impulse.cpp::projectVelocities` removes the velocity that would stretch a rope that engages.
- Editor additions in `frontend/js/editor/`: `placement.js` (where a support goes, shared by the support tools and the move
  tool), `moves.js` (pure move operations: translate masses with their joint group, surfaces, free pins; re-attach ends,
  supports and loads; contact snapping; rope normalisation), `connections.js` (attachment points grouped by position, and
  what an object is connected to), tools `LinkTool`, `JointTool`, `MoveTool`. A move drag is a `SceneModel.transaction()`:
  every pointer move re-applies the operation to the state at the start of the drag, release records one undo step.

## v0.4: graphs, colour schemes, Fachwerke and beams

- **Graphs.** `Simulation.step_traced(n)` / `SimSession.advance()` send the pose of every body after (at most 120 of) the engine steps of a
  display frame as the frame message's `trace` (`contracts/protocol.md`). `frontend/js/graphs/recorder.js` keeps the history of every
  body (reset on rewind and on a new scene), `plot.js` is the maths (ticks, units, min / max envelope per pixel column), `panel.js` the
  floating panels. `main.js` offers them in a run-mode context menu (`editor/hit.js::massesAt`, which uses the current poses) and the
  editor's popup has a Graph button.
- **Colour schemes.** `css/main.css` defines the colours as variables, `:root` is the light scheme, `[data-theme='dark']` overrides it;
  `Renderer.readTheme()` reads them, `theme.js` switches and remembers. The UI accent (`--c-accent`) and the line colour of symbols are separate.
- **Engine.** `core/section.*` (sections), `core/material.hpp` (E, density), `bodies/node.*`, `elements/bar.*` (an elastic `Spring`),
  `elements/beam_element.*` (the finite elements of a beam, hidden from frames), `io/beam_builder.*` (a `beam` body in the scene becomes node
  bodies with `Body::beam >= 0`, one `BeamElement` and a `World::beams` group; attachments are remapped to the nodes before the other
  objects are loaded), `solver/stiffness.*` (maximum frequency, substeps in `World::step`). `World::sceneBodies()` is the body list as the
  outside sees it (a beam is one body, the middle node): `frame()` and the C API's `ms_world_get_state` use it.
- **Editor.** `section.js` (section maths, mirrors `section.cpp`), `sectionview.js` (the drawing in the popup), `NodeTool`, `BeamTool`;
  the Stab tool makes nodes at free ends (`SceneModel.addRod` with `{ node: true }` ends, one undo step); `setStabSection` turns a rod into an
  elastic bar and back; property forms can reshape (a select with `reshape` rebuilds the form: cross-section type, load type);
  symbols `node.js`, `beam.js` (smooth deformed shape, bending exaggeration about the chord), `rod.js` (force labels, tension blue, compression red).

## v0.4b: bars that bend and buckle, damping

- `elements/beam_element.*` is one class for both uses: a `Beam` (hidden, reported through its body) and a `Bar` (an element of the frame with its own id). The ends of a
  segment are `End`s: a node body, or an anchor (a point of a body or of the ground) that is **hinged** (no rotation variable, condensed out). The strain has
  the bowing term, so a compressed member loses stiffness and buckles at the Euler load.
- `io/beam_builder.*::addBar` builds the chain for an elastic Stab (anchors already remapped to beam nodes, like for every element): hidden internal bodies
  (`Body::hidden`, not reported, carrying the mass), a half-sine initial bow, the weight of the end halves on the anchors. The loader calls it for `type: "bar"`
  instead of a registry factory; `elements/bar.*` is gone.
- `Body::damping` (viscous rate, applied in `solver/assembler.cpp`) is set from the `damping` parameter of nodes, beams and bars. Replaces the stiffness-proportional
  damping tried first (see the notes).
- Frontend: `rod.js` draws an elastic bar along its `nodes` (Hermite curve, `exaggerate` of `beam.js`) and labels the compression as a percentage of `pcr`;
  `properties.js` has the Euler load, slenderness, elements, mass, damping and initial bow of an elastic Stab.
