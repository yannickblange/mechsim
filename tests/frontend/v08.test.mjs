// v0.8: curved surfaces (spline, half circle), the surface tool's menu, friction and bounce of a surface.
import assert from 'node:assert/strict';
import test from 'node:test';

import { closestOnSurface, isCurved, supportAngleAt, surfaceLength, surfacePath } from '../../frontend/js/editor/geometry.js';
import { hitTest, moveTarget } from '../../frontend/js/editor/hit.js';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { applyProperties, propertyFields } from '../../frontend/js/editor/properties.js';
import { contactOffset, moveSurface } from '../../frontend/js/editor/moves.js';
import { snapPoint, surfaceAtPoint } from '../../frontend/js/editor/snap.js';
import { MAX_SEGMENT, MAX_TURN, flipSurface, halfCircle, sampleSpline, surfaceFields, translateSurface } from '../../frontend/js/editor/surfaces.js';
import { block, click, close, closePoint, disc, drag, sceneWith, setup } from './helpers.mjs';

const turn = (a, b, c) => Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
  (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])));
const maxTurn = (pts) => Math.max(0, ...pts.slice(2).map((p, i) => turn(pts[i], pts[i + 1], p)));
const maxLen = (pts) => Math.max(...pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])));

// --- geometry ------------------------------------------------------------------------------------------

