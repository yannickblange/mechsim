# v0.3c notes: damper

Branch `v0.3c/damper` (from v0.3b). Not merged.

## What was added

- Engine: `elements/damper.cpp`, an element like the spring: `F = c u . (v_b - v_a)` along the axis, tension positive, stores no
  energy. Registered as `damper`.
- Scene format: element `damper` with anchors `a`, `b` and `params.c` (N s / m, >= 0). Version stays 0.3. `validate_scene` also
  rejects ends on unknown masses, both ends on the ground, and both ends on the same mass.
- Editor: **Damper** tool (two clicks, ends snap like rope and Stab ends: masses, surfaces, free-space Festlager), default
  c = 10 N s/m, c in the properties popup. Dampers are selectable, movable (drag an end to re-attach it), highlighted with their
  connections, scale with a resized mass and are deleted with it, exactly like springs. Dashpot symbol (cylinder, piston plate, rod).
- Example scene `spring_damper` (spring above, damper below, zeta = 0.2).

## Frozen files changed (approved for v0.3, which v0.3c continues)

`native/engine/core/registry.cpp`, `contracts/scene.schema.json`, `contracts/units.md`, `frontend/js/canvas/symbols/index.js`.
Nothing else frozen. Versions still say 0.1.0.

## Things to know

- **Stability.** The damping force uses the velocities at the start of the step, so the scheme is stable for `c dt / m_eff < 2`
  (at dt = 1 ms: `c / m < 2000 1/s`). A very stiff damper on a light mass oscillates numerically; reduce dt or c.
- **Energy.** A system with a damper loses energy by design, so `spring_damper` is excluded from the all-scenes energy-drift test;
  `tests/validation/test_v03c_damper.py` checks the decay instead.
- Attach the spring and damper of a parallel pair on the line through the centre of mass; off-centre attachment couples
  rotation into the motion (the example does this).

## Tests

```
100% tests passed out of 94          (ctest; 9 new: decay, sign, torque, momentum, spring-mass-damper, energy, factory, frame)
272 passed, 1 warning                (pytest; damped frequency and decay ratio, force = c dL/dt per step, terminal velocity,
                                      schema / reference checks, editor -> engine damper)
tests 151, pass 151, fail 0          (node --test tests/frontend; 7 new)
```
