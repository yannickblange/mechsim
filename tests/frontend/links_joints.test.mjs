import assert from 'node:assert/strict';
import test from 'node:test';
import { attachedPoint, anchorWorld } from '../../frontend/js/editor/hit.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { bodyToWorld } from '../../frontend/js/editor/geometry.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { snapPoint } from '../../frontend/js/editor/snap.js';
import { block, click, close, closePoint, disc, drag, sceneWith, setup } from './helpers.mjs';

const hung = () => sceneWith({ bodies: [block('m1', 0, 0.5, 0.4, 0.2)] });

// --- Festlager in free space ---------------------------------------------------------------------

test('Festlager: a click in free space places a pin that belongs to no mass', () => {
  const { model, tools, log } = setup();
  const t = tools.get('pin');
  t.move({ world: [1.0, 1.5] });
  assert.equal(t.preview.valid, true);
  assert.match(t.preview.label, /freier Raum/);
  click(t, [1.0, 1.5]);
  assert.deepEqual(model.scene.constraints[0], {
    id: 'A1', type: 'pin_support', body: null, point: [1, 1.5], surface: null, params: { angle: 0 },
  });
  assert.deepEqual(log.created, [['constraint', 'A1']]);
});

test('Festlager in free space: on a surface it adopts it, on the side the pointer is on', () => {
  for (const [y, angle] of [[0.004, 0], [-0.004, Math.PI]]) {
    const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }] }));
    click(tools.get('pin'), [1.0, y]);
    const pin = model.scene.constraints[0];
    assert.equal(pin.surface, 's1');
    close(pin.params.angle, angle, 1e-9);
    closePoint(pin.point, [1, 0]);
  }
});

test('Festlager in free space: not twice at the same place; other supports still need a mass', () => {
  const { model, tools } = setup();
  const pin = tools.get('pin');
  click(pin, [1, 1]);
  click(pin, [1.004, 1.003]);
  assert.match(pin.error, /schon ein Festlager/);
  assert.equal(model.scene.constraints.length, 1);
  const fixed = tools.get('fixed');
  click(fixed, [2, 2]);
  assert.match(fixed.error, /Punkt einer Masse/);
});

test('snapping: ends snap to a Festlager in free space only when asked', () => {
  const m = new SceneModel(hung());
  m.addGroundPin({ point: [0, 1.5] });
  const near = [0.004, 1.497];
  const r = snapPoint(near, m.scene, { scale: 400, pins: true });
  assert.equal(r.kind, 'pin');
  assert.equal(r.pin, 'A1');
  assert.deepEqual(r.point, [0, 1.5]);
  assert.notEqual(snapPoint(near, m.scene, { scale: 400 }).kind, 'pin');
});

// --- rope and Stab -------------------------------------------------------------------------------

test('Stab: from a Festlager in free space to a point of a mass', () => {
  const { model, tools, log } = setup(hung());
  model.addGroundPin({ point: [0, 1.5] });
  const t = tools.get('rod');
  click(t, [0.004, 1.498]); // snaps onto the pin
  assert.match(t.preview.label, /Stab/);
  click(t, [0, 0.6]); // the top edge of the block
  const rod = model.scene.constraints.find((c) => c.type === 'rod');
  assert.deepEqual(rod, { id: 'S1', type: 'rod', a: { body: null, point: [0, 1.5] }, b: { body: 'm1', point: [0, 0.1] }, params: {} });
  assert.deepEqual(log.created.at(-1), ['constraint', 'S1']);
});

test('rope: taut by default (no length), ids R1, R2', () => {
  const { model, tools } = setup(hung());
  const t = tools.get('rope');
  click(t, [0.5, 1.5]);
  click(t, [0.2, 0.5]);
  drag(t, [-0.5, 1.5], [-0.2, 0.5]);
  const ropes = model.scene.constraints.filter((c) => c.type === 'rope');
  assert.deepEqual(ropes.map((r) => r.id), ['R1', 'R2']);
  assert.deepEqual(ropes[0].params, {});
  assert.deepEqual(ropes[0].b, { body: 'm1', point: [0.2, 0] });
});