test('a spline passes through its control points and its polyline is fine enough for the engine', () => {
  const control = [[0, 0], [1, 0.5], [2, 0], [3, 1.2], [4, 0.2]];
  const pts = sampleSpline(control);
  closePoint(pts[0], control[0]);
  closePoint(pts[pts.length - 1], control[4]);
  for (const c of control) assert.ok(Math.min(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) < 1e-5, `passes through ${c}`);
  assert.ok(maxTurn(pts) <= MAX_TURN * 1.05, `turn ${maxTurn(pts)}`);
  assert.ok(maxLen(pts) <= MAX_SEGMENT * 1.01, `segment ${maxLen(pts)}`);
  // two points are a line
  assert.deepEqual(sampleSpline([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
});

test('a half circle: a bowl lies below its diameter and is run counter-clockwise (free side inside), a dome above, run clockwise', () => {
  const bowl = halfCircle([-1, 0], [1, 0], 'bowl');
  closePoint(bowl[0], [-1, 0]);
  closePoint(bowl[bowl.length - 1], [1, 0]);
  const lowest = bowl.reduce((a, p) => (p[1] < a[1] ? p : a));
  closePoint(lowest, [0, -1], 1e-4);
  for (const p of bowl) close(Math.hypot(p[0], p[1]), 1, 1e-5);
  assert.ok(maxTurn(bowl) <= MAX_TURN * 1.05);
  // the free side is on the left of the direction of travel: at the bottom the path runs to the right, and left is up
  const i = bowl.findIndex((p) => Math.abs(p[0]) < 0.01);
  assert.ok(bowl[i + 1][0] > bowl[i][0]);
  const dome = halfCircle([1, 0], [-1, 0], 'dome'); // drawn from the other end: the same dome
  const top = dome.reduce((a, p) => (p[1] > a[1] ? p : a));
  closePoint(top, [0, 1], 1e-4);
  closePoint(dome[0], [-1, 0]);
  const j = dome.findIndex((p) => Math.abs(p[0]) < 0.01);
  assert.ok(dome[j + 1][0] > dome[j][0]); // left to right over the top: the free side (left) is above it
  // a slanted diameter: the arc is still on the lower side
  const slanted = halfCircle([0, 0], [1, 1], 'bowl');
  const centre = [0.5, 0.5];
  const apex = slanted.reduce((a, p) => (p[1] < a[1] ? p : a));
  assert.ok(apex[1] < centre[1] - 0.2);
});

test('surface helpers: path, length, closest point, flip, translate', () => {
  const s = { id: 's', ...surfaceFields('arc', [[-1, 0], [1, 0]], 'bowl') };
  assert.ok(isCurved(s));
  assert.equal(surfacePath({ p1: [0, 0], p2: [1, 0] }).length, 2);
  close(surfaceLength(s), Math.PI, 2e-3);
  const r = Math.hypot(0.05, 1.2);
  const hit = closestOnSurface([0.05, -1.2], s); // the nearest point of a circle lies on the ray from its centre
  closePoint(hit.point, [0.05 / r, -1.2 / r], 2e-3);
  close(hit.dist, r - 1, 2e-3);
  const copy = JSON.parse(JSON.stringify(s));
  flipSurface(copy);
  closePoint(copy.p1, s.p2);
  closePoint(copy.points[0], s.points[s.points.length - 1]);
  translateSurface(copy, [1, 2]);
  closePoint(copy.p1, [s.p2[0] + 1, s.p2[1] + 2]);
  closePoint(copy.points[1], [s.points[s.points.length - 2][0] + 1, s.points[s.points.length - 2][1] + 2], 1e-5);
});

// --- model ---------------------------------------------------------------------------------------------

test('addCurve stores the polyline and the control points; friction and bounce are optional and default to 0', () => {
  const m = new SceneModel(sceneWith({}));
  const id = m.addCurve('spline', [[0, 0], [1, 0.5], [2, 0]]);
  const s = m.scene.surfaces.find((x) => x.id === id);
  assert.equal(s.shape, 'spline');
  assert.equal(s.control.length, 3);
  assert.ok(s.points.length > 20);
  closePoint(s.p1, [0, 0]);
  closePoint(s.p2, [2, 0]);
  const arc = m.addCurve('arc', [[-1, 0], [1, 0]], 'dome');
  assert.equal(m.scene.surfaces.find((x) => x.id === arc).shape, 'arc');
  const line = m.addCurve('spline', [[0, 0], [1, 1]]); // two points: a straight surface
  assert.equal(m.scene.surfaces.find((x) => x.id === line).points, undefined);

  m.updateSurface(id, { friction: 0.4, restitution: 0.5 });
  assert.equal(s.friction, 0.4);
  assert.equal(m.scene.surfaces.find((x) => x.id === id).restitution, 0.5);
  m.updateSurface(id, { friction: 0 });
  assert.equal(m.scene.surfaces.find((x) => x.id === id).friction, undefined);
  m.undo();
  assert.equal(m.scene.surfaces.find((x) => x.id === id).friction, 0.4);
});

test('the surface form: friction, bounce and flipping the solid side', () => {
  const m = new SceneModel(sceneWith({}));
  const id = m.addSurface([0, 0], [2, 0]);
  const form = propertyFields(m, id);
  assert.deepEqual(form.fields.map((f) => f.key), ['friction', 'restitution', 'side']);
  assert.match(form.info.join(' '), /Reibungszahl/);
  assert.equal(applyProperties(m, id, { friction: '0,35', restitution: '0,6', side: 'keep' }).ok, true);
  const s = m.scene.surfaces[0];
  assert.equal(s.friction, 0.35);
  assert.equal(s.restitution, 0.6);
  assert.deepEqual(s.p1, [0, 0]);
  assert.equal(applyProperties(m, id, { friction: '0,35', restitution: '0,6', side: 'flip' }).ok, true);
  assert.deepEqual(m.scene.surfaces[0].p1, [2, 0]); // run the other way
  // bad values are refused
  assert.equal(applyProperties(m, id, { friction: '-1', restitution: '0', side: 'keep' }).ok, false);
  assert.equal(applyProperties(m, id, { friction: '0', restitution: '1,5', side: 'keep' }).ok, false);
  // a curve says what it is
  const arc = m.addCurve('arc', [[-1, 3], [1, 3]], 'bowl');
  assert.match(propertyFields(m, arc).info[0], /Halbkreis/);
});

// --- the tool and its menu ---------------------------------------------------------------------------------

test('the surface tool has one menu: Gerade (default), Spline, two half circles; the choice is kept', () => {
  const { model, tools } = setup(sceneWith({}));
  const tool = tools.get('surface');
  assert.deepEqual(tool.menu.items.map((i) => i.id), ['line', 'spline', 'bowl', 'dome']);
  assert.equal(tool.menu.value, 'line');
  assert.equal(tools.get('rect').menu, null);
  drag(tool, [0, 0], [1, 0]);
  assert.equal(model.scene.surfaces.length, 1);
  assert.equal(model.scene.surfaces[0].points, undefined); // the regular straight surface, as before

  tool.setMenu('bowl');
  assert.equal(tool.menu.value, 'bowl');
  assert.match(tool.hint, /Durchmesser/);
  drag(tool, [-1, 2], [1, 2]);
  const bowl = model.scene.surfaces[1];
  assert.equal(bowl.shape, 'arc');
  const lowest = bowl.points.reduce((a, p) => (p[1] < a[1] ? p : a));
  closePoint(lowest, [0, 1], 1e-3);

  tool.setMenu('dome');
  drag(tool, [3, 0], [5, 0]);
  const dome = model.scene.surfaces[2];
  assert.ok(Math.max(...dome.points.map((p) => p[1])) > 0.99);
  assert.equal(tool.menu.value, 'dome'); // kept after drawing
  // an unknown entry is ignored
  tool.setMenu('wave');
  assert.equal(tool.menu.value, 'dome');
});

test('half circle preview shows the arc while the diameter is dragged', () => {
  const { tools } = setup(sceneWith({}));
  const tool = tools.get('surface');
  tool.setMenu('bowl');
  tool.move({ world: [0, 0] });
  tool.down({ world: [0, 0] });
  tool.move({ world: [2, 0] });
  const pv = tool.preview;
  assert.equal(pv.type, 'surface');
  assert.ok(pv.points.length > 100);
  assert.match(pv.label, /r = 1,00 m/);
});

test('spline: click the points, a second click on the last point or Enter finishes, Escape cancels', () => {
  const { model, tools } = setup(sceneWith({}));
  const tool = tools.get('surface');
  tool.setMenu('spline');
  click(tool, [0, 0]);
  click(tool, [1, 0.5]);
  click(tool, [2, 0]);
  assert.equal(model.scene.surfaces.length, 0);
  const pv = tool.preview;
  assert.equal(pv.handles.length, 3);
  assert.ok(pv.points.length > 20);
  click(tool, [2, 0]); // on the last point again: done
  assert.equal(model.scene.surfaces.length, 1);
  const s = model.scene.surfaces[0];
  assert.equal(s.shape, 'spline');
  assert.equal(s.control.length, 3);
  closePoint(s.p1, [0, 0]);
  closePoint(s.p2, [2, 0]);

  click(tool, [0, 3]);
  click(tool, [1, 3.5]);
  click(tool, [2, 3]);
  assert.equal(tool.key('Enter'), true);
  assert.equal(model.scene.surfaces.length, 2);

  click(tool, [0, 5]);
  click(tool, [1, 5]);
  assert.equal(tool.key('Escape'), true);
  assert.equal(model.scene.surfaces.length, 2);
  assert.equal(tool.preview, null);

  // one point is not a surface
  click(tool, [0, 6]);
  tool.key('Enter');
  assert.equal(model.scene.surfaces.length, 2);
  assert.match(tool.error, /mindestens zwei/);
});

test('switching the shape while drawing drops the unfinished surface', () => {
  const { model, tools } = setup(sceneWith({}));
  const tool = tools.get('surface');
  tool.setMenu('spline');
  click(tool, [0, 0]);
  click(tool, [1, 1]);
  tool.setMenu('line');
  assert.equal(tool.preview, null);
  assert.equal(model.scene.surfaces.length, 0);
});

// --- the rest of the editor knows curved surfaces ----------------------------------------------------------------

const bowlScene = () => {
  const m = new SceneModel(sceneWith({}));
  const id = m.addCurve('arc', [[-1, 0], [1, 0]], 'bowl');
  return { m, id };
};

test('hit test, snapping and the surface lookup follow the curve, not its chord', () => {
  const { m, id } = bowlScene();
  const scale = 400;
  assert.deepEqual(hitTest(m.scene, [0, -1], scale), { kind: 'surface', id }); // the bottom of the bowl: far from the chord
  assert.equal(hitTest(m.scene, [0, -0.5], scale), null); // the middle between curve and chord
  assert.equal(moveTarget(m.scene, [0, -1], scale).id, id);
  const s = snapPoint([0.3, -0.96], m.scene, { scale, surfaces: true });
  assert.equal(s.surface, id);
  close(Math.hypot(s.point[0], s.point[1]), 1, 2e-3);
  assert.equal(surfaceAtPoint(m.scene, [0, -1]).id, id);
  assert.equal(surfaceAtPoint(m.scene, [0, -0.5]), null);
});

test('a support on a curved surface takes the direction of the surface where it sits', () => {
  const { m } = bowlScene();
  const s = m.scene.surfaces[0];
  // at the bottom of the bowl the surface runs to the right: a body above it has the angle 0 (like a floor)
  const bottom = supportAngleAt(s, [0, -1], [0, -0.9]);
  close(bottom, 0, 0.03);
  // on the right wall (x = 0.7) the surface climbs: the angle is positive, and a body to its left (inside) keeps it
  const y = -Math.sqrt(1 - 0.49);
  const wall = supportAngleAt(s, [0.7, y], [0.6, y + 0.05]);
  close(wall, Math.atan2(0.7, Math.sqrt(1 - 0.49)), 0.05);
});

test('dragging a mass lands it on a curve; moving the surface moves its points and control points', () => {
  const { m, id } = bowlScene();
  m.scene.bodies.push(disc('d', 0, -0.85, 0.1));
  // the lowest point of the disc is 0.05 above the bowl: within reach, it lands on it
  const off = contactOffset(m.scene, 'd', [0, 0], 0.06);
  close(off[1], -0.05, 2e-3);
  moveSurface(m.scene, id, [1, 2], 0.01);
  const s = m.scene.surfaces[0];
  closePoint(s.p1, [0, 2]);
  closePoint(s.points[90], [1, 1], 1e-3);
  closePoint(s.control[0], [0, 2]);
});
