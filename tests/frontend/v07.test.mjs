// v0.7: Einspannung where a Stab or beam sits on a surface, Festlager rotation from the second click, spring angles
// to a surface, Shift = no snapping anywhere, load arrows that do not hide what lies under them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { anchorWorld, hitTest, loadArrow } from '../../frontend/js/editor/hit.js';
import { snapPoint } from '../../frontend/js/editor/snap.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { block, click, close, closePoint, drag, sceneWith, setup } from './helpers.mjs';

const floor = { id: 'floor', p1: [-3, 0], p2: [3, 0] };
const deg = (x) => (x * 180) / Math.PI;
const supports = (model) => model.scene.constraints.filter((c) => c.type.endsWith('_support'));

// --- Shift: nothing snaps -------------------------------------------------------------------------------

test('snapPoint free: the exact point, a mass under it is still found, nothing else snaps', () => {
  const scene = sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.5, 0.4, 0.2)] });
  const nearFloor = snapPoint([0.123, 0.004], scene, { scale: 400, surfaces: true, free: true });
  assert.deepEqual(nearFloor.point, [0.123, 0.004]);
  assert.equal(nearFloor.surface, null);
  const onMass = snapPoint([1.013, 0.52], scene, { scale: 400, interior: true, surfaces: true, free: true });
  assert.equal(onMass.body, 'm');
  closePoint(onMass.point, [1.013, 0.52]);
  closePoint(onMass.local, [0.013, 0.02]);
  assert.equal(snapPoint([1.013, 0.52], scene, { scale: 400, free: true }).body, null); // without `interior`
});

test('Shift: rectangle, circle, surface and beam take the pointer positions as they are', () => {
  const free = { shift: true };
  let { model, tools } = setup();
  drag(tools.get('rect'), [0.013, 0.027], [0.931, 0.512], free);
  const r = model.scene.bodies[0].params;
  close(r.width, 0.918, 1e-9);
  close(r.height, 0.485, 1e-9);

  ({ model, tools } = setup());
  drag(tools.get('circle'), [0, 0], [0.273, 0], free);
  close(model.scene.bodies[0].params.radius, 0.273, 1e-9);
  ({ model, tools } = setup());
  drag(tools.get('circle'), [0, 0], [0.273, 0]);
  close(model.scene.bodies[0].params.radius, 0.25, 1e-9); // the grid rounds it

  ({ model, tools } = setup());
  drag(tools.get('surface'), [0, 0], [1.0, 0.43], free);
  closePoint(model.scene.surfaces[0].p2, [1.0, 0.43]);
  ({ model, tools } = setup());
  drag(tools.get('beam'), [0, 0], [1.0, 0.43], free);
  close(model.scene.bodies[0].params.length, Math.hypot(1.0, 0.43), 1e-8);
});

// --- a Stab or a beam on a surface is fest eingespannt ----------------------------------------------------------

const stand = (model, tools, x = 0.5) => {
  click(tools.get('rod'), [x, 0.01]); // snaps onto the floor
  click(tools.get('rod'), [x, 2]);
  return model.scene.constraints.find((c) => c.type === 'rod');
};

test('a Stab drawn from a surface snaps onto it; made elastic, its foot is clamped (an Einspannung on the node)', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor] }));
  const rod = stand(model, tools);
  assert.equal(model.scene.bodies.length, 2);
  closePoint(model.body(rod.a.body).position, [0.5, 0]); // on the floor line
  assert.equal(supports(model).length, 0); // a rigid Stab is a truss member: nothing is clamped
  model.setStabSection(rod.id, { type: 'square', a: 0.04 });
  const [E] = supports(model);
  assert.equal(supports(model).length, 1);
  assert.equal(E.type, 'fixed_support');
  assert.equal(E.surface, 'floor');
  assert.equal(E.body, rod.a.body);
  closePoint(E.point, [0, 0]);
  close(E.params.angle, 0, 1e-12); // the Stab, and so the "body", is above the floor
  // back to rigid and elastic again: the support stays one
  model.setStabSection(rod.id, null);
  model.setStabSection(rod.id, { type: 'square', a: 0.04 });
  assert.equal(supports(model).length, 1);
});

