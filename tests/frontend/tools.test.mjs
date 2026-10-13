import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyFeaturePoints, bodyToWorld, closestOnSegment, surfaceAngle } from '../../frontend/js/editor/geometry.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { TOOL_DEFS } from '../../frontend/js/editor/tools.js';
import {
  block, click, close, closePoint, disc, drag, sceneWith, setup,
} from './helpers.mjs';

const floorScene = () => sceneWith({
  surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }],
  bodies: [block('m1', 0.5, 0.1, 0.4, 0.2)],
});

test('the toolbox offers every component', () => {
  assert.deepEqual(TOOL_DEFS.map((d) => d.id), [
    'select', 'move', 'rect', 'circle', 'beam', 'surface', 'spring', 'damper', 'rope', 'rod', 'node', 'load', 'pin', 'fixed', 'roller', 'joint', 'weld',
  ]);
});

// --- rectangle ---------------------------------------------------------------------------------

test('rect: drag from corner to corner, in any direction', () => {
  for (const [a, b] of [[[0, 0], [0.4, 0.2]], [[0.4, 0.2], [0, 0]], [[0, 0.2], [0.4, 0]]]) {
    const { model, tools, log } = setup();
    assert.equal(drag(tools.get('rect'), a, b), true);
    const body = model.scene.bodies[0];
    assert.equal(body.type, 'block');
    closePoint(body.position, [0.2, 0.1]);
    assert.deepEqual(body.params, { mass: 1, width: 0.4, height: 0.2 });
    assert.deepEqual(log.created, [['body', 'm1']]);
  }
});

test('rect: click - click works as well as dragging', () => {
  const { model, tools } = setup();
  const t = tools.get('rect');
  click(t, [0, 0]);
  assert.equal(model.scene.bodies.length, 0);
  assert.ok(t.preview, 'rubber band while waiting for the second corner');
  click(t, [0.6, 0.3]);
  assert.equal(model.scene.bodies.length, 1);
  assert.equal(t.preview, null);
});

test('rect: a degenerate rectangle is rejected with a message', () => {
  const { model, tools } = setup();
  const t = tools.get('rect');
  drag(t, [0, 0], [0.01, 0.4]);
  assert.equal(model.scene.bodies.length, 0);
  assert.match(t.error, /klein/i);
});

test('rect: starting on a surface aligns the rectangle with it', () => {
  const s = Math.tan(Math.PI / 6);
  const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', p1: [0, 0], p2: [1.6, 1.6 * s] }] }));
  const t = tools.get('rect');
  const start = [0.8, 0.8 * s];
  drag(t, start, [0.9, 0.9]);
  const body = model.scene.bodies[0];
  close(body.angle, Math.PI / 6, 1e-6);
  assert.ok(body.params.width > 0 && body.params.height > 0);
  const corners = bodyFeaturePoints(body).filter((f) => f.kind === 'corner').map((f) => bodyToWorld(body, f.local));
  const nearest = Math.min(...corners.map((c) => Math.hypot(c[0] - start[0], c[1] - start[1])));
  assert.ok(nearest < 0.03, `one corner is at the press point (off by ${nearest})`);
});

test('rect: floors and walls do not rotate the rectangle', () => {
  for (const surface of [{ p1: [0, 0], p2: [2, 0] }, { p1: [2, 0], p2: [0, 0] }, { p1: [0, 1], p2: [0, -0.5] }, { p1: [0, -0.5], p2: [0, 1] }]) {
    const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', ...surface }] }));
    const start = [(surface.p1[0] + surface.p2[0]) / 2, (surface.p1[1] + surface.p2[1]) / 2];
    drag(tools.get('rect'), start, [start[0] + 0.5, start[1] + 0.3]);
    const b = model.scene.bodies[0];
    assert.equal(b.angle, 0);
    assert.deepEqual(b.params, { mass: 1, width: 0.5, height: 0.3 });
  }
});

test('rect: starting off a surface keeps the rectangle axis-aligned', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', p1: [0, 0], p2: [1, 1] }] }));
  drag(tools.get('rect'), [2, 2], [2.4, 2.2]);
  assert.equal(model.scene.bodies[0].angle, 0);
});

test('rect: Escape cancels the gesture', () => {
  const { model, tools } = setup();
  const t = tools.get('rect');
  click(t, [0, 0]);
  assert.equal(t.key('Escape'), true);
  assert.equal(t.preview, null);
  assert.equal(t.key('Escape'), false, 'nothing left to cancel');
  click(t, [0.2, 0.2]);
  assert.equal(model.scene.bodies.length, 0, 'a new gesture starts fresh');
});

