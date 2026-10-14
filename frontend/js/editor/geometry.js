// geometry.js - pure 2D helpers for the layout editor (metres, y up, angles in rad CCW).
// No DOM access, so everything here is unit-tested with Node (tests/frontend).
import { sectionProps } from './section.js';

export const SNAP_ANGLES_DEG = [0, 30, 45, 60, 90];
const TAU = 2 * Math.PI;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const length = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const rotate = ([x, y], phi) => {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [c * x - s * y, s * x + c * y];
};

// Angle wrapped into (-pi, pi].
export function normalizeAngle(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

export const roundTo = (x, step) => Math.round(x / step) * step;
// Removes floating point noise such as 0.30000000000000004 before values are stored in a scene.
export const tidy = (x) => Math.round(x * 1e9) / 1e9;
export const tidyPoint = (p) => [tidy(p[0]), tidy(p[1])];

// --- snapping of directions ----------------------------------------------------------------

// All allowed directions in rad: 0, 30, 45, 60, 90 degrees and their mirror images in the other
// three quadrants (so a surface can run up, down, left or right).
export function snapAngles(anglesDeg = SNAP_ANGLES_DEG) {
  const set = new Set();
  for (const deg of anglesDeg) {
    for (const d of [deg, 180 - deg, -deg, deg - 180]) set.add(normalizeAngle((d * Math.PI) / 180));
  }
  return [...set];
}

// Direction of (dx, dy) snapped to the nearest allowed angle.
export function snapDirection(dx, dy, anglesDeg = SNAP_ANGLES_DEG) {
  const raw = Math.atan2(dy, dx);
  let best = 0;
  let bestDiff = Infinity;
  for (const a of snapAngles(anglesDeg)) {
    const diff = Math.abs(normalizeAngle(raw - a));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best;
}

// End point of a surface dragged from p1 towards `raw`: direction snapped to the allowed angles,
// length rounded to `step` (never below one step).
export function snapSegmentEnd(p1, raw, { step = 0.05, anglesDeg = SNAP_ANGLES_DEG } = {}) {
  const d = sub(raw, p1);
  const len = length(d);
  if (len < 1e-9) return [...p1];
  const angle = snapDirection(d[0], d[1], anglesDeg);
  const snappedLen = Math.max(step, roundTo(len, step));
  return tidyPoint([p1[0] + snappedLen * Math.cos(angle), p1[1] + snappedLen * Math.sin(angle)]);
}

// `raw` moved onto the ray from p1 whose direction is the nearest allowed angle, measured from `baseAngle`
// (so 0, 30, 45, 60, 90 degrees to a surface); the distance from p1 stays as it is.
export function snapDirectionTo(p1, raw, baseAngle = 0, anglesDeg = SNAP_ANGLES_DEG) {
  const d = sub(raw, p1);
  const len = length(d);
  if (len < 1e-9) return [...p1];
  const angle = baseAngle + snapDirection(...rotate(d, -baseAngle), anglesDeg);
  return tidyPoint([p1[0] + len * Math.cos(angle), p1[1] + len * Math.sin(angle)]);
}

// The point of the surface line (within the segment) that is hit by a ray from p1 at an allowed angle to the
// surface, the one closest to `raw`; null if no such ray meets the surface. Parallel rays never do.
export function snapOntoSurfaceAtAngles(p1, raw, surface, anglesDeg = SNAP_ANGLES_DEG) {
  let best = null; // (a curve: its segments in turn, the angles measured from each)
  for (const seg of surfaceSegments(surface)) {
    const point = snapOntoSegmentAtAngles(p1, raw, seg, anglesDeg);
    if (point && (!best || dist(point, raw) < best.d)) best = { d: dist(point, raw), point };
  }
  return best && best.point;
}

function snapOntoSegmentAtAngles(p1, raw, surface, anglesDeg) {
  const base = surfaceAngle(surface);
  const t = [Math.cos(base), Math.sin(base)];
  let best = null;
  for (const a of snapAngles(anglesDeg)) {
    const angle = base + a;
    const r = [Math.cos(angle), Math.sin(angle)];
    const denom = cross(r, t);
    if (Math.abs(denom) < 1e-9) continue; // parallel to the surface
    // p1 + s r = p2 + u t  =>  s = cross(p2 - p1, t) / cross(r, t)
    const s = cross(sub(surface.p1, p1), t) / denom;
    if (s <= 0) continue;
    const hit = [p1[0] + s * r[0], p1[1] + s * r[1]];
    const onSeg = closestOnSegment(hit, surface.p1, surface.p2);
    if (onSeg.dist > 1e-6) continue;
    const d = dist(hit, raw);
    if (!best || d < best.d) best = { d, point: tidyPoint(hit) };
  }
  return best && best.point;
}

// --- segments -------------------------------------------------------------------------------

// Closest point on segment a-b to p: { point, t (0..1), dist }.
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  const point = [a[0] + t * ab[0], a[1] + t * ab[1]];
  return { point, t, dist: dist(p, point) };
}

// --- surfaces: a segment p1 -> p2, or a polyline `points` (v0.8) ----------------------------------

export const surfacePath = (s) => (s.points && s.points.length >= 2 ? s.points : [s.p1, s.p2]);

export function pathLength(path) {
  let len = 0;
  for (let i = 0; i + 1 < path.length; i++) len += dist(path[i], path[i + 1]);
  return len;
}

export const surfaceLength = (s) => pathLength(surfacePath(s));
export const isCurved = (s) => surfacePath(s).length > 2;

// The segments of a surface as { p1, p2, index } objects (straight "surfaces" that the helpers below understand).
export function surfaceSegments(s) {
  const path = surfacePath(s);
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) out.push({ p1: path[i], p2: path[i + 1], index: i });
  return out;
}