test('a Stab between two surfaces is clamped at both ends once it is elastic', () => {
  const ceiling = { id: 'ceiling', p1: [3, 2], p2: [-3, 2] };
  const { model, tools } = setup(sceneWith({ surfaces: [floor, ceiling] }));
  click(tools.get('rod'), [0, 0.01]);
  click(tools.get('rod'), [0, 1.995]);
  model.setStabSection(model.scene.constraints[0].id, { type: 'square', a: 0.04 });
  assert.equal(supports(model).length, 2);
  const angles = supports(model).map((c) => c.params.angle).sort((a, b) => a - b);
  close(angles[0], 0, 1e-9);
  close(Math.abs(angles[1]), Math.PI, 1e-9);
});

test('no Einspannung where it would be wrong: a Fachwerk joint, a node with a support, a free end', () => {
  // a Fachwerk joint on the floor (two members meet): both become elastic, the joint stays free
  let { model, tools } = setup(sceneWith({ surfaces: [floor] }));
  click(tools.get('rod'), [0, 0.01]);
  click(tools.get('rod'), [1, 1]);
  click(tools.get('rod'), [2, 0.01]);
  click(tools.get('rod'), [1, 1]);
  click(tools.get('rod'), [0, 0.01]); // the joint (0, 0) is shared by a third member
  click(tools.get('rod'), [2, 0.01]);
  for (const c of [...model.scene.constraints]) model.setStabSection(c.id, { type: 'square', a: 0.02 });
  assert.equal(supports(model).length, 0);

  // a node that has its Festlager already
  ({ model, tools } = setup(sceneWith({ surfaces: [floor] })));
  const rod = stand(model, tools);
  model.addSupport('pin_support', { body: rod.a.body, point: [0, 0], surface: 'floor', angle: 0 });
  model.setStabSection(rod.id, { type: 'square', a: 0.04 });
  assert.deepEqual(supports(model).map((c) => c.type), ['pin_support']);

  // standing in the air
  ({ model, tools } = setup(sceneWith({ surfaces: [floor] })));
  click(tools.get('rod'), [0, 1]);
  click(tools.get('rod'), [1, 1]);
  model.setStabSection(model.scene.constraints[0].id, { type: 'square', a: 0.04 });
  assert.equal(supports(model).length, 0);
});

test('a point carries one support: a Festlager or Einspannung replaces the one that is there', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor] }));
  const rod = stand(model, tools);
  model.setStabSection(rod.id, { type: 'square', a: 0.04 }); // Einspannung E1
  model.addSupport('pin_support', { body: rod.a.body, point: [0, 0], surface: 'floor', angle: 0 });
  assert.deepEqual(supports(model).map((c) => c.type), ['pin_support']);
  model.addSupport('fixed_support', { body: rod.a.body, point: [0, 0], surface: 'floor', angle: 0 });
  assert.deepEqual(supports(model).map((c) => c.type), ['fixed_support']);
  // Loslager on the same point of a block: two of them may share it
  const m = setup(sceneWith({ bodies: [block('m', 0, 0, 0.4, 0.2)] })).model;
  m.addSupport('roller_support', { body: 'm', point: [0.2, -0.1], angle: 0 });
  m.addSupport('roller_support', { body: 'm', point: [0.2, -0.1], angle: Math.PI / 2 });
  assert.equal(supports(m).length, 2);
  m.addSupport('pin_support', { body: 'm', point: [0.2, -0.1] });
  assert.deepEqual(supports(m).map((c) => c.type), ['pin_support']);
});

