// hit.js - what is under the pointer? Used for selection and for right-click properties.
import { FORCE_M_PER_N } from '../canvas/symbols/load.js';
import {
  bodyArea, bodyToWorld, closestOnSegment, dist, pointInBody,
} from './geometry.js';

export const HIT_PX = { support: 14, load: 12, spring: 7, surface: 7 };
export { FORCE_M_PER_N };

// World position of the point a load or support is attached to.
export function attachedPoint(scene, obj) {
  const body = scene.bodies.find((b) => b.id === obj.body);
  return body ? bodyToWorld(body, obj.point) : null;
}

export function anchorWorld(scene, anchor) {
  if (anchor.body === null) return anchor.point;
  const body = scene.bodies.find((b) => b.id === anchor.body);
  return body ? bodyToWorld(body, anchor.point) : null;
}

// Returns { kind: "surface" | "body" | "element" | "constraint", id } or null.
// Small things win over big things: supports, loads, springs, then bodies, then surfaces.
export function hitTest(scene, world, scale) {
  const px = (n) => n / scale;

  for (const c of [...scene.constraints].reverse()) {
    const p = attachedPoint(scene, c);
    if (p && dist(p, world) <= px(HIT_PX.support)) return { kind: 'constraint', id: c.id };
  }
  for (const e of [...scene.elements].reverse()) {
    if (e.type !== 'load') continue;
    const p = attachedPoint(scene, e);
    if (!p) continue;
    const f = e.params.force || [0, 0];
    const tip = [p[0] + f[0] * FORCE_M_PER_N, p[1] + f[1] * FORCE_M_PER_N];
    const nearArrow = closestOnSegment(world, p, tip).dist <= px(HIT_PX.load);
    const nearMoment = (e.params.moment || 0) !== 0 && dist(p, world) <= px(HIT_PX.load + 12);
    if (nearArrow || nearMoment || dist(p, world) <= px(HIT_PX.load)) return { kind: 'element', id: e.id };
  }
  for (const e of [...scene.elements].reverse()) {
    if (e.type !== 'spring') continue;
    const a = anchorWorld(scene, e.a);
    const b = anchorWorld(scene, e.b);
    if (a && b && closestOnSegment(world, a, b).dist <= px(HIT_PX.spring)) return { kind: 'element', id: e.id };
  }
  const bodies = scene.bodies.filter((b) => pointInBody(b, world));
  if (bodies.length) {
    bodies.sort((p, q) => bodyArea(p) - bodyArea(q)); // the smaller body is on top of the larger
    return { kind: 'body', id: bodies[0].id };
  }
  for (const s of [...scene.surfaces].reverse()) {
    if (closestOnSegment(world, s.p1, s.p2).dist <= px(HIT_PX.surface)) return { kind: 'surface', id: s.id };
  }
  return null;
}