test('links: both ends on the ground, the same mass, or too close together are refused', () => {
  const { model, tools } = setup(hung());
  const t = tools.get('rope'); // (a Stab makes a node of a free end: see truss.test.mjs)
  click(t, [0, 1.5]);
  click(t, [1, 1.5]);
  assert.match(t.error, /Mindestens ein Ende muss an einer Masse/);
  click(t, [0.0, 0.5]); // the first end is still set: this one is fine
  assert.equal(model.scene.constraints.length, 1);

  click(t, [-0.2, 0.5]);
  click(t, [0.2, 0.5]);
  assert.match(t.error, /derselben Masse/);
  t.key('Escape');

  click(t, [0, 1.5]);
  click(t, [0.02, 1.5]);
  assert.match(t.error, /zu dicht|Mindestens ein Ende/);
  assert.equal(model.scene.constraints.length, 1);
});

test('links: Escape cancels', () => {
  const { tools } = setup(hung());
  const t = tools.get('rope');
  click(t, [0, 1.5]);
  assert.ok(t.preview);
  assert.equal(t.key('Escape'), true);
  assert.equal(t.preview, null);
});

// --- joints ----------------------------------------------------------------------------------------

const twoBars = () => sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2), block('b', 0.4, 0, 0.4, 0.2)] });

test('joint: where two masses touch it creates a hinge whose two anchors coincide', () => {
  const { model, tools, log } = setup(twoBars());
  const t = tools.get('joint');
  t.move({ world: [0.2, 0] });
  assert.equal(t.marker.kind, 'joint');
  click(t, [0.2, 0]);
  const j = model.scene.constraints[0];
  assert.equal(j.type, 'pin_joint');
  assert.equal(j.id, 'G1');
  assert.notEqual(j.a.body, j.b.body);
  const pa = anchorWorld(model.scene, j.a);
  const pb = anchorWorld(model.scene, j.b);
  closePoint(pa, [0.2, 0]);
  closePoint(pb, pa);
  assert.deepEqual(log.created.at(-1), ['constraint', 'G1']);
});

test('joint: the rigid variant creates a fixed_joint (W1)', () => {
  const { model, tools } = setup(twoBars());
  click(tools.get('weld'), [0.2, 0]);
  assert.deepEqual([model.scene.constraints[0].id, model.scene.constraints[0].type], ['W1', 'fixed_joint']);
});

test('joint: one mass is not enough; three masses join the top two', () => {
  const one = setup(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2)] }));
  const t = one.tools.get('joint');
  t.move({ world: [0.2, 0] });
  assert.equal(t.marker.kind, 'invalid');
  click(t, [0.2, 0]);
  assert.match(t.error, /zwei Massen/);
  assert.equal(one.model.scene.constraints.length, 0);

  const three = setup(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.4), block('b', 0, 0, 0.4, 0.4), block('c', 0, 0, 0.4, 0.4)] }));
  click(three.tools.get('joint'), [0, 0]);
  const j = three.model.scene.constraints[0];
  assert.deepEqual([j.a.body, j.b.body], ['c', 'b']);
  assert.match(three.tools.get('joint').error ?? 'x', /./);
});

test('joint: on a free-space Festlager it pins the mass that lies on it (same id, now on the mass)', () => {
  const { model, tools, log } = setup(sceneWith({ bodies: [block('m1', 0, 1.3, 0.4, 0.4)] }));
  model.addGroundPin({ point: [0, 1.5] });
  const t = tools.get('joint');
  click(t, [0, 1.5]);
  assert.equal(model.scene.constraints.length, 1);
  assert.deepEqual(model.scene.constraints[0], {
    id: 'A1', type: 'pin_support', body: 'm1', point: [0, 0.2], surface: null, params: { angle: 0 },
  });
  assert.deepEqual(log.created.at(-1), ['constraint', 'A1']);
  // a pin without a mass on it cannot be attached
  model.addGroundPin({ point: [2, 2] });
  click(t, [2, 2]);
  assert.match(t.error, /Masse auf das Festlager/);
});

