import assert from 'node:assert/strict';
import test from 'node:test';
import { anchorWorld, attachedPoint, hitTest, moveTarget } from '../../frontend/js/editor/hit.js';
import { connectionPoints, neighbors } from '../../frontend/js/editor/connections.js';
import {
  contactOffset, jointGroup, linkProblem, moveBodies, movePin, moveSurface, normalizeRopes,
  refreshSupports,
} from '../../frontend/js/editor/moves.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { block, click, close, closePoint, disc, drag, sceneWith, setup } from './helpers.mjs';

const TOL = 10 / 400;
const floor = { id: 's1', p1: [0, 0], p2: [3, 0] };

// --- pure operations ---------------------------------------------------------------------------

test('jointGroup follows pin and fixed joints transitively, not ropes or supports', () => {
  const m = new SceneModel(sceneWith({ bodies: ['a', 'b', 'c', 'd'].map((id, i) => block(id, i, 0, 0.5, 0.5)) }));
  m.addJoint('pin_joint', { a: { body: 'a', point: [0.25, 0] }, b: { body: 'b', point: [-0.25, 0] } });
  m.addJoint('fixed_joint', { b: { body: 'c', point: [-0.25, 0] }, a: { body: 'b', point: [0.25, 0] } });
  m.addRope({ a: { body: 'c', point: [0.25, 0] }, b: { body: 'd', point: [-0.25, 0] } });
  assert.deepEqual(jointGroup(m.scene, 'a').sort(), ['a', 'b', 'c']);
  assert.deepEqual(jointGroup(m.scene, 'd'), ['d']);
});

test('moveBodies: attached things follow, ground ends stay; a support keeps its surface at any distance', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor], bodies: [block('a', 1, 0.1, 0.4, 0.2)] }));
  m.addSupport('roller_support', { body: 'a', point: [0, -0.1], surface: 's1', angle: 0 });
  m.addSpring({ a: { body: null, point: [0, 0.1] }, b: { body: 'a', point: [-0.2, 0] } });
  const s = m.toJSON();
  moveBodies(s, ['a'], [0, 1.0], TOL);
  assert.deepEqual(s.bodies[0].position, [1, 1.1]);
  assert.deepEqual(s.elements[0].a, { body: null, point: [0, 0.1] }, 'the ground end stays');
  assert.equal(s.constraints[0].surface, 's1', 'still on the floor, one metre below: the symbol spans the gap');
  assert.equal(s.constraints[0].params.angle, 0);
  moveBodies(s, ['a'], [0, -1.5], TOL); // through the floor: the point is on the other side now
  assert.equal(s.constraints[0].surface, 's1');
  close(Math.abs(s.constraints[0].params.angle), Math.PI, 1e-9, 'the angle follows the side of the surface');
});

test('moveBodies: a support without a surface adopts one that it now touches', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor], bodies: [block('a', 1, 1, 0.4, 0.2)] }));
  m.addSupport('pin_support', { body: 'a', point: [0, -0.1], surface: null });
  const s = m.toJSON();
  moveBodies(s, ['a'], [0, -0.9], TOL);
  assert.equal(s.constraints[0].surface, 's1');
});

test('moveBodies drops the explicit length of a rope that would be too short', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2)] }));
  m.addRope({ a: { body: null, point: [0, 2] }, b: { body: 'a', point: [0, 0] }, length: 3 });
  const s = m.toJSON();
  moveBodies(s, ['a'], [0, -0.5], TOL); // distance 2.5 < 3: still slack
  assert.equal(s.constraints[0].params.length, 3);
  moveBodies(s, ['a'], [0, -1.0], TOL); // distance 3.5 > 3
  assert.equal('length' in s.constraints[0].params, false);
  normalizeRopes(s); // idempotent
});

test('movePin carries the ground ends at its point and nothing else', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 1, 0, 0.4, 0.2)] }));
  m.addGroundPin({ point: [0, 2] });
  m.addRod({ a: { body: null, point: [0, 2] }, b: { body: 'a', point: [0, 0] } });
  m.addSpring({ a: { body: null, point: [0.5, 2] }, b: { body: 'a', point: [0, 0] } });
  const s = m.toJSON();
  movePin(s, 'A1', [0.5, 0], TOL);
  assert.deepEqual(s.constraints[0].point, [0.5, 2]);
  assert.deepEqual(s.constraints[1].a.point, [0.5, 2], 'the Stab end moved with the pin');
  assert.deepEqual(s.elements[0].a.point, [0.5, 2], 'this spring end happened to be at the new place already');
  const s2 = m.toJSON();
  s2.elements[0].a.point = [0.9, 2];
  movePin(s2, 'A1', [0.5, 0], TOL);
  assert.deepEqual(s2.elements[0].a.point, [0.9, 2], 'an end that is not on the pin stays');
});