// --- circle ------------------------------------------------------------------------------------

test('circle: centre, then radius (drag or click)', () => {
  const { model, tools, log } = setup();
  const t = tools.get('circle');
  drag(t, [1, 1], [1.3, 1]);
  const d = model.scene.bodies[0];
  assert.equal(d.type, 'disc');
  closePoint(d.position, [1, 1]);
  close(d.params.radius, 0.3, 1e-9);
  assert.deepEqual(log.created[0], ['body', 'm1']);

  click(t, [3, 1]);
  click(t, [3, 1.45]);
  close(model.scene.bodies[1].params.radius, 0.45, 1e-9);
});

test('circle: a radius is never smaller than one grid step', () => {
  const { model, tools } = setup();
  const t = tools.get('circle');
  click(t, [0, 0]);
  click(t, [0, 0]);
  close(model.scene.bodies[0].params.radius, 0.05, 1e-9);
});

// --- surface -----------------------------------------------------------------------------------

const surfaceAngleDeg = (s) => (surfaceAngle(s) * 180) / Math.PI;
const surfaceLen = (s) => Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]);

test('surface: the angle snaps to 0, 30, 45, 60 and 90 degrees', () => {
  const cases = [[[1.2, 0.05], 0], [[1.0, 0.6], 30], [[1.0, 0.95], 45], [[0.6, 1.0], 60], [[0.02, 1.0], 90], [[-1.0, 1.1], 135], [[1.0, -0.55], -30]];
  for (const [end, expected] of cases) {
    const { model, tools } = setup();
    drag(tools.get('surface'), [0, 0], end);
    const s = model.scene.surfaces[0];
    close(surfaceAngleDeg(s), expected, 1e-6, `end ${end}`);
    assert.ok(surfaceLen(s) >= 0.05);
  }
});

test('surface: length is rounded to the grid and shown while dragging', () => {
  const { model, tools } = setup();
  const t = tools.get('surface');
  t.move({ world: [0, 0] });
  t.down({ world: [0, 0] });
  t.move({ world: [1.02, 0.57] });
  assert.match(t.preview.label, /1,15 m, 30°/);
  t.up({ world: [1.02, 0.57] });
  close(surfaceLen(model.scene.surfaces[0]), 1.15, 1e-6);
});

test('surface: Shift releases the angle snap', () => {
  const { model, tools } = setup();
  drag(tools.get('surface'), [0, 0], [1.0, 0.6], { shift: true });
  closePoint(model.scene.surfaces[0].p2, [1, 0.6]);
});

test('surface: click - click, too short is rejected', () => {
  const { model, tools } = setup();
  const t = tools.get('surface');
  click(t, [0, 0]);
  click(t, [0.8, 0.02]);
  assert.equal(model.scene.surfaces.length, 1);
  click(t, [3, 3]);
  click(t, [3.01, 3.0]);
  assert.equal(model.scene.surfaces.length, 1);
  assert.ok(t.error);
});

test('surface: starts snap to other surface end points', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', p1: [0, 0], p2: [1, 0] }] }));
  drag(tools.get('surface'), [1.004, 0.006], [1.0, 1.0]);
  const s = model.scene.surfaces[1];
  closePoint(s.p1, [1, 0]);
  closePoint(s.p2, [1, 1]);
});

// --- spring --------------------------------------------------------------------------------------

const springScene = () => sceneWith({ bodies: [block('m1', 1, 0.5, 0.4, 0.2)] });

test('spring: A on the ground, B on a mass, then the relaxed length (ghost)', () => {
  const { model, tools, log } = setup(springScene());
  const t = tools.get('spring');
  click(t, [0, 0.5]);
  click(t, [0.8, 0.5]); // left edge midpoint of m1
  assert.equal(model.scene.elements.length, 0);
  assert.match(t.hint, /entspannte Länge/);
  click(t, [0.5, 0.5]);
  const sp = model.scene.elements[0];
  assert.equal(sp.type, 'spring');
  assert.deepEqual(sp.a, { body: null, point: [0, 0.5] });
  assert.deepEqual(sp.b, { body: 'm1', point: [-0.2, 0] });
  assert.equal(sp.params.rest_length, 0.5);
  assert.equal(sp.params.k, 100);
  assert.deepEqual(log.created, [['element', 'k1']]);
});