test('a beam end on a surface gets an Einspannung at that end of the beam', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor] }));
  const t = tools.get('beam');
  drag(t, [1, 0.01], [1, 2]);
  const beam = model.scene.bodies[0];
  assert.equal(beam.type, 'beam');
  const [E] = supports(model);
  assert.equal(supports(model).length, 1);
  assert.equal(E.type, 'fixed_support');
  assert.equal(E.body, beam.id);
  assert.equal(E.surface, 'floor');
  closePoint(E.point, [-beam.params.length / 2, 0], 1e-9); // the start of the axis
  close(E.params.angle, 0, 1e-9);
  close(deg(beam.angle), 90, 1e-6);

  // starting in the air and ending on the floor: the clamp is at the other end
  const b = setup(sceneWith({ surfaces: [floor] }));
  drag(b.tools.get('beam'), [1, 2], [1, 0.02]);
  const [F] = supports(b.model);
  assert.equal(supports(b.model).length, 1);
  closePoint(F.point, [b.model.scene.bodies[0].params.length / 2, 0], 1e-9);

  // not near a surface: no support; with Shift not either
  const c = setup(sceneWith({ surfaces: [floor] }));
  drag(c.tools.get('beam'), [1, 1], [1, 2]);
  assert.equal(supports(c.model).length, 0);
  const d = setup(sceneWith({ surfaces: [floor] }));
  drag(d.tools.get('beam'), [1, 0.01], [1, 2], { shift: true });
  assert.equal(supports(d.model).length, 0);
});

test('the Euler load of an elastic Stab follows its ends: pinned 1, one end clamped 0.699, both 0.5', () => {
  const build = (clamped) => {
    const m = new SceneModel(sceneWith({}));
    const id = m.addRod({ a: { node: true, point: [0, 0] }, b: { node: true, point: [0, 2] } });
    const [n1, n2] = m.scene.bodies.map((b) => b.id);
    if (clamped >= 1) m.addSupport('fixed_support', { body: n1, point: [0, 0], surface: 'floor', angle: 0 });
    if (clamped >= 2) m.addSupport('fixed_support', { body: n2, point: [0, 0], surface: null, angle: Math.PI });
    m.setStabSection(id, { type: 'square', a: 0.04 });
    return propertyFields(m, id).info.join(' ');
  };
  const pcr = (K) => (Math.PI ** 2 * 210e9 * (0.04 ** 4 / 12)) / (K * 2) ** 2;
  assert.match(build(0), new RegExp(`${(pcr(1) / 1e3).toFixed(1).replace('.', ',')} kN`));
  assert.match(build(0), /gelenkig/);
  assert.match(build(1), new RegExp(`${(pcr(0.6991546) / 1e3).toFixed(1).replace('.', ',')} kN`));
  assert.match(build(1), /Eulerfall 3/);
  assert.match(build(2), /Eulerfall 4/);
});

// --- Festlager: the second click turns it --------------------------------------------------------------------

const second = (tool, a, b, extra = {}) => {
  tool.move({ world: a, ...extra });
  tool.down({ world: a, ...extra });
  tool.up({ world: a, ...extra });
  tool.move({ world: b, ...extra });
  tool.down({ world: b, ...extra });
  tool.up({ world: b, ...extra });
};

test('Festlager: the second click in free space sets the rotation (the symbol points at the click)', () => {
  const angleFor = (click2, extra) => {
    const { model, tools } = setup(sceneWith({ bodies: [block('m', 0.5, 0.1, 0.4, 0.2)] }));
    second(tools.get('pin'), [0.5, 0.1], click2, extra);
    const [c] = model.scene.constraints;
    assert.equal(c.type, 'pin_support');
    assert.equal(c.surface, null);
    return c.params.angle;
  };
  close(angleFor([0.5, -2]), 0, 1e-9); // below: ground below, the default
  close(angleFor([0.5, 2.5]), Math.PI, 1e-9); // above: a ceiling
  close(angleFor([3, 0.1]), Math.PI / 2, 1e-9); // to the right: a wall on the right
  close(angleFor([-3, 0.1]), -Math.PI / 2, 1e-9);
  close(deg(angleFor([2.5, 2.9])), 150, 1e-6); // the direction (54.5 degrees) snaps to 60: 60 + 90
  close(deg(angleFor([2.5, 2.9], { shift: true })), deg(Math.atan2(2.8, 2) + Math.PI / 2), 1e-3); // Shift: exactly
});

test('Festlager and Einspannung: a click on a surface still adapts to it, Shift does not', () => {
  const scene = () => sceneWith({ surfaces: [{ id: 's', p1: [0, 0], p2: [1, 1] }], bodies: [block('m', 0.8, 0.2, 0.2, 0.2)] });
  let { model, tools } = setup(scene());
  second(tools.get('pin'), [0.8, 0.2], [0.5, 0.5]);
  assert.equal(model.scene.constraints[0].surface, 's');
  ({ model, tools } = setup(scene()));
  second(tools.get('pin'), [0.8, 0.2], [0.5, 0.5], { shift: true });
  assert.equal(model.scene.constraints[0].surface, null);
});

