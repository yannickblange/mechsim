// Builds layouts with the editor tools (simulated pointer events, no DOM) and prints them as JSON.
// Used by tests/python/test_editor_scenes.py to check that what the editor produces is valid and
// that the native engine simulates it correctly.
import { bodyToWorld } from '../../frontend/js/editor/geometry.js';
import { setup, click, drag } from './helpers.mjs';

const SCALE = 400; // px per metre -> 0.05 m grid

// Supports take two clicks: a point of a mass, then the surface it sits on (or any free spot for none).
const support = (tool, point, surfacePoint = point) => {
  click(tool, point);
  click(tool, surfacePoint);
};

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
  support(tools.get('roller'), bodyToWorld(body, [-width / 2, -height / 2]));
  support(tools.get('roller'), bodyToWorld(body, [width / 2, -height / 2]));
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
  support(tools.get('pin'), [0, 0]);
  drag(tools.get('load'), [0, -1.0], [0.05, -1.0]); // 1 N horizontal at the lower end ...
  model.updateElement('F1', { mode: 'impulse' }); // ... as an impulse, like the property form does
  return model.toJSON();
}

function disc() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('circle'), [0, 0.6], [0.25, 0.6]);
  support(tools.get('pin'), [0, 0.6], [1, 1]); // at the centre of mass, no surface
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
  support(tools.get('fixed'), [0, 0.45]); // left edge midpoint, on the wall
  drag(tools.get('load'), [1.0, 0.45], [1.0, 0.25]); // -4 N at the tip
  return model.toJSON();
}

// A block hung from two Festlager in free space: a Stab to one, a rope to the other.
function hung() {
  const { model, tools } = setup(undefined, SCALE);
  click(tools.get('pin'), [0, 1.5]);
  click(tools.get('pin'), [0.8, 1.5]);
  drag(tools.get('rect'), [-0.2, 0.4], [0.2, 0.6]);
  const rod = tools.get('rod');
  click(rod, [0.004, 1.498]); // snaps onto the first pin
  click(rod, [0, 0.6]); // top edge of the block
  const rope = tools.get('rope');
  click(rope, [0.8, 1.5]);
  click(rope, [0.2, 0.5]); // right edge of the block
  return model.toJSON();
}

// Two bars: the upper one pinned to a Festlager in free space (joint tool on the pin), the lower
// one hinged to it (joint tool), and a moment on the lower one so that it swings.
function chain() {
  const { model, tools } = setup(undefined, SCALE);
  click(tools.get('pin'), [0, 1.5]);
  drag(tools.get('rect'), [-0.05, 1.5], [0.05, 0.9]);
  drag(tools.get('rect'), [-0.05, 0.9], [0.05, 0.3]);
  click(tools.get('joint'), [0, 1.5]); // pins the upper bar to the Festlager
  click(tools.get('joint'), [0, 0.9]); // hinge between the bars
  click(tools.get('load'), [0, 0.6]); // a moment on the lower bar ...
  model.updateElement('F1', { moment: 1 }); // ... of 1 N m, like the property form would set
  return model.toJSON();
}

// A block 0.5 m above a floor held by two Loslager that were placed with a gap (the symbols span it).
function gap() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [-1, 0], [1, 0]);
  drag(tools.get('rect'), [-0.2, 0.5], [0.2, 0.7]);
  support(tools.get('roller'), [-0.2, 0.5], [-0.6, 0]); // lower left corner, then the floor far away
  support(tools.get('roller'), [0.2, 0.5], [0.6, 0]);
  return model.toJSON();
}

// A block hung from a damper only: it falls at the terminal velocity m g / c.
function damped() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('rect'), [-0.2, 0.4], [0.2, 0.6]);
  const t = tools.get('damper');
  click(t, [0, 1.5]);
  click(t, [0, 0.6]); // top edge of the block
  return model.toJSON();
}

