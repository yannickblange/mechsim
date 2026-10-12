// v0.4 beams, sections in the editor, harmonic loads.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exaggerate, beamCurve, beamNodes, beamOutline } from '../../frontend/js/canvas/symbols/beam.js';
import { formatForce } from '../../frontend/js/canvas/symbols/rod.js';
import {
  blockCorners, bodyArea, bodyBox, bodyFeaturePoints, nearestOnOutline, pointInBody,
} from '../../frontend/js/editor/geometry.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { beamMass, defaultSection, sectionProps } from '../../frontend/js/editor/section.js';
import { sectionSvg } from '../../frontend/js/editor/sectionview.js';
import { snapPoint } from '../../frontend/js/editor/snap.js';
import { block, close, closePoint, click, drag, sceneWith, setup } from './helpers.mjs';

const beams = (m) => m.scene.bodies.filter((b) => b.type === 'beam');

test('beam tool: drag along the axis makes a beam (midpoint, angle, length, default square section)', () => {
  const { model, tools, log } = setup();
  const t = tools.get('beam');
  assert.match(t.hint, /beam/i);
  drag(t, [0, 0], [2, 0]);
  const b = beams(model)[0];
  assert.equal(b.id, 'b1');
  closePoint(b.position, [1, 0]);
  close(b.angle, 0);
  assert.deepEqual(b.params, { length: 2, section: { type: 'square', a: 0.05 }, damping: 5 }); // a new beam settles
  assert.deepEqual(log.created.at(-1), ['body', 'b1']);

  // the angle snaps like surfaces do: 30 degrees
  drag(t, [0, 1], [1.8, 2.1]);
  const c = beams(model)[1];
  close(c.angle, Math.PI / 6, 1e-6);
  close(c.params.length, 1.8 / Math.cos(Math.PI / 6), 0.05); // the length is rounded to the grid step

  // too short is refused; free angles with Shift
  drag(t, [0, 3], [0.05, 3]);
  assert.match(t.error, /small/);
  assert.equal(beams(model).length, 2);
  drag(t, [0, 3], [1, 3.3], { shift: true });
  close(beams(model)[2].angle, Math.atan2(0.3, 1), 1e-2);
  assert.equal(model.undoStack.length, 3);
});

test('beam tool preview: a beam band with its length', () => {
  const { tools } = setup();
  const t = tools.get('beam');
  t.move({ world: [0, 0] });
  t.down({ world: [0, 0] });
  t.move({ world: [1.5, 0] });
  assert.equal(t.preview.type, 'beam');
  assert.match(t.preview.label, /1\.50 m beam/);
});

test('a beam is a rectangle in the editor: hit, snap features along its axis, outline', () => {
  const m = new SceneModel();
  const id = m.addBeam({ start: [0, 0], end: [2, 0] });
  const beam = m.body(id);
  assert.deepEqual(bodyBox(beam), { x0: -1, x1: 1, y0: -0.025, y1: 0.025 });
  assert.equal(pointInBody(beam, [1.5, 0.01]), true);
  assert.equal(pointInBody(beam, [1.5, 0.05]), false);
  close(bodyArea(beam), 2 * 0.05);
  assert.equal(blockCorners(beam).length, 4);
  const kinds = bodyFeaturePoints(beam).map((f) => `${f.kind}:${f.local}`);
  assert.ok(kinds.includes('center:0,0'));
  assert.ok(kinds.includes('corner:-1,0'), 'the axis ends are snap points');
  assert.ok(kinds.includes('corner:1,0'));
  closePoint(nearestOnOutline(beam, [1.5, 0.2]).local, [0.5, 0.025]); // the beam's centre is at x = 1
  // the pointer snaps onto the end of the axis (world x = 2)
  const s = snapPoint([2.003, 0.004], m.scene, { scale: 400 });
  assert.equal(s.body, id);
  assert.deepEqual(s.local, [1, 0]);
});

test('a T beam reaches further below its axis than above (flange up)', () => {
  const m = new SceneModel(sceneWith({
    bodies: [{ id: 'b1', type: 'beam', position: [0, 0], angle: 0, params: { length: 1, section: { type: 'T', b: 0.1, h: 0.1, tf: 0.01, tw: 0.01 } } }],
  }));
  const box = bodyBox(m.body('b1'));
  assert.ok(-box.y0 > box.y1);
  close(box.y1 - box.y0, 0.1, 1e-12);
  assert.equal(pointInBody(m.body('b1'), [0, -0.06]), true);
  assert.equal(pointInBody(m.body('b1'), [0, 0.06]), false);
});

