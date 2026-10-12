// beam.js - bendable beam: the deformed shape from the poses of its nodes, as the band the section
// occupies (its depth, with L and T sections reaching further to one side of the centroid axis).
import { sectionProps } from '../../editor/section.js';

const SUBDIVISIONS = 6; // points per segment of the smooth curve
const MARKER_RADIUS = 5; // px

const wrap = (a) => {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
};

// [[x, y, phi], ...] of a beam: the nodes of the frame entry, or - before there are any (the editor,
// the mock) - the straight beam from its pose.
export function beamNodes(spec, entry) {
  if (entry.nodes && entry.nodes.length >= 2) return entry.nodes;
  const half = spec.params.length / 2;
  const c = Math.cos(entry.phi);
  const s = Math.sin(entry.phi);
  return [[entry.x - half * c, entry.y - half * s, entry.phi], [entry.x + half * c, entry.y + half * s, entry.phi]];
}

// Bending shown `k` times as large: every node's offset from the chord (first to last node) and its
// rotation against the chord are multiplied by k; the rigid motion of the beam is untouched.
export function exaggerate(nodes, k) {
  if (k === 1 || nodes.length < 3) return nodes;
  const [x0, y0] = nodes[0];
  const last = nodes[nodes.length - 1];
  const len = Math.hypot(last[0] - x0, last[1] - y0) || 1;
  const ux = (last[0] - x0) / len;
  const uy = (last[1] - y0) / len;
  const beta = Math.atan2(uy, ux);
  return nodes.map(([x, y, phi]) => {
    const dx = x - x0;
    const dy = y - y0;
    const s = dx * ux + dy * uy;
    const v = -dx * uy + dy * ux;
    return [x0 + s * ux - k * v * uy, y0 + s * uy + k * v * ux, beta + k * wrap(phi - beta)];
  });
}

// Smooth axis through the nodes (cubic Hermite, tangent along each section's rotation): [[x, y, phi], ...].
export function beamCurve(nodes, subdivisions = SUBDIVISIONS) {
  const out = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const [xi, yi, pi] = nodes[i];
    const [xj, yj, pj] = nodes[i + 1];
    const len = Math.hypot(xj - xi, yj - yi);
    const ti = [Math.cos(pi) * len, Math.sin(pi) * len];
    const tj = [Math.cos(pj) * len, Math.sin(pj) * len];
    const dphi = wrap(pj - pi);
    for (let k = 0; k < subdivisions; k++) {
      const t = k / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * xi + h10 * ti[0] + h01 * xj + h11 * tj[0],
        h00 * yi + h10 * ti[1] + h01 * yj + h11 * tj[1],
        pi + t * dphi,
      ]);
    }
  }
  out.push(nodes[nodes.length - 1]);
  return out;
}

// The outline of the band: top edge from start to end, then the bottom edge back (world points).
export function beamOutline(curve, yTop, yBottom) {
  const edge = (offset) => curve.map(([x, y, phi]) => [x - Math.sin(phi) * offset, y + Math.cos(phi) * offset]);
  return [...edge(yTop), ...edge(-yBottom).reverse()];
}

export function drawBeam(ctx, cam, spec, entry, theme) {
  const { yTop, yBottom } = sectionProps(spec.params.section);
  const k = cam.bendScale || 1;
  const nodes = exaggerate(beamNodes(spec, entry), k);
  const curve = beamCurve(nodes);
  const outline = beamOutline(curve, yTop, yBottom).map((p) => cam.toScreen(p));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.08;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // the axis (line of the section centroids)
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.muted;
  ctx.beginPath();
  curve.map((p) => cam.toScreen(p)).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);

  // centre-of-mass marker at the middle of the beam, as on blocks
  const mid = curve[Math.floor(curve.length / 2)];
  const [cx, cy] = cam.toScreen(mid);
  ctx.fillStyle = theme.ink;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, MARKER_RADIUS, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, MARKER_RADIUS, -Math.PI / 2, 0);
  ctx.closePath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, MARKER_RADIUS, Math.PI / 2, Math.PI);
  ctx.closePath();
  ctx.fill();

  // label: id, the exaggeration when bending is shown larger, the largest stress when running
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const top = outline.reduce((a, b) => (b[1] < a[1] ? b : a));
  const lines = [spec.id + (k !== 1 ? `  (bending ×${k})` : '')];
  if (entry.stress > 0) lines.push(`σ max ${(entry.stress / 1e6).toFixed(entry.stress >= 1e7 ? 0 : 1)} MPa`);
  lines.forEach((text, i) => ctx.fillText(text, top[0] + 6, top[1] - 10 - 13 * (lines.length - 1 - i)));
  ctx.restore();
}