// A Fachwerk drawn with the Stab tool alone: its free ends make the nodes. Nodes A(0,0) B(2,0) C(4,0)
// D(1,1) E(3,1); seven Stabs; a Festlager on A, a Loslager on C (both on the floor), 1000 N down on B.
// 2 j = 10 = 7 members + 3 reactions: statically determinate.
function fachwerk() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [-0.5, 0], [4.5, 0]); // the floor
  const rod = tools.get('rod');
  for (const [a, b] of [[[0, 0], [2, 0]], [[2, 0], [4, 0]], [[0, 0], [1, 1]], [[1, 1], [2, 0]], [[1, 1], [3, 1]], [[2, 0], [3, 1]], [[3, 1], [4, 0]]]) {
    click(rod, a);
    click(rod, b);
  }
  support(tools.get('pin'), [0, 0]); // node A, then the floor
  support(tools.get('roller'), [4, 0]); // node C
  drag(tools.get('load'), [2, 0], [2, -2]);
  model.updateElement('F1', { force: [0, -1000] });
  return model.toJSON();
}

// The same Fachwerk with an extra Stab (A - E) and every Stab elastic (cross sections set the way the
// property form does): statically indeterminate, solvable only because the bars have a stiffness.
function fachwerkElastic() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('surface'), [-0.5, 0], [4.5, 0]);
  const rod = tools.get('rod');
  for (const [a, b] of [[[0, 0], [2, 0]], [[2, 0], [4, 0]], [[0, 0], [1, 1]], [[1, 1], [2, 0]], [[1, 1], [3, 1]], [[2, 0], [3, 1]], [[3, 1], [4, 0]], [[1, 1], [4, 0]]]) {
    click(rod, a);
    click(rod, b);
  }
  support(tools.get('pin'), [0, 0]);
  support(tools.get('roller'), [4, 0]);
  drag(tools.get('load'), [2, 0], [2, -2]);
  model.updateElement('F1', { force: [0, -1000] });
  for (const c of [...model.scene.constraints]) {
    // elastic steel bars of one element (the pure axial bar: no weight, no bending), damping 5 / s
    if (c.type === 'rod') model.setStabSection(c.id, { type: 'square', a: 0.02 }, { segments: 1 });
  }
  for (const b of model.scene.bodies) model.updateBody(b.id, { damping: 5 }); // the nodes settle as well
  return model.toJSON();
}

// A cantilever drawn with the beam tool: 2 m long, thin (10 mm square, set like the property form does),
// clamped at the left end, a 2 N force down at the tip.
function cantileverBeam() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('beam'), [0, 0], [2, 0]);
  model.updateBody('b1', { section: { type: 'square', a: 0.01 }, damping: 0 }); // undamped: it swings
  support(tools.get('fixed'), [0, 0]); // the start of the axis (a snap point of the beam)
  drag(tools.get('load'), [2, 0], [2, -0.4]);
  model.updateElement('F1', { force: [0, -2] });
  return model.toJSON();
}

// Forced vibration: a 2 kg mass on a spring (200 N/m) with a damper (8 N s/m), shaken by a harmonic force.
function forced() {
  const { model, tools } = setup(undefined, SCALE);
  drag(tools.get('rect'), [-0.2, 0.4], [0.2, 0.6]);
  model.updateBody('m1', { mass: 2 });
  const sp = tools.get('spring');
  click(sp, [0, 1.5]);
  click(sp, [0, 0.6]);
  sp.key('Enter'); // the installed length is the relaxed length
  model.updateElement('k1', { k: 200 });
  const damper = tools.get('damper');
  click(damper, [0, -0.5]);
  click(damper, [0, 0.4]);
  model.updateElement('c1', { c: 8 });
  drag(tools.get('load'), [0, 0.5], [0, 0.7]);
  model.updateElement('F1', { force: [0, 5], mode: 'harmonic', frequency: 1.5 });
  return model.toJSON();
}

process.stdout.write(JSON.stringify({
  incline: incline(), pendulum: pendulum(), disc: disc(), clamp: clamp(), hung: hung(), chain: chain(), gap: gap(), damped: damped(),
  fachwerk: fachwerk(), fachwerkElastic: fachwerkElastic(), cantileverBeam: cantileverBeam(), forced: forced(),
}));
