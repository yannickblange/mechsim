# v0.4 notes: graphs, colour schemes, Fachwerke, beams, vibrations

Branch `v0.4/graphs-beams`, commits `[V0.4-1]` to `[V0.4-5]`. **Built on top of `v0.3c/damper` (not merged into `main` yet)**, which
in turn sits on `v0.3b`; merge those first (or merge this branch, which contains them). Not merged.

## What was asked and how it was read

| Request | What was built |
|---------|----------------|
| Graphs of mass displacement against time, in the context menu | Right-click a **mass** while the simulation is shown: a menu offers its displacement graph; in the editor the right-click popup of a mass has a **Graph** button. Floating, draggable, resizable panels: displacement x, y / magnitude / rotation, whole run or last 5 / 20 s, hover read-out, CSV export. The server sends the pose after **every engine step** with each frame (`trace`), so fast vibrations are not aliased by the 60 Hz display |
| White background, grey grid, blue forces, black lines; dark mode | Light scheme is the default; **Dark** in the toolbar, remembered in `localStorage`. All colours are CSS variables; the UI accent is separate from the (black) symbol ink |
| "Stab not natively containing Festlager connected to empty space if point isn't connected" | Read as: a Stab end clicked in free space used to become a *ground anchor* (an invisible fixed point drawn with a hinge, i.e. a Festlager nobody placed). Now **a free end makes a node (Knoten)**, a movable point mass, or reuses the node already there. Nothing is pinned to empty space; a fixed point is a Festlager that the user places (free in space, or on a node) |
| Make Fachwerke possible | Nodes + Stabs + supports + loads: the `node` body, the **Node** tool, a node wins over the Stabs that end in it when selecting / moving, Stab forces are written on the Stabs while running (tension blue, compression red), example scenes `truss_bridge` (determinate, rigid Stabs) and `truss_elastic` (indeterminate: elastic bars) |
| Bendable mass objects and/or Stab objects, selectable cross sections and dimensions; same E for all | **Both**: the **beam** (a bendable mass object: Euler-Bernoulli, large rotations) and the **elastic Stab** (a `bar`: axial stiffness E A / L, from the same section list). Sections square, L, T, H, I with their dimensions in the right-click popup (with a drawing of the section), E = 210 GPa for everything (density 7850 kg/m³ gives the default mass of a beam) |
| Example scenes: freie, harmonische, erzwungene Schwingung | `free_vibration` (damped, zeta = 0.1), `harmonic_oscillation` (undamped, T = 1 s), `forced_vibration` (a **harmonic load**, a new load mode, near resonance); plus `cantilever_beam`, `beam_i_section` |

## What was added

| Layer | Content |
|-------|---------|
| Engine | `core/section.*`, `core/material.hpp`; bodies `node`, `beam` (becomes hidden node bodies + `BeamElement`, `io/beam_builder.*`); element `bar`; `load` mode `harmonic`; `World::sceneBodies()`, `BeamGroup`; **substeps** for stiff elements (`solver/stiffness.*`) |
| Contracts | scene schema 0.4 (node, beam, bar, sections, harmonic loads, `view.bend`), state schema (beam nodes / moments / stress, bar stress, harmonic mode), protocol (`trace`), units, formulation |
| Python | reference checks (sections that do not fit, attachments outside a beam, `bar` ends), readable schema errors for sections, `step_traced`, `analysis/truss.py` (method of joints, direct stiffness), `analysis/sections.py`, mock frames |
| Frontend | theme, graphs (recorder, plot maths, panels), run-mode context menu, `section.js`, `sectionview.js`, Node / Beam tools, Stab tool with nodes, elastic bars, reshaping property forms, symbols node / beam / bar / rod labels, harmonic load label, bending exaggeration (*Bending* selector, scene hint `view.bend`) |
| Scenes | `harmonic_oscillation`, `free_vibration`, `forced_vibration`, `truss_bridge`, `truss_elastic`, `cantilever_beam`, `beam_i_section` |

## Frozen files changed (approved by the user for v0.4)

`contracts/{scene,state}.schema.json`, `contracts/units.md`, `contracts/protocol.md`; `native/engine/core/{body,element,world}.hpp`,
`core/world.cpp`, `core/registry.cpp`, `io/scene_loader.cpp`, `capi/mechsim_capi.cpp`; `frontend/index.html`, `frontend/js/main.js`,
`frontend/js/state.js`, `frontend/js/canvas/symbols/index.js`; `tests/python/test_scene_v02.py` (version "0.4" is valid now: the
example of an unsupported version is "0.5"). Not touched: `CMakeLists.txt`, `pyproject.toml`, `mechsim.h`, `paths.py`, `protocol.py`,
`tests/conftest.py`, `QWEN.md`. Versions still say 0.1.0.