// --- model ---------------------------------------------------------------------------------------

function wired() {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2), block('b', 0.4, 0, 0.4, 0.2)] }));
  const pin = m.addGroundPin({ point: [0, 1.5] });
  const rope = m.addRope({ a: { body: null, point: [0, 1.5] }, b: { body: 'a', point: [0, 0.1] } });
  const rod = m.addRod({ a: { body: 'a', point: [0.2, 0] }, b: { body: 'b', point: [-0.2, 0] } });
  const joint = m.addJoint('pin_joint', { a: { body: 'a', point: [0.2, 0] }, b: { body: 'b', point: [-0.2, 0] } });
  return { m, pin, rope, rod, joint };
}

test('model: ids and shapes of the v0.3 objects', () => {
  const { m, pin, rope, rod, joint } = wired();
  assert.deepEqual([pin, rope, rod, joint], ['A1', 'R1', 'S1', 'G1']);
  assert.deepEqual(m.find('G1').obj, { id: 'G1', type: 'pin_joint', a: { body: 'a', point: [0.2, 0] }, b: { body: 'b', point: [-0.2, 0] }, params: {} });
  assert.throws(() => m.addJoint('hinge', {}), /unknown joint type/);
});

test('model: removing a mass removes its ropes, Stabs and joints; the pin stays', () => {
  const { m } = wired();
  const removed = m.remove('a');
  assert.deepEqual(removed.sort(), ['G1', 'R1', 'S1', 'a']);
  assert.deepEqual(m.scene.constraints.map((c) => c.id), ['A1']);
});

test('model: resizing a mass moves the ends of ropes, Stabs and joints with it', () => {
  const { m } = wired();
  m.updateBody('a', { width: 0.8, height: 0.4 });
  assert.deepEqual(m.find('R1').obj.b.point, [0, 0.2]);
  assert.deepEqual(m.find('S1').obj.a.point, [0.4, 0]);
  assert.deepEqual(m.find('G1').obj.a.point, [0.4, 0]);
  assert.deepEqual(m.find('G1').obj.b.point, [-0.2, 0], 'the other mass is untouched');
});

test('model: attachPin, joint type, rope length', () => {
  const { m } = wired();
  m.attachPin('A1', { body: 'a', point: [0, 0.5] });
  assert.equal(m.find('A1').obj.body, 'a');
  assert.throws(() => m.attachPin('A1', { body: 'b', point: [0, 0] }), /no free-space/);
  m.setJointType('G1', 'fixed_joint');
  assert.equal(m.find('G1').obj.type, 'fixed_joint');
  assert.throws(() => m.setJointType('R1', 'pin_joint'), /no joint/);
  m.updateRope('R1', { length: 3 });
  assert.deepEqual(m.find('R1').obj.params, { length: 3 });
  m.updateRope('R1', { length: null });
  assert.deepEqual(m.find('R1').obj.params, {});
  assert.throws(() => m.updateRope('S1', {}), /no rope/);
});

test('model: a transaction is one undo step; cancel restores', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 1, 1)] }));
  const tx = m.transaction();
  tx.update((s) => { s.bodies[0].position = [1, 0]; });
  tx.update((s) => { s.bodies[0].position = [2, 0]; });
  assert.deepEqual(m.body('a').position, [2, 0]);
  assert.equal(m.canUndo, false, 'nothing recorded before commit');
  assert.equal(tx.commit(), true);
  assert.equal(m.undoStack.length, 1);
  assert.equal(m.revision, 1);
  m.undo();
  assert.deepEqual(m.body('a').position, [0, 0]);

  const tx2 = m.transaction();
  tx2.update((s) => { s.bodies[0].position = [5, 5]; });
  tx2.cancel();
  assert.deepEqual(m.body('a').position, [0, 0]);
  assert.equal(m.transaction().commit(), false, 'an unchanged transaction records nothing');
});

// --- properties ----------------------------------------------------------------------------------