// The closest point on a surface: { point, dist, index (of the segment), t (along that segment), p1, p2 (that segment) }.
export function closestOnSurface(p, s) {
  const path = surfacePath(s);
  let best = null;
  for (let i = 0; i + 1 < path.length; i++) {
    const hit = closestOnSegment(p, path[i], path[i + 1]);
    if (!best || hit.dist < best.dist) best = { ...hit, index: i, p1: path[i], p2: path[i + 1] };
  }
  return best;
}

// The straight segment of the surface that `p` is nearest to ({ p1, p2 }); the surface itself if it is straight, or `p` is not given.
export function nearestSegment(s, p) {
  if (!p || !isCurved(s)) return { p1: s.p1, p2: s.p2 };
  const hit = closestOnSurface(p, s);
  return { p1: hit.p1, p2: hit.p2 };
}

// Direction of the surface (at `near`, for a curve: the direction of the segment nearest to it).
export const surfaceAngle = (s, near = null) => {
  const g = nearSegment(s, near);
  return Math.atan2(g.p2[1] - g.p1[1], g.p2[0] - g.p1[0]);
};

const nearSegment = (s, near) => (near ? nearestSegment(s, near) : { p1: s.p1, p2: s.p2 });

// > 0 if p lies on the left-hand side of the directed surface (a curve: of its segment nearest to p).
export const sideOfSurface = (s, p) => {
  const g = nearestSegment(s, p);
  return cross(sub(g.p2, g.p1), sub(p, g.p1));
};

// --- bodies ---------------------------------------------------------------------------------

export const bodyAngle = (body) => body.angle || 0;
export const bodyToWorld = (body, local) => add(body.position, rotate(local, bodyAngle(body)));
export const worldToLocal = (body, world) => rotate(sub(world, body.position), -bodyAngle(body));

// A node (Knoten, v0.4) has no extent: this is the radius within which it is hit and snapped to.
export const NODE_RADIUS = 0.05;

// Rectangle { x0, x1, y0, y1 } of a block or beam in its local frame. A block is centred on its
// centre of mass; a beam lies along x with its centroid axis at y = 0, so the box of an L or T
// section reaches further to one side.
export function bodyBox(body) {
  if (body.type === 'beam') {
    const { yBottom, yTop } = sectionProps(body.params.section);
    return { x0: -body.params.length / 2, x1: body.params.length / 2, y0: -yBottom, y1: yTop };
  }
  const { width: w, height: h } = body.params;
  return { x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2 };
}

