import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockCorners, bodyFeaturePoints, bodyToWorld, closestOnSegment, nearestOnOutline, nextId,
  normalizeAngle, pointInBody, rectFromCorners, snapAngles, snapDirection, snapSegmentEnd,
  supportAngle, surfaceAngle, tidy, worldToLocal,
} from '../../frontend/js/editor/geometry.js';
import { slugify } from '../../frontend/js/editor/names.js';
import { block, close, closePoint, disc } from './helpers.mjs';

const deg = (d) => (d * Math.PI) / 180;

test('the snap angles are 0, 30, 45, 60, 90 degrees and their mirror images', () => {
  const angles = snapAngles().map((a) => Math.round((a * 180) / Math.PI)).sort((a, b) => a - b);
  assert.deepEqual(angles, [-150, -135, -120, -90, -60, -45, -30, 0, 30, 45, 60, 90, 120, 135, 150, 180]);
});

test('snapDirection picks the nearest allowed angle in every quadrant', () => {
  const cases = [
    [[1, 0.1], 0], [[1, 0.6], 30], [[1, 0.45], 30], [[1, 1.1], 45], [[1, 1.9], 60], [[0.1, 1], 90],
    [[-1, 1.05], 135], [[-1, 0.02], 180], [[-0.2, -1], -90], [[1, -0.55], -30], [[-1, -1.8], -120],
  ];
  for (const [[dx, dy], expectedDeg] of cases) {
    close(snapDirection(dx, dy), deg(expectedDeg), 1e-12, `(${dx}, ${dy}) -> ${expectedDeg}`);
  }
});

test('snapSegmentEnd snaps the direction and rounds the length to the step', () => {
  const end = snapSegmentEnd([0, 0], [1.02, 0.57], { step: 0.05 });
  const len = Math.hypot(end[0], end[1]);
  close(Math.atan2(end[1], end[0]), deg(30), 1e-6);
  close(len, 1.15, 1e-6);
  assert.deepEqual(snapSegmentEnd([1, 1], [1, 1]), [1, 1], 'no movement, no change');
  const tiny = snapSegmentEnd([0, 0], [0.01, 0.002], { step: 0.05 });
  close(Math.hypot(...tiny), 0.05, 1e-9, 'never shorter than one step');
});

test('normalizeAngle wraps into (-pi, pi]', () => {
  close(normalizeAngle(3 * Math.PI), Math.PI);
  close(normalizeAngle(-Math.PI), Math.PI);
  close(normalizeAngle(2 * Math.PI + 0.3), 0.3);
  close(normalizeAngle(-3.5), -3.5 + 2 * Math.PI);
});

test('closestOnSegment clamps to the end points', () => {
  const a = [0, 0];
  const b = [2, 0];
  assert.deepEqual(closestOnSegment([1, 1], a, b).point, [1, 0]);
  close(closestOnSegment([1, 1], a, b).dist, 1);
  assert.deepEqual(closestOnSegment([-3, 1], a, b).point, [0, 0]);
  assert.deepEqual(closestOnSegment([5, -1], a, b).point, [2, 0]);
  assert.equal(closestOnSegment([1, 1], a, a).t, 0, 'degenerate segment');
});

test('world <-> local conversion respects the body angle', () => {
  const b = block('m', 1, 2, 0.4, 0.2, { angle: Math.PI / 2 });
  closePoint(bodyToWorld(b, [0.2, 0]), [1, 2.2]);
  closePoint(worldToLocal(b, [1, 2.2]), [0.2, 0]);
});

test('pointInBody for rotated blocks and discs', () => {
  const b = block('m', 0, 0, 1, 0.2, { angle: Math.PI / 2 }); // now 0.2 wide and 1 tall
  assert.ok(pointInBody(b, [0, 0.45]));
  assert.ok(!pointInBody(b, [0.45, 0]));
  const d = disc('d', 1, 1, 0.5);
  assert.ok(pointInBody(d, [1.3, 1.3]));
  assert.ok(!pointInBody(d, [1.4, 1.4]));
});