test('rope form: length at least the distance between the ends; equal means taut', () => {
  const { m } = wired();
  const form = propertyFields(m, 'R1');
  assert.deepEqual(form.fields.map((f) => f.key), ['length']);
  close(form.fields[0].value, 1.4, 1e-6); // (0,1.5) to (0,0.1)
  assert.equal(applyProperties(m, 'R1', { length: '1.0' }).ok, false);
  assert.match(applyProperties(m, 'R1', { length: '1.0' }).errors[0], /mindestens 1,400/);
  assert.equal(applyProperties(m, 'R1', { length: '2.5' }).ok, true);
  assert.deepEqual(m.find('R1').obj.params, { length: 2.5 });
  assert.equal(applyProperties(m, 'R1', { length: '1.4' }).ok, true);
  assert.deepEqual(m.find('R1').obj.params, {}, 'the rope is taut again');
  assert.match(propertyFields(m, 'R1').info[0], /dehnt sich nie/);
});

test('Stab, joint and free pin forms', () => {
  const { m } = wired();
  const rod = propertyFields(m, 'S1');
  // v0.4: a cross section is optional; v0.7b: an end on a mass is clamped (a choice of its own)
  assert.deepEqual(rod.fields.map((f) => [f.key, f.value]), [['sectionType', 'rigid'], ['end_a', 'clamped'], ['end_b', 'clamped']]);  // (masses: the ends are clamped)
  assert.match(rod.info[0], /Zweikraftglied/);
  const joint = propertyFields(m, 'G1');
  assert.match(joint.title, /Gelenk/);
  assert.match(joint.info[0], /Verbindet a und b/);
  assert.equal(applyProperties(m, 'G1', { jointType: 'fixed_joint' }).ok, true);
  assert.equal(m.find('G1').obj.type, 'fixed_joint');
  assert.match(propertyFields(m, 'G1').title, /Starr/);
  assert.equal(applyProperties(m, 'G1', { jointType: 'bogus' }).ok, false);
  assert.match(propertyFields(m, 'A1').title, /freier Raum/);
});

// --- slack rope geometry -------------------------------------------------------------------------

import { ropeControlPoint, ropePolyline } from '../../frontend/js/canvas/symbols/rope.js';
import { hitTest } from '../../frontend/js/editor/hit.js';

test('slack rope: a taut rope has no curve; a slack one hangs down with the right arc length', () => {
  assert.equal(ropeControlPoint([0, 0], [1, 0], 1), null);
  assert.equal(ropeControlPoint([0, 0], [1, 0], 0.9), null);
  const c = ropeControlPoint([0, 0], [1, 0], 1.1);
  close(c[0], 0.5, 1e-12);
  assert.ok(c[1] < 0, 'hangs down');
  // arc length of the sampled curve is close to the rope length
  const pts = ropePolyline([0, 0], [1, 0], 1.1, 200);
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  close(len, 1.1, 1e-2); // the parabola formula is accurate to < 1 % at this sag
  // vertical rope: sideways; reversed direction gives the same side for the same chord
  const v = ropeControlPoint([0, 1], [0, 0], 1.2);
  assert.ok(v[0] > 0);
  const swapped = ropeControlPoint([0, 0], [0, 1], 1.2);
  closePoint(swapped, v, 1e-9);
});

test('hitTest finds a slack rope where it hangs, not on its chord', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 1, 0, 0.2, 0.2)] }));
  m.addRope({ a: { body: null, point: [0, 1] }, b: { body: 'a', point: [0, 0] }, length: 1.6 });
  const s = m.scene;
  const c = ropeControlPoint([0, 1], [1, 0], 1.6);
  const mid = [0.5, 0.5]; // the middle of the straight chord
  const onCurve = [0.5 * c[0] + 0.25 * 1, 0.25 * 1 + 0.5 * c[1]]; // the curve at t = 0.5 (B(t) = (p1 + 2c + p2) / 4)
  assert.deepEqual(hitTest(s, onCurve, 400), { kind: 'constraint', id: 'R1' });
  assert.equal(hitTest(s, mid, 400), null, 'the straight chord is empty space');
});
