// supports.js - Lager symbols. v0.1: Festlager (pin_support).
const TRI_HALF_BASE = 12; // px (24 px wide)
const TRI_HEIGHT = 18;
const GROUND_HALF = 17; // 34 px wide
const GROUND_GAP = 3;
const HATCH_COUNT = 6;
const HATCH_LENGTH = 6;
const HINGE_RADIUS = 4;

// Fixed pixel sizes, always upright (supports do not rotate with the body).
export function drawPinSupport(ctx, cam, spec, entry, theme) {
  const [px, py] = cam.toScreen(entry.position);
  const baseY = py + TRI_HEIGHT;
  const groundY = baseY + GROUND_GAP;

  ctx.save();
  ctx.strokeStyle = theme.support;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - TRI_HALF_BASE, baseY);
  ctx.lineTo(px + TRI_HALF_BASE, baseY);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px - GROUND_HALF, groundY);
  ctx.lineTo(px + GROUND_HALF, groundY);
  ctx.stroke();

  // Hatching below the ground line, 45 degrees.
  const d = HATCH_LENGTH / Math.SQRT2;
  const pitch = (2 * GROUND_HALF) / HATCH_COUNT;
  ctx.beginPath();
  for (let i = 0; i < HATCH_COUNT; i++) {
    const x = px - GROUND_HALF + pitch * (i + 1);
    ctx.moveTo(x, groundY);
    ctx.lineTo(x - d, groundY + d);
  }
  ctx.stroke();

  // Hinge circle on top.
  ctx.fillStyle = theme.background;
  ctx.beginPath();
  ctx.arc(px, py, HINGE_RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