## Decisions worth knowing

- **Beams are chains of nodes.** A `beam` body in the scene becomes N + 1 hidden node bodies (default 8 segments, always a node in the
  middle) joined by corotational Euler-Bernoulli elements. Anything attached to the beam at a body-local point gets a node there (or snaps to
  a node within 20 % of a segment and keeps the offset as a rigid lever). The frame has one body with the beam's id (the middle node's pose) plus
  `nodes`, so graphs, `get_state` and the scene order are unchanged. Supports, springs, loads, ropes, Stabs and joints work on a beam like on a block.
- **Substeps.** Steel is stiff: a thin 2 m strip has modes up to ~10³ rad/s, a steel bar between 1 kg nodes ~10⁴ rad/s, far past what dt = 1 ms
  integrates stably. `World::step` splits a step into `ceil(omega dt / 0.25)` substeps from an estimate of the highest frequency. Scenes
  without stiff elements take exactly one step as before (all earlier results are unchanged). The cost is small (a truss: ~1 ms per display frame).
- **Elastic vs rigid Stab.** A rigid `rod` stays a constraint (statically determinate trusses; a redundant one is still reported as
  "constraint system is singular"). With a cross section it becomes a `bar` element with the same id (the editor moves it between the lists),
  which also makes statically indeterminate trusses solvable.
- **Sections.** The member axis is the line of centroids. Bending is about the axis normal to the plane; the product of inertia of the L is
  neglected (no unsymmetric bending). `H` is the `I` turned by 90 degrees, so beams of the same dimensions show the strong and weak axis.
- **Right-click while running** uses the *current* poses (`massesAt`) and considers masses only: supports, loads and springs on a small block
  do not hide it.
- **Harmonic load** is evaluated at the start of the step; it is not conservative, so `free_vibration` (damper) and `forced_vibration`
  are excluded from the all-scenes energy test, and the two truss scenes are checked on the scale of the energy that moves (the generic drift
  metric divides by the peak kinetic energy, which is ~0 for a structure at rest).
- The uncommitted half-written redundant-constraint solver that was in the worktree when this started (`lagrange.cpp` with an undefined
  placeholder; it did not compile) was discarded; a copy of that diff was kept outside the repo. Over-constrained layouts are still reported
  as singular, which the existing tests assert.

## Not done / ideas

- Plastic yielding (buckling of bars: see v0.4b; the stress is the linear-elastic value; a thin steel strip swinging widely shows stresses above yield).
- Structural damping of beams (use a damper). Rayleigh damping would also tame the highest numerical modes.
- Unsymmetric bending (L, T bending out of the symmetry plane), shear deformation (Timoshenko), out-of-plane motion.
- Graphs of velocities, accelerations, forces and bar forces against time; graphs of nodes of a beam other than the middle (the tip).
- Free nodes inside a beam as drawn objects; a joint between a Stab and the *middle* of a beam is made with the joint tool on a node
  placed on the beam.
- Moving a node that carries a support moves the support (the support wins the grab); a Stab end on a node cannot be re-attached by dragging
  (delete and redraw).
- Version strings (see v0.2 notes).

## Tests

```
100% tests passed out of 120   (ctest; 26 new: sections, beams, bars, nodes, harmonic loads, substeps)
365 passed, 1 warning          (pytest; includes the Node run, editor -> engine layouts, physics of the example scenes)
tests 210, pass 210, fail 0    (node --test tests/frontend; 59 new)
```

New: `tests/native/test_section.cpp`, `test_beam.cpp`, `elements/test_bar.cpp`; `tests/validation/test_v04_physics.py` (harmonic, free and
forced vibration against theory, truss forces against the method of joints and the stiffness method, cantilever and I beam deflection and
frequency); `tests/python/test_scene_v04.py`, `test_v04_native.py`, `test_trace.py`, `test_section_parity.py` (JS, C++ and a Python
reference agree to 1e-12), extended `test_editor_scenes.py` (a Fachwerk, a beam and a forced vibration built with the editor tools);
`tests/frontend/{theme,graphs,section,truss,beam}.test.mjs`; a v0.4 section in `tests/frontend/smoke.html` (both colour schemes).

## Manual checks in the browser (native engine)

`forced_vibration` with its graph (beating transient, then 0.39 m steady state), `truss_bridge` (member forces +1.01 / +1.42 / -2.02 /
-1.44 kN as by hand), `cantilever_beam` (bends and swings, tip block turns with the tip), `beam_i_section` (opens with bending x 50), a Fachwerk
drawn with real clicks (five nodes, seven Stabs), the beam popup with the drawing of a T section, the symbol gallery in light and dark. As before,
a synthesized right-click does not emit `contextmenu` in the embedded pane, so that event was dispatched directly.
