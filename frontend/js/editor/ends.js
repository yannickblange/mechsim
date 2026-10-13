// ends.js - which ends of a Stab are clamped (fest eingespannt) and which are pins. Pure; mirrors the engine
// (native/engine/constraints/link.cpp for a rigid Stab, io/beam_builder.cpp for an elastic one):
//   - an end on a block or a disc is clamped (the Stab is a rigid arm of the mass) unless params.hinged_a / hinged_b;
//   - a Stab, rigid or elastic, is also clamped at a node that has an Einspannung (fixed_support; v0.7c, rigid ones too);
//   - every other end (the ground, a Festlager, a node, a beam) is a pin.
import { bodyToWorld } from './geometry.js';
import { surfaceAtPoint } from './snap.js';

export const MASS_TYPES = ['block', 'disc'];
const SUPPORT_TYPES = ['pin_support', 'fixed_support', 'roller_support'];

export function stabClamps(scene, stab) {
  return ['a', 'b'].map((side) => {
    const end = stab[side];
    const body = end && end.body !== null && (scene.bodies || []).find((b) => b.id === end.body);
    if (!body) return false;
    if (MASS_TYPES.includes(body.type)) return !(stab.params && stab.params[`hinged_${side}`]);
    return body.type === 'node' && hasEinspannung(scene, body.id);
  });
}

// The ends of a Stab that sit on a block or a disc (the ones whose end condition can be chosen): ['a', 'b'].
export function massEnds(scene, stab) {
  return ['a', 'b'].filter((side) => {
    const end = stab[side];
    const body = end && end.body !== null && (scene.bodies || []).find((b) => b.id === end.body);
    return body && MASS_TYPES.includes(body.type);
  });
}

// The ends of a Stab that sit on a Knoten ([{ side, node }]). A Knoten is where an end is clamped by an Einspannung (fixed_support)
// on it: an elastic Stab then keeps the rotation of the node. Without one the end is a pin.
export function nodeEnds(scene, stab) {
  return ['a', 'b'].flatMap((side) => {
    const end = stab[side];
    const node = end && end.body !== null && (scene.bodies || []).find((b) => b.id === end.body && b.type === 'node');
    return node ? [{ side, node }] : [];
  });
}

// The ends of a Stab that can be clamped by an Einspannung, because they are attached to the ground: a Festlager in free space (the foot
// of a column; `node` is null then, the clamp turns the anchor into a Knoten with an Einspannung), or a Knoten with a Festlager or an
// Einspannung, or a Knoten that stands on a surface. An end that is attached to nothing is free and has no end condition. [{ side, node | null }]
export function clampableEnds(scene, stab) {
  const held = (node) => (scene.constraints || []).some((c) => c.body === node.id && (c.type === 'fixed_support' || c.type === 'pin_support'))
    || Boolean(surfaceAtPoint(scene, node.position));
  return ['a', 'b'].flatMap((side) => {
    const end = stab[side];
    if (end && end.body === null) return [{ side, node: null }];
    return nodeEnds(scene, stab).filter((e) => e.side === side && held(e.node));
  });
}

export const hasEinspannung = (scene, nodeId) => (scene.constraints || []).some((c) => c.type === 'fixed_support' && c.body === nodeId);

// The ends of a Stab that stand on a surface: a Knoten on a surface line that has no support yet and belongs to this Stab only
// (a Knoten that joins several members is a Fachwerk joint, unless `joined` is asked for). [{ side, node, surface, far }], `far` the world point of the other end.
export function standingEnds(scene, stab, { joined: allowJoined = false } = {}) {
  const all = [...(scene.elements || []), ...(scene.constraints || [])];
  return nodeEnds(scene, stab).flatMap(({ side, node }) => {
    if (all.some((c) => c.body === node.id && SUPPORT_TYPES.includes(c.type))) return [];
    const joined = all.some((o) => o.id !== stab.id && ((o.a && o.a.body === node.id) || (o.b && o.b.body === node.id)));
    const surface = surfaceAtPoint(scene, node.position);
    if ((joined && !allowJoined) || !surface) return [];
    const other = stab[side === 'a' ? 'b' : 'a'];
    const far = other.body === null ? other.point : bodyToWorld(scene.bodies.find((b) => b.id === other.body), other.point);
    return [{ side, node, surface, far }];
  });
}
