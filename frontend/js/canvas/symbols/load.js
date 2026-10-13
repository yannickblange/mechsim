import { comma } from '../../format.js';

// load.js - external force and moment at a point: arrow (force) and circular arrow (moment).
// Constant loads are drawn solid, impulses dashed; an impulse fades once it has been applied. A harmonic
// load (v0.4) is drawn solid with its frequency in the label; its arrow follows the instantaneous force.
export const FORCE_M_PER_N = 0.05; // arrow length per newton (also used by the editor)
const MIN_ARROW_PX = 18;
const MAX_ARROW_PX = 320;
const MOMENT_RADIUS = 16; // px
const HEAD = 9; // px

function arrowHead(ctx, tipX, tipY, dirX, dirY) {
  const nx = -dirY;
  const ny = dirX;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dirX * HEAD + nx * HEAD * 0.4, tipY - dirY * HEAD + ny * HEAD * 0.4);
  ctx.lineTo(tipX - dirX * HEAD - nx * HEAD * 0.4, tipY - dirY * HEAD - ny * HEAD * 0.4);
  ctx.closePath();
  ctx.fill();
}

// Force arrow with its tail at the application point. Returns the tip (screen) or null.
function drawForce(ctx, cam, p, vector, impulse, theme) {
  const mag = Math.hypot(vector[0], vector[1]);
  if (mag < 1e-12) return null;
  const px = Math.min(MAX_ARROW_PX, Math.max(MIN_ARROW_PX, mag * FORCE_M_PER_N * cam.scale));
  const dirX = vector[0] / mag;
  const dirY = -vector[1] / mag; // screen y points down
  const tipX = p[0] + dirX * px;
  const tipY = p[1] + dirY * px;

  ctx.lineWidth = 2.5;
  if (impulse) ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(tipX - dirX * HEAD * 0.6, tipY - dirY * HEAD * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
  arrowHead(ctx, tipX, tipY, dirX, dirY);
  return [tipX, tipY];
}

// 270 degree arc around p with an arrow head; counter-clockwise for a positive moment.
function drawMoment(ctx, p, moment, impulse) {
  const ccw = moment > 0;
  const a0 = (30 * Math.PI) / 180; // world angles, counter-clockwise
  const a1 = (300 * Math.PI) / 180;
  ctx.lineWidth = 2.5;
  if (impulse) ctx.setLineDash([5, 3]);
  ctx.beginPath();
  // canvas angles are the negated world angles (y down)
  if (ccw) ctx.arc(p[0], p[1], MOMENT_RADIUS, -a0, -a1, true);
  else ctx.arc(p[0], p[1], MOMENT_RADIUS, -a1, -a0, false);
  ctx.stroke();
  ctx.setLineDash([]);
  const end = ccw ? a1 : a0;
  const tip = [p[0] + MOMENT_RADIUS * Math.cos(end), p[1] - MOMENT_RADIUS * Math.sin(end)];
  const sign = ccw ? 1 : -1;
  arrowHead(ctx, tip[0], tip[1], -sign * Math.sin(end), -sign * Math.cos(end));
}

const trimNumber = (x) => comma(Math.round(x * 100) / 100);

export function drawLoad(ctx, cam, spec, entry, theme) {
  const params = spec.params || {};
  const vector = entry.vector || params.force || [0, 0];
  const moment = entry.moment ?? params.moment ?? 0;
  const impulse = (entry.mode || params.mode) === 'impulse';
  const harmonic = (entry.mode || params.mode) === 'harmonic';
  const p = cam.toScreen(entry.p1);

  ctx.save();
  ctx.strokeStyle = theme.force;
  ctx.fillStyle = theme.force;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = entry.active === false ? 0.25 : 1;

  const tip = drawForce(ctx, cam, p, vector, impulse, theme);
  if (moment !== 0) drawMoment(ctx, p, moment, impulse);

  // anchor dot
  ctx.beginPath();
  ctx.arc(p[0], p[1], 3, 0, 2 * Math.PI);
  ctx.fill();

  const parts = [];
  const mag = Math.hypot(vector[0], vector[1]);
  if (mag > 0) parts.push(`${trimNumber(mag)} ${impulse ? 'N·s' : 'N'}`);
  if (moment !== 0) parts.push(`${trimNumber(moment)} ${impulse ? 'N·m·s' : 'N·m'}`);
  if (harmonic) {
    // the label names the excitation (amplitude and frequency), the arrow shows the value now
    const amp = trimNumber(entry.force ?? Math.hypot(...(params.force || [0, 0])));
    parts.length = 0;
    parts.push(`${amp} N sin(2π·${trimNumber(params.frequency ?? 0)} Hz·t)`);
  }
  if (parts.length) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    const at = tip || [p[0] + MOMENT_RADIUS + 4, p[1] - MOMENT_RADIUS];
    ctx.fillText(`${impulse ? 'Impuls ' : ''}${parts.join(', ')}`, at[0] + 6, at[1] - 4);
  }
  ctx.restore();
}
