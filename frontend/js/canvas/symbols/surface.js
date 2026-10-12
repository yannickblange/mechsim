// surface.js - fixed surface: a line with hatching on its right-hand side (p1 -> p2).
const HATCH_PITCH = 12; // px along the surface
const HATCH_LENGTH = 8; // px

export function drawSurface(ctx, cam, surface, theme) {
  const [ax, ay] = cam.toScreen(surface.p1);
  const [bx, by] = cam.toScreen(surface.p2);
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return;

  const ux = (bx - ax) / L; // direction along the surface, screen
  const uy = (by - ay) / L;
  // Right-hand side of p1 -> p2 as seen on screen (y points down): (-uy, ux) rotated the other way.
  const nx = -uy;
  const ny = ux;
  const h = HATCH_LENGTH / Math.SQRT2;

  ctx.save();
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  const count = Math.max(1, Math.floor(L / HATCH_PITCH));
  for (let i = 0; i <= count; i++) {
    const s = (i / count) * L;
    const x = ax + ux * s;
    const y = ay + uy * s;
    ctx.moveTo(x, y);
    ctx.lineTo(x + nx * h - ux * h, y + ny * h - uy * h);
  }
  ctx.stroke();
  ctx.restore();
}
