// spring.js - "Feder" zig-zag symbol.
const LEAD = 0.15; // straight lead-in/out, fraction of the length
const ZIGZAG_POINTS = 8;
const AMPLITUDE = 6; // px

export function drawSpring(ctx, cam, spec, entry, theme) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return;

  const ux = (bx - ax) / L; // unit vector along the axis
  const uy = (by - ay) / L;
  const nx = -uy; // perpendicular
  const ny = ux;
  const at = (s, offset = 0) => [ax + ux * s + nx * offset, ay + uy * s + ny * offset];

  ctx.save();
  ctx.strokeStyle = theme.spring;
  ctx.fillStyle = theme.spring;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  const start = LEAD * L;
  const end = (1 - LEAD) * L;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(...at(start));
  for (let i = 0; i < ZIGZAG_POINTS; i++) {
    const s = start + ((i + 0.5) / ZIGZAG_POINTS) * (end - start);
    ctx.lineTo(...at(s, i % 2 === 0 ? AMPLITUDE : -AMPLITUDE));
  }
  ctx.lineTo(...at(end));
  ctx.lineTo(bx, by);
  ctx.stroke();

  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
