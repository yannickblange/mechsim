# B3: Camera, renderer, grid and stylesheet

**Agent:** B  **Depends on:** B1, B2 merged  **Branch:** `v0.1/B3-canvas`

## Files you own
- `frontend/css/main.css`
- `frontend/js/canvas/camera.js`
- `frontend/js/canvas/renderer.js`
- `frontend/js/canvas/grid.js`

## Read only
`frontend/index.html` (element ids and structure), `frontend/js/main.js` (how the renderer is
called), `frontend/js/canvas/symbols/index.js` (symbol signature), `contracts/*.schema.json`.

## Task
### camera.js: `export class Camera`
- Fields: `center` ([x, y] in m), `scale` (px per m, default 200), `width`, `height` (CSS px).
- `toScreen([x, y])` → `[width/2 + (x − cx)·scale, height/2 − (y − cy)·scale]` (y flips).
- `toWorld([sx, sy])` inverse of `toScreen`.
- `fit(center, worldWidth)`: `scale = width / worldWidth`.
- `zoomAt([sx, sy], factor)`: keep the world point under the cursor fixed; clamp scale to [5, 5000].
- `panBy(dx, dy)` in CSS px.

### grid.js: `export function drawGrid(ctx, cam, theme)`
Minor lines every 0.1 m, major every 1 m (choose a coarser step automatically when lines would
be closer than 8 px), axes x = 0 and y = 0 slightly stronger. Colours `theme.grid` / `theme.muted`.

### renderer.js: `export class Renderer`
- `constructor(canvas)`: 2D context, a `Camera`, pointer handling: wheel → `zoomAt` (factor 1.1
  per notch), drag with primary button → `panBy`, double-click → refit to scene.
- `resize()`: canvas backing store = CSS size × `devicePixelRatio`; draw in CSS px by
  `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`; update `cam.width/height`.
- `setScene(scene)`: store it, build maps id → spec for bodies, elements and constraints, fit the
  camera: `scene.view` if present, else the bounding box of body positions and ground anchor
  points with 50 % padding (min width 1 m).
- `render(frame)`: clear with `theme.background`, `drawGrid`, then draw in this order: elements,
  bodies, constraints, using the maps in `symbols/index.js` (`elementSymbols[type](ctx, cam,
  spec, entry, theme)` etc.). Unknown types are skipped with one `console.warn` per type.
  If `frame` is null but a scene is set, draw the **initial frame** computed from the scene
  (body pose from `position`/`angle`, spring p1/p2 from anchors, support position from its body
  point) so a freshly loaded scene is visible before play.
- `static readTheme()` (or a method): read CSS custom properties from `:root` and return
  `{background, grid, ink, muted, spring, support, force}`. Re-read on each `setScene` only.

### main.css
Visual direction: a **lecture-hall blackboard** (Tafelbild), since this is a TM tool. Define on `:root`:

```
--c-bg:      #22332b   /* slate green board */
--c-panel:   #1a2620
--c-grid:    rgba(233, 238, 228, 0.07)
--c-ink:     #e9eee4   /* chalk white: bodies, text */
--c-muted:   #9fb0a4
--c-spring:  #f0c96a   /* yellow chalk */
--c-support: #9cc3e6   /* blue chalk */
--c-force:   #e8868a   /* red chalk, used from v0.2 */
```
Layout: toolbar on top, canvas fills the rest, status bar at the bottom (CSS grid, full
viewport height, canvas never scrolls). System UI font stack, `font-variant-numeric: tabular-nums`
in the status bar. Buttons and selects in panel colour with a 1 px chalk outline; visible
`:focus-visible` ring; disabled buttons dimmed. `#conn[data-connected="true"]` gets the
support colour, false gets muted. `#error` sits over the canvas top, red chalk text on panel.
Sentence case everywhere; no uppercase labels.

## Acceptance
- `./tools/run_server.sh --mock`, open the page. Grid visible, zoom around the
  cursor works, pan works, double-click refits, resizing the window keeps the view sharp.
- With the symbols still stubbed (B4 not merged) the page shows the grid and raises no console errors.
- `node --check frontend/js/canvas/*.js` passes (syntax).
