// v0.4 Fachwerk: a Stab never pins itself to empty space - its free ends become nodes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { hitTest, moveTarget } from '../../frontend/js/editor/hit.js';
import { connectionPoints } from '../../frontend/js/editor/connections.js';
import { block, click, drag, sceneWith, setup } from './helpers.mjs';

const nodes = (model) => model.scene.bodies.filter((b) => b.type === 'node');
const rods = (model) => model.scene.constraints.filter((c) => c.type === 'rod');

test('Stab: free ends make nodes, the Stab is anchored to them (not to the ground)', () => {
  const { model, tools, log } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]);
  assert.match(t.hint, /second end/);
  assert.equal(t.preview.newNodes.length, 2, 'both ends of the Stab are free: two nodes will be made');
  click(t, [1, 0]);
  assert.equal(model.scene.bodies.length, 2);
  assert.deepEqual(nodes(model).map((n) => [n.id, n.position, n.params]), [
    ['N1', [0, 0], { mass: 1 }], ['N2', [1, 0], { mass: 1 }],
  ]);
  assert.deepEqual(rods(model), [
    { id: 'S1', type: 'rod', a: { body: 'N1', point: [0, 0] }, b: { body: 'N2', point: [0, 0] }, params: {} },
  ]);
  assert.deepEqual(log.created.at(-1), ['constraint', 'S1']);
  assert.equal(model.undoStack.length, 1, 'the Stab and its nodes are one undo step');
  model.undo();
  assert.equal(model.scene.bodies.length, 0);
  assert.equal(model.scene.constraints.length, 0);
});

test('Stab: the preview marks the ends where a node will be made', () => {
  const { model, tools } = setup(sceneWith({ bodies: [block('m1', 0, 0.5, 0.4, 0.2)] }));
  const t = tools.get('rod');
  click(t, [0, 0.6]); // the top edge of the block: a point of a mass, no new node
  t.move({ world: [1, 1] });
  assert.deepEqual(t.preview.newNodes, [[1, 1]]);
  t.move({ world: [0.1, 0.5] }); // back onto the block
  assert.deepEqual(t.preview.newNodes, []);
  assert.equal(model.scene.bodies.length, 1);
});

test('Stab: a triangle of three Stabs shares its nodes', () => {
  const { model, tools } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]); click(t, [1, 0]);
  click(t, [1, 0]); click(t, [0.5, 0.8]); // starts on the node N2, which is reused
  click(t, [0.5, 0.8]); click(t, [0, 0]); // closes the triangle on N3 and N1
  assert.equal(nodes(model).length, 3, 'no duplicates');
  assert.equal(rods(model).length, 3);
  assert.deepEqual(rods(model).map((r) => [r.a.body, r.b.body]), [['N1', 'N2'], ['N2', 'N3'], ['N3', 'N1']]);
  // every rod end sits on a node's centre
  for (const r of rods(model)) for (const e of [r.a, r.b]) assert.deepEqual(e.point, [0, 0]);
  // each node is a hub: two Stabs meet there
  const hubs = connectionPoints(model.scene).filter((c) => c.hub);
  assert.equal(hubs.length, 3);
});

test('Stab: between a mass and free space - the mass end stays on the mass, the free end is a node', () => {
  const { model, tools } = setup(sceneWith({ bodies: [block('m1', 0, 0.5, 0.4, 0.2)] }));
  const t = tools.get('rod');
  click(t, [0, 0.6]);
  click(t, [1.5, 1.5]);
  assert.deepEqual(rods(model)[0].a, { body: 'm1', point: [0, 0.1] });
  assert.deepEqual(rods(model)[0].b, { body: 'N1', point: [0, 0] });
  assert.deepEqual(nodes(model)[0].position, [1.5, 1.5]);
});

