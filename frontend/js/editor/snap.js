// snap.js - where does the pointer "stick"? Pure; used by every editor tool.
import {
  bodyFeaturePoints, bodyToWorld, closestOnSegment, dist, nearestOnOutline, pointInBody,
  roundTo, tidy, tidyPoint, worldToLocal,
} from './geometry.js';

export const SNAP_TOLERANCE_PX = 10;
const MIN_GRID_PX = 14;

// Grid spacing in metres: 0.05 m while zoomed in, coarser (x2, x5, x10 ...) when zooming out so the
// snap points stay at least ~14 px apart.
export function gridStepFor(pxPerMetre) {
  let step = 0.05;
  const factors = [2, 2.5, 2];
  let i = 0;
  while (step * pxPerMetre < MIN_GRID_PX) step *= factors[i++ % 3];
  return step;
}

// Priority: free-space Festlager > body features (centre > corner > edge midpoint > edge) > surface end points >
// surface line > inside a body > grid. Result:
//   { point: [x, y], kind, body: id | null, local: [x, y] | null, surface: id | null }
// Options:
//   scale          px per metre (converts the pixel tolerance to metres)
//   pins           snap to Festlager in free space (default false); kind "pin", result.pin = its id
//   bodies         snap to body features and outlines (default true)
//   interior       report points inside a body as body points, kind "inside" (default false)
//   surfaces       snap to surfaces (default false)
//   grid           snap to the grid (default true)
//   exclude        body ids to ignore
export function snapPoint(world, scene, opts = {}) {
  const {
    scale = 200, bodies = true, interior = false, surfaces = false, grid = true, exclude = [], pins = false,
  } = opts;
  const tol = SNAP_TOLERANCE_PX / scale;
  const step = gridStepFor(scale);
  const candidates = (scene.bodies || []).filter((b) => !exclude.includes(b.id));

  if (pins) {
    const pin = freePins(scene).find((c) => dist(c.point, world) <= tol);
    if (pin) return { point: [...pin.point], kind: 'pin', body: null, local: null, surface: null, pin: pin.id };
  }
  if (bodies) {
    const hit = snapToBodyFeature(world, candidates, tol);
    if (hit) return hit;
  }
  if (surfaces) {
    const hit = snapToSurface(world, scene.surfaces || [], tol);
    if (hit) return hit;
  }
  if (interior) {
    // Topmost (last drawn) body containing the point.
    const body = [...candidates].reverse().find((b) => pointInBody(b, world));
    if (body) {
      const gridPoint = tidyPoint([roundTo(world[0], step), roundTo(world[1], step)]);
      const point = grid && pointInBody(body, gridPoint) ? gridPoint : world;
      return bodyHit(body, point, 'inside');
    }
  }
  if (grid) {
    return free(tidyPoint([roundTo(world[0], step), roundTo(world[1], step)]), 'grid');
  }
  return free(world, 'free');
}

function free(point, kind) {
  return { point, kind, body: null, local: null, surface: null, pin: null };
}

// Festlager in free space: pin_support with body null (its point is a world point).
export const freePins = (scene) => (scene.constraints || []).filter((c) => c.type === 'pin_support' && c.body === null);

// Bodies that contain `world` or whose outline is within the snap tolerance, topmost first.
export function bodiesAt(world, scene, scale) {
  const tol = SNAP_TOLERANCE_PX / scale;
  return [...(scene.bodies || [])]
    .reverse()
    .filter((b) => pointInBody(b, world) || nearestOnOutline(b, world).dist <= tol);
}

function bodyHit(body, point, kind) {
  const local = worldToLocal(body, point);
  return { point, kind, body: body.id, local: [tidy(local[0]), tidy(local[1])], surface: null, pin: null };
}

function snapToBodyFeature(world, bodies, tol) {
  let best = null;
  const rank = { center: 0, corner: 1, 'edge-mid': 2, edge: 3 };
  for (const body of bodies) {
    for (const f of bodyFeaturePoints(body)) {
      const p = bodyToWorld(body, f.local);
      const d = dist(p, world);
      if (d <= tol && (!best || rank[f.kind] < rank[best.kind] || (rank[f.kind] === rank[best.kind] && d < best.d))) {
        best = { body, point: p, kind: f.kind, d };
      }
    }
  }
  if (best) return { ...bodyHit(best.body, best.point, best.kind === 'edge-mid' ? 'edge-mid' : best.kind) };
  // No feature close by: snap onto the nearest outline.
  let edge = null;
  for (const body of bodies) {
    const o = nearestOnOutline(body, world);
    if (o.dist <= tol && (!edge || o.dist < edge.dist)) edge = { body, ...o };
  }
  return edge ? bodyHit(edge.body, edge.world, 'edge') : null;
}

function snapToSurface(world, surfaces, tol) {
  const result = (point, kind, surface) => ({ point, kind, body: null, local: null, surface, pin: null });
  let end = null; // end points win over the line itself
  for (const s of surfaces) {
    for (const p of [s.p1, s.p2]) {
      const d = dist(p, world);
      if (d <= tol && (!end || d < end.d)) end = { d, point: [...p], surface: s.id };
    }
  }
  if (end) return result(end.point, 'surface-end', end.surface);

  let line = null;
  for (const s of surfaces) {
    const hit = closestOnSegment(world, s.p1, s.p2);
    if (hit.dist <= tol && (!line || hit.dist < line.dist)) line = { dist: hit.dist, point: hit.point, surface: s.id };
  }
  return line && result(tidyPoint(line.point), 'surface', line.surface);
}

// The surface (if any) closest to `world` within the snap tolerance. Used by supports.
export function surfaceNear(world, surfaces, scale, tolPx = SNAP_TOLERANCE_PX) {
  const tol = tolPx / scale;
  let best = null;
  for (const s of surfaces || []) {
    const hit = closestOnSegment(world, s.p1, s.p2);
    if (hit.dist <= tol && (!best || hit.dist < best.dist)) best = { surface: s, dist: hit.dist };
  }
  return best && best.surface;
}
