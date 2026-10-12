// Builds layouts with the editor tools (simulated pointer events, no DOM) and prints them as JSON.
// Used by tests/python/test_editor_scenes.py to check that what the editor produces is valid and
// that the native engine simulates it correctly.
import { bodyToWorld } from '../../frontend/js/editor/geometry.js';
import { setup, click, drag } from './helpers.mjs';

const SCALE = 400; // px per metre -> 0.05 m grid

function incline() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [0, 0], [1.6, 0.9]); // snaps to 30 degrees
  const surface = model.scene.surfaces[0];
  // A block lying on the incline: press on the surface, drag up and along it.
  const a = Math.atan2(surface.p2[1] - surface.p1[1], surface.p2[0] - surface.p1[0]);
  const t = [Math.cos(a), Math.sin(a)];
  const n = [-Math.sin(a), Math.cos(a)];
  const start = [0.8 * t[0], 0.8 * t[1]];
  drag(tools.get('rect'), start, [start[0] + 0.4 * t[0] + 0.2 * n[0], start[1] + 0.4 * t[1] + 0.2 * n[1]]);
  const body = model.scene.bodies[0];
  // Two Loslager at the lower corners (one would let the block tip over), force at the centre,
  // spring to the slope above.
  const { width, height } = body.params;
  click(tools.get('roller'), bodyToWorld(body, [-width / 2, -height / 2]));
  click(tools.get('roller'), bodyToWorld(body, [width / 2, -height / 2]));
  drag(tools.get('load'), body.position, [body.position[0] + 0.2, body.position[1]]);
  const top = bodyToWorld(body, [body.params.width / 2, 0]);
  const anchor = [top[0] + 0.6 * t[0], top[1] + 0.6 * t[1]];
  const sp = tools.get('spring');
  click(sp, anchor);
  click(sp, top);
  click(sp, [anchor[0] + 0.3 * t[0], anchor[1] + 0.3 * t[1]]);
  return model.toJSON();
}

function pendulum() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [0.5, 0], [-0.5, 0]); // a ceiling, drawn right to left
  drag(tools.get('rect'), [-0.05, 0], [0.05, -1.0]); // the rod, hanging from the ceiling
  click(tools.get('pin'), [0, 0]);
  drag(tools.get('load'), [0, -1.0], [0.05, -1.0]); // 1 N horizontal at the lower end ...
  model.updateElement('F1', { mode: 'impulse' }); // ... as an impulse, like the property form does
  return model.toJSON();
}

function disc() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('circle'), [0, 0.6], [0.25, 0.6]);
  click(tools.get('pin'), [0, 0.6]); // at the centre of mass
  const sp = tools.get('spring');
  click(sp, [0.25, 1.4]);
  click(sp, [0.25, 0.6]); // rim point (r, 0)
  click(sp, [0.25, 0.9]); // ghost: relaxed length 0.5 m, installed 0.8 m -> tension
  click(tools.get('load'), [0, 0.6]); // a click adds a moment ...
  // ... edited like the property form does: mass, stiffness and a clockwise moment
  model.updateBody('m1', { mass: 1.5 });
  model.updateElement('k1', { k: 30 });
  model.updateElement('F1', { moment: -2.2 }); // nearly balances the spring: small oscillations
  return model.toJSON();
}

function clamp() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [0, 1], [0, -0.5]); // a wall, drawn downwards: the mass is on its left
  drag(tools.get('rect'), [0, 0.5], [1.0, 0.4]); // a beam attached to the wall
  click(tools.get('fixed'), [0, 0.45]); // left edge midpoint
  drag(tools.get('load'), [1.0, 0.45], [1.0, 0.25]); // -4 N at the tip
  return model.toJSON();
}

process.stdout.write(JSON.stringify({ incline: incline(), pendulum: pendulum(), disc: disc(), clamp: clamp() }));
