// block.js - rectangular mass ("Masse").
const MARKER_RADIUS = 5; // px

export function drawBlock(ctx, cam, spec, entry, theme) {
  const [cx, cy] = cam.toScreen([entry.x, entry.y]);
  const w = spec.params.width * cam.scale;
  const h = spec.params.height * cam.scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-entry.phi); // screen y points down, so counter-clockwise becomes negative

  ctx.fillStyle = theme.ink;
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  // Centre-of-mass marker: circle with the top-right and bottom-left quarters filled.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, MARKER_RADIUS, 0, 2 * Math.PI);
  ctx.stroke();
  const r = MARKER_RADIUS;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, -Math.PI / 2, 0); // top-right quarter (screen y down)
  ctx.closePath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, Math.PI / 2, Math.PI); // bottom-left quarter
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Label stays upright, to the right of the block's unrotated half width.
  ctx.save();
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.id, cx + w / 2 + 6, cy);
  ctx.restore();
}