test('beam form: length, section select with its dimensions in mm, mass from steel or given', () => {
  const m = new SceneModel();
  const id = m.addBeam({ start: [0, 0], end: [2, 0] });
  let form = propertyFields(m, id);
  assert.deepEqual(form.fields.map((f) => f.key), ['length', 'sectionType', 'sec_a', 'massMode', 'damping', 'segments', 'angle', 'vx', 'vy', 'omega']);
  assert.equal(form.fields.find((f) => f.key === 'damping').value, 5);
  assert.equal(form.fields.find((f) => f.key === 'sec_a').value, 50);
  assert.equal(form.fields.find((f) => f.key === 'sec_a').unit, 'mm');
  assert.equal(form.fields.find((f) => f.key === 'massMode').value, 'steel');
  assert.ok(form.fields.find((f) => f.key === 'sectionType').reshape);
  assert.deepEqual(form.fields.find((f) => f.key === 'sectionType').options.map(([v]) => v), ['square', 'L', 'T', 'H', 'I']);
  assert.match(form.info[0], /EI = /);
  assert.match(form.info[0], /Mass 39\.25/); // 7850 x 0.05^2 x 2

  // type changed to H: new dimensions of that type, same depth (50 mm)
  form = propertyFields(m, id, { sectionType: 'H' });
  assert.deepEqual(form.fields.filter((f) => f.key.startsWith('sec_')).map((f) => f.key), ['sec_b', 'sec_h', 'sec_tf', 'sec_tw']);
  close(sectionProps(form.section).depth, 0.05, 1e-6);

  // "given" shows the mass field with the steel mass as the starting value
  form = propertyFields(m, id, { massMode: 'given' });
  close(form.fields.find((f) => f.key === 'mass').value, beamMass({ type: 'square', a: 0.05 }, 2), 1e-4);
});

test('beam form: applying changes length, section, mass and keeps attachments in place along the beam', () => {
  const m = new SceneModel();
  const id = m.addBeam({ start: [0, 0], end: [2, 0] });
  m.addLoad({ body: id, point: [1, 0], force: [0, -5] }); // the right end
  const values = {
    length: '4', sectionType: 'I', sec_b: '60', sec_h: '120', sec_tf: '7', sec_tw: '4', massMode: 'steel', segments: '12', damping: '3',
    angle: '10', vx: '0', vy: '0', omega: '0',
  };
  const r = applyProperties(m, id, values);
  assert.equal(r.ok, true, r.errors.join());
  const b = m.body(id);
  assert.deepEqual(b.params, { length: 4, section: { type: 'I', b: 0.06, h: 0.12, tf: 0.007, tw: 0.004 }, segments: 12, damping: 3 });
  close(b.angle, (10 * Math.PI) / 180, 1e-9);
  assert.deepEqual(m.scene.elements[0].point, [2, 0], 'the load stays at the end of the longer beam');

  applyProperties(m, id, { ...values, massMode: 'given', mass: '25' });
  assert.equal(m.body(id).params.mass, 25);
  applyProperties(m, id, { ...values, massMode: 'steel' });
  assert.equal('mass' in m.body(id).params, false, 'back to steel');
});

test('beam form: bad input is refused', () => {
  const m = new SceneModel();
  const id = m.addBeam({ start: [0, 0], end: [2, 0] });
  const ok = { length: '2', sectionType: 'square', sec_a: '50', massMode: 'steel', damping: '5', segments: '8', angle: '0', vx: '0', vy: '0', omega: '0' };
  assert.equal(applyProperties(m, id, { ...ok, segments: '1' }).ok, false);
  assert.equal(applyProperties(m, id, { ...ok, segments: '8.5' }).ok, false);
  assert.equal(applyProperties(m, id, { ...ok, segments: '99' }).ok, false);
  assert.equal(applyProperties(m, id, { ...ok, length: '0' }).ok, false);
  assert.equal(applyProperties(m, id, { ...ok, damping: '-1' }).ok, false);
  assert.equal(applyProperties(m, id, { ...ok, sec_a: '-3' }).ok, false);
  const t = applyProperties(m, id, { ...ok, sectionType: 'T', sec_b: '100', sec_h: '100', sec_tf: '100', sec_tw: '10' });
  assert.equal(t.ok, false);
  assert.match(t.errors.join(), /flange thickness/);
  assert.deepEqual(m.body(id).params.section, { type: 'square', a: 0.05 }, 'unchanged');
});

test('deleting a beam deletes what is attached to it', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('m1', 3, 0, 0.4, 0.2)] }));
  const id = m.addBeam({ start: [0, 0], end: [2, 0] });
  m.addLoad({ body: id, point: [0, 0], force: [0, -1] });
  m.addSupport('fixed_support', { body: id, point: [-1, 0] });
  assert.deepEqual(m.remove(id).sort(), ['E1', 'F1', 'b1'].sort());
  assert.deepEqual(m.scene.bodies.map((b) => b.id), ['m1']);
});

test('section drawing: one rectangle for the square, three for I / H, two for L / T', () => {
  const count = (s) => (sectionSvg(s).match(/<rect/g) || []).length;
  assert.equal(count({ type: 'square', a: 0.04 }), 1);
  assert.equal(count(defaultSection('I')), 3);
  assert.equal(count(defaultSection('H')), 3);
  assert.equal(count(defaultSection('T')), 2);
  assert.equal(count(defaultSection('L')), 2);
  assert.match(sectionSvg(defaultSection('T')), /aria-label="Cross section T"/);
});