test('movePin adopts a surface it lands on', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  m.addGroundPin({ point: [1, 1] });
  const s = m.toJSON();
  movePin(s, 'A1', [0, -1.003], TOL);
  assert.equal(s.constraints[0].surface, 's1');
});

test('moveSurface: supports stay attached to their surface', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor], bodies: [block('a', 1, 0.1, 0.4, 0.2)] }));
  m.addSupport('pin_support', { body: 'a', point: [0, -0.1], surface: 's1' });
  const s = m.toJSON();
  moveSurface(s, 's1', [0, -1], TOL);
  assert.deepEqual(s.surfaces[0], { id: 's1', p1: [0, -1], p2: [3, -1] });
  assert.equal(s.constraints[0].surface, 's1', 'the gap is now 1 m');
  refreshSupports(s, TOL);
  assert.equal(s.constraints[0].surface, 's1');
});

test('contactOffset: a block corner or a disc rim lands exactly on a nearby surface', () => {
  const s = sceneWith({ surfaces: [floor], bodies: [block('b', 1, 0.12, 0.4, 0.2), disc('d', 2, 0.16, 0.15), block('far', 1, 0.5, 0.4, 0.2)] });
  closePoint(contactOffset(s, 'b', [0, 0], TOL), [0, -0.02], 1e-9);
  closePoint(contactOffset(s, 'd', [0, 0], TOL), [0, -0.01], 1e-9);
  assert.deepEqual(contactOffset(s, 'far', [0, 0], TOL), [0, 0]);
  closePoint(contactOffset(s, 'far', [0, -0.38], TOL), [0, -0.02], 1e-9); // moving it down brings it into reach
  // beyond the end of the surface: nothing
  assert.deepEqual(contactOffset(s, 'b', [5, 0], TOL), [0, 0]);
});

test('contactOffset on a sloped surface moves along its normal', () => {
  const a = Math.PI / 6;
  const slope = { id: 's', p1: [0, 0], p2: [2 * Math.cos(a), 2 * Math.sin(a)] };
  const n = [-Math.sin(a), Math.cos(a)];
  // a disc whose rim is 0.01 above the slope
  const c = [Math.cos(a) + n[0] * 0.16, Math.sin(a) + n[1] * 0.16];
  const s = sceneWith({ surfaces: [slope], bodies: [disc('d', c[0], c[1], 0.15)] });
  closePoint(contactOffset(s, 'd', [0, 0], TOL), [-n[0] * 0.01, -n[1] * 0.01], 1e-9);
});

test('linkProblem', () => {
  const s = sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2), block('b', 1, 0, 0.4, 0.2)] });
  const L = (a, b) => linkProblem(s, { a, b });
  assert.match(L({ body: null, point: [0, 0] }, { body: null, point: [1, 1] }), /at least one end/);
  assert.match(L({ body: 'a', point: [0, 0] }, { body: 'a', point: [0.1, 0] }), /same mass/);
  assert.match(L({ body: null, point: [0, 0] }, { body: 'a', point: [0.01, 0] }), /too close/);
  assert.equal(L({ body: 'a', point: [0, 0] }, { body: 'b', point: [0, 0] }), null);
});

// --- connections and hit ---------------------------------------------------------------------------

function scene3() {
  const m = new SceneModel(sceneWith({ bodies: [block('a', 0, 0.5, 0.4, 0.2), block('b', 0.4, 0.5, 0.4, 0.2)] }));
  m.addGroundPin({ point: [0, 1.5] });
  m.addRope({ a: { body: null, point: [0, 1.5] }, b: { body: 'a', point: [0, 0.1] } });
  m.addSpring({ a: { body: null, point: [0, 1.5] }, b: { body: 'b', point: [0, 0.1] } });
  m.addJoint('pin_joint', { a: { body: 'a', point: [0.2, 0] }, b: { body: 'b', point: [-0.2, 0] } });
  m.addLoad({ body: 'b', point: [0.2, 0], force: [1, 0] });
  return m;
}