test('Stab: from a Festlager in free space the end is a fixed point; two of them are refused', () => {
  const { model, tools } = setup();
  model.addGroundPin({ point: [0, 2] });
  model.addGroundPin({ point: [2, 2] });
  const t = tools.get('rod');
  click(t, [0, 2]); // on pin A1
  click(t, [1, 1]); // free: a node
  assert.deepEqual(rods(model)[0].a, { body: null, point: [0, 2] }, 'ground anchor on the pin');
  assert.equal(rods(model)[0].b.body, 'N1');
  click(t, [0, 2]);
  click(t, [2, 2]); // the second pin: both ends on the ground
  assert.match(t.error, /at least one end on a mass/);
  assert.equal(rods(model).length, 1);
});

test('Stab: the surfaces do not catch a Stab end any more (rope, spring and damper still use them)', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [{ id: 's1', p1: [-1, 0], p2: [3, 0] }] }));
  const rope = tools.get('rope');
  click(rope, [0, 0.003]); // on the surface: a ground anchor
  assert.equal(rope.a.kind, 'surface');
  rope.cancel();
  const t = tools.get('rod');
  click(t, [0, 0.003]);
  assert.equal(t.a.node, true, 'a node, not a ground point');
});

test('Stab ends too close together or on one mass are refused', () => {
  const { model, tools } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]);
  click(t, [0.02, 0]);
  assert.match(t.error, /too close/);
  assert.equal(model.scene.bodies.length, 0, 'no nodes were made for a refused Stab');
});

test('node tool: places a node, refuses a second one at the same point, one undo step', () => {
  const { model, tools, log } = setup();
  const t = tools.get('node');
  assert.match(t.hint, /node/i);
  click(t, [0.5, 0.5]);
  assert.deepEqual(nodes(model)[0], { id: 'N1', type: 'node', position: [0.5, 0.5], angle: 0, params: { mass: 1 } });
  assert.deepEqual(log.created.at(-1), ['body', 'N1']);
  click(t, [0.5, 0.5]);
  assert.match(t.error, /already a node/);
  assert.equal(nodes(model).length, 1);
  assert.equal(model.undoStack.length, 1);
});

test('a Stab starts on a node made with the node tool', () => {
  const { model, tools } = setup();
  click(tools.get('node'), [0, 0]);
  const t = tools.get('rod');
  click(t, [0, 0]);
  click(t, [1, 0]);
  assert.equal(nodes(model).length, 2);
  assert.equal(rods(model)[0].a.body, 'N1');
});

test('a node wins over the Stabs that end in it (select and move)', () => {
  const { model, tools } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]); click(t, [1, 0]);
  assert.deepEqual(hitTest(model.scene, [0, 0], 400), { kind: 'body', id: 'N1' });
  assert.deepEqual(hitTest(model.scene, [0.5, 0], 400), { kind: 'constraint', id: 'S1' });
  assert.deepEqual(moveTarget(model.scene, [1, 0], 400), { type: 'body', id: 'N2' }, 'a Stab end on a node is not a handle');
});

test('moving a node drags the Stabs along: their ends are on the node', () => {
  const { model, tools } = setup();
  const rod = tools.get('rod');
  click(rod, [0, 0]); click(rod, [1, 0]);
  const move = tools.get('move');
  drag(move, [1, 0], [1, 0.5]);
  assert.deepEqual(model.body('N2').position, [1, 0.5]);
  assert.deepEqual(rods(model)[0].b, { body: 'N2', point: [0, 0] });
  assert.equal(model.undoStack.length, 2);
});

test('deleting a node deletes the Stabs that end in it, and only those', () => {
  const { model, tools } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]); click(t, [1, 0]);
  click(t, [1, 0]); click(t, [0.5, 0.8]);
  const removed = model.remove('N2');
  assert.deepEqual(removed.sort(), ['N2', 'S1', 'S2']);
  assert.deepEqual(model.scene.bodies.map((b) => b.id), ['N1', 'N3']);
});

