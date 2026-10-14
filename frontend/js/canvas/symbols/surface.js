// surface.js - fixed surface: a line (or a curve, a polyline) with hatching on its right-hand side, the solid side. Blocks and discs rest on
// the free, left-hand side (v0.8: they collide with it). A surface with friction is hatched with longer, closer strokes.
import { surfacePath } from '../../editor/geometry.js';

const HATCH_PITCH = 12; // px along the surface
const HATCH_LENGTH = 8; // px
const ROUGH_PITCH = 8;
const ROUGH_LENGTH = 11;

export function drawSurface(ctx, cam, surface, theme) {
  const path = surfacePath(surface).map((p) => cam.toScreen(p));
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  if (total < 1) return;

  const rough = surface.friction > 0;
  const pitch = rough ? ROUGH_PITCH : HATCH_PITCH;
  const h = (rough ? ROUGH_LENGTH : HATCH_LENGTH) / Math.SQRT2;

  ctx.save();
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();

  // hatching every `pitch` px of the path, on the right of the direction of travel: (-uy, ux) as seen on the screen (y down)
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  const count = Math.max(1, Math.floor(total / pitch));
  const step = total / count;
  let next = 0; // arc length of the next stroke
  let run = 0; // arc length at the start of the current segment
  for (let i = 0; i + 1 < path.length && next <= total + 1e-6; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-9) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    while (next <= run + len + 1e-6 && next <= total + 1e-6) {
      const s = Math.min(len, Math.max(0, next - run));
      const x = ax + ux * s;
      const y = ay + uy * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x - uy * h - ux * h, y + ux * h - uy * h);
      next += step;
    }
    run += len;
  }
  ctx.stroke();
  ctx.restore();
}