// Corners of a block or beam in its local frame, counter-clockwise from the lower left.
export function blockCorners(body) {
  const { x0, x1, y0, y1 } = bodyBox(body);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function pointInBody(body, world) {
  const l = worldToLocal(body, world);
  if (body.type === 'disc') return length(l) <= body.params.radius;
  if (body.type === 'node') return length(l) <= NODE_RADIUS;
  const { x0, x1, y0, y1 } = bodyBox(body);
  return l[0] >= x0 && l[0] <= x1 && l[1] >= y0 && l[1] <= y1;
}

export function bodyArea(body) {
  if (body.type === 'node') return Math.PI * NODE_RADIUS ** 2 * 0.25; // smaller than any real mass: on top
  if (body.type === 'disc') return Math.PI * body.params.radius ** 2;
  const { x0, x1, y0, y1 } = bodyBox(body);
  return (x1 - x0) * (y1 - y0);
}

// Nearest point on the outline of a body to `world`: { local, world, dist }.
export function nearestOnOutline(body, world) {
  const l = worldToLocal(body, world);
  let best;
  if (body.type === 'disc' || body.type === 'node') {
    const r = body.type === 'node' ? NODE_RADIUS : body.params.radius;
    const len = length(l);
    const local = len < 1e-12 ? [r, 0] : scale(l, r / len);
    best = { local, dist: Math.abs(len - r) };
  } else {
    const c = blockCorners(body);
    for (let i = 0; i < 4; i++) {
      const hit = closestOnSegment(l, c[i], c[(i + 1) % 4]);
      if (!best || hit.dist < best.dist) best = { local: hit.point, dist: hit.dist };
    }
  }
  return { local: best.local, world: bodyToWorld(body, best.local), dist: best.dist };
}

// Features a load or support can snap to: centre of mass, corners, edge midpoints (a beam also its
// two axis ends). Discs have the centre and the four points on the axes of the body; a node only its
// centre.
export function bodyFeaturePoints(body) {
  if (body.type === 'node') return [{ kind: 'center', local: [0, 0] }];
  if (body.type === 'disc') {
    const r = body.params.radius;
    return [
      { kind: 'center', local: [0, 0] },
      ...[[r, 0], [0, r], [-r, 0], [0, -r]].map((local) => ({ kind: 'corner', local })),
    ];
  }
  const { x0, x1, y0, y1 } = bodyBox(body);
  const ym = (y0 + y1) / 2;
  const features = [
    { kind: 'center', local: [0, 0] },
    ...blockCorners(body).map((local) => ({ kind: 'corner', local })),
    ...[[0, y0], [x1, ym], [0, y1], [x0, ym]].map((local) => ({ kind: 'edge-mid', local })),
  ];
  if (body.type === 'beam') features.push(...[[x0, 0], [x1, 0]].map((local) => ({ kind: 'corner', local })));
  return features;
}

// Rectangle spanned by two opposite corners: { center, width, height }.
export function rectFromCorners(p1, p2) {
  return {
    center: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
    width: Math.abs(p2[0] - p1[0]),
    height: Math.abs(p2[1] - p1[1]),
  };
}

// --- supports -------------------------------------------------------------------------------

// Value of a support's params.angle (see contracts/scene.schema.json): the surface direction
// chosen so the body lies on its LEFT side. Flips by pi if the body is on the right.
export function supportAngle(surface, bodyCenter, near = bodyCenter) {
  const a = surfaceAngle(surface, near);
  return normalizeAngle(sideOfSurface(surface, bodyCenter) >= 0 ? a : a + Math.PI);
}

// Like supportAngle, but decided by the side the supported POINT is on: the point may be some
// distance from the surface. A point within 1 cm of the surface line (touching, up to snapping
// noise) takes the side of the body's centre.
export function supportAngleAt(surface, point, bodyCenter) {
  const g = nearestSegment(surface, point); // a curve: the support sits on the segment nearest to its point
  const len = surfaceLength(surface) || 1;
  const side = cross(sub(g.p2, g.p1), sub(point, g.p1)) / (dist(g.p1, g.p2) || 1); // distance of the point from the line, signed
  if (Math.abs(side) / len < 0.01) return supportAngle(surface, bodyCenter, point);
  return normalizeAngle(side > 0 ? surfaceAngle(surface, point) : surfaceAngle(surface, point) + Math.PI);
}

// --- ids ------------------------------------------------------------------------------------

// prefix + smallest positive integer not yet used in `taken`.
export function nextId(prefix, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
