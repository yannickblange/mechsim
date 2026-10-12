// joint.js - joints between two masses: Gelenk (pin_joint, a ring) and rigid joint (fixed_joint,
// a filled square). Both are drawn at the joint point so it is clearly visible where masses are joined.
const RING = 6.5; // px
const HALF = 6;

export function drawPinJoint(ctx, cam, spec, entry, theme) {
  const [x, y] = cam.toScreen(entry.position);
  ctx.save();
  ctx.strokeStyle = theme.support;
  ctx.fillStyle = theme.background;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, RING, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.support;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

export function drawFixedJoint(ctx, cam, spec, entry, theme) {
  const [x, y] = cam.toScreen(entry.position);
  ctx.save();
  ctx.strokeStyle = theme.support;
  ctx.fillStyle = theme.support;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x - HALF, y - HALF, 2 * HALF, 2 * HALF);
  ctx.globalAlpha = 1;
  ctx.strokeRect(x - HALF, y - HALF, 2 * HALF, 2 * HALF);
  ctx.fillStyle = theme.background;
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}
