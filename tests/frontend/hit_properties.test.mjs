import assert from 'node:assert/strict';
import test from 'node:test';
import { hitTest, massesAt } from '../../frontend/js/editor/hit.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { block, close, closePoint, disc, sceneWith } from './helpers.mjs';

function scene() {
  const m = new SceneModel(sceneWith({
    surfaces: [{ id: 's1', p1: [0, 0], p2: [3, 0] }],
    bodies: [block('big', 1, 0.5, 1.0, 1.0), block('small', 1, 0.5, 0.2, 0.2), disc('d', 2.5, 0.15, 0.15)],
  }));
  m.addSpring({ a: { body: null, point: [3, 0.5] }, b: { body: 'd', point: [0.15, 0] }, restLength: 0.2 });
  m.addLoad({ body: 'big', point: [0.5, 0.5], force: [4, 0] });
  m.addSupport('pin_support', { body: 'big', point: [-0.5, -0.5], surface: 's1', angle: 0 });
  return m;
}

// --- hit testing -------------------------------------------------------------------------------

test('hit: supports and loads win over the body underneath', () => {
  const { scene: s } = scene();
  assert.deepEqual(hitTest(s, [0.5, 0.0], 400), { kind: 'constraint', id: 'A1' });
  assert.deepEqual(hitTest(s, [1.5, 1.0], 400), { kind: 'element', id: 'F1' });
  assert.deepEqual(hitTest(s, [1.6, 1.0], 400), { kind: 'element', id: 'F1' }, 'along the arrow');
});

test('hit: the smaller body is on top; springs and surfaces are found by their line', () => {
  const { scene: s } = scene();
  assert.deepEqual(hitTest(s, [1, 0.5], 400), { kind: 'body', id: 'small' });
  assert.deepEqual(hitTest(s, [1.3, 0.8], 400), { kind: 'body', id: 'big' });
  assert.deepEqual(hitTest(s, [2.825, 0.325], 400), { kind: 'element', id: 'k1' }, 'middle of the spring');
  assert.deepEqual(hitTest(s, [2.5, 0.15], 400), { kind: 'body', id: 'd' });
  assert.deepEqual(hitTest(s, [2.2, 0.003], 400), { kind: 'surface', id: 's1' });
  assert.equal(hitTest(s, [2, 2], 400), null);
});

test('hit: the pixel tolerance does not depend on the zoom', () => {
  const { scene: s } = scene();
  const p = (px, scale) => [2.2, px / scale]; // above the surface by `px` pixels
  assert.equal(hitTest(s, p(5, 100), 100)?.id, 's1');
  assert.equal(hitTest(s, p(5, 800), 800)?.id, 's1');
  assert.equal(hitTest(s, p(12, 100), 100), null);
  assert.equal(hitTest(s, p(12, 800), 800), null);
});

// --- property forms ------------------------------------------------------------------------------

const fieldMap = (form) => Object.fromEntries(form.fields.map((f) => [f.key, f]));

test('block form: mass properties with the moment of inertia', () => {
  const m = scene();
  const form = propertyFields(m, 'small');
  assert.deepEqual(form.fields.map((f) => f.key), ['mass', 'width', 'height', 'angle', 'vx', 'vy', 'omega']);
  assert.match(form.info[0], /J = 0,0067 kg·m²/); // 1 * (0.04 + 0.04) / 12
  assert.equal(fieldMap(form).mass.value, 1);
  assert.equal(fieldMap(form).mass.unit, 'kg');
});

test('disc form: radius instead of width and height, J = m r^2 / 2', () => {
  const m = scene();
  m.updateBody('d', { mass: 2 });
  const form = propertyFields(m, 'd');
  assert.deepEqual(form.fields.map((f) => f.key), ['mass', 'radius', 'angle', 'vx', 'vy', 'omega']);
  assert.match(form.info[0], /J = 0,0225 kg·m²/);
});

test('applying a valid block form updates mass, size, angle and initial velocity', () => {
  const m = scene();
  const res = applyProperties(m, 'small', { mass: '2.5', width: '0,4', height: '0.3', angle: '90', vx: '1', vy: '-2', omega: '0.5' });
  assert.deepEqual(res, { ok: true, errors: [] });
  const b = m.body('small');
  assert.deepEqual(b.params, { mass: 2.5, width: 0.4, height: 0.3 });
  close(b.angle, Math.PI / 2);
  assert.deepEqual(b.velocity, [1, -2]);
  assert.equal(b.omega, 0.5);
});

test('invalid input changes nothing and lists every problem', () => {
  const m = scene();
  const before = JSON.stringify(m.scene);
  const revision = m.revision;
  const res = applyProperties(m, 'small', { mass: '-1', width: 'abc', height: '0.3', angle: '', vx: '0', vy: '0', omega: '0' });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 3);
  assert.match(res.errors.join(' '), /Masse.*größer als 0/);
  assert.match(res.errors.join(' '), /Breite.*Zahl eingeben/);
  assert.match(res.errors.join(' '), /Winkel.*Zahl eingeben/);
  assert.equal(JSON.stringify(m.scene), before);
  assert.equal(m.revision, revision, 'no undo step was recorded');
});