test('nearestOnOutline: block edge and disc rim', () => {
  const b = block('m', 0, 0, 1, 1);
  const o = nearestOnOutline(b, [0.2, 0.7]);
  closePoint(o.world, [0.2, 0.5]);
  close(o.dist, 0.2);
  const d = nearestOnOutline(disc('d', 0, 0, 1), [3, 0]);
  closePoint(d.world, [1, 0]);
  close(d.dist, 2);
});

test('feature points: centre, 4 corners, 4 edge midpoints on a block; centre + 4 on a disc', () => {
  const kinds = (b) => bodyFeaturePoints(b).map((f) => f.kind);
  assert.deepEqual(kinds(block('m', 0, 0, 1, 1)), ['center', ...Array(4).fill('corner'), ...Array(4).fill('edge-mid')]);
  assert.deepEqual(kinds(disc('d', 0, 0, 1)), ['center', ...Array(4).fill('corner')]);
  assert.equal(blockCorners(block('m', 0, 0, 2, 1)).length, 4);
});

test('rectFromCorners works in any drag direction', () => {
  for (const [p1, p2] of [[[0, 0], [2, 1]], [[2, 1], [0, 0]], [[0, 1], [2, 0]], [[2, 0], [0, 1]]]) {
    const r = rectFromCorners(p1, p2);
    assert.deepEqual(r, { center: [1, 0.5], width: 2, height: 1 });
  }
});

test('supportAngle: the body lies on the left of the surface direction', () => {
  const floor = { p1: [0, 0], p2: [2, 0] };
  close(supportAngle(floor, [1, 0.5]), 0);
  close(supportAngle(floor, [1, -0.5]), Math.PI);
  const ceiling = { p1: [1, 0], p2: [-1, 0] };
  close(supportAngle(ceiling, [0, -0.5]), Math.PI);
  close(supportAngle(ceiling, [0, 0.5]), 0);
  const wall = { p1: [0, 1.2], p2: [0, -0.4] }; // drawn downwards, body to the right
  close(supportAngle(wall, [0.6, 0.5]), -Math.PI / 2);
  close(surfaceAngle({ p1: [0, 0], p2: [1, 1] }), Math.PI / 4);
});

test('nextId fills gaps and never reuses an id', () => {
  assert.equal(nextId('m', []), 'm1');
  assert.equal(nextId('m', ['m1', 'm2', 'k1']), 'm3');
  assert.equal(nextId('m', ['m2']), 'm1');
});

test('tidy removes floating point noise', () => {
  assert.equal(tidy(0.1 + 0.2), 0.3);
  assert.equal(tidy(1 / 3), 0.333333333);
});

test('slugify produces names the server accepts', () => {
  assert.equal(slugify('My first layout!'), 'My_first_layout');
  assert.equal(slugify('  ../../etc/passwd '), 'etc_passwd');
  assert.equal(slugify('Ünïcode ß'), 'n_code');
  assert.equal(slugify('   '), 'layout');
  assert.equal(slugify('a'.repeat(100)).length, 64);
  assert.match(slugify('ok-name_1'), /^[A-Za-z0-9_-]+$/);
});

import { supportAngleAt } from '../../frontend/js/editor/geometry.js';

test('supportAngleAt: a point that is clearly off the surface decides the side; a touching one does not', () => {
  const floor0 = { p1: [0, 0], p2: [2, 0] };
  close(supportAngleAt(floor0, [1, 0.5], [1, 0.6]), 0);
  close(supportAngleAt(floor0, [1, -0.5], [1, 0.6]), Math.PI, 1e-12, 'the point is below: the body side is below');
  // touching up to 0.1 mm of noise: the body centre decides
  close(supportAngleAt(floor0, [1, -1e-4], [1, 0.6]), 0);
  close(supportAngleAt(floor0, [1, 0.004], [1, -0.6]), Math.PI, 1e-12);
});