test('spring: the ghost preview hangs from the ground end and says tension or compression', () => {
  const { tools } = setup(springScene());
  const t = tools.get('spring');
  click(t, [0, 0.5]);
  click(t, [0.8, 0.5]);
  t.move({ world: [0.5, 0.5] });
  let pv = t.preview;
  closePoint(pv.ghost.from, [0, 0.5]);
  closePoint(pv.ghost.to, [0.5, 0.5]);
  assert.match(pv.label, /entspannt L0 = 0,50 m \(Zug\)/);
  t.move({ world: [1.1, 0.5] });
  pv = t.preview;
  closePoint(pv.ghost.to, [1.1, 0.5]);
  assert.match(pv.label, /\(Druck\)/);
});

test('spring: Enter, or a click at the installed length, means no pre-stress', () => {
  for (const finish of [(t) => t.key('Enter'), (t) => click(t, [0.79, 0.5])]) {
    const { model, tools } = setup(springScene());
    const t = tools.get('spring');
    click(t, [0, 0.5]);
    click(t, [0.8, 0.5]);
    finish(t);
    assert.equal(model.scene.elements.length, 1);
    assert.equal('rest_length' in model.scene.elements[0].params, false);
  }
});

test('spring: the end on the ground is stored first, whichever was clicked first', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('spring');
  click(t, [0.8, 0.5]); // the mass first
  click(t, [0, 0.5]);
  assert.match(t.preview.label, /Zug|Druck|spannungsfrei/);
  assert.deepEqual(t.preview.ghost.from, [0, 0.5], 'ghost starts at the ground end');
  click(t, [0.3, 0.5]);
  const sp = model.scene.elements[0];
  assert.equal(sp.a.body, null);
  assert.equal(sp.b.body, 'm1');
  assert.equal(sp.params.rest_length, 0.3);
});

test('spring: drag from A to B also sets both ends', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('spring');
  drag(t, [0, 0.5], [0.8, 0.5]);
  assert.equal(t.stage, 2);
  click(t, [0.4, 0.5]);
  assert.equal(model.scene.elements.length, 1);
});

test('spring: both ends on the ground is refused and B can be picked again', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('spring');
  click(t, [0, 0.5]);
  click(t, [0, 1.5]);
  assert.match(t.error, /Masse/);
  assert.equal(t.stage, 1);
  click(t, [0.8, 0.5]);
  assert.equal(t.stage, 2);
  assert.equal(t.error, null);
});

test('spring: a spring between two masses and from a point inside a mass', () => {
  const { model, tools } = setup(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.4), block('b', 1, 0, 0.4, 0.4)] }));
  const t = tools.get('spring');
  click(t, [0.1, 0.1]); // inside a, not on a feature
  click(t, [1, 0]); // centre of b
  t.key('Enter');
  const sp = model.scene.elements[0];
  assert.deepEqual(sp.a, { body: 'a', point: [0.1, 0.1] });
  assert.deepEqual(sp.b, { body: 'b', point: [0, 0] });
});

test('spring: a ground end can sit on a surface', () => {
  const { model, tools } = setup(sceneWith({
    surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }], bodies: [block('m1', 1, 0.5, 0.4, 0.2)],
  }));
  const t = tools.get('spring');
  click(t, [0.5, 0.004]);
  click(t, [1, 0.5]);
  t.key('Enter');
  assert.deepEqual(model.scene.elements[0].a, { body: null, point: [0.5, 0] });
});

test('spring: Escape cancels at any stage', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('spring');
  click(t, [0, 0.5]);
  click(t, [0.8, 0.5]);
  assert.equal(t.key('Escape'), true);
  assert.equal(t.stage, 0);
  assert.equal(t.preview, null);
  assert.equal(model.scene.elements.length, 0);
  assert.equal(t.key('Escape'), false);
});

// --- load ----------------------------------------------------------------------------------------

test('load: press on a corner and drag to set the force vector', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('load');
  drag(t, [1.2, 0.6], [1.2, 0.2]);
  const l = model.scene.elements[0];
  assert.equal(l.type, 'load');
  assert.equal(l.body, 'm1');
  assert.deepEqual(l.point, [0.2, 0.1]);
  assert.deepEqual(l.params, { force: [0, -8], moment: 0, mode: 'constant' });
});

test('load: a plain click on the centre of mass adds a moment', () => {
  const { model, tools } = setup(springScene());
  click(tools.get('load'), [1, 0.5]);
  const l = model.scene.elements[0];
  assert.deepEqual(l.point, [0, 0]);
  assert.deepEqual(l.params, { force: [0, 0], moment: 5, mode: 'constant' });
});

