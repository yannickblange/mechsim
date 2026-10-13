# v0.7 notes: Einspannung of Stabs and beams, Festlager rotation, snapping, Shift

Branch `v0.7/euler-support-snapping` (from `main` at v0.6), not merged.

## What was asked

The saved layout `Knick Fall` (Eulerknickfall: a 2 m steel Stab, Einspannung at the foot, Loslager at the top on a wall, 150 kN down) did not
behave like a clamped column. Plus: Stabs and beams on a surface should be fest eingespannt; the Festlager should be placed like the Loslager, the
second click allowed in free space (it then only sets the rotation); the load arrow hid the Stab; springs placed on a surface snap to 0, 30, 45, 60, 90
degrees; Shift prevents snapping everywhere.

## What was wrong: the engine pinned every Stab end

An elastic Stab was a chain of beam elements **hinged at both ends** (v0.4b: "columns with other end conditions than pinned are not offered"). The
Einspannung on the foot node held the node, but the node is a point mass the bar is hinged to, so the Stab was free to rotate there: Euler's case 2 with
`P_cr` = 110.5 kN, and the 150 kN load buckled it. The fix is in the engine (below); the Knick Fall now loads as clamped - pinned (case 3, `P_cr` = 226 kN)
and carries 150 kN (72 %).

## What was added

| Layer | Content |
|-------|---------|
| Engine | `addBar`: an end on a **node with a `fixed_support`** is clamped (`End::hinge = false`, `phi0` = the node's angle); `bucklingFactor` (K = 1, 0.699, 0.5) in `BeamElement`, the frame's `pcr` is `pi^2 E I / (K L)^2`; `scene_loader` finds the clamped nodes before it loads the elements. No schema change |
| Tests | `tests/native/elements/test_bar.cpp` (clamped - pinned column, cantilever), `tests/validation/test_v07_physics.py` (the Knick Fall, moment at the foot) |
| Beams | a beam end that sticks to a surface (it now sticks to a surface the pointer is near, otherwise the angle snaps as before) gets an Einspannung at that end: `addBeam({ clamps })`, one undo step |
| Stabs | a Stab end snaps to surfaces now (it did not); **making a Stab elastic** puts an Einspannung on each end node that lies on a surface, has no support and belongs to this Stab only (`clampStandingEnds`) |
| Supports | Festlager and Einspannung: the second click on a surface adapts as before, **in free space it sets the rotation** (the symbol points at the click, snapped to 0, 30, 45, 60, 90 degrees); a point carries one support: a Festlager or Einspannung replaces the one that is there (`pushSupport`) |
| Spring | first end on a surface: the second end is held on the ray at 0, 30, 45, 60, 90 degrees **to that surface** (points of masses on the ray); first end on a mass: the end on a surface lands where an allowed ray meets it |
| Shift | `Tool.shift` is set from every pointer event; `snapPoint({ free })`: the exact point, a mass under it is still found. Rectangle, circle, surface, beam, spring (and its relaxed length), load, supports, move tool (grid, landing on a surface, re-attaching): nothing snaps. The hint line says so |
| Hit test | the arrow of a load is hit where it is **drawn** (320 px at most; the old test used 0.05 m / N, 7.5 km for 150 kN), where it acts and at its head first, its shaft only after Stabs, springs and ropes |
| Frontend text | the elastic-Stab form tells the end conditions and `K` with the Euler load |

## Decisions worth knowing

- **Why a Stab is clamped only when it is made elastic.** First version: every Stab end drawn on a surface got an Einspannung. That clamps every floor node of a
  Fachwerk (the example truss has three on the floor) and the engine rejects the doubled supports as singular; a rigid Stab is a truss member, an Einspannung means
  nothing for it. So a standing Stab is clamped when it becomes **elastic**, and only if its end node is alone (a Fachwerk joint is not clamped), on a surface and
  without a support. If you want it at creation instead, it is `clampStandingEnds` called from `addRod`.
- **The loader derives the clamp from the scene**, so old scenes (the Knick Fall) change without editing: any elastic Stab ending on a node with a fixed_support is
  clamped now. A Fachwerk with an Einspannung on a node behaves differently from v0.6 (the bar ends there are fixed in rotation); the example scenes have none.
- **`pcr` assumes the far end is held sideways** (Euler cases 2, 3, 4). A clamped Stab with a free top (case 1, K = 2) buckles at a quarter of the pinned load and the label does not know.
- **A sudden load is dynamic.** The Knick Fall has damping 0 on the bar: 150 kN applied at t = 0 swings the axial force up to about 2 x 150 kN (the force label read
  -162 kN at 3.4 s and -197 kN at 6 s), above the static Euler load of 226 kN at the peaks, but too briefly to buckle. Set the damping > 0 for the static picture.
- **Spring angles are relative to the surface**, which is the same as the world angles for floors and walls. Shift keeps the old free behaviour.

## Tests

```
100% tests passed out of 131   (ctest)
381 passed                     (pytest)
237 pass, 0 fail               (node --test tests/frontend)
```