test('connectionPoints: hubs where things meet, single dots elsewhere', () => {
  const pts = connectionPoints(scene3().scene);
  const at = (x, y) => pts.find((p) => Math.abs(p.point[0] - x) < 1e-6 && Math.abs(p.point[1] - y) < 1e-6);
  const pin = at(0, 1.5);
  assert.equal(pin.items.length, 3);
  assert.equal(pin.hub, true);
  assert.deepEqual([...pin.kinds].sort(), ['end', 'pin']);
  assert.equal(at(0.2, 0.5).hub, true, 'the joint');
  assert.equal(at(0, 0.6).hub, false, 'the rope end on the mass alone');
  assert.equal(at(0.6, 0.5).items[0].role, 'load');
});

test('neighbors: what a selection is connected to', () => {
  const s = scene3().scene;
  const n = neighbors(s, { kind: 'body', id: 'a' });
  assert.deepEqual([...n.bodies], ['b']);
  assert.deepEqual([...n.items].sort(), ['G1', 'R1']);
  const rope = neighbors(s, { kind: 'constraint', id: 'R1' });
  assert.deepEqual([...rope.bodies], ['a']);
  const pin = neighbors(s, { kind: 'constraint', id: 'A1' });
  assert.deepEqual([...pin.items].sort(), ['R1', 'k1']);
  assert.deepEqual([...pin.bodies].sort(), ['a', 'b']);
  assert.deepEqual(neighbors(s, null), { bodies: new Set(), items: new Set() });
});

test('hitTest finds ropes, Stabs, joints and free pins', () => {
  const s = scene3().scene;
  assert.deepEqual(hitTest(s, [0, 1.0], 400), { kind: 'constraint', id: 'R1' }, 'on the rope');
  assert.deepEqual(hitTest(s, [0.002, 1.498], 400), { kind: 'constraint', id: 'A1' }, 'the pin wins over the lines at its point');
  assert.deepEqual(hitTest(s, [0.2, 0.5], 400), { kind: 'constraint', id: 'G1' });
});

test('moveTarget: ends first, then supports / pins / loads, masses, surfaces', () => {
  const s = scene3().scene;
  assert.deepEqual(moveTarget(s, [0, 0.6], 400), { type: 'end', id: 'R1', end: 'b', kind: 'constraint' });
  assert.deepEqual(moveTarget(s, [0.003, 1.499], 400), { type: 'pin', id: 'A1' }, 'ends on a pin belong to the pin');
  s.constraints.find((c) => c.id === 'A1').point = [5, 5]; // loose ground ends are handles of their own
  assert.deepEqual(moveTarget(s, [0.003, 1.499], 400)?.type, 'end');
  assert.deepEqual(moveTarget(s, [0.6, 0.5], 400), { type: 'load', id: 'F1' });
  assert.deepEqual(moveTarget(s, [-0.1, 0.45], 400), { type: 'body', id: 'a' });
  assert.equal(moveTarget(s, [3, 3], 400), null);
});

// --- the move tool -------------------------------------------------------------------------------------

test('move: a mass and what is attached to it; one undo step', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('m', 1, 0.5, 0.4, 0.2)] }));
  m0.addSupport('pin_support', { body: 'm', point: [-0.2, -0.1], surface: null });
  const { model, tools } = setup(m0.scene);
  const t = tools.get('move');
  assert.equal(drag(t, [1.05, 0.52], [1.35, 0.72]), true);
  assert.deepEqual(model.body('m').position, [1.3, 0.7]);
  closePoint(attachedPoint(model.scene, model.scene.constraints[0]), [1.1, 0.6]);
  assert.equal(model.undoStack.length, 1);
  model.undo();
  assert.deepEqual(model.body('m').position, [1, 0.5]);
});

test('move: a mass lands exactly on a nearby surface; Shift only turns the grid off', () => {
  const start = () => setup(sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.5, 0.4, 0.2)] }));
  let { model, tools } = start();
  drag(tools.get('move'), [1, 0.5], [1, 0.12], { shift: true });
  close(model.body('m').position[1], 0.1, 1e-9);
  ({ model, tools } = start());
  drag(tools.get('move'), [1, 0.5], [1.33, 0.12]);
  closePoint(model.body('m').position, [1.35, 0.1], 1e-9);
  ({ model, tools } = start());
  drag(tools.get('move'), [1, 0.5], [1.33, 0.12], { shift: true });
  closePoint(model.body('m').position, [1.33, 0.1], 1e-9);
});

