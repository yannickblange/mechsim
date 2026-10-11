# B4: Drawing symbols (Feder, Masse, Festlager) and smoke test

**Agent:** B  **Depends on:** B3 merged  **Branch:** `v0.1/B4-symbols`

## Files you own
- `frontend/js/canvas/symbols/spring.js`
- `frontend/js/canvas/symbols/block.js`
- `frontend/js/canvas/symbols/supports.js`
- `tests/frontend/smoke.html`

## Read only
`frontend/js/canvas/symbols/index.js` (signature), `frontend/js/canvas/camera.js`,
`contracts/*.schema.json`.

## Task
All symbols draw in CSS pixels via `cam.toScreen`. Symbol **sizes are fixed in pixels** (they do
not grow with zoom) except geometry that is physical (block size, spring length). Line width 1.5 px.
Each function saves/restores the context state.

- `drawSpring(ctx, cam, spec, entry, theme)`: from `entry.p1` to `entry.p2`. Straight lead-in
  for the first and last 15 % of the length, zig-zag with 8 points in between, amplitude 6 px,
  colour `theme.spring`. Small filled dots (r = 2.5 px) at both ends. Skip if screen length < 1 px.
- `drawBlock(ctx, cam, spec, entry, theme)`: rectangle `spec.params.width × height` centred on
  `(entry.x, entry.y)`, rotated by `entry.phi` (remember y flips: rotate the canvas by −phi).
  Stroke `theme.ink` 2 px, fill `theme.ink` at 8 % alpha. Centre-of-mass marker: circle r = 5 px
  with the top-right and bottom-left quarters filled (classic Schwerpunkt symbol), rotating with
  the body. Label `spec.id` in `theme.muted`, 11 px, next to the block (not rotated).
- `drawPinSupport(ctx, cam, spec, entry, theme)`: at `entry.position`, colour `theme.support`:
  hinge circle r = 4 px (filled with `theme.background`, stroked), triangle below with apex at
  the hinge, base 24 px wide, 18 px high; ground line 34 px wide 3 px below the base; 6 hatching
  strokes of 6 px at 45° below the ground line. Always upright (supports do not rotate).

### smoke.html
A standalone page (served at `/tests/smoke.html` by B1) that imports `/js/canvas/camera.js` and
the three symbol modules, creates a 900×300 canvas, and draws: springs at 3 lengths (short,
medium, long, one diagonal), blocks at phi = 0, 0.5, π/2, and a pin support, with hard-coded
`theme` colours matching `main.css`. No server API calls.

## Acceptance
- `./tools/run_server.sh --mock` → `/tests/smoke.html` shows all symbols correctly; the main page
  shows all four scenes with springs, blocks and Festlager, moving in mock mode.
- Rotated block corners match the spring attachment points in `pinned_block_spring` (mock mode).
- `node --check` on all three files passes.