// --- Spring on a surface -----------------------------------------------------------------------------------

test('a spring that starts on a surface is held at 0, 30, 45, 60, 90 degrees to it', () => {
  const m = block('m', 1, 0.8, 0.6, 0.6);
  const make = (extra) => {
    const { model, tools } = setup(sceneWith({ surfaces: [floor], bodies: [m] }));
    const t = tools.get('spring');
    click(t, [0, 0.01], extra);
    click(t, [1.0, 0.8], extra); // the end is somewhere in the mass; the ray decides
    t.key('Enter');
    const [spring] = model.scene.elements;
    return { spring, model };
  };
  const { spring, model } = make();
  const a = anchorWorld(model.scene, spring.a);
  const b = anchorWorld(model.scene, spring.b);
  assert.equal(spring.b.body, 'm');
  close(deg(Math.atan2(b[1] - a[1], b[0] - a[0])), 45, 1e-6); // the pointer was at 38.7 degrees
  const free = make({ shift: true });
  const fb = anchorWorld(free.model.scene, free.spring.b);
  closePoint(fb, [1.0, 0.8], 1e-9);
});

test('a spring from a mass to a surface lands on the surface at an allowed angle to it', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.8, 0.6, 0.6)] }));
  const t = tools.get('spring');
  click(t, [1, 0.8]); // the centre of the mass
  click(t, [0.5, 0.01]); // near the floor, left of the mass
  t.key('Enter');
  const [spring] = model.scene.elements;
  const a = anchorWorld(model.scene, spring.a); // ground end first
  const b = anchorWorld(model.scene, spring.b);
  close(a[1], 0, 1e-9);
  close(deg(Math.atan2(b[1] - a[1], b[0] - a[0])), 60, 1e-6); // 60 degrees to the floor
});

test('Shift: a spring end on the floor stays where it was clicked', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor], bodies: [block('m', 1, 0.8, 0.6, 0.6)] }));
  const t = tools.get('spring');
  click(t, [1, 0.8], { shift: true });
  click(t, [0.5, 0.01], { shift: true });
  t.key('Enter');
  const [spring] = model.scene.elements;
  closePoint(anchorWorld(model.scene, spring.a), [0.5, 0.01]); // not on the floor line, not snapped
});

// --- the arrow of a load does not hide what it points along ---------------------------------------------------

test('a long load arrow along a Stab does not hide the Stab, but is still hit where it acts and at its head', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  const id = m.addRod({ a: { node: true, point: [0, 0] }, b: { node: true, point: [0, 2] } });
  m.addLoad({ body: 'N2', point: [0, 0], force: [0, -150000] });
  const scale = 100;
  assert.deepEqual(hitTest(m.scene, [0, 1], scale), { kind: 'constraint', id });
  assert.deepEqual(hitTest(m.scene, [0, 1.3], scale), { kind: 'constraint', id });
  assert.equal(hitTest(m.scene, [0, 2.02], scale).id, 'F1'); // at the point where it acts
  const arrow = loadArrow(m.scene, m.scene.elements[0], scale);
  closePoint(arrow.p, [0, 2]);
  closePoint(arrow.tip, [0, 2 - 3.2], 1e-9); // 320 px at most, not 7500 m
  assert.equal(hitTest(m.scene, arrow.tip, scale).id, 'F1'); // the arrow head
  assert.equal(hitTest(m.scene, [0, -0.6], scale).id, 'F1'); // the shaft below the Stab
  assert.equal(hitTest(m.scene, [0, -3], scale), null); // beyond the drawn arrow nothing is hit
});

test('Stab form: making a Stab elastic with the property form clamps the foot that stands on a surface', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  const id = m.addRod({ a: { node: true, point: [0, 0] }, b: { node: true, point: [0, 2] } });
  assert.equal(applyProperties(m, id, { sectionType: 'square', sec_a: '40', segments: 4, massMode: 'steel', damping: 0, bow: '0,02' }).ok, true);
  assert.equal(m.scene.elements.find((e) => e.id === id).type, 'bar');
  assert.deepEqual(supports(m).map((c) => [c.type, c.surface]), [['fixed_support', 'floor']]);
});