test('load: refuses to act off a mass, and shows an invalid marker while hovering there', () => {
  const { model, tools } = setup(springScene());
  const t = tools.get('load');
  t.move({ world: [3, 3] });
  assert.equal(t.marker.kind, 'invalid');
  click(t, [3, 3]);
  assert.match(t.error, /Masse/);
  assert.equal(model.scene.elements.length, 0);
  t.up({ world: [3, 3] });
});

test('load: the force arrow preview reports newtons', () => {
  const { tools } = setup(springScene());
  const t = tools.get('load');
  t.down({ world: [1.2, 0.6] });
  t.move({ world: [1.6, 0.6] });
  assert.deepEqual(t.preview.force.map((v) => Math.round(v)), [8, 0]);
  assert.match(t.preview.label, /8,0 N/);
});

// --- supports ------------------------------------------------------------------------------------

// Supports take two clicks: a point of a mass, then the surface it sits on.
const clickSupport = (tool, point, surfacePoint) => { click(tool, point); click(tool, surfacePoint ?? point); };

test('Festlager: first a point of the mass, then the surface', () => {
  const { model, tools, log } = setup(floorScene());
  const t = tools.get('pin');
  click(t, [0.3, 0.0]);
  assert.equal(model.scene.constraints.length, 0, 'nothing yet');
  assert.match(t.hint, /Fläche anklicken/i);
  assert.ok(t.marker, 'the picked point stays marked');
  click(t, [0.8, 0.0]); // anywhere on the surface: it only picks the surface
  assert.deepEqual(model.scene.constraints[0], {
    id: 'A1', type: 'pin_support', body: 'm1', point: [-0.2, -0.1], surface: 's1', params: { angle: 0 },
  });
  assert.deepEqual(log.created, [['constraint', 'A1']]);
  assert.match(t.hint, /Einen Punkt einer Masse anklicken/, 'ready for the next one');
});

test('supports: the surface may be further away than the mass; the preview spans the gap', () => {
  const { model, tools } = setup(sceneWith({
    surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }],
    bodies: [block('m1', 0.5, 0.6, 0.4, 0.2)], // its lower edge is 0.5 m above the surface
  }));
  const t = tools.get('roller');
  click(t, [0.5, 0.5]); // middle of the lower edge
  t.move({ world: [1.2, 0.01] }); // hovering the surface (a little off it)
  assert.equal(t.preview.surface, 's1');
  assert.equal(t.preview.valid, true);
  close(t.preview.height, 0.5, 1e-9);
  click(t, [1.2, 0.01]);
  assert.deepEqual(model.scene.constraints[0], {
    id: 'B1', type: 'roller_support', body: 'm1', point: [0, -0.1], surface: 's1', params: { angle: 0 },
  });
});

test('supports: the surface can be picked from 15 px away, not from further', () => {
  const { model, tools } = setup(floorScene());
  const t = tools.get('fixed');
  click(t, [0.3, 0.0]);
  click(t, [1.0, 0.045]); // 18 px at 400 px/m: too far
  assert.equal(model.scene.constraints[0].surface, null, 'created without a surface');
  click(t, [0.7, 0.0]);
  click(t, [1.0, 0.03]); // 12 px: picks it
  assert.equal(model.scene.constraints[1].surface, 's1');
});

test('Loslager: the second click must be a surface; Escape cancels the first', () => {
  const { model, tools } = setup(floorScene());
  const t = tools.get('roller');
  click(t, [0.7, 0.0]);
  t.move({ world: [1.5, 1.5] });
  assert.equal(t.preview.valid, false);
  click(t, [1.5, 1.5]);
  assert.match(t.error, /braucht eine Fläche/);
  assert.equal(model.scene.constraints.length, 0);
  assert.ok(t.first, 'still waiting for the surface');
  assert.equal(t.key('Escape'), true);
  assert.equal(t.first, null);
  assert.equal(t.key('Escape'), false);
  click(t, [1.5, 1.5]);
  assert.match(t.error, /Punkt einer Masse/);
});

test('Festlager and fixed Lager without a surface: second click elsewhere', () => {
  const { model, tools } = setup(sceneWith({ bodies: [block('m1', 0.5, 0.1, 0.4, 0.2)] }));
  clickSupport(tools.get('pin'), [0.5, 0.1], [3, 3]);
  clickSupport(tools.get('fixed'), [0.3, 0.1], [3, 3]);
  // no surface: the click only turns the support towards it (snapped to 45 degrees: 45 + 90)
  const angles = model.scene.constraints.map((c) => [c.type, c.surface, Math.round((c.params.angle * 180) / Math.PI)]);
  assert.deepEqual(angles, [['pin_support', null, 135], ['fixed_support', null, 135]]);
});

