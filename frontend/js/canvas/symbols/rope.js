// rope.js - Seil: a line that is straight while taut and hangs in a curve while slack.
const KNOT = 3; // px

// Control point (world) of the quadratic curve a slack rope of `length` hangs in between p1 and p2,
// or null if it is taut. A parabola with the rope's arc length: length ~ d + 8 s^2 / (3 d) for a peak
// sag s; the control point is 2 s from the chord. It hangs down (world -y), sideways for a
// vertical rope.
export function ropeControlPoint(p1, p2, length) {
  const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (!(length > d + 1e-6) || d < 1e-9) return null;
  const sag = Math.sqrt((3 * d * (length - d)) / 8);
  let nx = -(p2[1] - p1[1]) / d;
  let ny = (p2[0] - p1[0]) / d;
  if (ny > 0 || (Math.abs(ny) < 1e-9 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return [(p1[0] + p2[0]) / 2 + nx * 2 * sag, (p1[1] + p2[1]) / 2 + ny * 2 * sag];
}

// Points of the curve (or the straight line) for hit testing.
export function ropePolyline(p1, p2, length, n = 16) {
  const c = ropeControlPoint(p1, p2, length);
  if (!c) return [p1, p2];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * p1[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return pts;
}

export function drawRope(ctx, cam, spec, entry, theme) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);
  const d = Math.hypot(entry.p2[0] - entry.p1[0], entry.p2[1] - entry.p1[1]); // m
  const length = entry.length ?? (spec.params && spec.params.length) ?? d;
  const taut = entry.taut !== false || !(length > d + 1e-6);

  ctx.save();
  ctx.strokeStyle = theme.rope || theme.spring;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = taut ? 2.6 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  const control = taut ? null : ropeControlPoint(entry.p1, entry.p2, length);
  if (!control) {
    ctx.lineTo(bx, by);
  } else {
    const [cx, cy] = cam.toScreen(control);
    ctx.quadraticCurveTo(cx, cy, bx, by);
  }
  ctx.stroke();
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, KNOT, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
