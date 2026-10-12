// moves.js - editing operations behind the move tool. Pure functions on a scene object (the
// editor applies them to a working copy inside a model transaction, so a drag is one undo step).
//
// What moves with what:
//   a mass          everything attached to it by a body-local point (supports, loads, spring / rope /
//                   rod ends) and, through pin and fixed joints, the masses joined to it
//   a Festlager in free space   with the ground ends of springs, ropes and rods at its point
//   a surface       alone
// Ground ends of springs / ropes / rods that are not on a pin stay where they are.
import {
  add, bodyToWorld, closestOnSegment, dist, sub, supportAngle, tidy, tidyPoint,
} from './geometry.js';
import { anchorWorld, isJoint, isLink } from './hit.js';

const SUPPORTS = ['pin_support', 'fixed_support', 'roller_support'];
const isSupport = (c) => SUPPORTS.includes(c.type);

// The ids of all masses connected to `bodyId` through pin and fixed joints (including itself).
export function jointGroup(scene, bodyId) {
  const group = new Set([bodyId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of scene.constraints) {
      if (!isJoint(c)) continue;
      const a = group.has(c.a.body);
      const b = group.has(c.b.body);
      if (a !== b) {
        group.add(a ? c.b.body : c.a.body);
        grew = true;
      }
    }
  }
  return [...group];
}

// The surface (object) closest to p within tol, or null.
export function nearestSurface(scene, p, tol) {
  let best = null;
  for (const s of scene.surfaces) {
    const d = closestOnSegment(p, s.p1, s.p2).dist;
    if (d <= tol && (!best || d < best.d)) best = { s, d };
  }
  return best && best.s;
}

// After masses or surfaces moved: every support (on the given masses, or all) sits on the surface
// it now touches, or on none. The angle follows the surface; without one it is kept.
export function refreshSupports(scene, tol, bodyIds = null) {
  for (const c of scene.constraints) {
    if (!isSupport(c) || c.body === null) continue;
    if (bodyIds && !bodyIds.includes(c.body)) continue;
    const body = scene.bodies.find((b) => b.id === c.body);
    const surface = nearestSurface(scene, bodyToWorld(body, c.point), tol);
    c.surface = surface ? surface.id : null;
    if (surface) c.params.angle = tidy(supportAngle(surface, body.position));
  }
}

// A rope with an explicit length that is now shorter than the distance between its ends becomes
// taut (its length parameter is dropped), so the scene stays valid.
export function normalizeRopes(scene) {
  for (const c of scene.constraints) {
    if (c.type !== 'rope' || c.params.length === undefined) continue;
    const a = anchorWorld(scene, c.a);
    const b = anchorWorld(scene, c.b);
    if (a && b && c.params.length < dist(a, b) - 1e-9) delete c.params.length;
  }
}

// --- translations -----------------------------------------------------------------------------

export function moveBodies(scene, ids, delta, tol) {
  for (const b of scene.bodies) {
    if (ids.includes(b.id)) b.position = tidyPoint(add(b.position, delta));
  }
  refreshSupports(scene, tol, ids);
  normalizeRopes(scene);
}

export function moveSurface(scene, id, delta, tol) {
  const s = scene.surfaces.find((x) => x.id === id);
  s.p1 = tidyPoint(add(s.p1, delta));
  s.p2 = tidyPoint(add(s.p2, delta));
  refreshSupports(scene, tol);
}

// Moves a Festlager in free space together with the ground ends attached at its point.
export function movePin(scene, id, delta, tol) {
  const pin = scene.constraints.find((c) => c.id === id);
  const old = pin.point;
  const moved = (anchor) => {
    if (anchor.body === null && dist(anchor.point, old) < 1e-6) anchor.point = tidyPoint(add(anchor.point, delta));
  };
  for (const e of scene.elements) if (e.type === 'spring') { moved(e.a); moved(e.b); }
  for (const c of scene.constraints) if (isLink(c)) { moved(c.a); moved(c.b); }
  pin.point = tidyPoint(add(old, delta));
  const surface = nearestSurface(scene, pin.point, tol);
  pin.surface = surface ? surface.id : null;
  if (surface) pin.params.angle = tidy(supportAngle(surface, pin.point));
  normalizeRopes(scene);
}

// --- contact snapping ---------------------------------------------------------------------------

// Vector to add to a mass moved by `delta` so that it touches a surface that it is within tol of:
// a corner of a block or the rim of a disc lands exactly on the surface line. [0, 0] if none.
export function contactOffset(scene, bodyId, delta, tol) {
  const body = scene.bodies.find((b) => b.id === bodyId);
  const moved = { ...body, position: add(body.position, delta) };
  let best = null;
  for (const s of scene.surfaces) {
    const d = sub(s.p2, s.p1);
    const len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) continue;
    const t = [d[0] / len, d[1] / len];
    const n = [-t[1], t[0]];
    const probes = body.type === 'disc'
      ? [{ p: moved.position, dist: signedDistance(moved.position, s.p1, n), radius: body.params.radius }]
      : cornerPoints(moved).map((p) => ({ p, dist: signedDistance(p, s.p1, n), radius: 0 }));
    for (const probe of probes) {
      const along = (probe.p[0] - s.p1[0]) * t[0] + (probe.p[1] - s.p1[1]) * t[1];
      if (along < -tol || along > len + tol) continue;
      const gap = Math.sign(probe.dist || 1) * probe.radius - probe.dist; // move by gap along n
      if (Math.abs(gap) <= tol && (!best || Math.abs(gap) < Math.abs(best.gap))) best = { gap, n };
    }
  }
  return best ? [best.n[0] * best.gap, best.n[1] * best.gap] : [0, 0];
}

const signedDistance = (p, origin, n) => (p[0] - origin[0]) * n[0] + (p[1] - origin[1]) * n[1];

function cornerPoints(body) {
  const { width: w, height: h } = body.params;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((c) => bodyToWorld(body, c));
}

// --- re-attaching -------------------------------------------------------------------------------

// Problem with a spring, rope or rod in its current state, or null.
export function linkProblem(scene, link) {
  const a = link.a;
  const b = link.b;
  if (a.body === null && b.body === null) return 'Needs at least one end on a mass.';
  if (a.body !== null && a.body === b.body) return 'Both ends are on the same mass.';
  const pa = anchorWorld(scene, a);
  const pb = anchorWorld(scene, b);
  if (!pa || !pb || dist(pa, pb) < 0.05) return 'The ends are too close together.';
  return null;
}

// Moves end "a" or "b" of a spring / rope / rod to `anchor` ({ body, point }).
export function reattachEnd(scene, id, end, anchor) {
  const link = [...scene.elements, ...scene.constraints].find((o) => o.id === id);
  link[end] = { body: anchor.body, point: tidyPoint(anchor.point) };
  normalizeRopes(scene);
}

// Applies a placeSupport() result to a support.
export function replaceSupport(scene, id, placement) {
  const c = scene.constraints.find((x) => x.id === id);
  c.body = placement.body;
  c.point = tidyPoint(placement.local);
  c.surface = placement.surface;
  c.params.angle = tidy(placement.angle);
}

export function replaceLoad(scene, id, { body, point }) {
  const l = scene.elements.find((x) => x.id === id);
  l.body = body;
  l.point = tidyPoint(point);
}
