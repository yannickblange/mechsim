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
import { drawBlock } from './block.js';
import { drawSpring } from './spring.js';
import { drawPinSupport } from './supports.js';

export const bodySymbols = { block: drawBlock };
export const elementSymbols = { spring: drawSpring };
export const constraintSymbols = { pin_support: drawPinSupport };