test('spring form: stiffness and relaxed length, with tension / compression info', () => {
  const m = scene();
  const form = propertyFields(m, 'k1');
  assert.deepEqual(form.fields.map((f) => f.key), ['k', 'restLength']);
  assert.match(form.info[0], /Eingebaute Länge 0,49 m.*Zug/); // (3, 0.5) to the disc rim at (2.65, 0.15)
  assert.equal(applyProperties(m, 'k1', { k: '40', restLength: '0.6' }).ok, true);
  assert.deepEqual(m.find('k1').obj.params, { k: 40, rest_length: 0.6 });
  assert.match(propertyFields(m, 'k1').info[0], /Druck/);
  assert.equal(applyProperties(m, 'k1', { k: '-5', restLength: '0.6' }).ok, false);
  assert.equal(applyProperties(m, 'k1', { k: '0', restLength: '0' }).ok, true, 'k = 0 and L0 = 0 are allowed');
});

test('spring without a rest length shows the installed length as the default', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 1, 1)] }));
  const id = m.addSpring({ a: { body: null, point: [2, 0] }, b: { body: 'a', point: [0.5, 0] } });
  const form = propertyFields(m, id);
  assert.equal(fieldMap(form).restLength.value, 1.5);
  assert.match(form.info[0], /unbelastet/);
});

test('load form: type switch changes the units; a load can become an impulse', () => {
  const m = scene();
  let form = propertyFields(m, 'F1');
  assert.equal(fieldMap(form).fx.unit, 'N');
  assert.equal(fieldMap(form).moment.unit, 'N·m');
  assert.equal(fieldMap(form).mode.value, 'constant');
  const res = applyProperties(m, 'F1', { mode: 'impulse', fx: '2', fy: '-3', moment: '0.5' });
  assert.equal(res.ok, true);
  assert.deepEqual(m.find('F1').obj.params, { force: [2, -3], moment: 0.5, mode: 'impulse' });
  form = propertyFields(m, 'F1');
  assert.equal(fieldMap(form).fx.unit, 'N·s');
  assert.match(form.title, /Impuls/);
  assert.equal(applyProperties(m, 'F1', { mode: 'ramp', fx: '1', fy: '1', moment: '0' }).ok, false);
});

test('surfaces have friction and bounce, supports have no editable fields; both describe themselves', () => {
  const m = scene();
  assert.deepEqual(propertyFields(m, 's1').fields.map((f) => [f.key, f.value]), [['friction', 0], ['restitution', 0], ['side', 'keep']]);
  assert.match(propertyFields(m, 's1').info[0], /Länge 3,00 m, Gerade, Richtung 0,0°/);
  const pin = propertyFields(m, 'A1');
  assert.deepEqual(pin.fields, []);
  assert.match(pin.title, /Festlager/);
  assert.match(pin.info.join(' '), /auf Fläche s1/);
  assert.deepEqual(applyProperties(m, 'A1', {}), { ok: true, errors: [] });
  assert.equal(propertyFields(m, 'nope'), null);
  assert.equal(applyProperties(m, 'nope', {}).ok, false);
});

test('resizing through the form keeps attached points on the same features', () => {
  const m = scene();
  applyProperties(m, 'big', { mass: '1', width: '2', height: '1', angle: '0', vx: '0', vy: '0', omega: '0' });
  closePoint(m.find('A1').obj.point, [-1, -0.5]);
  closePoint(m.find('F1').obj.point, [1, 0.5]);
});

// --- v0.4: right-click a mass while the simulation runs -------------------------------------------------

test('massesAt finds a mass where it is now, even with a support or load on it', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0.1, 0.4, 0.2), block('b', 3, 0.1, 0.4, 0.2)] }));
  m.addSupport('pin_support', { body: 'a', point: [0, 0] });
  m.addLoad({ body: 'a', point: [0, 0], force: [5, 0] });
  // at rest: the centre of a is covered by a support and a load, hitTest picks those
  assert.equal(hitTest(m.scene, [0, 0.1], 400).kind, 'constraint');
  assert.deepEqual(massesAt(m.scene, null, [0, 0.1]), ['a']);
  assert.deepEqual(massesAt(m.scene, null, [1.5, 0.1]), []);
  // a has moved to x = 1 and turned: the frame says so, the scene does not
  const frame = { bodies: [{ id: 'a', x: 1, y: 0.1, phi: Math.PI / 2 }, { id: 'b', x: 3, y: 0.1, phi: 0 }] };
  assert.deepEqual(massesAt(m.scene, frame, [1, 0.25]), ['a'], 'turned: it is tall now');
  assert.deepEqual(massesAt(m.scene, frame, [0.25, 0.1]), [], 'its old place is empty');
  assert.deepEqual(massesAt(m.scene, frame, [3.1, 0.1]), ['b']);
});

test('massesAt lists the small mass on top first (nodes, then masses on larger masses)', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('big', 0, 0, 2, 1)] }));
  m.addNode({ point: [0, 0] });
  m.addBlock({ center: [0.1, 0], width: 0.3, height: 0.3 });
  assert.deepEqual(massesAt(m.scene, null, [0.02, 0]), ['N1', 'm1', 'big']);
});
