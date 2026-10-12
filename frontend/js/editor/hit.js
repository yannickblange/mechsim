// hit.js - what is under the pointer? Used for selection and for right-click properties.
import { FORCE_M_PER_N } from '../canvas/symbols/load.js';
import { ropePolyline } from '../canvas/symbols/rope.js';
import {
  bodyArea, bodyToWorld, closestOnSegment, dist, pointInBody,
} from './geometry.js';

export { FORCE_M_PER_N };

export const HIT_PX = { support: 14, load: 12, spring: 7, surface: 7, end: 11 };

const LINK_TYPES = ['rope', 'rod'];
const JOINT_TYPES = ['pin_joint', 'fixed_joint'];
export const isLink = (c) => LINK_TYPES.includes(c.type);
// Spring, damper and (elastic) bar: elements with two anchors.
export const isAxialElement = (e) => e.type === 'spring' || e.type === 'damper' || e.type === 'bar';
export const isJoint = (c) => JOINT_TYPES.includes(c.type);

export function anchorWorld(scene, anchor) {
  if (anchor.body === null) return anchor.point;
  const body = scene.bodies.find((b) => b.id === anchor.body);
  return body ? bodyToWorld(body, anchor.point) : null;
}

// World position of the point a load, support, free-space Festlager or joint is attached to.
export function attachedPoint(scene, obj) {
  if (obj.a) return anchorWorld(scene, obj.a); // joint (links are handled by their ends)
  if (obj.body === null) return obj.point; // Festlager in free space: a world point
  const body = scene.bodies.find((b) => b.id === obj.body);
  return body ? bodyToWorld(body, obj.point) : null;
}

// The two end points (world) of a spring, rope or rod, or null.
export function linkEnds(scene, obj) {
  const a = anchorWorld(scene, obj.a);
  const b = anchorWorld(scene, obj.b);
  return a && b ? [a, b] : null;
}

// The path of a spring, rope or rod as a polyline (a slack rope is the curve it hangs in), or null.
export function linkPath(scene, obj) {
  const ends = linkEnds(scene, obj);
  if (!ends) return null;
  return obj.type === 'rope' && obj.params.length !== undefined ? ropePolyline(ends[0], ends[1], obj.params.length) : ends;
}

// Distance of p from a spring / rope / rod.
function lineDistance(p, ends, obj, scene) {
  const pts = linkPath(scene, obj) || ends;
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, closestOnSegment(p, pts[i], pts[i + 1]).dist);
  return best;
}

// A Knoten (node) under the pointer: it sits where Stabs end, so it must win over them.
function nodeAtPoint(scene, world, radius) {
  return [...scene.bodies].reverse().find((b) => b.type === 'node' && dist(b.position, world) <= radius) || null;
}

// Returns { kind: "surface" | "body" | "element" | "constraint", id } or null.
// Small things win over big things: supports, joints and pins, loads, nodes, springs / ropes / rods,
// then bodies, then surfaces.
export function hitTest(scene, world, scale) {
  const px = (n) => n / scale;

  for (const c of [...scene.constraints].reverse()) {
    if (isLink(c)) continue;
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
  const node = nodeAtPoint(scene, world, px(HIT_PX.end));
  if (node) return { kind: 'body', id: node.id };
  const lines = [
    ...scene.elements.filter(isAxialElement).map((e) => ({ kind: 'element', obj: e })),
    ...scene.constraints.filter(isLink).map((c) => ({ kind: 'constraint', obj: c })),
  ].reverse();
  for (const { kind, obj } of lines) {
    const ends = linkEnds(scene, obj);
    if (ends && lineDistance(world, ends, obj, scene) <= px(HIT_PX.spring)) return { kind, id: obj.id };
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

// What the move tool would grab at `world`, or null:
//   { type: "end", id, end: "a" | "b", kind }   an end of a spring, rope or rod (re-attach it)
//   { type: "support" | "load", id }            re-place on a mass
//   { type: "pin", id }                         Festlager in free space (carries its ground ends)
//   { type: "body" | "surface", id }
export function moveTarget(scene, world, scale) {
  const px = (n) => n / scale;
  const ends = [
    ...scene.elements.filter(isAxialElement).map((e) => ({ kind: 'element', obj: e })),
    ...scene.constraints.filter(isLink).map((c) => ({ kind: 'constraint', obj: c })),
  ].reverse();
  // A ground end that sits on a Festlager in free space is part of that pin (moving the pin moves
  // it), not a handle of its own.
  const pins = scene.constraints.filter((c) => c.type === 'pin_support' && c.body === null);
  const onPin = (anchor) => anchor.body === null && pins.some((c) => dist(c.point, anchor.point) < 1e-6);
  // ... and so is an end on a Knoten: dragging there moves the node (with the Stabs that meet in it).
  const nodes = new Set(scene.bodies.filter((b) => b.type === 'node').map((b) => b.id));
  const onNode = (anchor) => anchor.body !== null && nodes.has(anchor.body);
  for (const { kind, obj } of ends) {
    for (const end of ['a', 'b']) {
      if (onPin(obj[end]) || onNode(obj[end])) continue;
      const p = anchorWorld(scene, obj[end]);
      if (p && dist(p, world) <= px(HIT_PX.end)) return { type: 'end', id: obj.id, end, kind };
    }
  }
  for (const c of [...scene.constraints].reverse()) {
    if (isLink(c) || isJoint(c)) continue;
    const p = attachedPoint(scene, c);
    if (p && dist(p, world) <= px(HIT_PX.support)) {
      return { type: c.type === 'pin_support' && c.body === null ? 'pin' : 'support', id: c.id };
    }
  }
  for (const e of [...scene.elements].reverse()) {
    if (e.type !== 'load') continue;
    const p = attachedPoint(scene, e);
    if (p && dist(p, world) <= px(HIT_PX.load)) return { type: 'load', id: e.id };
  }
  const bodies = scene.bodies.filter((b) => pointInBody(b, world));
  if (bodies.length) {
    bodies.sort((p, q) => bodyArea(p) - bodyArea(q));
    return { type: 'body', id: bodies[0].id };
  }
  for (const s of [...scene.surfaces].reverse()) {
    if (closestOnSegment(world, s.p1, s.p2).dist <= px(HIT_PX.surface)) return { type: 'surface', id: s.id };
  }
  return null;
}