// --- v0.7b: a Stab on a block or a disc is clamped there ------------------------------------------------------

import { massEnds, stabClamps } from '../../frontend/js/editor/ends.js';
import { disc } from './helpers.mjs';

const kreis = () => {
  const m = new SceneModel(sceneWith({ bodies: [disc('m1', 0, 1, 0.9)] }));
  m.addGroundPin({ point: [-2, 1] }); // (a Festlager in free space, unused)
  const rod = m.addRod({ a: { body: 'm1', point: [0.9, 0] }, b: { node: true, point: [2, 1] } });
  return { m, rod };
};

test('stabClamps / massEnds: ends on blocks and discs are clamped, nodes and the ground are pins', () => {
  const { m, rod } = kreis();
  const stab = m.find(rod).obj;
  assert.deepEqual(stabClamps(m.scene, stab), [true, false]);
  assert.deepEqual(massEnds(m.scene, stab), ['a']);
  stab.params = { hinged_a: true };
  assert.deepEqual(stabClamps(m.scene, stab), [false, false]);
  // a Stab, rigid or elastic, is also clamped at a node with an Einspannung
  const b = m.scene.bodies.find((x) => x.type === 'node').id;
  m.addSupport('fixed_support', { body: b, point: [0, 0] });
  assert.deepEqual(stabClamps(m.scene, { ...stab, type: 'bar' }), [false, true]);
  assert.deepEqual(stabClamps(m.scene, stab), [false, true]);
});

test('Stab form: the end condition of an end on a mass can be chosen, and is kept when the Stab becomes elastic', () => {
  const { m, rod } = kreis();
  const form = propertyFields(m, rod);
  const end = form.fields.find((f) => f.key === 'end_a');
  assert.equal(end.value, 'clamped');
  assert.equal(form.fields.find((f) => f.key === 'end_b').value, 'hinged'); // the node end: a pin until an Einspannung is put on it
  assert.match(form.info.join(' '), /starrer Arm/);

  assert.equal(applyProperties(m, rod, { sectionType: 'rigid', end_a: 'hinged' }).ok, true);
  assert.deepEqual(m.find(rod).obj.params, { hinged_a: true });
  m.setStabSection(rod, { type: 'square', a: 0.02 }); // elastic: the flag stays
  assert.equal(m.find(rod).obj.params.hinged_a, true);
  assert.equal(propertyFields(m, rod).fields.find((f) => f.key === 'end_a').value, 'hinged');
  assert.equal(applyProperties(m, rod, { sectionType: 'square', sec_a: '20', segments: 4, massMode: 'steel', damping: 5, bow: '0,02', end_a: 'clamped', end_b: 'hinged' }).ok, true);
  assert.equal(m.find(rod).obj.params.hinged_a, undefined);
  m.setStabSection(rod, null);
  assert.deepEqual(m.find(rod).obj.params, {}); // back to rigid and clamped
});

test('the Euler load counts a Stab clamped to a mass', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('m', 0, 0, 0.4, 0.2)] }));
  const id = m.addRod({ a: { body: 'm', point: [0, 0.1] }, b: { node: true, point: [0, 2.1] } });
  m.setStabSection(id, { type: 'square', a: 0.04 });
  assert.match(propertyFields(m, id).info.join(' '), /Eulerfall 3/);
  m.setStabEnds(id, { a: true });
  assert.match(propertyFields(m, id).info.join(' '), /gelenkig \(Eulerfall 2\)/);
});

// --- an end on a Knoten can be fest eingespannt from the Stab form -------------------------------------------

const mast = () => { // a Stab from a node in free space (not on any surface) to another node
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  const id = m.addRod({ a: { node: true, point: [0, 1] }, b: { node: true, point: [0, 3] } });
  return { m, id };
};
const SECTION = { sectionType: 'square', sec_a: '40', segments: 4, massMode: 'steel', damping: 5, bow: '0,02' };

