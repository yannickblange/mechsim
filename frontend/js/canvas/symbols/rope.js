// rope.js - Seil: a line that is straight while taut and hangs in a curve while slack.
const KNOT = 3; // px

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
  const chord = Math.hypot(bx - ax, by - ay);
  if (taut || chord < 2) {
    ctx.lineTo(bx, by);
  } else {
    // A parabola with the rope's arc length: length ~ d + 8 s^2 / (3 d), s = peak sag.
    const sag = Math.sqrt((3 * d * (length - d)) / 8) * cam.scale;
    let nx = -(by - ay) / chord; // chord normal, pointing down the screen (the rope hangs)
    let ny = (bx - ax) / chord;
    if (ny < 0 || (Math.abs(ny) < 1e-9 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    ctx.quadraticCurveTo((ax + bx) / 2 + nx * 2 * sag, (ay + by) / 2 + ny * 2 * sag, bx, by);
  }
  ctx.stroke();
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, KNOT, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}
