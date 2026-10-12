// connections.js - which things are joined where? Pure analysis behind the connection markers and
// the "what is this connected to" highlight in the editor.
import { anchorWorld, attachedPoint, isJoint, isLink } from './hit.js';

const KEY = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

// Every attachment point of the scene, grouped by world position:
//   { point, items: [{ kind: "element" | "constraint", id, role }], kinds: Set<string> }
// role: "end" (spring / rope / rod), "load", "support", "pin" (free-space Festlager), "joint".
// Points where two or more things meet (or a joint / pin sits) are `hub`s.
export function connectionPoints(scene) {
  const groups = new Map();
  const add = (p, item) => {
    if (!p) return;
    const k = KEY(p);
    if (!groups.has(k)) groups.set(k, { point: [...p], items: [], kinds: new Set() });
    const g = groups.get(k);
    g.items.push(item);
    g.kinds.add(item.role);
  };
  for (const e of scene.elements) {
    if (e.type === 'spring') {
      add(anchorWorld(scene, e.a), { kind: 'element', id: e.id, role: 'end' });
      add(anchorWorld(scene, e.b), { kind: 'element', id: e.id, role: 'end' });
    } else if (e.type === 'load') {
      add(attachedPoint(scene, e), { kind: 'element', id: e.id, role: 'load' });
    }
  }
  for (const c of scene.constraints) {
    if (isLink(c)) {
      add(anchorWorld(scene, c.a), { kind: 'constraint', id: c.id, role: 'end' });
      add(anchorWorld(scene, c.b), { kind: 'constraint', id: c.id, role: 'end' });
    } else if (isJoint(c)) {
      add(attachedPoint(scene, c), { kind: 'constraint', id: c.id, role: 'joint' });
    } else {
      const free = c.body === null;
      add(attachedPoint(scene, c), { kind: 'constraint', id: c.id, role: free ? 'pin' : 'support' });
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    hub: g.items.length >= 2 || g.kinds.has('joint') || g.kinds.has('pin'),
  }));
}

// Ids of the masses and objects connected to the selected object { kind, id }:
//   a mass: everything attached to it and the masses at the other ends
//   a spring / rope / rod / joint: the masses at its ends (and what is at a free pin)
//   a support or load: its mass;  a free-space Festlager: everything anchored at its point
// Returns { bodies: Set<id>, items: Set<id> } (the selection itself is not included).
export function neighbors(scene, selection) {
  const bodies = new Set();
  const items = new Set();
  if (!selection) return { bodies, items };
  const onBody = (o, id) => o.body === id || (o.a && o.a.body === id) || (o.b && o.b.body === id);
  const endsOf = (o) => [o.a, o.b].filter(Boolean).map((x) => x.body).filter((b) => b !== null);
  const all = [...scene.elements, ...scene.constraints];

  if (selection.kind === 'body') {
    for (const o of all) {
      if (!onBody(o, selection.id)) continue;
      items.add(o.id);
      for (const b of endsOf(o)) bodies.add(b);
      if (o.body) bodies.add(o.body);
    }
  } else {
    const obj = all.find((o) => o.id === selection.id);
    if (obj) {
      for (const b of endsOf(obj)) bodies.add(b);
      if (obj.body) bodies.add(obj.body);
      if (obj.body === null && obj.type === 'pin_support') {
        for (const o of all) {
          if (o === obj) continue;
          if ([o.a, o.b].some((x) => x && x.body === null && Math.hypot(x.point[0] - obj.point[0], x.point[1] - obj.point[1]) < 1e-6)) {
            items.add(o.id);
            for (const b of endsOf(o)) bodies.add(b);
          }
        }
      }
    }
  }
  bodies.delete(selection.id);
  items.delete(selection.id);
  return { bodies, items };
}
