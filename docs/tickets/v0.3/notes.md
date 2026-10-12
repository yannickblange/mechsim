# v0.3 notes: rope, Stab, joints, free-space Festlager, move tool

Branch `v0.3/links-joints` (from `main` after v0.2), commits `[V0.3-1]` to `[V0.3-4]`. Not merged.

## What was added

| Layer | Content |
|-------|---------|
| Engine | `rope` (tension only, infinitely strong, switches on and off), `rod` (Stab, push and pull), `pin_joint` (Gelenk), `fixed_joint`, free-space Festlager (`pin_support` with `body: null`), active-set iteration in the integrator, `projectVelocities` (also used for impulses) |
| Contracts | scene schema 0.3 (constraint types, `bodyAnchor`, rope `length`, `body: null` for `pin_support`), state schema (link fields), units, formulation |
| Python | reference checks for links, joints and free pins; mock frames for the new types |
| Frontend | tools Rope, Stab, Joint, Rigid joint, Move; Festlager in free space; connection markers (dotted rings where things meet) and a highlight of what a selected object is connected to; symbols rope (sags when slack), rod, joints; rope length and joint type in the properties popup |
| Scenes | `rope_catch`, `rod_truss`, `double_pendulum`, `welded_pendulum` |

## Frozen files changed (approved by the user for v0.3 as for v0.2)

`native/engine/core/registry.cpp`, `contracts/scene.schema.json`, `contracts/state.schema.json`, `contracts/units.md`,
`frontend/js/canvas/symbols/index.js`. Not touched: `CMakeLists.txt`, `pyproject.toml`, `mechsim.h`, `paths.py`,
`tests/conftest.py`, `index.html`, `main.js`, and every `*.hpp` that existed before v0.2. (`unilateral.hpp` is new;
`Constraint` is unchanged.) Versions still say 0.1.0.

## Decisions worth knowing

- **"Attaching anything to a mass is like a fixed support"** is implemented as: every attachment (spring, rope, rod, support,
  load) is a body-local point that moves with the mass and does not slide. The *ends* of ropes and Stabs are hinges (a Stab
  is a two-force member, so it cannot transmit a moment). A rigid connection between two masses is the separate
  **rigid joint** (`fixed_joint`); the **joint** tool makes a hinge.
- **Free-space Festlager.** It has no equations: it is a visible, snappable fixed point. Rope, Stab and spring ends that snap
  to it become ground anchors at its world point. The joint tool on a free pin with a mass on it turns it into an ordinary
  Festlager on that mass (same id). Its reaction is `[0, 0]` (the forces of attached links are not summed up).
- **Rope.** A rope that is taut at the start has length = distance; a longer `length` starts it slack. Slack: no force, drawn as a
  hanging curve. Snap: inelastic (the outward velocity vanishes, tangential velocity stays), energy is lost, no bounce.
  The scene format rejects a rope shorter than its end distance (the editor drops an explicit length when a move would make
  it too short). Because of the snap, `rope_catch` is excluded from the all-scenes energy test; instead the test checks the
  snap time, the energy loss `½ m v_r²` and that the energy never recovers.
- **Move.** Moves a mass together with what is attached to it and the masses joined to it through joints; surfaces move
  alone; a free-space Festlager takes the ground ends at its point with it; supports re-evaluate which surface they sit on.
  Dragging a support, load or an end re-attaches it (snapping as when creating it; invalid drops are refused with a
  message). A mass lands exactly on a surface within snap range (corner or rim); Shift turns the grid snap off.
  One drag is one undo step.
- Over-constrained layouts (two identical Stabs, a Stab plus a fixed support on the same point ...) are reported when
  applied ("constraint system is singular").
- Initial velocities that the constraints do not allow are projected away at the first step for ropes and Stabs (as an
  impulsive reaction); other constraints still correct them gradually (Baumgarte), as in v0.1.

## Not done / ideas

- Free nodes (a joint of two Stabs in free space) need a massless-node body; not modelled. Ends must be on a mass or the ground.
- The reaction of a free-space Festlager, and tension labels for ropes and Stabs in the UI.
- Pulleys, rope around corners, rope-surface contact; collision with surfaces still does not exist.
- Dragging a joint by itself (move one of its masses, which moves the joined group, instead).
- Version strings (see v0.2 notes).

## Tests

```
100% tests passed out of 85          (ctest; 16 new: link, joint, ground pin)
245 passed, 1 warning                (pytest; includes the Node run and editor -> engine tests)
tests 137, pass 137, fail 0          (node --test tests/frontend; 45 new)
```

New: `tests/native/constraints/{test_link,test_joint}.cpp`, `tests/validation/test_v03_physics.py` (rod truss statics, rope catch,
double pendulum vs RK4 Lagrange reference, welded pendulum period, free pin), `tests/python/{test_scene_v03,test_links_native}.py`,
extended `test_editor_scenes.py` (a block hung on a Stab and a rope from free pins; a chain built with the joint tool),
`tests/frontend/{links_joints,move}.test.mjs`, and a v0.3 section in `tests/frontend/smoke.html`.

## Manual checks in the browser (native engine)

`rope_catch` (slack curve, snap, swing; energy 11.77 J to 9.74 J), a layout built with the mouse (free Festlager, block, Stab,
move, second block, hinge joint) and run, rope properties popup, symbol gallery. As before, the synthesized right-click does not
emit `contextmenu` in the embedded pane, so that event was dispatched directly.