test('Stab form: rigid and elastic Stabs offer the end condition per Knoten end; the Euler load follows the choice', () => {
  const { m, id } = mast();
  const ends = (form) => form.fields.filter((f) => f.key.startsWith('end_')).map((f) => [f.key, f.value]);
  assert.deepEqual(ends(propertyFields(m, id)), [['end_a', 'hinged'], ['end_b', 'hinged']]); // rigid
  assert.deepEqual(ends(propertyFields(m, id, { sectionType: 'square' })), [['end_a', 'hinged'], ['end_b', 'hinged']]);
  assert.match(propertyFields(m, id, { sectionType: 'square' }).info.join(' '), /Eulerfall 2/);
  assert.match(propertyFields(m, id, { sectionType: 'square', end_a: 'clamped' }).info.join(' '), /Eulerfall 3/);
});

test('Stab form: a rigid Stab can be fest eingespannt at a Knoten (an Einspannung on it) and released to a Festlager', () => {
  const { m, id } = mast();
  assert.equal(applyProperties(m, id, { sectionType: 'rigid', end_a: 'clamped', end_b: 'hinged' }).ok, true);
  assert.equal(m.find(id).obj.type, 'rod');
  const [E, ...rest] = supports(m);
  assert.equal(rest.length, 0);
  assert.deepEqual([E.type, E.body], ['fixed_support', m.find(id).obj.a.body]);
  assert.deepEqual(stabClamps(m.scene, m.find(id).obj), [true, false]);
  assert.equal(propertyFields(m, id).fields.find((f) => f.key === 'end_a').value, 'clamped');
  // elastic and back: the Einspannung stays with the Knoten
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true);
  assert.equal(supports(m).length, 1);
  assert.equal(applyProperties(m, id, { sectionType: 'rigid', end_a: 'hinged', end_b: 'hinged' }).ok, true);
  assert.deepEqual(supports(m).map((c) => c.type), ['pin_support']);
});

test('Stab form: "Fest eingespannt" at a Knoten in free space puts an Einspannung on it, "Gelenk" removes it', () => {
  const { m, id } = mast();
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true);
  const [E, ...rest] = supports(m);
  assert.equal(rest.length, 0);
  assert.equal(E.type, 'fixed_support');
  assert.equal(E.body, m.find(id).obj.a.body);
  assert.equal(E.surface, null);
  close(E.params.angle, 0, 1e-9); // the Stab is above the Knoten, like a column on a floor (angle 0)
  assert.deepEqual(stabClamps(m.scene, m.find(id).obj), [true, false]);
  // shown clamped in the form from now on
  assert.equal(propertyFields(m, id).fields.find((f) => f.key === 'end_a').value, 'clamped');
  assert.match(propertyFields(m, id).info.join(' '), /Eulerfall 3/);
  // and released again: the Knoten stays where it is, on a Festlager
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'hinged', end_b: 'hinged' }).ok, true);
  assert.deepEqual(supports(m).map((c) => [c.type, c.body]), [['pin_support', E.body]]);
  assert.deepEqual(stabClamps(m.scene, m.find(id).obj), [false, false]);
});

const column = () => { // the foot of the column is a Festlager in free space on the floor: a ground anchor (as in buckling_columns)
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  const pin = m.addGroundPin({ point: [0, 0], surface: 'floor', angle: 0 });
  const id = m.addRod({ a: { body: null, point: [0, 0] }, b: { node: true, point: [0, 2] } });
  return { m, id, pin };
};

test('Stab form: the foot on a Festlager in free space (ground) can be fest eingespannt: it becomes a Knoten with an Einspannung', () => {
  const { m, id, pin } = column();
  const form = propertyFields(m, id, { sectionType: 'square' });
  assert.equal(form.fields.find((f) => f.key === 'end_a').value, 'hinged');
  assert.match(form.fields.find((f) => f.key === 'end_a').label, /Festlager/);
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true);
  const stab = m.find(id).obj;
  assert.notEqual(stab.a.body, null);
  closePoint(m.body(stab.a.body).position, [0, 0]);
  assert.deepEqual(supports(m).map((c) => [c.id, c.type, c.body, c.surface]), [[pin, 'fixed_support', stab.a.body, 'floor']]); // the Festlager became it
  assert.deepEqual(stabClamps(m.scene, stab), [true, false]);
  assert.equal(propertyFields(m, id).fields.find((f) => f.key === 'end_a').value, 'clamped');
  // and back to a pin: a Festlager on the Knoten
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'hinged', end_b: 'hinged' }).ok, true);
  assert.deepEqual(supports(m).map((c) => [c.type, c.body]), [['pin_support', stab.a.body]]);
});

