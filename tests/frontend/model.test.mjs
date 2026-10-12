import assert from 'node:assert/strict';
import test from 'node:test';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { closePoint } from './helpers.mjs';

function filled() {
  const m = new SceneModel();
  const a = m.addBlock({ center: [0.5, 0.1], width: 0.4, height: 0.2 });
  const d = m.addDisc({ center: [1.5, 0.15], radius: 0.15 });
  const s = m.addSurface([0, 0], [2, 0]);
  const k = m.addSpring({ a: { body: a, point: [-0.2, 0] }, b: { body: null, point: [0, 0.1] }, restLength: 0.3 });
  const f = m.addLoad({ body: d, point: [0.15, 0], force: [3, 0] });
  const p = m.addSupport('pin_support', { body: a, point: [-0.2, -0.1], surface: s, angle: 0 });
  const r = m.addSupport('roller_support', { body: d, point: [0, -0.15], surface: s, angle: 0 });
  return { m, a, d, s, k, f, p, r };
}

test('a new model is an empty v0.4 scene', () => {
  const s = new SceneModel().toJSON();
  assert.equal(s.version, '0.4');
  for (const key of ['surfaces', 'bodies', 'elements', 'constraints']) assert.deepEqual(s[key], []);
});

test('objects get unique ids with sensible prefixes', () => {
  const { m, a, d, s, k, f, p, r } = filled();
  assert.deepEqual([a, d, s, k, f, p, r], ['m1', 'm2', 's1', 'k1', 'F1', 'A1', 'B1']);
  assert.equal(new Set(m.allIds()).size, m.allIds().length);
  assert.equal(m.addSupport('fixed_support', { body: a, point: [0, 0] }), 'E1');
  assert.throws(() => m.addSupport('slider', { body: a, point: [0, 0] }), /unknown support type/);
});

test('created objects have the scene.schema.json shape', () => {
  const { m } = filled();
  const s = m.toJSON();
  assert.deepEqual(s.bodies[0], { id: 'm1', type: 'block', position: [0.5, 0.1], angle: 0, params: { mass: 1, width: 0.4, height: 0.2 } });
  assert.deepEqual(s.bodies[1].params, { mass: 1, radius: 0.15 });
  assert.deepEqual(s.surfaces[0], { id: 's1', p1: [0, 0], p2: [2, 0] });
  assert.deepEqual(s.elements[1], { id: 'F1', type: 'load', body: 'm2', point: [0.15, 0], params: { force: [3, 0], moment: 0, mode: 'constant' } });
  assert.deepEqual(s.constraints[1], { id: 'B1', type: 'roller_support', body: 'm2', point: [0, -0.15], surface: 's1', params: { angle: 0 } });
});

test('a spring is stored ground end first, so its ghost hangs from the fixed end', () => {
  const m = new SceneModel();
  const b = m.addBlock({ center: [0, 0], width: 1, height: 1 });
  const id = m.addSpring({ a: { body: b, point: [0.5, 0] }, b: { body: null, point: [2, 0] }, restLength: 1 });
  const sp = m.find(id).obj;
  assert.equal(sp.a.body, null);
  assert.equal(sp.b.body, b);
  assert.equal(sp.params.rest_length, 1);
  const free = m.addSpring({ a: { body: null, point: [0, 2] }, b: { body: b, point: [0, 0.5] } });
  assert.equal('rest_length' in m.find(free).obj.params, false, 'no rest length = installed length');
});

test('numbers are stored without floating point noise', () => {
  const m = new SceneModel();
  const id = m.addBlock({ center: [0.1 + 0.2, 0.7], width: 0.3, height: 0.1 + 0.2 });
  const b = m.find(id).obj;
  assert.deepEqual(b.position, [0.3, 0.7]);
  assert.equal(b.params.height, 0.3);
});

test('removing a body also removes its springs, loads and supports', () => {
  const { m, a } = filled();
  const removed = m.remove(a);
  assert.deepEqual(removed.sort(), ['A1', 'k1', 'm1']);
  const s = m.toJSON();
  assert.deepEqual(s.bodies.map((b) => b.id), ['m2']);
  assert.deepEqual(s.elements.map((e) => e.id), ['F1']);
  assert.deepEqual(s.constraints.map((c) => c.id), ['B1']);
  assert.equal(s.surfaces.length, 1);
});

test('removing a surface only detaches the supports on it', () => {
  const { m, s } = filled();
  assert.deepEqual(m.remove(s), ['s1']);
  const c = m.toJSON().constraints;
  assert.equal(c.length, 2);
  assert.ok(c.every((x) => x.surface === null));
  assert.ok(c.every((x) => x.params.angle === 0), 'the angle is kept');
});

test('removing something unknown does nothing', () => {
  const { m } = filled();
  const before = JSON.stringify(m.scene);
  assert.deepEqual(m.remove('nope'), []);
  assert.equal(JSON.stringify(m.scene), before);
  assert.equal(m.canUndo, true);
});

