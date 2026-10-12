# v0.3b notes: two-click supports that span the gap to their surface

Branch `v0.3b/support-placement` (from `main` after v0.3). Frontend only: no engine, schema, contract or other frozen file
changed.

## What changed

- **Placement is two clicks** for Festlager, fixed Lager and Loslager: first a point of a mass (centre, corner, edge snapping),
  then the surface it sits on. The second click only has to be on (within 15 px of) the surface; the support's foot is where the
  point projects onto it. While the pointer hovers a surface the preview shows the finished symbol and highlights the surface.
  Escape cancels after the first click. The Loslager needs a surface; a Festlager or fixed Lager clicked elsewhere is placed
  without one. A Festlager clicked in free space (no mass) still needs just one click (v0.3).
- **The symbol adapts to the surface and spans the gap.** It is rotated to the surface angle and the point-to-surface distance
  (along the surface normal, on the side of the mass) sets its size: Festlager and Loslager grow in height (width only
  partly, so neighbours do not overlap; hinge and line widths keep their pixel size), the fixed Lager gets a rigid stem. At
  default size it is the same as before. The distance is derived from the support's existing `surface` reference and its current
  position, so it needs no new field: it follows a sliding Loslager and moved masses or surfaces automatically
  (`supportHeight()` in `symbols/supports.js`, injected by the renderer).
- **Supports keep their surface at any distance** when masses or surfaces are moved or when the support is dragged with the move
  tool (before, a support that was no longer touching dropped its surface). One without a surface still adopts one that it now
  touches. The angle follows the side of the surface the supported point is on; a point within 1 cm of the surface (touching,
  with snapping noise) takes the side of the mass's centre.

## Not changed

The engine only uses the support point and `params.angle` (the surface direction), so a support with a gap holds exactly like
one that touches: the mass is held at its initial distance (a rigid leg). Saved v0.3 layouts load unchanged; their supports just
touch the surface.

## Tests

```
100% tests passed out of 85          (ctest, unchanged)
248 passed, 1 warning                (pytest; +3: the new editor scene is validated, run, and a block held 0.5 m above a
                                      floor by two Loslager placed with a gap)
tests 144, pass 144, fail 0          (node --test tests/frontend; +7 net: two-click flow, gap preview, surface pick range,
                                      Escape, no-surface supports, supportHeight, renderer height injection, move semantics)
```

Also checked in the browser: block hovering 1 m above a floor with two Loslager (preview while hovering the floor, then the
placed symbols); symbol gallery (`tests/frontend/smoke.html`, new v0.3b section) with gaps 0 to 1.3 m, roller, fixed Lager and a
sloped surface.
