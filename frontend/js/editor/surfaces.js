// surfaces.js - surfaces as paths (v0.8). A surface is the segment p1 -> p2, or a polyline `points` (a spline, an arc) whose ends are
// p1 and p2; the hatching (the solid side) is on the right of the direction of travel, blocks and discs rest on the left. Pure.
//
// The editor makes curves from a few control points and writes the dense polyline for the engine (which collides with it segment by
// segment): `shape` ("line" | "spline" | "arc") and `control` stay in the scene so that the curve can be edited again.
import { closestOnSurface, isCurved, nearestSegment, pathLength, surfaceLength, surfacePath, surfaceSegments, tidyPoint } from './geometry.js';

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export const MAX_TURN = (1 * Math.PI) / 180; // the polyline turns by at most this at a vertex: the engine's contact is then smooth
export const MAX_SEGMENT = 0.05; // m

// --- the path ------------------------------------------------------------------------------------

export { closestOnSurface, isCurved, nearestSegment, pathLength, surfaceLength, surfacePath, surfaceSegments };

// --- edits ---------------------------------------------------------------------------------------

// The same surface run the other way: the free side and the hatching change sides.
export function flipSurface(s) {
  const reverse = (pts) => pts.map((p) => [...p]).reverse();
  [s.p1, s.p2] = [s.p2, s.p1];
  if (s.points) s.points = reverse(s.points);
  if (s.control) s.control = reverse(s.control);
}

export function translateSurface(s, delta) {
  const move = (p) => tidyPoint([p[0] + delta[0], p[1] + delta[1]]);
  s.p1 = move(s.p1);
  s.p2 = move(s.p2);
  if (s.points) s.points = s.points.map(move);
  if (s.control) s.control = s.control.map(move);
}

// --- spline ------------------------------------------------------------------------------------------

// Centripetal Catmull-Rom spline through the control points (no loops or cusps, however unevenly they are spaced), as a dense polyline
// whose segments are at most MAX_SEGMENT long and turn by at most MAX_TURN at every vertex. The first and last point are the first and
// last control point.
export function sampleSpline(control) {
  const n = control.length;
  if (n < 2) return control.map((p) => [...p]);
  if (n === 2) return [[...control[0]], [...control[1]]];
  // end points are mirrored so that the curve starts and ends in the direction of the first / last control polygon edge
  const P = [
    [2 * control[0][0] - control[1][0], 2 * control[0][1] - control[1][1]],
    ...control,
    [2 * control[n - 1][0] - control[n - 2][0], 2 * control[n - 1][1] - control[n - 2][1]],
  ];
  const spans = [];
  for (let i = 1; i + 2 < P.length; i++) spans.push(spanCurve(P[i - 1], P[i], P[i + 1], P[i + 2]));
  const at = (u) => {
    const i = Math.min(Math.floor(u), spans.length - 1);
    return spans[i](u - i);
  };
  // parameters 0 .. n-1 (a span per unit); split every segment that is too long and both segments at a vertex that turns too much
  let us = [];
  for (let i = 0; i < spans.length; i++) for (let k = 0; k < 8; k++) us.push(i + k / 8);
  us.push(spans.length);
  for (let round = 0; round < 24; round++) {
    const pts = us.map(at);
    const split = new Set();
    for (let i = 0; i + 1 < pts.length; i++) if (dist(pts[i], pts[i + 1]) > MAX_SEGMENT) split.add(i);
    for (let i = 1; i + 1 < pts.length; i++) {
      if (Math.abs(angleBetween([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]])) > MAX_TURN * 0.95) {
        split.add(i - 1);
        split.add(i);
      }
    }
    if (!split.size) break;
    const next = [];
    for (let i = 0; i < us.length; i++) {
      next.push(us[i]);
      if (split.has(i)) next.push((us[i] + us[i + 1]) / 2);
    }
    us = next;
  }
  const out = us.map((u) => tidyPoint(at(u)));
  out[0] = tidyPoint(control[0]);
  out[out.length - 1] = tidyPoint(control[n - 1]);
  return out;
}

// One span P1 -> P2 of the centripetal Catmull-Rom spline (Barry-Goldman) as a function of s in [0, 1].
function spanCurve(P0, P1, P2, P3) {
  const knot = (a, b) => Math.max(Math.sqrt(dist(a, b)), 1e-9);
  const t0 = 0;
  const t1 = t0 + knot(P0, P1);
  const t2 = t1 + knot(P1, P2);
  const t3 = t2 + knot(P2, P3);
  const lerp = (a, b, ta, tb, t) => [
    ((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0],
    ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1],
  ];
  return (s) => {
    const t = t1 + s * (t2 - t1);
    const A1 = lerp(P0, P1, t0, t1, t);
    const A2 = lerp(P1, P2, t1, t2, t);
    const A3 = lerp(P2, P3, t2, t3, t);
    const B1 = lerp(A1, A2, t0, t2, t);
    const B2 = lerp(A2, A3, t1, t3, t);
    return lerp(B1, B2, t1, t2, t);
  };
}

function angleBetween(u, v) {
  const lu = Math.hypot(u[0], u[1]);
  const lv = Math.hypot(v[0], v[1]);
  if (lu < 1e-12 || lv < 1e-12) return 0;
  return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
}

// --- half circle ---------------------------------------------------------------------------------------

// A half circle on the diameter a - b, as a polyline from the left end to the right end (for a vertical diameter from the lower to the
// upper end) with the free side where the mass goes:
//   "bowl"  (Mulde): the arc below the diameter, open upwards, the free side inside, the solid side outside
//   "dome"  (Wölbung): the arc above the diameter, the free side outside, the solid side inside
// Whichever way the diameter is drawn, the surface is the same.
export function halfCircle(a, b, kind = 'bowl') {
  let [p, q] = [a, b];
  if (p[0] > q[0] || (p[0] === q[0] && p[1] > q[1])) [p, q] = [q, p];
  const centre = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const r = dist(p, q) / 2;
  const phi0 = Math.atan2(p[1] - centre[1], p[0] - centre[0]); // the left end (angle pi for a horizontal diameter)
  const steps = Math.max(24, Math.ceil(Math.PI / MAX_TURN));
  // bowl: from the left end, counter-clockwise through the lowest point; dome: clockwise through the highest point
  const dir = kind === 'dome' ? -1 : 1;
  const points = [];
  for (let k = 0; k <= steps; k++) {
    const ang = phi0 + dir * Math.PI * (k / steps);
    points.push(tidyPoint([centre[0] + r * Math.cos(ang), centre[1] + r * Math.sin(ang)]));
  }
  points[0] = tidyPoint(p);
  points[steps] = tidyPoint(q);
  return points;
}

// The surface fields that go into the scene for a shape ({ p1, p2, points?, shape?, control? }); a straight line is just p1 and p2.
export function surfaceFields(shape, control, kind = 'bowl') {
  if (shape === 'spline') {
    const points = sampleSpline(control);
    return { p1: tidyPoint(points[0]), p2: tidyPoint(points[points.length - 1]), points, shape: 'spline', control: control.map((p) => tidyPoint(p)) };
  }
  if (shape === 'arc') {
    const points = halfCircle(control[0], control[1], kind);
    return { p1: points[0], p2: points[points.length - 1], points, shape: 'arc', control: [points[0], points[points.length - 1]] };
  }
  return { p1: tidyPoint(control[0]), p2: tidyPoint(control[control.length - 1]) };
}