// --- beam shape ---------------------------------------------------------------------------------------

test('a beam without frame nodes is drawn straight from its pose', () => {
  const spec = { params: { length: 2 } };
  const nodes = beamNodes(spec, { x: 1, y: 1, phi: Math.PI / 2 });
  closePoint(nodes[0], [1, 0]);
  closePoint(nodes[1], [1, 2]);
  assert.equal(nodes[0][2], Math.PI / 2);
  assert.deepEqual(beamNodes(spec, { x: 0, y: 0, phi: 0, nodes: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] }).length, 3);
});

test('exaggerate: factor 1 changes nothing; a bent beam is bent k times as much, rigid rotation is untouched', () => {
  const bent = [[0, 0, 0], [1, 0.01, 0.02], [2, 0.04, 0.04], [3, 0.09, 0.06]];
  assert.equal(exaggerate(bent, 1), bent);
  const k = exaggerate(bent, 10);
  // the chord (first to last node) stays; the offset from it grows by 10
  closePoint(k[0], bent[0]);
  closePoint(k[3], bent[3]);
  const chordAngle = Math.atan2(0.09, 3);
  const off = (n, p) => (p[1] * Math.cos(chordAngle) - p[0] * Math.sin(chordAngle)) * (n === 0 ? 1 : 1);
  close(off(0, k[1]) / off(0, bent[1]), 10, 1e-9);
  close(off(0, k[2]) / off(0, bent[2]), 10, 1e-9);
  // the same bent beam turned by 40 degrees: the exaggerated shape is turned the same way
  const a = 40 * Math.PI / 180;
  const turn = ([x, y, phi]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), phi + a];
  const k2 = exaggerate(bent.map(turn), 10);
  k.map(turn).forEach((p, i) => { closePoint(k2[i], p, 1e-9); close(k2[i][2], p[2], 1e-9); });
});

test('beamCurve passes through the nodes; the outline is half a depth either side of the axis', () => {
  const nodes = [[0, 0, 0], [1, 0.1, 0.3], [2, 0.3, 0.5]];
  const curve = beamCurve(nodes, 4);
  assert.equal(curve.length, 2 * 4 + 1);
  closePoint(curve[0], nodes[0]);
  closePoint(curve[4], nodes[1]);
  closePoint(curve[8], nodes[2]);
  const straight = beamCurve([[0, 0, 0], [2, 0, 0]], 4);
  const outline = beamOutline(straight, 0.03, 0.01);
  assert.equal(outline.length, 10);
  closePoint(outline[0], [0, 0.03]);
  closePoint(outline[4], [2, 0.03]);
  closePoint(outline[5], [2, -0.01]);
  closePoint(outline[9], [0, -0.01]);
  // a vertical beam: "up" is -x
  closePoint(beamOutline([[0, 0, Math.PI / 2], [0, 1, Math.PI / 2]], 0.02, 0.02)[0], [-0.02, 0]);
});

test('formatForce: sign shows tension / compression, units follow the size', () => {
  assert.equal(formatForce(12.34), '+12.3 N');
  assert.equal(formatForce(-250), '−250 N');
  assert.equal(formatForce(1500), '+1.50 kN');
  assert.equal(formatForce(-123456), '−123 kN');
});

// --- harmonic load ------------------------------------------------------------------------------------

test('a load becomes harmonic: frequency and phase appear, apply stores them, constant removes them', () => {
  const m = new SceneModel(sceneWith({ bodies: [block('m1', 0, 0, 0.4, 0.2)] }));
  m.addLoad({ body: 'm1', point: [0, 0], force: [0, 10] });
  let form = propertyFields(m, 'F1');
  assert.deepEqual(form.fields.map((f) => f.key), ['mode', 'fx', 'fy', 'moment']);
  assert.ok(form.fields[0].reshape);
  assert.deepEqual(form.fields[0].options.map(([v]) => v), ['constant', 'impulse', 'harmonic']);

  form = propertyFields(m, 'F1', { mode: 'harmonic' });
  assert.deepEqual(form.fields.map((f) => f.key), ['mode', 'fx', 'fy', 'moment', 'frequency', 'phase']);
  assert.match(form.info[0], /6\.283 rad\/s/);
  assert.equal(form.fields[1].label, 'Amplitude x');

  const values = { mode: 'harmonic', fx: '0', fy: '10', moment: '0', frequency: '2.5', phase: '90' };
  assert.equal(applyProperties(m, 'F1', values).ok, true);
  assert.deepEqual(m.find('F1').obj.params, { force: [0, 10], moment: 0, mode: 'harmonic', frequency: 2.5, phase: 1.570796327 }); // stored rounded to 1e-9
  assert.match(propertyFields(m, 'F1').title, /Harmonic/);

  assert.equal(applyProperties(m, 'F1', { ...values, frequency: '0' }).ok, false);
  assert.equal(applyProperties(m, 'F1', { ...values, mode: 'constant' }).ok, true);
  assert.deepEqual(m.find('F1').obj.params, { force: [0, 10], moment: 0, mode: 'constant' });
});