test('supports: the angle follows the surface and the side the point is on', () => {
  // ceiling drawn right to left, rod hanging below it
  const ceiling = setup(sceneWith({
    surfaces: [{ id: 'c', p1: [0.5, 0], p2: [-0.5, 0] }],
    bodies: [block('rod', 0, -0.5, 0.06, 1)],
  }));
  clickSupport(ceiling.tools.get('pin'), [0, 0]);
  const pin = ceiling.model.scene.constraints[0];
  assert.deepEqual(pin.point, [0, 0.5]);
  assert.equal(pin.surface, 'c');
  close(pin.params.angle, Math.PI, 1e-9);

  // 30 degree incline with an aligned block on it
  const a = Math.PI / 6;
  const incline = setup(sceneWith({
    surfaces: [{ id: 's', p1: [0, 0], p2: [Math.cos(a) * 2, Math.sin(a) * 2] }],
    bodies: [block('b', 0.9 + Math.sin(a) * -0.1, 0.5196 + Math.cos(a) * 0.1, 0.3, 0.2, { angle: a })],
  }));
  const body = incline.model.scene.bodies[0];
  const bottom = bodyToWorld(body, [0, -0.1]);
  clickSupport(incline.tools.get('roller'), bottom);
  const r = incline.model.scene.constraints[0];
  assert.equal(r.surface, 's');
  close(r.params.angle, a, 1e-6);

  // the same incline, the point at the top of the block: still above (left of) the surface
  const top = bodyToWorld(body, [0, 0.1]);
  const far = setup(incline.model.scene);
  clickSupport(far.tools.get('pin'), top, bottom);
  close(far.model.scene.constraints[0].params.angle, a, 1e-6);
  const h = far.tools.get('pin');
  click(h, top);
  h.move({ world: bottom });
  close(h.preview.height, 0.2, 1e-3, 'the gap is measured along the surface normal');
});

test('supports: not on a mass is an error, with an invalid marker (except the Festlager)', () => {
  const { model, tools } = setup(floorScene());
  const t = tools.get('fixed');
  t.move({ world: [1.5, 0.5] });
  assert.equal(t.marker.kind, 'invalid');
  assert.equal(t.preview.valid, false);
  click(t, [1.5, 0.5]);
  assert.match(t.error, /Punkt einer Masse/);
  assert.equal(model.scene.constraints.length, 0);
});

test('supports: the preview carries the orientation and the surface', () => {
  const { tools } = setup(floorScene());
  const t = tools.get('roller');
  click(t, [0.3, 0.0]);
  t.move({ world: [1.0, 0.0] });
  assert.equal(t.preview.supportType, 'roller_support');
  assert.equal(t.preview.valid, true);
  assert.equal(t.preview.angle, 0);
  assert.equal(t.preview.surface, 's1');
  assert.equal(t.preview.height, 0);
});

// --- select --------------------------------------------------------------------------------------

test('select: clicking selects; empty space clears and lets the canvas pan', () => {
  const { tools, log } = setup(floorScene());
  const t = tools.get('select');
  assert.equal(click(t, [0.5, 0.1]), true);
  assert.deepEqual(log.selected, { kind: 'body', id: 'm1' });
  assert.equal(click(t, [1.5, 1.5]), false, 'not consumed: the canvas pans');
  assert.equal(log.selected, null);
});

test('every tool survives a full gesture followed by cancel()', () => {
  for (const def of TOOL_DEFS) {
    const { tools } = setup(floorScene());
    const t = tools.get(def.id);
    t.move({ world: [0.3, 0] });
    t.down({ world: [0.3, 0] });
    t.move({ world: [0.6, 0.2] });
    t.cancel();
    assert.equal(t.preview, null, def.id);
    assert.equal(typeof t.hint, 'string');
  }
});

test('creating through tools keeps the model undoable', () => {
  const { model, tools } = setup();
  drag(tools.get('rect'), [0, 0], [0.4, 0.2]);
  drag(tools.get('surface'), [0, -0.2], [1, -0.2]);
  assert.equal(model.scene.bodies.length + model.scene.surfaces.length, 2);
  model.undo();
  model.undo();
  assert.equal(model.scene.bodies.length + model.scene.surfaces.length, 0);
});
