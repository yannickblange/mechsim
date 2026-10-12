// rod.js - Stab: a thick bar with a hinge at each end (it takes push and pull).
const HINGE = 4; // px

export function drawRod(ctx, cam, spec, entry, theme) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);
  ctx.save();
  ctx.strokeStyle = theme.ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = theme.background;
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, HINGE, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
