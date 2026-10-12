// supports.js - Lager symbols: Festlager (pin_support), fixed Lager (fixed_support, Einspannung)
// and Loslager (roller_support).
//
// All three are drawn in a frame that is rotated by spec.params.angle (the direction of the surface
// the support sits on, body on its left): origin at the supported point, +y of that frame (screen
// down at angle 0) pointing into the ground. Sizes are fixed pixels; the symbols do not rotate
// with the body.
const TRI_HALF_BASE = 12; // px (24 px wide)
const TRI_HEIGHT = 18;
const GROUND_HALF = 17; // 34 px wide
const GROUND_GAP = 3;
const HATCH_COUNT = 6;
const HATCH_LENGTH = 6;
const HINGE_RADIUS = 4;
const ROLLER_RADIUS = 3.5;

// Runs draw() in the support's own frame.
function inSupportFrame(ctx, cam, spec, entry, theme, draw) {
  const [px, py] = cam.toScreen(entry.position);
  const angle = (spec.params && spec.params.angle) || 0;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-angle); // screen y points down: counter-clockwise becomes negative
  ctx.strokeStyle = theme.support;
  ctx.lineWidth = 1.5;
  draw(ctx, theme);
  ctx.restore();
}

// Ground line at y with 45 degree hatching below it.
function ground(ctx, y) {
  ctx.beginPath();
  ctx.moveTo(-GROUND_HALF, y);
  ctx.lineTo(GROUND_HALF, y);
  ctx.stroke();
  const d = HATCH_LENGTH / Math.SQRT2;
  const pitch = (2 * GROUND_HALF) / HATCH_COUNT;
  ctx.beginPath();
  for (let i = 0; i < HATCH_COUNT; i++) {
    const x = -GROUND_HALF + pitch * (i + 1);
    ctx.moveTo(x, y);
    ctx.lineTo(x - d, y + d);
  }
  ctx.stroke();
}

function triangle(ctx, baseY) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-TRI_HALF_BASE, baseY);
  ctx.lineTo(TRI_HALF_BASE, baseY);
  ctx.closePath();
  ctx.stroke();
}

function hinge(ctx, theme) {
  ctx.fillStyle = theme.background;
  ctx.beginPath();
  ctx.arc(0, 0, HINGE_RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

// Festlager: hinge on a triangle on the ground. Locks x and y, rotation is free.
export function drawPinSupport(ctx, cam, spec, entry, theme) {
  inSupportFrame(ctx, cam, spec, entry, theme, () => {
    triangle(ctx, TRI_HEIGHT);
    ground(ctx, TRI_HEIGHT + GROUND_GAP);
    hinge(ctx, theme);
  });
}

// Fixed Lager (Einspannung): the point is welded to the ground - a filled slab, no hinge.
// Locks x, y and rotation.
export function drawFixedSupport(ctx, cam, spec, entry, theme) {
  inSupportFrame(ctx, cam, spec, entry, theme, () => {
    ctx.lineWidth = 3;
    ground(ctx, 0);
    ctx.fillStyle = theme.support;
    ctx.fillRect(-GROUND_HALF, -4, 2 * GROUND_HALF, 4);
  });
}

// Loslager: triangle on two rollers; the point may slide along the surface, no friction.
export function drawRollerSupport(ctx, cam, spec, entry, theme) {
  inSupportFrame(ctx, cam, spec, entry, theme, () => {
    const baseY = TRI_HEIGHT - 4;
    triangle(ctx, baseY);
    for (const x of [-TRI_HALF_BASE / 2, TRI_HALF_BASE / 2]) {
      ctx.beginPath();
      ctx.arc(x, baseY + ROLLER_RADIUS, ROLLER_RADIUS, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ground(ctx, baseY + 2 * ROLLER_RADIUS + 1);
    hinge(ctx, theme);
  });
}