test('a ground Festlager that other members are anchored to stays; the foot gets an Einspannung of its own', () => {
  const { m, id, pin } = column();
  m.addSpring({ a: { body: null, point: [0, 0] }, b: { node: true, point: [1, 0.5] } });
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true);
  const stab = m.find(id).obj;
  assert.deepEqual(supports(m).map((c) => [c.type, c.body]).sort(), [['fixed_support', stab.a.body], ['pin_support', null]]);
  assert.equal(supports(m).find((c) => c.id === pin).body, null);
});

test('Stab form: the foot that stands on a surface is shown clamped, and "Gelenk" makes it a Festlager instead of the automatic Einspannung', () => {
  const m = new SceneModel(sceneWith({ surfaces: [floor] }));
  const id = m.addRod({ a: { node: true, point: [0, 0] }, b: { node: true, point: [0, 2] } });
  assert.equal(propertyFields(m, id, { sectionType: 'square' }).fields.find((f) => f.key === 'end_a').value, 'clamped');
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'hinged', end_b: 'hinged' }).ok, true);
  assert.equal(m.find(id).obj.type, 'bar');
  assert.deepEqual(supports(m).map((c) => [c.type, c.surface]), [['pin_support', 'floor']]); // the foot stays where it stands: a Festlager
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true); // already elastic
  assert.deepEqual(supports(m).map((c) => [c.type, c.surface]), [['fixed_support', 'floor']]);
});

test('an Einspannung chosen for a Knoten with a Festlager replaces it', () => {
  const { m, id } = mast();
  m.addSupport('pin_support', { body: m.find(id).obj.a.body, point: [0, 0] });
  assert.equal(applyProperties(m, id, { ...SECTION, end_a: 'clamped', end_b: 'hinged' }).ok, true);
  assert.deepEqual(supports(m).map((c) => c.type), ['fixed_support']);
});

// --- the Stab tool: fest einspannen where an end lands on a surface ---------------------------------------------

test('Stab tool option: an end that lands on a surface gets an Einspannung, off by default and kept between Stabs', () => {
  const { model, tools } = setup(sceneWith({ surfaces: [floor] }));
  const tool = tools.get('rod');
  assert.deepEqual(tool.option, { label: 'Enden an Flächen fest einspannen', checked: false });
  assert.equal(tools.get('rope').option, null);
  stand(model, tools); // option off: a plain Stab, nothing clamped
  assert.equal(supports(model).length, 0);

  tool.setOption(true);
  assert.equal(tool.option.checked, true);
  click(tool, [-1, 0.01]); // snaps onto the floor
  click(tool, [-1, 2]); // free space: no surface, no Einspannung
  const rod = model.scene.constraints.find((c) => c.id === 'S2');
  const [E, ...rest] = supports(model);
  assert.equal(rest.length, 0);
  assert.deepEqual([E.type, E.body, E.surface], ['fixed_support', rod.a.body, 'floor']);
  close(E.params.angle, 0, 1e-12);
  // elastic: the foot is clamped, as the Einspannung says
  model.setStabSection('S2', { type: 'square', a: 0.04 });
  assert.deepEqual(stabClamps(model.scene, model.find('S2').obj), [true, false]);
  assert.equal(supports(model).length, 1);
});

test('Stab tool option: a Stab between two surfaces is clamped at both ends; a node that already has a support is left alone', () => {
  const ceiling = { id: 'ceiling', p1: [3, 2], p2: [-3, 2] };
  const { model, tools } = setup(sceneWith({ surfaces: [floor, ceiling] }));
  const tool = tools.get('rod');
  tool.setOption(true);
  click(tool, [0, 0.01]);
  click(tool, [0, 1.995]);
  assert.deepEqual(supports(model).map((c) => c.type), ['fixed_support', 'fixed_support']);
  // a second Stab from the same floor node (a Fachwerk joint): the node keeps its single support
  click(tool, [0, 0.01]);
  click(tool, [1, 1]);
  assert.equal(supports(model).length, 2);
});
