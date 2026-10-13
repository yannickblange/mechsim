import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Recorder, MAX_SAMPLES } from '../../frontend/js/graphs/recorder.js';
import { envelope, extent, formatTick, lengthUnit, lowerBound, niceTicks } from '../../frontend/js/graphs/plot.js';
import { AppState } from '../../frontend/js/state.js';
import { close } from './helpers.mjs';

const frame = (t, bodies) => ({
  type: 'frame',
  data: { t, bodies: bodies.map(([id, x, y, phi]) => ({ id, x, y, phi, vx: 0, vy: 0, omega: 0 })), elements: [], constraints: [], energy: {} },
});

test('a frame without a trace is one sample; the first pose is the reference', () => {
  const r = new Recorder();
  r.ingest(frame(0, [['m1', 1, 2, 0.5]]));
  r.ingest(frame(0.1, [['m1', 1.25, 1.5, 0.75]]));
  const d = r.displacement('m1');
  assert.deepEqual(d.t, [0, 0.1]);
  close(d.ux[1], 0.25);
  close(d.uy[1], -0.5);
  close(d.umag[1], Math.hypot(0.25, 0.5));
  close(d.rot[1], 0.25);
  assert.equal(r.displacement('nope'), null);
});

test('a trace gives every engine step, not only the display frame', () => {
  const r = new Recorder();
  r.ingest(frame(0, [['a', 0, 0, 0], ['b', 5, 5, 0]]));
  const msg = frame(0.003, [['a', 3, 0, 0], ['b', 5, 5, 0]]);
  msg.trace = { ids: ['a', 'b'], t: [0.001, 0.002, 0.003], q: [[1, 0, 0, 5, 5, 0], [2, 0, 0, 5, 5, 0], [3, 0, 0, 5, 5, 0]] };
  r.ingest(msg);
  assert.deepEqual(r.t, [0, 0.001, 0.002, 0.003]);
  assert.deepEqual(r.displacement('a').ux, [0, 1, 2, 3]);
  assert.deepEqual(r.displacement('b').ux, [0, 0, 0, 0]);
});

test('a rewind (reset) starts a new recording; a repeated frame adds nothing', () => {
  const r = new Recorder();
  r.ingest(frame(0, [['m', 0, 0, 0]]));
  r.ingest(frame(1, [['m', 1, 0, 0]]));
  r.ingest(frame(1, [['m', 1, 0, 0]]));
  assert.equal(r.t.length, 2);
  r.ingest(frame(0, [['m', 0, 0, 0]]));
  assert.deepEqual(r.t, [0]);
  r.ingest(frame(0.5, [['m', 0.2, 0, 0]]));
  assert.deepEqual(r.displacement('m').ux, [0, 0.2]);
});

test('a new scene clears the recording', () => {
  const r = new Recorder();
  r.bindScene(1);
  r.ingest(frame(0, [['m', 0, 0, 0]]));
  r.ingest(frame(0.5, [['m', 1, 0, 0]]));
  r.bindScene(1);
  assert.equal(r.t.length, 2);
  r.bindScene(2);
  assert.equal(r.t.length, 0);
  assert.equal(r.has('m'), false);
});

test('the history is bounded and keeps the reference pose', () => {
  const r = new Recorder();
  r.ingest(frame(0, [['m', 10, 0, 0]]));
  for (let i = 1; i <= MAX_SAMPLES; i++) r.ingest(frame(i * 1e-3, [['m', 10 + i, 0, 0]]));
  assert.ok(r.t.length <= MAX_SAMPLES);
  assert.ok(r.t.length > MAX_SAMPLES / 2);
  const d = r.displacement('m');
  assert.equal(d.t.length, d.ux.length);
  close(d.ux[d.ux.length - 1], MAX_SAMPLES); // still measured from the pose at t = 0
});

test('AppState hands frame messages and traces to listeners and counts scenes', () => {
  const s = new AppState();
  const seen = [];
  const off = s.onFrame((m) => seen.push(m));
  const msg = frame(0.1, [['m', 0, 0, 0]]);
  msg.trace = { ids: ['m'], t: [0.1], q: [[0, 0, 0]] };
  s.applyMessage(msg);
  s.applyMessage({ type: 'status', running: true, speed: 1, mode: 'native' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].trace.t[0], 0.1);
  const v = s.sceneVersion;
  s.setScene('x', { bodies: [] });
  assert.equal(s.sceneVersion, v + 1);
  off();
  s.applyMessage(msg);
  assert.equal(seen.length, 1);
});

test('niceTicks: 1, 2, 5 steps that cover the range', () => {
  const { ticks, step } = niceTicks(0, 1, 5);
  assert.equal(step, 0.2);
  assert.deepEqual(ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
  const t = niceTicks(-3.2, 7.9, 5);
  assert.equal(t.step, 2);
  assert.deepEqual(t.ticks, [-2, 0, 2, 4, 6]);
  const flat = niceTicks(2, 2, 5); // a constant signal still gets an axis
  assert.ok(flat.ticks.length >= 2 && flat.ticks[0] < 2 && flat.ticks.at(-1) > 2);
  assert.equal(niceTicks(0, 0.0003, 3).step, 0.0001);
});

test('formatTick uses the decimals the step needs; units switch to mm for small motion', () => {
  assert.equal(formatTick(0.4, 0.2), '0,4');
  assert.equal(formatTick(5, 5), '5');
  assert.equal(formatTick(0.0002, 0.0001), '0,0002');
  assert.equal(formatTick(1e-12, 0.1), '0,0');
  assert.deepEqual(lengthUnit(0.004), { name: 'mm', factor: 1000 });
  assert.deepEqual(lengthUnit(0.3), { name: 'm', factor: 1 });
  assert.deepEqual(lengthUnit(0), { name: 'm', factor: 1 });
});

test('lowerBound and extent', () => {
  const t = [0, 1, 2, 3, 4];
  assert.equal(lowerBound(t, -1), 0);
  assert.equal(lowerBound(t, 2), 2);
  assert.equal(lowerBound(t, 2.5), 3);
  assert.equal(lowerBound(t, 9), 5);
  assert.deepEqual(extent([3, -1, 7, 2]), [-1, 7]);
  assert.deepEqual(extent([3, -1, 7, 2], 2), [2, 7]);
  assert.equal(extent([]), null);
});

test('envelope: few samples are drawn as they are, many collapse to one min/max column per pixel', () => {
  const t = [0, 1, 2, 3];
  const raw = envelope(t, [0, 5, -5, 1], 0, 3, 300);
  assert.deepEqual(raw.map((c) => c.hi), [0, 5, -5, 1]);
  assert.deepEqual(raw.map((c) => Math.round(c.x)), [0, 100, 200, 300]);

  // 100 000 samples of a fast oscillation on a 200 px plot: no spike may be lost
  const n = 100000;
  const tt = Array.from({ length: n }, (_, i) => i * 1e-4);
  const v = tt.map((x) => Math.sin(2 * Math.PI * 50 * x));
  v[54321] = 3; // a single spike
  const cols = envelope(tt, v, 0, tt[n - 1], 200);
  assert.ok(cols.length <= 201);
  assert.equal(Math.max(...cols.map((c) => c.hi)), 3);
  assert.ok(Math.min(...cols.map((c) => c.lo)) <= -0.999);
  assert.ok(cols.every((c, i) => i === 0 || c.x > cols[i - 1].x));
});
