// contact.js - where a block or a disc touches a surface (v0.8): the normal force on the body as an arrow along the surface normal,
// the friction force along the surface (dashed), each with its value. Drawn from the frame's `contacts`.
import { decimal } from '../../format.js';

const M_PER_N = 0.01; // arrow length per newton on the screen at 1 px = 1 m / scale
const MIN_PX = 10;
const MAX_PX = 90;
const MIN_FORCE = 0.05; // N: smaller forces are not drawn
const HEAD = 7; // px

const length = (n, scale) => Math.min(MAX_PX, Math.max(MIN_PX, n * M_PER_N * scale));

function arrow(ctx, from, dirX, dirY, px) {
  const tipX = from[0] + dirX * px;
  const tipY = from[1] + dirY * px;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(tipX - dirX * HEAD * 0.6, tipY - dirY * HEAD * 0.6);
  ctx.stroke();
  const nx = -dirY;
  const ny = dirX;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dirX * HEAD + nx * HEAD * 0.4, tipY - dirY * HEAD + ny * HEAD * 0.4);
  ctx.lineTo(tipX - dirX * HEAD - nx * HEAD * 0.4, tipY - dirY * HEAD - ny * HEAD * 0.4);
  ctx.closePath();
  ctx.fill();
  return [tipX, tipY];
}

const text = (f) => `${decimal(Math.abs(f), Math.abs(f) >= 100 ? 0 : 1)} N`;

export function drawContacts(ctx, cam, contacts, theme) {
  if (!contacts || !contacts.length) return;
  ctx.save();
  ctx.strokeStyle = theme.force;
  ctx.fillStyle = theme.force;
  ctx.lineWidth = 2;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const c of contacts) {
    const p = cam.toScreen(c.point);
    const nx = c.normal[0];
    const ny = -c.normal[1]; // screen y points down
    if (c.normal_force >= MIN_FORCE) {
      ctx.globalAlpha = 0.9;
      const tip = arrow(ctx, p, nx, ny, length(c.normal_force, cam.scale));
      ctx.fillText(text(c.normal_force), tip[0] + 5 * (nx >= 0 ? 1 : -1) - (nx >= 0 ? 0 : 38), tip[1] + (ny >= 0 ? 8 : -8));
    }
    if (Math.abs(c.friction_force) >= MIN_FORCE) {
      // along the tangent perp(normal) = (-ny, nx) in the world, mirrored for the screen; the sign of friction_force gives the direction
      const tx = -c.normal[1] * Math.sign(c.friction_force);
      const ty = -c.normal[0] * Math.sign(c.friction_force);
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([5, 3]);
      const tip = arrow(ctx, p, tx, ty, length(Math.abs(c.friction_force), cam.scale));
      ctx.setLineDash([]);
      ctx.fillText(text(c.friction_force), tip[0] + 5 * (tx >= 0 ? 1 : -1) - (tx >= 0 ? 0 : 38), tip[1] + (ty >= 0 ? 8 : -8));
    }
  }
  ctx.restore();
}
