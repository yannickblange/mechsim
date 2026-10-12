// symbols/index.js - maps JSON type names to drawing functions.
// Only integration tickets edit this file.
//
// Every symbol function has the signature
//   draw(ctx, cam, spec, entry, theme)
//     ctx   CanvasRenderingContext2D, identity transform, units = CSS pixels
//     cam   Camera (canvas/camera.js): cam.toScreen([x, y]) -> [sx, sy], cam.scale (px per m)
//     spec  the object from the scene JSON (bodies[i], elements[i] or constraints[i])
//     entry the matching object from the current frame (same id)
//     theme colours, see Renderer.readTheme()
// Surfaces are not part of frames; the renderer draws them with drawSurface(ctx, cam, surface, theme).
import { drawBeam } from './beam.js';
import { drawBlock } from './block.js';
import { drawDamper } from './damper.js';
import { drawDisc } from './disc.js';
import { drawFixedJoint, drawPinJoint } from './joint.js';
import { drawLoad } from './load.js';
import { drawNode } from './node.js';
import { drawBar, drawRod } from './rod.js';
import { drawRope } from './rope.js';
import { drawSpring } from './spring.js';
import { drawFixedSupport, drawPinSupport, drawRollerSupport, supportHeight } from './supports.js';

export { drawSurface } from './surface.js';
export { drawSpringGhost } from './spring.js';
export { supportHeight };

export const bodySymbols = { block: drawBlock, disc: drawDisc, node: drawNode, beam: drawBeam };
export const elementSymbols = { spring: drawSpring, load: drawLoad, damper: drawDamper, bar: drawBar };
export const constraintSymbols = {
  pin_support: drawPinSupport,
  fixed_support: drawFixedSupport,
  roller_support: drawRollerSupport,
  rope: drawRope,
  rod: drawRod,
  pin_joint: drawPinJoint,
  fixed_joint: drawFixedJoint,
};
