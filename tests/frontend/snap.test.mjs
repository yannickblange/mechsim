import assert from 'node:assert/strict';
import test from 'node:test';
import { gridStepFor, snapPoint, surfaceNear } from '../../frontend/js/editor/snap.js';
import { block, closePoint, disc, sceneWith } from './helpers.mjs';

test('grid step grows when zooming out and stays >= 14 px', () => {
  assert.equal(gridStepFor(400), 0.05);
  assert.equal(gridStepFor(200), 0.1);
  assert.equal(gridStepFor(100), 0.25);
  for (const s of [5, 12, 37, 100, 333, 2000, 5000]) assert.ok(gridStepFor(s) * s >= 14 - 1e-9, `scale ${s}`);
});

test('free space snaps to the grid', () => {
  const r = snapPoint([0.512, 0.239], sceneWith({}), { scale: 400 });
  assert.equal(r.kind, 'grid');
  closePoint(r.point, [0.5, 0.25]);
  assert.equal(r.body, null);
  const raw = snapPoint([0.512, 0.239], sceneWith({}), { scale: 400, grid: false });
  assert.equal(raw.kind, 'free');
  closePoint(raw.point, [0.512, 0.239]);
});

test('corners, centre and edge midpoints of a block are snap points', () => {
  const scene = sceneWith({ bodies: [block('m1', 1, 1, 0.4, 0.2)] });
  const opts = { scale: 400 };
  let r = snapPoint([1.205, 1.103], scene, opts);
  assert.equal(r.kind, 'corner');
  closePoint(r.point, [1.2, 1.1]);
  closePoint(r.local, [0.2, 0.1]);
  assert.equal(r.body, 'm1');

  r = snapPoint([1.01, 0.99], scene, opts);
  assert.equal(r.kind, 'center');
  closePoint(r.local, [0, 0]);

  r = snapPoint([1.0, 1.108], scene, opts);
  assert.equal(r.kind, 'edge-mid');
  closePoint(r.local, [0, 0.1]);
});

test('anywhere on an edge snaps to the edge; further away than the tolerance does not', () => {
  const scene = sceneWith({ bodies: [block('m1', 0, 0, 1, 0.2)] });
  let r = snapPoint([0.3, 0.103], scene, { scale: 400 });
  assert.equal(r.kind, 'edge');
  closePoint(r.point, [0.3, 0.1], 1e-9);
  r = snapPoint([0.3, 0.2], scene, { scale: 400 });
  assert.notEqual(r.body, 'm1', '0.1 m away is far outside the 10 px tolerance');
});

test('the pixel tolerance is the same at every zoom level', () => {
  const scene = sceneWith({ bodies: [block('m1', 0, 0, 1, 1)] });
  // 8 px away from the corner at (0.5, 0.5)
  for (const scale of [100, 400, 1600]) {
    const r = snapPoint([0.5 + 8 / scale, 0.5], scene, { scale });
    assert.equal(r.kind, 'corner', `scale ${scale}`);
  }
  assert.notEqual(snapPoint([0.5 + 14 / 400, 0.5], scene, { scale: 400 }).kind, 'corner');
});

test('disc: centre and the four axis points', () => {
  const scene = sceneWith({ bodies: [disc('d1', 0, 0, 0.5)] });
  assert.equal(snapPoint([0.003, 0.003], scene, { scale: 400 }).kind, 'center');
  const r = snapPoint([0.503, 0.002], scene, { scale: 400 });
  assert.equal(r.kind, 'corner');
  closePoint(r.local, [0.5, 0]);
});

test('interior points are body points only when asked', () => {
  const scene = sceneWith({ bodies: [block('m1', 0, 0, 1, 1)] });
  assert.equal(snapPoint([0.23, 0.17], scene, { scale: 400 }).body, null);
  const r = snapPoint([0.23, 0.17], scene, { scale: 400, interior: true });
  assert.equal(r.kind, 'inside');
  assert.equal(r.body, 'm1');
  closePoint(r.point, [0.25, 0.15]);
  closePoint(r.local, [0.25, 0.15]);
});

test('the topmost body wins in the interior; excluded bodies are ignored', () => {
  const scene = sceneWith({ bodies: [block('low', 0, 0, 2, 2), block('high', 0, 0, 1, 1)] });
  assert.equal(snapPoint([0.2, 0.2], scene, { scale: 400, interior: true }).body, 'high');
  assert.equal(snapPoint([0.2, 0.2], scene, { scale: 400, interior: true, exclude: ['high'] }).body, 'low');
});

test('surface end points beat the surface line; both need surfaces: true', () => {
  const scene = sceneWith({ surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }] });
  const opts = { scale: 400, surfaces: true };
  let r = snapPoint([0.01, 0.01], scene, opts);
  assert.equal(r.kind, 'surface-end');
  assert.equal(r.surface, 's1');
  closePoint(r.point, [0, 0]);

  r = snapPoint([1.0, 0.012], scene, opts);
  assert.equal(r.kind, 'surface');
  closePoint(r.point, [1, 0]);

  assert.equal(snapPoint([1.0, 0.012], scene, { scale: 400 }).kind, 'grid');
});

test('body features win over surfaces', () => {
  const scene = sceneWith({
    bodies: [block('m1', 0.5, 0.1, 0.4, 0.2)],
    surfaces: [{ id: 's1', p1: [0, 0], p2: [2, 0] }],
  });
  const r = snapPoint([0.31, 0.005], scene, { scale: 400, surfaces: true });
  assert.equal(r.kind, 'corner');
  assert.equal(r.body, 'm1');
});

test('surfaceNear finds the closest surface within the tolerance', () => {
  const surfaces = [{ id: 'a', p1: [0, 0], p2: [2, 0] }, { id: 'b', p1: [0, 0.01], p2: [2, 0.01] }];
  assert.equal(surfaceNear([1, 0.008], surfaces, 400).id, 'b');
  assert.equal(surfaceNear([1, 0.5], surfaces, 400), null);
  assert.equal(surfaceNear([1, 0], [], 400), null);
});
