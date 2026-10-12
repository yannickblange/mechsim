// rod.js - Stab: a thick bar with a hinge at each end (it takes push and pull). A rigid Stab is a solid
// line, an elastic one (a bar with a cross section) an outlined one. While the simulation runs the
// axial force is written next to it and the bar is drawn in the colour of the force: tension blue,
// compression red.
const HINGE = 4; // px
const MIN_FORCE = 1e-6; // N: below this no label

export const formatForce = (f) => {
  const a = Math.abs(f);
  const text = a >= 1e5 ? `${(a / 1e3).toFixed(0)} kN` : a >= 1e3 ? `${(a / 1e3).toFixed(2)} kN` : `${a.toFixed(a >= 100 ? 0 : 1)} N`;
  return `${f < 0 ? '−' : '+'}${text}`;
};

export function strokeStab(ctx, cam, entry, theme, elastic) {
  const [ax, ay] = cam.toScreen(entry.p1);
  const [bx, by] = cam.toScreen(entry.p2);
  const force = entry.force || 0;
  const colour = Math.abs(force) < MIN_FORCE ? theme.ink : force > 0 ? theme.force : theme.compression;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  if (elastic) {
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = theme.background; // hollow
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = colour;
  ctx.fillStyle = theme.background;
  for (const [x, y] of [[ax, ay], [bx, by]]) {
    ctx.beginPath();
    ctx.arc(x, y, HINGE, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  if (Math.abs(force) >= MIN_FORCE && Math.hypot(bx - ax, by - ay) > 40) {
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    // beside the middle, on the upper side of the bar
    const side = ny > 0 || (ny === 0 && nx > 0) ? -1 : 1;
    const mx = (ax + bx) / 2 + side * nx * 13;
    const my = (ay + by) / 2 + side * ny * 13;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = formatForce(force);
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = theme.labelBg;
    ctx.fillRect(mx - w / 2, my - 8, w, 16);
    ctx.fillStyle = colour;
    ctx.fillText(text, mx, my);
  }
  ctx.restore();
}

export function drawRod(ctx, cam, spec, entry, theme) {
  strokeStab(ctx, cam, entry, theme, false);
}

// Elastic Stab: an element of the scene (type "bar") drawn like the rod, outlined.
export function drawBar(ctx, cam, spec, entry, theme) {
  strokeStab(ctx, cam, entry, theme, true);
}
