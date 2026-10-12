// placement.js - where a support goes for a pointer position. Shared by the support tools and the
// move tool (dragging a support to another point of a mass).
import { normalizeAngle, supportAngle } from './geometry.js';
import { snapPoint, surfaceNear } from './snap.js';

export const SUPPORT_LABELS = {
  pin_support: 'Festlager',
  fixed_support: 'Lager (fixed)',
  roller_support: 'Loslager',
};

// type: pin_support | fixed_support | roller_support. Returns either
//   { error, point }                                  cannot be placed here
//   { body, point, local, kind, surface, angle }      on a mass
//   { free: true, point, kind, surface, angle }       Festlager in free space
// `exclude`: ids of constraints to ignore (the one being moved).
export function placeSupport(scene, type, world, scale) {
  const s = snapPoint(world, scene, { scale, interior: true, surfaces: true, pins: true });
  if (s.body) {
    const body = scene.bodies.find((b) => b.id === s.body);
    const surface = surfaceNear(s.point, scene.surfaces, scale);
    if (!surface && type === 'roller_support') {
      return { error: 'A Loslager needs a surface - draw one under the mass first.', point: s.point };
    }
    return {
      body: s.body, point: s.point, local: s.local, kind: s.kind,
      surface: surface ? surface.id : null,
      angle: normalizeAngle(surface ? supportAngle(surface, body.position) : 0),
    };
  }
  if (type !== 'pin_support') return { error: 'Place the support on a mass.', point: s.point };
  if (s.kind === 'pin') return { error: 'There is already a Festlager here.', point: s.point };
  // Festlager in free space: on a surface it adopts it, on the side the pointer is on.
  const surface = surfaceNear(s.point, scene.surfaces, scale);
  return {
    free: true, point: s.point, kind: s.kind, surface: surface ? surface.id : null,
    angle: normalizeAngle(surface ? supportAngle(surface, world) : 0),
  };
}
