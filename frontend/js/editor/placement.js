// placement.js - how a support is placed: first a point on a mass, then the surface it sits on.
// Shared by the support tools and the move tool (dragging a support to another point of a mass).
import { supportAngleAt } from './geometry.js';
import { SNAP_TOLERANCE_PX, snapPoint, surfaceNear } from './snap.js';

export const SUPPORT_LABELS = {
  pin_support: 'Festlager',
  fixed_support: 'Einspannung',
  roller_support: 'Loslager',
};

// The surface may be picked from further away than a snap point: it is a line, not a feature.
export const SURFACE_PICK_PX = 1.5 * SNAP_TOLERANCE_PX;

// Step 1: the point of the support. Returns either
//   { error, point }                                  cannot be placed here
//   { body, point, local, kind }                      a point of a mass (snapped like everywhere)
//   { free: true, point, kind, surface, angle }       Festlager in free space (needs no second click)
export function pickSupportPoint(scene, type, world, scale) {
  const s = snapPoint(world, scene, { scale, interior: true, surfaces: true, pins: true });
  if (s.body) return { body: s.body, point: s.point, local: s.local, kind: s.kind };
  if (type !== 'pin_support') return { error: 'Zuerst einen Punkt einer Masse anklicken.', point: s.point };
  if (s.kind === 'pin') return { error: 'Hier ist schon ein Festlager.', point: s.point };
  // Festlager in free space: on a surface it adopts it, on the side the pointer is on.
  const surface = surfaceNear(s.point, scene.surfaces, scale);
  return {
    free: true, point: s.point, kind: s.kind, surface: surface ? surface.id : null,
    angle: surface ? supportAngleAt(surface, world, world) : 0,
  };
}

// Step 2: the surface under the pointer (within SURFACE_PICK_PX), or null.
export function surfaceUnder(scene, world, scale) {
  return surfaceNear(world, scene.surfaces, scale, SURFACE_PICK_PX);
}

// Where the support ends up for a picked point and surface (or none):
//   { body, local, surface: id | null, angle }
// The symbol points from the point towards the surface and adapts to the surface angle; the body
// side is the side the point is on.
export function describeSupport(scene, point, surface) {
  const body = scene.bodies.find((b) => b.id === point.body);
  return {
    body: point.body,
    local: point.local,
    surface: surface ? surface.id : null,
    angle: surface ? supportAngleAt(surface, point.point, body.position) : 0,
  };
}
