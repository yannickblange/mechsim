// geometry.js - pure 2D helpers for the layout editor (metres, y up, angles in rad CCW).
// No DOM access, so everything here is unit-tested with Node (tests/frontend).

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

// --- segments -------------------------------------------------------------------------------

// Closest point on segment a-b to p: { point, t (0..1), dist }.
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  const point = [a[0] + t * ab[0], a[1] + t * ab[1]];
  return { point, t, dist: dist(p, point) };
}

export const surfaceAngle = (s) => Math.atan2(s.p2[1] - s.p1[1], s.p2[0] - s.p1[0]);

// > 0 if p lies on the left-hand side of the directed segment p1 -> p2.
export const sideOfSurface = (s, p) => cross(sub(s.p2, s.p1), sub(p, s.p1));

// --- bodies ---------------------------------------------------------------------------------

export const bodyAngle = (body) => body.angle || 0;
export const bodyToWorld = (body, local) => add(body.position, rotate(local, bodyAngle(body)));
export const worldToLocal = (body, world) => rotate(sub(world, body.position), -bodyAngle(body));

// Corners of a block in world coordinates, counter-clockwise from the lower left.
export function blockCorners(body) {
  const { width: w, height: h } = body.params;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
}

export function pointInBody(body, world) {
  const l = worldToLocal(body, world);
  if (body.type === 'disc') return length(l) <= body.params.radius;
  return Math.abs(l[0]) <= body.params.width / 2 && Math.abs(l[1]) <= body.params.height / 2;
}

export function bodyArea(body) {
  return body.type === 'disc'
    ? Math.PI * body.params.radius ** 2
    : body.params.width * body.params.height;
}

// Nearest point on the outline of a body to `world`: { local, world, dist }.
export function nearestOnOutline(body, world) {
  const l = worldToLocal(body, world);
  let best;
  if (body.type === 'disc') {
    const r = body.params.radius;
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

// Features a load or support can snap to: centre of mass, corners, edge midpoints.
// Discs have the centre and the four points on the axes of the body.
export function bodyFeaturePoints(body) {
  if (body.type === 'disc') {
    const r = body.params.radius;
    return [
      { kind: 'center', local: [0, 0] },
      ...[[r, 0], [0, r], [-r, 0], [0, -r]].map((local) => ({ kind: 'corner', local })),
    ];
  }
  const { width: w, height: h } = body.params;
  return [
    { kind: 'center', local: [0, 0] },
    ...blockCorners(body).map((local) => ({ kind: 'corner', local })),
    ...[[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]].map((local) => ({ kind: 'edge-mid', local })),
  ];
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
export function supportAngle(surface, bodyCenter) {
  const a = surfaceAngle(surface);
  return normalizeAngle(sideOfSurface(surface, bodyCenter) >= 0 ? a : a + Math.PI);
}

// Like supportAngle, but decided by the side the supported POINT is on: the point may be some
// distance from the surface. A point within 1 cm of the surface line (touching, up to snapping
// noise) takes the side of the body's centre.
export function supportAngleAt(surface, point, bodyCenter) {
  const len = dist(surface.p1, surface.p2) || 1;
  const side = sideOfSurface(surface, point);
  if (Math.abs(side) / len < 0.01) return supportAngle(surface, bodyCenter);
  return normalizeAngle(side > 0 ? surfaceAngle(surface) : surfaceAngle(surface) + Math.PI);
}

// --- ids ------------------------------------------------------------------------------------

// prefix + smallest positive integer not yet used in `taken`.
export function nextId(prefix, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