test('resizing a body moves its attached points with it', () => {
  const { m, a } = filled();
  m.updateBody(a, { width: 0.8, height: 0.4, mass: 5 });
  const s = m.toJSON();
  assert.deepEqual(s.bodies[0].params, { mass: 5, width: 0.8, height: 0.4 });
  closePoint(s.elements[0].a.point, [0, 0.1], 1e-9); // the spring end was on the ground; unchanged
  closePoint(s.elements[0].b.point, [-0.4, 0], 1e-9); // body end moved from (-0.2, 0) to (-0.4, 0)
  closePoint(s.constraints[0].point, [-0.4, -0.2], 1e-9); // the pin stays on the lower left corner
});

test('resizing a disc scales attachments uniformly; other bodies are untouched', () => {
  const { m, d } = filled();
  m.updateBody(d, { radius: 0.3 });
  const s = m.toJSON();
  closePoint(s.elements[1].point, [0.3, 0]);
  closePoint(s.constraints[1].point, [0, -0.3]);
  closePoint(s.constraints[0].point, [-0.2, -0.1]);
});

test('body patch: velocity, omega, angle; unknown ids throw', () => {
  const { m, a } = filled();
  m.updateBody(a, { velocity: [1, 2], omega: 0.5, angle: 0.25 });
  const b = m.body(a);
  assert.deepEqual([b.velocity, b.omega, b.angle], [[1, 2], 0.5, 0.25]);
  assert.throws(() => m.updateBody('nope', {}), /no body/);
  assert.throws(() => m.updateBody('k1', {}), /no body/);
});

test('element patch for springs and loads', () => {
  const { m, k, f } = filled();
  m.updateElement(k, { k: 250, restLength: 0.5 });
  assert.deepEqual(m.find(k).obj.params, { k: 250, rest_length: 0.5 });
  m.updateElement(k, { restLength: null });
  assert.equal('rest_length' in m.find(k).obj.params, false);
  m.updateElement(f, { mode: 'impulse', force: [1, 2], moment: 0.5 });
  assert.deepEqual(m.find(f).obj.params, { force: [1, 2], moment: 0.5, mode: 'impulse' });
  assert.throws(() => m.updateElement('m1', {}), /no element/);
});

test('undo and redo restore whole scenes', () => {
  const m = new SceneModel();
  assert.equal(m.canUndo, false);
  m.addBlock({ center: [0, 0], width: 1, height: 1 });
  m.addSurface([0, 0], [1, 0]);
  assert.equal(m.scene.surfaces.length, 1);
  assert.ok(m.undo());
  assert.equal(m.scene.surfaces.length, 0);
  assert.equal(m.scene.bodies.length, 1);
  assert.ok(m.undo());
  assert.equal(m.scene.bodies.length, 0);
  assert.equal(m.undo(), false);
  assert.ok(m.redo() && m.redo());
  assert.equal(m.redo(), false);
  assert.equal(m.scene.surfaces.length, 1);
  m.undo();
  m.addDisc({ center: [0, 0], radius: 1 });
  assert.equal(m.canRedo, false, 'a new edit clears the redo stack');
});

test('undo of a cascading delete brings everything back', () => {
  const { m, a } = filled();
  const before = JSON.stringify(m.scene);
  m.remove(a);
  m.undo();
  assert.equal(JSON.stringify(m.scene), before);
});

test('dirty / revision: edits count, naming and view do not, load resets', () => {
  const m = new SceneModel();
  assert.deepEqual([m.dirty, m.revision], [false, 0]);
  m.setName('x');
  m.setView({ center: [1, 1], width: 4 });
  assert.deepEqual([m.dirty, m.revision], [false, 0]);
  m.addSurface([0, 0], [1, 0]);
  assert.deepEqual([m.dirty, m.revision], [true, 1]);
  m.undo();
  assert.equal(m.revision, 2, 'undo is a change too');
  m.dirty = false; // what saving does
  assert.equal(m.revision, 2);
  m.load(SceneModel.emptyScene());
  assert.deepEqual([m.dirty, m.revision, m.canUndo], [false, 0, false]);
});

test('history is capped', () => {
  const m = new SceneModel();
  for (let i = 0; i < 130; i++) m.addSurface([0, i], [1, i]);
  assert.equal(m.undoStack.length, 100);
});

test('toJSON returns a copy; load copies its input', () => {
  const m = new SceneModel();
  m.addSurface([0, 0], [1, 0]);
  const out = m.toJSON();
  out.surfaces.length = 0;
  assert.equal(m.scene.surfaces.length, 1);
  const input = { ...SceneModel.emptyScene(), surfaces: [{ id: 's1', p1: [0, 0], p2: [1, 0] }] };
  const m2 = new SceneModel(input);
  m2.remove('s1');
  assert.equal(input.surfaces.length, 1);
});

test('loading a v0.1 scene upgrades the version and fills missing lists', () => {
  const m = new SceneModel({ version: '0.1', bodies: [] });
  assert.equal(m.scene.version, '0.4');
  assert.deepEqual(m.scene.surfaces, []);
  assert.deepEqual(m.scene.constraints, []);
});

test('subscribers are notified on every change and can unsubscribe', () => {
  const m = new SceneModel();
  let n = 0;
  const off = m.subscribe(() => n++);
  m.addSurface([0, 0], [1, 0]);
  m.undo();
  assert.equal(n, 2);
  off();
  m.redo();
  assert.equal(n, 2);
});
