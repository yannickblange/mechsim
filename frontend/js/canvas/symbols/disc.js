// disc.js - circular mass ("Scheibe").
const MARKER_RADIUS = 5; // px

export function drawDisc(ctx, cam, spec, entry, theme) {
  const [cx, cy] = cam.toScreen([entry.x, entry.y]);
  const r = spec.params.radius * cam.scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-entry.phi); // screen y points down, so counter-clockwise becomes negative

  ctx.fillStyle = theme.ink;
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.stroke();

  // A radius line makes the rotation visible.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();

  // Centre-of-mass marker, as on blocks.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, MARKER_RADIUS, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, MARKER_RADIUS, -Math.PI / 2, 0);
  ctx.closePath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, MARKER_RADIUS, Math.PI / 2, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.id, cx + r + 6, cy);
  ctx.restore();
}
