# v0.4b notes: bending and buckling of Stabs, damping

Branch `v0.4b/buckling` (from `v0.4/graphs-beams`), not merged. Follows `docs/tickets/v0.4/notes.md`.

## What was asked

1. *"In the beam I section example the beam oscillates instead of bending to its maximum and holding there, since it is a constant force no?"*
   A constant force applied **suddenly** to an elastic system without losses makes it swing between 0 and twice the static deflection for ever; that is
   what the v0.4 example did, and it is correct physics. A real beam loses energy. v0.4b adds **viscous damping** (`damping` of nodes, beams and elastic Stabs):
   the I-beam example now overshoots once and holds its static deflection (11.8 mm + 0.5 mm of its own weight); the undamped variant still swings (set damping 0).
2. *Bending and buckling of the Stab when it is given a cross section.* An elastic Stab is now a **beam-column**: a chain of beam elements pinned at both
   anchors with hidden internal nodes carrying its steel mass. It sags under its own weight and **buckles** in the plane at the Euler load `pi^2 E I / L^2`.

## What was added

| Layer | Content |
|-------|---------|
| Engine | `BeamElement` generalised: hinged anchored ends, the bowing term (geometric stiffness), bar frames (`nodes`, `pcr`); `addBar` (chain, half-sine bow, end weights); `Body::hidden`, `Body::damping`; `estimateMaxOmega` sets velocities aside; `elements/bar.*` removed |
| Contracts | schema: `damping` (node, beam, bar), bar `segments`, `mass`, `imperfection`; frame: bar `nodes`, `pcr`; units, formulation |
| Python | `analysis/truss.py` includes the weight of elastic Stabs |
| Frontend | bars drawn along their bent shape, label with the percentage of the Euler load (bold from 90 %, "buckled" from 100 %), elastic-Stab form (Euler load, slenderness, elements, mass, damping, initial bow in mm), damping in the beam and node forms, defaults (new beams and elastic Stabs: damping 5 / s) |
| Scenes | `buckling_columns` (two identical 2 m steel columns at 70 % and 130 % of the Euler load), `beam_i_section` damped, `truss_elastic` damped |

## Decisions worth knowing

- **Damping is mass proportional** (force `-alpha m v`), not stiffness proportional. I built the usual structural choice first (Rayleigh `C = beta K`): explicit
  integration needs `beta omega_max^2 dt < 2`, and for steel the highest mode is ~10^4 rad/s, so either the damping is capped to nothing useful (my first
  attempt: the beam still rang after 10 s) or it needs hundreds of substeps per millisecond. Mass-proportional damping is unconditionally cheap, and decays **every** mode like
  `exp(-alpha t / 2)`. The price: it also acts on rigid-body motion (a free beam slows down like in a viscous medium), documented, default 0 in the engine.
- **`bar` with `segments: 1` is exactly the v0.4 bar** (massless, axial only, cannot buckle); the default is 4 elements. The tests that compare with the stiffness method
  use `segments: 1`, because ...
- **... heavy slender members are softer than E A / L.** A 2 m, 20 mm steel member weighs 12.6 kg and sags 2 mm; the chord shortens by `8 w^2 / 3 L` = 7 micrometres, as much
  as the load deforms a stiff truss (24 micrometres). In `truss_elastic` the redundant members therefore shift by a few ten per cent of the largest force against the
  textbook stiffness method, while the statically determinate members and the equilibrium do not. Checked: same result with 8 elements, exact with one element or light members.
- **Default imperfection 1e-5 L**, not the realistic 1e-3: at L / 1000 the arc excess of a bowed bar is as large as the elastic deformation of a stiff truss and shifted its forces
  by ~14 %. 20 micrometres on 2 m is enough to seed the instability (it grows to a metre in half a second above the Euler load); set the bow in the popup (1 / 1000 magnifies
  the deflection of a column below the Euler load by 1 / (1 - P / P_cr), the example `buckling_columns` does).
- The bar frame's `force` is the normal force of the element that carries the most: for a buckled column that is the full load (mean along a leaning bar would show 70 %).
- Buckling is in the plane, about the axis of the section's `I` (the H buckles about its weak axis); the L's product of inertia is neglected. The model is linear elastic
  with large rotations: no yielding, so a buckled steel column shows stresses far above the yield strength.

## Not done / ideas

- Plastic yielding, lateral-torsional and out-of-plane buckling, columns with other end conditions than pinned (fixing a node's rotation of a hidden node is not offered), a
  Stab that carries loads along its length (loads attach to nodes only).
- Graphs of bar force / deflection against time.

## Tests

```
100% tests passed out of 129   (ctest; 9 new: bars bend, buckle and follow the elastica, damping, input checks)
368 passed, 1 warning          (pytest)
tests 212, pass 212, fail 0    (node --test tests/frontend)
```

`tests/native/elements/test_bar.cpp` (pinned column: magnification `1 / (1 - P / P_cr)` at 0.3, 0.6, 0.8; no buckling at 0.9, buckling at 1.1; the post-buckled
deflection against Euler's elastica at 1.05, 1.1, 1.2; one element never buckles; sag `5 q L^4 / 384 E I`; input checks), `tests/native/test_beam.cpp` (a damped beam settles at
`P L^3 / 3 E I` and stays; an undamped one keeps swinging; damping of a free beam), `tests/validation/test_v04_physics.py` (I-beam settles / swings, buckling columns against the
Euler load and the elastica, elastic truss exact with one element and within the sag effect with four), `tests/frontend/truss.test.mjs` (elastic-Stab form).

## Manual checks in the browser

`beam_i_section` (graph: overshoot, then a flat line at 12 mm), `buckling_columns` (left column straight at 71 %, right column in the elastica, labelled "125 % of Pcr, buckled"), the
elastic-Stab popup with the drawing of an I section, the Euler load and the slenderness.
