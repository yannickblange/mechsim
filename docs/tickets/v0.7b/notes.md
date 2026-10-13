# v0.7b notes: a Stab on a block or a disc is fest eingespannt

Branch `v0.7b/stab-on-mass` (from `v0.7/euler-support-snapping`), not merged.

## What was asked

The layout `Kreis Feder Beispiel` (a disc on a Festlager at its centre, two Stabs from its rim to two nodes held by springs): the Stabs let the nodes rotate against
the disc. Where a Stab is attached to the mass it should behave like a Festeinspannung.

## What was wrong

A rod was only a distance constraint, pinned at both ends. The force from a rim end then points along the rod, and for the rods of the example (through the centre)
there is no torque on the disc at the start at all; the springs could only pull the nodes round the disc, never turn it.

## What was added

| Layer | Content |
|-------|---------|
| Engine | `Link`: a rod end on a **block or disc** is clamped. The rod becomes a rigid arm of the mass: 2 equations (the far end stays at its lever on the mass, a pin joint between the two), 3 for a rod clamped at both ends (a weld). Frame `force` / `reaction` as before. `params.hinged_a` / `hinged_b` keep an end a pin. Elastic Stabs (`bar`) on a block or disc are clamped as well (same flags), the Euler load follows (`K`) |
| Contracts | `rodParams` and the bar's params: `hinged_a`, `hinged_b` (boolean, default false); formulation and units |
| Editor | `editor/ends.js` (which ends are clamped, mirrors the engine); the Stab form has **Anschluss Ende A / B** (Fest eingespannt / Gelenk) for an end on a mass, kept when the Stab becomes elastic and back (`model.setStabEnds`); clamped ends are drawn as a filled square, pins as a circle |
| Examples and tests | `rod_truss` (a block hung from two Stabs) and the old pendulum tests use `hinged_b`: two clamped rods would fix the block completely. New tests: `test_link.cpp` (a block clamped to a rod swings as a physical pendulum `T = 2 pi sqrt((J + m L^2) / (m g L))`, hinged unchanged, the axial force, the weld), `test_v07b_physics.py` (the example: the nodes stay at the tips of the arms and the disc turns; hinged ones do not), `v07.test.mjs` |

## Decisions worth knowing

- **Default clamped, the flag is the opt-out.** The alternative (default pinned, a flag to clamp) leaves the saved layout `Kreis Feder Beispiel` as it is, which is the thing
  that was asked to change. The price: the scene files that hang something from rods on a mass must say `hinged_*` (done for `rod_truss`); in the editor a Stab on a mass is clamped
  from the start and the form has the choice. A Stab to a **node** is a pin as before: a node is a Fachwerk joint, and a node with an Einspannung clamps an elastic Stab (v0.7).
- **Two clamped Stabs from the ground to one block cannot move.** That is the physics of two rigid arms on one rigid body, not a bug; the message is the engine's
  "constraint system is singular". To hang a block, set **Gelenk** at its ends.
- Ends on beams are still pins (a Stab on a beam node); only blocks and discs ("masses") clamp.
