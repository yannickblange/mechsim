// spring.js - "Feder" zig-zag symbol, plus the dashed "ghost" showing the relaxed length.
const LEAD = 0.15; // straight lead-in/out, fraction of the length
const ZIGZAG_POINTS = 8;
const AMPLITUDE = 6; // px

// Zig-zag from screen point (ax, ay) to (bx, by) with the current stroke / fill style.
function strokeSpring(ctx, ax, ay, bx, by) {
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return false;

  const ux = (bx - ax) / L; // unit vector along the axis
  const uy = (by - ay) / L;
  const nx = -uy; // perpendicular
  const ny = ux;
  const at = (s, offset = 0) => [ax + ux * s + nx * offset, ay + uy * s + ny * offset];

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
  return true;
}

function endDots(ctx, points) {
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function drawSpring(ctx, cam, spec, entry, theme) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);

  ctx.save();
  ctx.strokeStyle = theme.spring;
  ctx.fillStyle = theme.spring;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  if (strokeSpring(ctx, ax, ay, bx, by)) endDots(ctx, [[ax, ay], [bx, by]]);
  ctx.restore();
}

// Relaxed state of a spring: a faded dashed spring of length `restLength` from world point
// `from` along world direction `towards` (a point on the axis). Draws a hollow ring at its free end.
export function drawSpringGhost(ctx, cam, from, towards, restLength, theme) {
  const dx = towards[0] - from[0];
  const dy = towards[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return;
  const end = [from[0] + (dx / len) * restLength, from[1] + (dy / len) * restLength];
  const [ax, ay] = cam.toScreen(from);
  const [bx, by] = cam.toScreen(end);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = theme.spring;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  strokeSpring(ctx, ax, ay, bx, by);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(bx, by, 4, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}
