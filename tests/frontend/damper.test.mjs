import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionPoints, neighbors } from '../../frontend/js/editor/connections.js';
import { hitTest, moveTarget } from '../../frontend/js/editor/hit.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { movePin } from '../../frontend/js/editor/moves.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { block, click, close, drag, sceneWith, setup } from './helpers.mjs';

const hung = () => sceneWith({ bodies: [block('m1', 0, 0.5, 0.4, 0.2)] });

test('damper tool: two clicks, ends on the ground and on a mass, default c', () => {
  const { model, tools, log } = setup(hung());
  const t = tools.get('damper');
  assert.match(t.hint, /first end of the damper/);
  click(t, [0, 1.5]);
  assert.match(t.preview.label, /damper/);
  click(t, [0, 0.6]); // top edge of the block
  assert.deepEqual(model.scene.elements[0], {
    id: 'c1', type: 'damper', a: { body: null, point: [0, 1.5] }, b: { body: 'm1', point: [0, 0.1] }, params: { c: 10 },
  });
  assert.deepEqual(log.created.at(-1), ['element', 'c1']);
  drag(t, [0.5, 1.5], [0.2, 0.5]); // drag also works
  assert.equal(model.scene.elements.length, 2);
});

test('damper tool: refuses two ground ends, the same mass, and too short', () => {
  const { model, tools } = setup(hung());
  const t = tools.get('damper');
  click(t, [0, 1.5]);
  click(t, [1, 1.5]);
  assert.match(t.error, /at least one end on a mass/);
  t.key('Escape');
  click(t, [-0.2, 0.5]);
  click(t, [0.2, 0.5]);
  assert.match(t.error, /same mass/);
  assert.equal(model.scene.elements.length, 0);
});

test('damper ends snap to a Festlager in free space', () => {
  const { model, tools } = setup(hung());
  model.addGroundPin({ point: [0, 1.5] });
  const t = tools.get('damper');
  click(t, [0.004, 1.498]);
  click(t, [0, 0.6]);
  assert.deepEqual(model.scene.elements[0].a, { body: null, point: [0, 1.5] });
});

test('model: damper cascade, resize, update', () => {
  const m = new SceneModel(hung());
  const id = m.addDamper({ a: { body: null, point: [0, 2] }, b: { body: 'm1', point: [0.2, 0.1] }, c: 4 });
  m.updateBody('m1', { width: 0.8, height: 0.4 });
  assert.deepEqual(m.find(id).obj.b.point, [0.4, 0.2], 'the end on the mass scales with it');
  m.updateElement(id, { c: 7 });
  assert.deepEqual(m.find(id).obj.params, { c: 7 });
  assert.deepEqual(m.remove('m1').sort(), ['c1', 'm1']);
});

test('hit, move and connections treat a damper like a spring', () => {
  const m = new SceneModel(hung());
  m.addGroundPin({ point: [0, 1.5] });
  m.addDamper({ a: { body: null, point: [0, 1.5] }, b: { body: 'm1', point: [0, 0.1] } });
  const s = m.scene;
  assert.deepEqual(hitTest(s, [0, 1.0], 400), { kind: 'element', id: 'c1' });
  assert.deepEqual(moveTarget(s, [0, 0.6], 400), { type: 'end', id: 'c1', end: 'b', kind: 'element' });
  const pts = connectionPoints(s);
  assert.equal(pts.find((p) => p.point[1] === 1.5).items.length, 2, 'pin + damper end');
  assert.deepEqual([...neighbors(s, { kind: 'element', id: 'c1' }).bodies], ['m1']);
  const moved = m.toJSON();
  movePin(moved, 'A1', [0.5, 0], 0.025);
  assert.deepEqual(moved.elements[0].a.point, [0.5, 1.5], 'the damper end moves with the pin');
});

test('move tool: drag the end of a damper to another mass', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 1, 0.5, 0.4, 0.2), block('b', 2, 0.5, 0.4, 0.2)] }));
  m0.addDamper({ a: { body: null, point: [1, 2] }, b: { body: 'a', point: [0, 0.1] } });
  const { model, tools } = setup(m0.scene);
  drag(tools.get('move'), [1, 0.6], [2, 0.5]);
  assert.deepEqual(model.scene.elements[0].b, { body: 'b', point: [0, 0] });
});

test('properties: damping c >= 0', () => {
  const m = new SceneModel(hung());
  m.addDamper({ a: { body: null, point: [0, 2] }, b: { body: 'm1', point: [0, 0.1] }, c: 4 });
  const form = propertyFields(m, 'c1');
  assert.deepEqual(form.fields.map((f) => [f.key, f.unit, f.value]), [['c', 'N·s/m', 4]]);
  assert.match(form.title, /Damper/);
  assert.equal(applyProperties(m, 'c1', { c: '12,5' }).ok, true);
  assert.deepEqual(m.find('c1').obj.params, { c: 12.5 });
  const bad = applyProperties(m, 'c1', { c: '-1' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /at least 0/);
  assert.equal(applyProperties(m, 'c1', { c: '0' }).ok, true, 'c = 0 is allowed');
});