test('supports and loads sit on a node like on any mass', () => {
  const { model, tools } = setup();
  const rod = tools.get('rod');
  click(rod, [0, 0]); click(rod, [1, 0]);
  const pin = tools.get('pin');
  click(pin, [0, 0]); // the node N1
  click(pin, [0, -0.5]); // no surface there: a support without one
  const support = model.scene.constraints.find((c) => c.type === 'pin_support');
  assert.equal(support.body, 'N1');
  assert.deepEqual(support.point, [0, 0]);
  const load = tools.get('load');
  drag(load, [1, 0], [1, -0.5]);
  const f = model.scene.elements.find((e) => e.type === 'load');
  assert.equal(f.body, 'N2');
  assert.deepEqual(f.point, [0, 0]);
  assert.ok(f.params.force[1] < 0);
});

test('node properties: mass and start velocity', () => {
  const { model, tools } = setup();
  click(tools.get('node'), [0, 0]);
  const form = propertyFields(model, 'N1');
  assert.deepEqual(form.fields.map((f) => f.key), ['mass', 'vx', 'vy', 'damping']);
  assert.match(form.title, /Node/);
  assert.equal(applyProperties(model, 'N1', { mass: '2.5', vx: '0', vy: '0.5', damping: '0' }).ok, true);
  assert.equal(model.body('N1').params.mass, 2.5);
  assert.equal('damping' in model.body('N1').params, false, 'no damping is not stored');
  assert.deepEqual(model.body('N1').velocity, [0, 0.5]);
  assert.equal(applyProperties(model, 'N1', { mass: '2.5', vx: '0', vy: '0', damping: '4' }).ok, true);
  assert.equal(model.body('N1').params.damping, 4);
  assert.equal(applyProperties(model, 'N1', { mass: '0', vx: '0', vy: '0', damping: '0' }).ok, false);
});

test('a Stab becomes elastic with a cross section and rigid again, keeping id and ends', () => {
  const { model, tools } = setup();
  const t = tools.get('rod');
  click(t, [0, 0]); click(t, [2, 0]);
  const before = rods(model)[0];
  let form = propertyFields(model, 'S1');
  assert.equal(form.fields[0].value, 'rigid');
  assert.match(form.info.join(' '), /Rigid/);

  // the select was changed to I: the form is built again with default I dimensions
  form = propertyFields(model, 'S1', { sectionType: 'I' });
  assert.deepEqual(form.fields.map((f) => f.key), ['sectionType', 'sec_b', 'sec_h', 'sec_tf', 'sec_tw', 'segments', 'massMode', 'damping', 'bow']);
  assert.ok(form.section && form.section.type === 'I');
  assert.match(form.info.join(' '), /Euler load/);

  const values = { sectionType: 'I', sec_b: '100', sec_h: '200', sec_tf: '10', sec_tw: '6', segments: '4', massMode: 'steel', damping: '5', bow: '0.02' };
  assert.equal(applyProperties(model, 'S1', values).ok, true);
  assert.equal(rods(model).length, 0);
  const bar = model.scene.elements.find((e) => e.id === 'S1');
  assert.deepEqual(bar, { id: 'S1', type: 'bar', a: before.a, b: before.b, params: { section: { type: 'I', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 }, damping: 5 } });  // a bow of 0.02 mm on 2 m is the default: not stored

  form = propertyFields(model, 'S1');
  assert.match(form.title, /elastic/);
  assert.match(form.info.join(' '), /axial stiffness/);
  assert.equal(form.fields[0].value, 'I');
  assert.equal(form.fields.find((f) => f.key === 'sec_h').value, 200);

  // another section type keeps the depth
  const square = propertyFields(model, 'S1', { sectionType: 'square' });
  assert.equal(square.fields.find((f) => f.key === 'sec_a').value, 200);

  assert.equal(applyProperties(model, 'S1', { sectionType: 'rigid' }).ok, true);
  assert.equal(model.scene.elements.length, 0);
  assert.deepEqual(rods(model)[0], before);
});

