// supports.js - Lager symbols: Festlager (pin_support), fixed Lager (fixed_support, Einspannung)
// and Loslager (roller_support).
//
// All three are drawn in a frame that is rotated by spec.params.angle (the direction of the surface
// the support sits on, body on its left): origin at the supported point, +y of that frame (screen
// down at angle 0) pointing into the ground. The symbols do not rotate with the body.
//
// Size: by default fixed pixels. If entry.height (m) is given, the distance from the supported point
// to the surface it sits on (see supportHeight), the symbol grows so that its ground line lies on
// the surface: Festlager and Loslager scale uniformly, the fixed Lager gets a stem of that length.
const TRI_HALF_BASE = 12; // px (24 px wide)
const TRI_HEIGHT = 18;
const GROUND_HALF = 17; // 34 px wide
const GROUND_GAP = 3;
const HATCH_COUNT = 6;
const HATCH_LENGTH = 6;
const HINGE_RADIUS = 4;
const ROLLER_RADIUS = 3.5;

// Distance from the point to the ground line at the default size.
const PIN_REACH = TRI_HEIGHT + GROUND_GAP;
const ROLLER_REACH = TRI_HEIGHT - 4 + 2 * ROLLER_RADIUS + 1;

// Distance (m) of a supported point from the surface it sits on, measured along the surface normal
// on the side the body is on (params.angle: the body lies on the left of the surface direction).
// 0 if the point is on or beyond the surface.
export function supportHeight(surface, angle, position) {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const h = (position[0] - surface.p1[0]) * nx + (position[1] - surface.p1[1]) * ny;
  return h > 0 ? h : 0;
}

// Vertical scale factor so that a symbol whose ground line is `reach` px away reaches the surface.
function reachScale(cam, entry, reach) {
  const px = (entry.height || 0) * cam.scale;
  return px > reach ? px / reach : 1;
}

// A tall support grows mostly in height: its width only follows partly, so neighbours do not overlap.
const widthFactor = (ky) => Math.min(2.5, 1 + (ky - 1) * 0.3);

// Runs draw() in the support's own frame.
function inSupportFrame(ctx, cam, spec, entry, theme, draw, ky = 1) {
  const [px, py] = cam.toScreen(entry.position);
  const angle = (spec.params && spec.params.angle) || 0;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-angle); // screen y points down: counter-clockwise becomes negative
  ctx.strokeStyle = theme.support;
  ctx.lineWidth = 1.5;
  draw(ctx, theme, ky, widthFactor(ky));
  ctx.restore();
}

// Ground line at y (half-width `half`) with 45 degree hatching below it.
function ground(ctx, y, half = GROUND_HALF) {
  ctx.beginPath();
  ctx.moveTo(-half, y);
  ctx.lineTo(half, y);
  ctx.stroke();
  const d = HATCH_LENGTH / Math.SQRT2;
  const pitch = (2 * GROUND_HALF) / HATCH_COUNT; // the hatch spacing keeps its size
  const count = Math.round((2 * half) / pitch);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const x = -half + pitch * (i + 1);
    ctx.moveTo(x, y);
    ctx.lineTo(x - d, y + d);
  }
  ctx.stroke();
}

function triangle(ctx, baseY, half = TRI_HALF_BASE) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-half, baseY);
  ctx.lineTo(half, baseY);
  ctx.closePath();
  ctx.stroke();
}

// The hinge always has the same pixel size.
function hinge(ctx, theme) {
  ctx.fillStyle = theme.background;
  ctx.beginPath();
  ctx.arc(0, 0, HINGE_RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

// Festlager: hinge on a triangle on the ground. Locks x and y, rotation is free.
export function drawPinSupport(ctx, cam, spec, entry, theme) {
  inSupportFrame(ctx, cam, spec, entry, theme, (_c, _t, ky, kx) => {
    triangle(ctx, TRI_HEIGHT * ky, TRI_HALF_BASE * kx);
    ground(ctx, (TRI_HEIGHT + GROUND_GAP) * ky, GROUND_HALF * kx);
    hinge(ctx, theme);
  }, reachScale(cam, entry, PIN_REACH));
}

// Fixed Lager (Einspannung): the point is welded to the ground - a filled slab, no hinge.
// Locks x, y and rotation.
export function drawFixedSupport(ctx, cam, spec, entry, theme) {
  const stem = Math.max(0, (entry.height || 0) * cam.scale); // px from the point to the surface
  inSupportFrame(ctx, cam, spec, entry, theme, () => {
    ctx.lineWidth = 3;
    ground(ctx, stem);
    if (stem > 4) {
      ctx.beginPath(); // rigid stem from the point to the surface
      ctx.moveTo(0, 0);
      ctx.lineTo(0, stem);
      ctx.stroke();
    }
    ctx.fillStyle = theme.support;
    ctx.fillRect(-GROUND_HALF, -4, 2 * GROUND_HALF, 4);
  });
}

// Loslager: triangle on two rollers; the point may slide along the surface, no friction.
export function drawRollerSupport(ctx, cam, spec, entry, theme) {
  inSupportFrame(ctx, cam, spec, entry, theme, (_c, _t, ky, kx) => {
    const groundY = ROLLER_REACH * ky;
    const r = ROLLER_RADIUS * kx;
    const baseY = (TRI_HEIGHT - 4) * ky;
    triangle(ctx, baseY, TRI_HALF_BASE * kx);
    for (const x of [-TRI_HALF_BASE * kx / 2, TRI_HALF_BASE * kx / 2]) {
      ctx.beginPath();
      ctx.arc(x, groundY - 1 - r, r, 0, 2 * Math.PI); // the wheels stand on the ground line
      ctx.stroke();
    }
    ground(ctx, groundY, GROUND_HALF * kx);
    hinge(ctx, theme);
  }, reachScale(cam, entry, ROLLER_REACH));
}
