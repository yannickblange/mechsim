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

## Fix: "fest eingespannt" for the ends on a Knoten or on the ground

Reported: the Stab form had no way to make one end fest eingespannt, and nothing clamped by itself. Cause: the choice existed only for ends on a block or a disc.
An elastic Stab is clamped by the engine at a Knoten that has an Einspannung (v0.7), but the editor offered no way to put one there, and the foot of a column on a
Festlager in free space (a ground anchor, as in `buckling_columns`) can never be clamped, because the engine pins ground ends.

Editor only, no engine or schema change:

- The elastic-Stab form shows **Anschluss Ende A / B** for every end on a Knoten or a ground Festlager (not for a rigid Stab: it is a pin there, the form says so). The Euler
  load in the text follows the choice live (`reshape`).
- *Fest eingespannt* on a Knoten puts an Einspannung on it (a Festlager there is replaced; on the surface the Knoten lies on, else free with the symbol turned away from the
  Stab). On a ground Festlager the end becomes a Knoten at that point and the Festlager becomes the Einspannung (same id, surface, angle); if other members are anchored to that
  Festlager it stays and the Knoten gets an Einspannung of its own. (`SceneModel.setStabClamps`, `clampEnd`.)
- *Gelenk* turns an Einspannung there into a Festlager: the Knoten stays where it is. It also opts out of the Einspannung that a Stab standing on a surface gets when it becomes elastic.
- Automatic behaviour is unchanged: an elastic Stab is clamped by itself only where its Knoten stands on a surface (v0.7). A ground Festlager is a pin by definition and stays one until chosen otherwise.
- A form value that is not submitted for a select counts as unchanged.

Checked: `tests/frontend/v07.test.mjs`; with the native engine, `buckling_columns` with S1's foot clamped has `pcr` 14134 N instead of 6909 N (K = 0.699) and the support reports a moment.

### Stab tool: fest einspannen where an end lands on a surface

The Stab tool has a checkbox **Enden an Flächen fest einspannen** (above the hint line, off by default, kept between Stabs). With it on, an end whose Knoten lands on a
surface and has no support yet gets an Einspannung on that surface (`addRod({ clampOnSurfaces })`, one undo step); a Knoten that other Stabs share (a Fachwerk joint) is clamped too
when the box is on, because it was asked for. Off, nothing changes: a floor node of a truss must not carry a support of its own. The Stab stays rigid; since v0.7c the Einspannung clamps it as a rigid cantilever, and it bends once the Stab is made elastic. Tool options are a new generic hook (`Tool.option` / `setOption`, `Editor.buildOption`).

### v0.7c: a rigid Stab on a node with an Einspannung is a rigid cantilever; bend selector for elastic Stabs

Found with the saved layouts `Stab beispiel` / `Stab beispiel 2`: a rigid Stab on a node with an Einspannung (E1) was only a pin, so under the tip load the top swung
round like a pendulum, although the foot was "fest eingespannt". (Chosen: option B, clamp rigid Stabs in the engine; not "make it elastic" and not "only a hint".)

- **Engine.** `scene_loader.cpp` finds the nodes with a `fixed_support` before it loads the elements *and* constraints and gives each rod end on such a node the internal
  `params.node_clamped_a / _b`; `Link` (`link.cpp`) clamps that end like an end on a block (rigid arm, 2 equations; the weld if both ends). The far end of the rod is then
  held: the Stab is a rigid cantilever, E1 reports `F` and the moment `F L`. Behaviour change: a rigid Stab on a node with an Einspannung used to be a pin. No scene
  in `scenes/` or the tests does that; a truss whose floor node has an Einspannung and members to several free nodes now fixes those nodes (use a Festlager there).
- **Editor.** The Stab form shows *Anschluss Ende* for every end on a Knoten or ground Festlager, rigid Stabs too; `stabClamps` (the clamp markers) counts rigid ones.
- **Why `Stab beispiel 2` "does not bend".** Its left Stab was already elastic (40 mm square steel, 0,9 m, 500 N): `P L^3 / 3 E I` = 2,7 mm at the tip (the undamped swing reaches 2x that), tip
  rotation 0,26 degrees - correct, and invisible at true scale. The **Biegung** selector (x 10 / x 50 / x 200) that exaggerates it was only shown for scenes with a beam body; it
  now also shows when there is an elastic Stab (`main.js`, `index.html` label).

### Free ends have no end condition

The *Anschluss* choice (v0.7b-2 / v0.7c) is only offered for an end that is **attached**: a ground Festlager, a Knoten with a Festlager or an Einspannung, or a Knoten that stands on a surface
(`clampableEnds`). An end in free space (a new Knoten with nothing on it, or a Fachwerk joint in the air) is free: no choice, nothing is added to it. (It was offered as "Gelenk" by mistake.)

### Bent clamped Stabs were drawn with an S curve (v0.7c-3)

Two display faults, both in how a bent elastic Stab (or beam) is drawn; the physics was right (a 1 m, 40 mm steel cantilever with 5 kN: tip `P L^3 / 3 E I` = 37 mm static, the undamped swing reaches twice that).

1. **Wrong section rotation at a clamped end.** The frame's `nodes` gave the *body* angle of the Knoten at a clamped end (0), not the rotation of the bar's section there (the axis direction, up = pi/2).
   The drawn Hermite curve therefore left the foot sideways: a kink at the foot, visible even at true scale. Engine fix in `BeamElement::writeFrame`: `atan2(u0) + (phi - phi0)`
   (`tests/native/elements/test_bar.cpp`, cantilever).
2. **The magnified bending was measured from the chord.** The "Biegung x N" display multiplies every node's offset from the line between the first and last node. That is right when both ends stay put
   (pinned, propped), but for a cantilever the chord has turned with the free tip, so the exaggerated shape bulged to the *wrong* side of it (the S curve). `exaggerate(nodes, k, ref)` now measures
   from the clamped end, in the direction of its section, when exactly one end is clamped by an Einspannung and the other end is free (`stabBendRef`, `beamBendRef` in `editor/ends.js`); the free end then
   moves k times as far. Everything else keeps the chord.

What remains is real: an undamped (damping 0) cantilever loaded suddenly keeps ringing with higher modes, so at x 50 its curve wobbles; set the damping (the editor's default for new elastic Stabs is 5 / s).