test('move: masses joined by a joint move together', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2), block('b', 0.4, 0, 0.4, 0.2), block('c', 2, 2, 0.4, 0.2)] }));
  m0.addJoint('pin_joint', { a: { body: 'a', point: [0.2, 0] }, b: { body: 'b', point: [-0.2, 0] } });
  const { model, tools } = setup(m0.scene);
  drag(tools.get('move'), [0, 0], [0.5, 0.5]);
  assert.deepEqual(model.body('a').position, [0.5, 0.5]);
  assert.deepEqual(model.body('b').position, [0.9, 0.5]);
  assert.deepEqual(model.body('c').position, [2, 2]);
  const j = model.scene.constraints[0];
  closePoint(anchorWorld(model.scene, j.a), anchorWorld(model.scene, j.b));
});

test('move: a Festlager in free space takes its ground ends along', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 1, 0, 0.4, 0.2)] }));
  m0.addGroundPin({ point: [0, 2] });
  m0.addRope({ a: { body: null, point: [0, 2] }, b: { body: 'a', point: [0, 0] } });
  const { model, tools } = setup(m0.scene);
  const t = tools.get('move');
  t.move({ world: [0, 2] });
  assert.deepEqual(t.hover, { type: 'pin', id: 'A1' });
  drag(t, [0, 2], [-0.5, 2.5]);
  assert.deepEqual(model.scene.constraints[0].point, [-0.5, 2.5]);
  assert.deepEqual(model.scene.constraints[1].a.point, [-0.5, 2.5]);
});

test('move: a surface alone', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.1, 0.4, 0.2)] }));
  drag(tools.get('move'), [2.5, 0.002], [2.5, -0.5]);
  assert.deepEqual(model.scene.surfaces[0], { id: 's1', p1: [0, -0.5], p2: [3, -0.5] });
  assert.deepEqual(model.body('m').position, [1, 0.1]);
});

test('move: drag the end of a spring or rope to attach it somewhere else', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 1, 0.5, 0.4, 0.2), block('b', 2, 0.5, 0.4, 0.2)] }));
  m0.addRope({ a: { body: null, point: [1, 2] }, b: { body: 'a', point: [0, 0.1] } });
  const { model, tools } = setup(m0.scene);
  const t = tools.get('move');
  drag(t, [1, 0.6], [2, 0.5]); // the lower end, onto the centre of b
  assert.deepEqual(model.scene.constraints[0].b, { body: 'b', point: [0, 0] });
  assert.equal(model.undoStack.length, 1);
});

test('move: an end that would make the link invalid goes back (and says why)', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 1, 0.5, 0.4, 0.2)] }));
  m0.addRod({ a: { body: null, point: [1, 2] }, b: { body: 'a', point: [0, 0.1] } });
  const { model, tools } = setup(m0.scene);
  const t = tools.get('move');
  t.down({ world: [1, 0.6] });
  t.move({ world: [3, 3] }); // free space: both ends would be on the ground
  assert.match(t.error, /at least one end on a mass/);
  assert.deepEqual(model.scene.constraints[0].b, { body: 'a', point: [0, 0.1] }, 'shown unchanged while dragging');
  t.up({ world: [3, 3] });
  assert.deepEqual(model.scene.constraints[0].b, { body: 'a', point: [0, 0.1] });
  assert.equal(model.undoStack.length, 0, 'nothing was changed, nothing to undo');
});

test('move: drag a support to another point of the mass; it keeps its surface', () => {
  const m0 = new SceneModel(sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.1, 0.4, 0.2)] }));
  m0.addSupport('pin_support', { body: 'm', point: [-0.2, -0.1], surface: 's1' });
  m0.addSupport('roller_support', { body: 'm', point: [0.2, -0.1], surface: 's1' });
  const { model, tools } = setup(m0.scene);
  const t = tools.get('move');
  drag(t, [0.8, 0.0], [1.0, 0.1]); // the Festlager to the centre
  assert.deepEqual(model.scene.constraints[0].point, [0, 0]);
  assert.equal(model.scene.constraints[0].surface, 's1');
  drag(t, [1.2, 0.0], [1.0, 0.2]); // the Loslager to the top edge: 0.2 m above the floor
  assert.deepEqual(model.scene.constraints[1].point, [0, 0.1]);
  assert.equal(model.scene.constraints[1].surface, 's1');
  drag(t, [1.0, 0.2], [3, 3]); // off the mass: refused
  assert.deepEqual(model.scene.constraints[1].point, [0, 0.1]);
});