test('an impossible cross section is refused with the reason', () => {
  const { model, tools } = setup();
  click(tools.get('rod'), [0, 0]); click(tools.get('rod'), [2, 0]);
  const r = applyProperties(model, 'S1', { sectionType: 'I', sec_b: '100', sec_h: '20', sec_tf: '12', sec_tw: '6', segments: '4', massMode: 'steel', damping: '5', bow: '0.02' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /flanges/);
  assert.equal(rods(model).length, 1, 'nothing changed');
  const nan = applyProperties(model, 'S1', { sectionType: 'square', sec_a: 'abc', segments: '4', massMode: 'steel', damping: '5', bow: '0.02' });
  assert.equal(nan.ok, false);
});

test('bars are selectable, movable by their ends, and deleted with their node', () => {
  const { model, tools } = setup();
  click(tools.get('rod'), [0, 0]); click(tools.get('rod'), [2, 0]);
  applyProperties(model, 'S1', { sectionType: 'square', sec_a: '20', segments: '4', massMode: 'steel', damping: '5', bow: '0.02' });
  assert.deepEqual(hitTest(model.scene, [1, 0.002], 400), { kind: 'element', id: 'S1' });
  assert.deepEqual(model.remove('N1').sort(), ['N1', 'S1']);
  assert.equal(model.scene.elements.length, 0);
});

// --- v0.4b: an elastic Stab bends and buckles ------------------------------------------------------------------

test('elastic Stab form: Euler load, elements, mass, damping and the bow in mm', () => {
  const { model, tools } = setup();
  click(tools.get('rod'), [0, 0]); click(tools.get('rod'), [2, 0]); // 2 m long
  const values = { sectionType: 'square', sec_a: '20', segments: '8', massMode: 'given', mass: '5', damping: '12', bow: '4' };
  assert.equal(applyProperties(model, 'S1', values).ok, true);
  const bar = model.find('S1').obj;
  assert.deepEqual(bar.params, { section: { type: 'square', a: 0.02 }, damping: 12, segments: 8, mass: 5, imperfection: 0.002 });

  const form = propertyFields(model, 'S1');
  assert.deepEqual(form.fields.map((f) => f.key), ['sectionType', 'sec_a', 'segments', 'massMode', 'mass', 'damping', 'bow']);
  assert.equal(form.fields.find((f) => f.key === 'bow').value, 4);
  assert.equal(form.fields.find((f) => f.key === 'segments').value, 8);
  const pcr = (Math.PI ** 2 * 210e9 * 0.02 ** 4 / 12) / 4; // 6909 N
  assert.match(form.info.join(' '), /Euler load .* 6909 N/);
  assert.match(form.info.join(' '), /slenderness L \/ i = 346/);
  assert.ok(pcr > 6900 && pcr < 6910);

  // back to the defaults: 4 elements, steel, the standard bow (0.02 mm on 2 m) are not stored
  const back = { ...values, segments: '4', massMode: 'steel', bow: '0.02' };
  assert.equal(applyProperties(model, 'S1', back).ok, true);
  assert.deepEqual(model.find('S1').obj.params, { section: { type: 'square', a: 0.02 }, damping: 12 });
  assert.equal(applyProperties(model, 'S1', { ...back, segments: '0' }).ok, false);
  assert.equal(applyProperties(model, 'S1', { ...back, segments: '17' }).ok, false);
  assert.equal(applyProperties(model, 'S1', { ...back, damping: '-1' }).ok, false);
  assert.equal(applyProperties(model, 'S1', { ...back, bow: '-1' }).ok, false);
  assert.equal(applyProperties(model, 'S1', { ...back, bow: '0' }).ok, true, 'a perfectly straight bar is allowed');
  assert.equal(model.find('S1').obj.params.imperfection, 0);
});

test('a bar made from a rigid Stab carries the chosen parameters in one step', () => {
  const { model, tools } = setup();
  click(tools.get('rod'), [0, 0]); click(tools.get('rod'), [2, 0]);
  const values = { sectionType: 'H', sec_b: '50', sec_h: '80', sec_tf: '6', sec_tw: '4', segments: '1', massMode: 'steel', damping: '0', bow: '0.02' };
  assert.equal(applyProperties(model, 'S1', values).ok, true);
  assert.deepEqual(model.find('S1').obj.params, { section: { type: 'H', b: 0.05, h: 0.08, tf: 0.006, tw: 0.004 }, damping: 0, segments: 1 });
});
