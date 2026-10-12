// damper.js - Dämpfer (dashpot): a cylinder open towards end b with a piston plate inside, a rod
// from the plate out to b and a lead to the closed end at a.
const CYL_WIDTH = 7; // px, half width of the cylinder
const PLATE_WIDTH = 5;
const MIN_LENGTH = 34; // px: shorter than this it is just a line

export function drawDamper(ctx, cam, spec, entry, theme) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return;
  const ux = (bx - ax) / L; // unit vector a -> b
  const uy = (by - ay) / L;
  const nx = -uy;
  const ny = ux;
  const at = (s, off = 0) => [ax + ux * s + nx * off, ay + uy * s + ny * off];

  ctx.save();
  ctx.strokeStyle = theme.damper || theme.spring;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';

  if (L < MIN_LENGTH) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  } else {
    const cylStart = 0.18 * L;
    const cylEnd = Math.max(cylStart + 16, 0.58 * L); // open end towards b
    const plate = cylStart + 0.6 * (cylEnd - cylStart);
    ctx.beginPath();
    ctx.moveTo(ax, ay); // lead to the closed end
    ctx.lineTo(...at(cylStart));
    ctx.moveTo(...at(cylEnd, CYL_WIDTH)); // the U of the cylinder
    ctx.lineTo(...at(cylStart, CYL_WIDTH));
    ctx.lineTo(...at(cylStart, -CYL_WIDTH));
    ctx.lineTo(...at(cylEnd, -CYL_WIDTH));
    ctx.moveTo(...at(plate, PLATE_WIDTH)); // piston plate
    ctx.lineTo(...at(plate, -PLATE_WIDTH));
    ctx.moveTo(...at(plate)); // rod out of the open end to b
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
