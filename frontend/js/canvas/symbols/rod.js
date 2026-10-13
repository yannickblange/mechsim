// rod.js - Stab: a thick bar with a hinge at each end (it takes push and pull). A rigid Stab is a solid
// line, an elastic one (a bar with a cross section) an outlined one. While the simulation runs the
// axial force is written next to it and the bar is drawn in the colour of the force: tension blue,
// compression red. An elastic bar (v0.4b) is drawn along its bent shape (entry.nodes, with the Bending
// exaggeration of the toolbar) and, while compressed, says how much of its Euler load it carries.
import { decimal } from '../../format.js';
import { beamCurve, exaggerate } from './beam.js';

const HINGE = 4; // px
const MIN_FORCE = 1e-6; // N: below this no label

export const formatForce = (f) => {
  const a = Math.abs(f);
  const text = a >= 1e5 ? `${decimal(a / 1e3, 0)} kN` : a >= 1e3 ? `${decimal(a / 1e3, 2)} kN` : `${decimal(a, a >= 100 ? 0 : 1)} N`;
  return `${f < 0 ? '−' : '+'}${text}`;
};

// The path of a Stab on the screen: the bent curve of an elastic bar through its nodes, else the straight line.
function stabPath(cam, entry) {
  if (entry.nodes && entry.nodes.length > 2) {
    return beamCurve(exaggerate(entry.nodes, cam.bendScale || 1, entry.bendRef)).map((p) => cam.toScreen(p));
  }
  return [cam.toScreen(entry.p1), cam.toScreen(entry.p2)];
}

export function strokeStab(ctx, cam, entry, theme, elastic) {
  const path = stabPath(cam, entry);
  const [ax, ay] = path[0];
  const [bx, by] = path[path.length - 1];
  const force = entry.force || 0;
  const colour = Math.abs(force) < MIN_FORCE ? theme.ink : force > 0 ? theme.force : theme.compression;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.beginPath();
  path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
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
  [[ax, ay], [bx, by]].forEach(([x, y], i) => {
    ctx.beginPath();
    if (entry.clamps && entry.clamps[i]) { // fest eingespannt: a filled square instead of the hinge circle
      ctx.rect(x - HINGE, y - HINGE, 2 * HINGE, 2 * HINGE);
      ctx.fillStyle = colour;
    } else {
      ctx.arc(x, y, HINGE, 0, 2 * Math.PI);
      ctx.fillStyle = theme.background;
    }
    ctx.fill();
    ctx.stroke();
  });

  if (Math.abs(force) >= MIN_FORCE && Math.hypot(bx - ax, by - ay) > 40) {
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    // beside the middle of the bar, on the upper side of the chord
    const side = ny > 0 || (ny === 0 && nx > 0) ? -1 : 1;
    const mid = path[Math.floor(path.length / 2)];
    const mx = mid[0] + side * nx * 14;
    const my = mid[1] + side * ny * 14;
    // a compressed elastic bar: how much of its Euler load it carries
    const ratio = elastic && force < 0 && entry.pcr > 0 ? -force / entry.pcr : 0;
    let text = formatForce(force);
    if (ratio >= 0.05) text += `  (${Math.round(ratio * 100)} % der Knicklast${ratio >= 1 ? ', geknickt' : ''})`;
    ctx.font = `${ratio >= 0.9 ? 'bold ' : ''}11px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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