test('move: drag a load to another mass', () => {
  const m0 = new SceneModel(sceneWith({ bodies: [block('a', 0, 0, 0.4, 0.2), block('b', 2, 0, 0.4, 0.2)] }));
  m0.addLoad({ body: 'a', point: [0, 0], force: [0, -5] });
  const { model, tools } = setup(m0.scene);
  drag(tools.get('move'), [0, 0], [2, 0]);
  assert.deepEqual(model.scene.elements[0].body, 'b');
  assert.deepEqual(model.scene.elements[0].params.force, [0, -5]);
});

test('move: empty space pans, a click does not change anything, Escape cancels', () => {
  const { model, tools, log } = setup(sceneWith({ bodies: [block('m', 1, 0.5, 0.4, 0.2)] }));
  const t = tools.get('move');
  assert.equal(click(t, [3, 3]), false);
  assert.equal(log.selected, null);
  click(t, [1, 0.5]);
  assert.deepEqual(log.selected, { kind: 'body', id: 'm' });
  assert.equal(model.undoStack.length, 0, 'a click is not a move');

  t.down({ world: [1, 0.5] });
  t.move({ world: [2, 1] });
  assert.deepEqual(model.body('m').position, [2, 1]);
  assert.equal(t.key('Escape'), true);
  assert.deepEqual(model.body('m').position, [1, 0.5]);
  assert.equal(model.undoStack.length, 0);
  assert.equal(t.key('Escape'), false);
});

test('move: a tiny drag below the threshold does not move anything', () => {
  const { model, tools } = setup(sceneWith({ bodies: [block('m', 1, 0.5, 0.4, 0.2)] }));
  drag(tools.get('move'), [1, 0.5], [1.005, 0.505]);
  assert.deepEqual(model.body('m').position, [1, 0.5]);
  assert.equal(model.undoStack.length, 0);
});

// --- support size ---------------------------------------------------------------------------------

import { supportHeight } from '../../frontend/js/canvas/symbols/supports.js';
import { Renderer } from '../../frontend/js/canvas/renderer.js';

test('supportHeight: distance to the surface along the normal on the body side', () => {
  const floor0 = { p1: [0, 0], p2: [3, 0] };
  close(supportHeight(floor0, 0, [1, 0.5]), 0.5);
  assert.equal(supportHeight(floor0, 0, [1, -0.2]), 0, 'through the surface: no negative height');
  // ceiling: body below it, angle pi
  close(supportHeight({ p1: [1, 2], p2: [-1, 2] }, Math.PI, [0, 1.25]), 0.75);
  // 30 degree incline: the point is 0.4 m from the line, measured perpendicular to it
  const a = Math.PI / 6;
  const slope = { p1: [0, 0], p2: [2 * Math.cos(a), 2 * Math.sin(a)] };
  const n = [-Math.sin(a), Math.cos(a)];
  close(supportHeight(slope, a, [Math.cos(a) + n[0] * 0.4, Math.sin(a) + n[1] * 0.4]), 0.4, 1e-12);
  // a wall at x = 0 that the body is to the right of (angle -pi/2)
  close(supportHeight({ p1: [0, 1], p2: [0, -1] }, -Math.PI / 2, [0.6, 0]), 0.6);
});

test('the renderer gives supports on a surface their distance from it', () => {
  const scene = sceneWith({
    surfaces: [{ id: 's1', p1: [0, 0], p2: [3, 0] }],
    constraints: [
      { id: 'A', type: 'pin_support', body: 'm', point: [0, 0], surface: 's1', params: { angle: 0 } },
      { id: 'B', type: 'pin_support', body: 'm', point: [0, 0], surface: null, params: { angle: 0 } },
      { id: 'R', type: 'rope', a: { body: null, point: [0, 1] }, b: { body: 'm', point: [0, 0] }, params: {} },
    ],
  });
  const fake = { scene, constraints: new Map(scene.constraints.map((c) => [c.id, c])) };
  const entries = [
    { id: 'A', position: [1, 0.7] }, { id: 'B', position: [1, 0.7] }, { id: 'R', position: [0, 1], p1: [0, 1], p2: [1, 0.7] },
  ];
  const out = Renderer.prototype.withSupportHeights.call(fake, entries);
  close(out[0].height, 0.7);
  assert.equal(out[1].height, undefined, 'no surface, no height');
  assert.equal(out[2].height, undefined, 'only supports');
  assert.equal(entries[0].height, undefined, 'the frame entries are not modified');
});
