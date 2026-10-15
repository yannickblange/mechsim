// v0.9: the analysis window's parameters, texts and chart models (the fixtures are real answers of /api/analysis:
// regenerate with the script in docs/tickets/v0.9/notes.md when the answer changes).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { criticalText, eigenvalueText, gaugePosition, modeTitle, overview, resonanceText, shapeText, sig, zoneOf } from '../../frontend/js/analysis/describe.js';
import { dofSeries, energyModel, frfModels, phaseModel, poleModel, rangeOf, timeModel } from '../../frontend/js/analysis/models.js';
import {
  addExcitation, applyParameter, criticalTargets, fromSlider, initialOffsets, labelOf, parametersOf, removeExcitation, setLabel, toSlider,
} from '../../frontend/js/analysis/params.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/analysis.json', import.meta.url), 'utf8'));
const scene = JSON.parse(fs.readFileSync(new URL('../../scenes/free_vibration.json', import.meta.url), 'utf8'));
const forcedScene = JSON.parse(fs.readFileSync(new URL('../../scenes/forced_vibration.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// --- parameters ----------------------------------------------------------------------------------------------

test('the parameters of a scene: masses, springs, dampers, loads and the start, with slider ranges', () => {
  const ps = parametersOf(scene, fx.free);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p]));
  assert.deepEqual(ps.map((p) => p.group).filter((g, i, a) => a.indexOf(g) === i), ['Massen', 'Federn', 'Dämpfer', 'Anfang']);
  assert.equal(byId['mass:mass'].value, 1);
  assert.equal(byId['mass:mass'].unit, 'kg');
  close(byId['k:spring'].value, 4 * Math.PI ** 2, 1e-6);
  // a mass or a spring slides over 0.1 to 10 times its value (logarithmic), a damper from 0 to 2.5 times the critical value (D from 0 to 2.5)
  close(byId['mass:mass'].lo, 0.1); close(byId['mass:mass'].hi, 10);
  assert.equal(byId['c:damper'].lo, 0);
  close(byId['c:damper'].hi, 2.5 * fx.free.single.c_crit, 1e-9);
  // the start: the deflection from the rest position of the analysis, the velocity of the scene
  assert.ok(byId['u0:mass:x'].symbol === 'u₀' && Math.abs(byId['u0:mass:x'].value - 0.04) < 1e-9);
  assert.equal(byId['v0:mass:x'].value, 0);
  assert.equal(ps.find((p) => p.id.startsWith('u0:') && p.id.endsWith(':phi')), undefined); // translations only
});

test('harmonic loads give an amplitude and a frequency', () => {
  const ps = parametersOf(forcedScene, fx.forced);
  const f = ps.find((p) => p.id === 'F:force');
  const hz = ps.find((p) => p.id === 'f:force');
  assert.deepEqual([f.group, f.value, f.unit], ['Erregung', 4, 'N']);
  assert.deepEqual([hz.value, hz.unit], [0.9, 'Hz']);
});

test('applying a parameter changes the copy only; the amplitude keeps the direction of the force; u0 becomes an offset', () => {
  const state = { scene: clone(forcedScene), offsets: null };
  const ps = parametersOf(state.scene, fx.forced);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p]));
  applyParameter(state, byId['mass:mass'], 2.5);
  applyParameter(state, byId['k:spring'], 100);
  applyParameter(state, byId['c:damper'], 3);
  applyParameter(state, byId['f:force'], 1.2);
  applyParameter(state, byId['F:force'], 6);
  const [load] = state.scene.elements.filter((e) => e.type === 'load');
  assert.equal(state.scene.bodies[0].params.mass, 2.5);
  assert.equal(state.scene.elements.find((e) => e.type === 'spring').params.k, 100);
  assert.equal(state.scene.elements.find((e) => e.type === 'damper').params.c, 3);
  assert.equal(load.params.frequency, 1.2);
  assert.deepEqual(load.params.force, [6, 0]);
  assert.equal(forcedScene.bodies[0].params.mass, 1); // the original is untouched

  state.offsets = initialOffsets(fx.forced);
  const u0 = parametersOf(state.scene, fx.forced).find((p) => p.id === 'u0:mass:x');
  applyParameter(state, u0, -0.03);
  assert.equal(state.offsets.mass.x, -0.03);
  const v0 = parametersOf(state.scene, fx.forced).find((p) => p.id === 'v0:mass:x');
  applyParameter(state, v0, 0.4);
  assert.deepEqual(state.scene.bodies[0].velocity, [0.4, 0]);
});

test('names (labels) are set and removed, and used instead of the id', () => {
  const s = clone(scene);
  assert.equal(labelOf(s, 'mass'), 'mass');
  setLabel(s, 'mass', '  Masse m  ');
  setLabel(s, 'spring', 'Feder k');
  assert.equal(labelOf(s, 'mass'), 'Masse m');
  assert.equal(s.elements[0].label, 'Feder k');
  setLabel(s, 'mass', '');
  assert.equal(s.bodies[0].label, undefined);
  setLabel(s, 'mass', 'x'.repeat(60));
  assert.equal(s.bodies[0].label.length, 40); // the scene format allows 40 characters
  assert.equal(parametersOf(s, null).find((p) => p.id === 'k:spring').objId, 'spring');
});

test('sliders: logarithmic from 0.1 to 10 times, linear for the others, both ways', () => {
  const p = { log: true, lo: 0.1, hi: 10 };
  assert.equal(toSlider(p, 1), 500);
  close(fromSlider(p, 500), 1, 1e-9);
  close(fromSlider(p, 0), 0.1); close(fromSlider(p, 1000), 10);
  const c = { log: false, lo: 0, hi: 5 };
  assert.equal(toSlider(c, 2.5), 500);
  close(fromSlider(c, 200), 1);
  assert.equal(toSlider(c, 99), 1000); // beyond the range: the end of the slider
});

test('an excitation can be added (first mass, along x, at the first natural frequency) and removed', () => {
  const s = clone(scene);
  const id = addExcitation(s, fx.free.modes[0].f0);
  const load = s.elements.find((e) => e.id === id);
  assert.deepEqual([load.body, load.params.mode, load.params.force], ['mass', 'harmonic', [1, 0]]);
  close(load.params.frequency, 1.0, 1e-3);
  assert.equal(addExcitation(s, 2), 'F2');
  removeExcitation(s);
  assert.equal(s.elements.filter((e) => e.type === 'load').length, 0);
});

// --- describe ------------------------------------------------------------------------------------------------

test('the damping ratio in words: how far from the aperiodic limit case', () => {
  const m = fx.free.modes[0];
  assert.equal(zoneOf(m).key, 'under');
  assert.match(criticalText(m), /10,0 % der kritischen Dämpfung/);
  assert.match(criticalText(m), /Faktor 10,0/);
  assert.equal(zoneOf(fx.over.modes[0]).key, 'over');
  assert.match(criticalText(fx.over.modes[0]), /150 % der kritischen Dämpfung/);
  assert.match(criticalText(fx.over.modes[0]), /überkritisch|über dem Grenzfall/);
  assert.equal(gaugePosition(0), 0); assert.equal(gaugePosition(1), 0.5); assert.equal(gaugePosition(2.7), 1);
  assert.match(criticalText({ zeta: 0, kind: 'ungedämpft' }), /Keine Dämpfung/);
  assert.equal(zoneOf({ kind: 'ungedämpft' }).key, 'undamped');
  assert.equal(zoneOf({ kind: 'aperiodischer Grenzfall' }).key, 'critical');
  assert.equal(zoneOf({ kind: 'instabil' }).key, 'unstable');
});

test('eigenvalues, mode titles, shapes and the overview', () => {
  const m = fx.free.modes[0];
  assert.equal(eigenvalueText(m), 'λ₁,₂ = −0,628 ± 6,25 i s⁻¹');
  assert.equal(modeTitle(m, 1), 'Mode 1: f₀ = 1,00 Hz, D = 0,10');
  assert.match(overview(fx.free), /Ein Freiheitsgrad: m = 1,00 kg, c = 1,26 N·s\/m, k = 39,5 N\/m; kritische Dämpfung c_krit = 2√\(k·m\) = 12,6 N·s\/m/);
  assert.equal(overview(fx.unsupported), fx.unsupported.reason);
  assert.match(overview(fx.chain), /6 Freiheitsgrade, 6 Eigenformen/);
  assert.match(shapeText(fx.chain.modes[2]), /y\(m1\) 0,52|y\(m2\)/);
  assert.equal(eigenvalueText(fx.over.modes[0]).startsWith('λ₁ = '), true);
  assert.equal(sig(0.000123), '1,23·10⁻⁴');
  assert.equal(sig(0.0123), '0,0123');
  assert.equal(sig(12345.6, 3), '12300');
  assert.equal(sig(0), '0');
});

test('the resonance sentence: distance to resonance and magnification', () => {
  const [load] = fx.forced.loads;
  assert.match(resonanceText(load), /η = Ω\/ω₀ = 0,900: nahe der Resonanz, Vergrößerung V = 3,82/);
  assert.match(resonanceText({ ...load, eta: 1.01 }), /in der Resonanz/);
  assert.match(resonanceText({ ...load, eta: 2 }), /überkritisch erregt/);
  assert.match(resonanceText({ ...load, eta: 0.3 }), /unter der Resonanz/);
});

// --- chart models --------------------------------------------------------------------------------------------

const run = (name) => ({ analysis: fx[name], response: fx[name].response });
const dof = { body: 'mass', axis: 'x' };

test('the deflection series starts at the offset from the rest position and carries the envelope of a damped vibration', () => {
  const s = dofSeries(run('free'), dof);
  close(s.u[0], 0.04, 1e-9);
  const m = timeModel(run('free'), null, dof, 'u');
  assert.equal(m.series[0].xs.length, fx.free.response.t.length);
  close(m.series[0].ys[0], 40, 1e-6); // mm
  assert.match(m.yLabel, /mm/);
  const env = m.series.filter((x) => x.id.startsWith('env'));
  assert.equal(env.length, 2);
  close(env[0].ys[0], 40 / Math.sqrt(1 - 0.01), 1e-6); // A = u0 / sqrt(1 - D^2) for a start at rest
  assert.ok(env[0].ys[env[0].ys.length - 1] < env[0].ys[0]);
  assert.ok(Math.max(...m.series[0].ys.map(Math.abs)) <= env[0].ys[0] * 1.001, 'the curve stays inside its envelope');
  assert.ok(m.y.min < -40 && m.y.max > 40);
});

test('a reference run is drawn faded beside the current one; velocity, phase plane and energy', () => {
  const m = timeModel(run('free'), run('over'), dof, 'u');
  const ref = m.series.find((x) => x.id === 'ref-ref' || x.id.endsWith('-ref'));
  assert.ok(ref && ref.alpha < 1 && ref.dash);
  const v = timeModel(run('free'), null, dof, 'v');
  assert.match(v.yLabel, /Geschwindigkeit/);
  assert.equal(v.series.filter((x) => x.id.startsWith('env')).length, 0);
  const p = phaseModel(run('free'), null, dof);
  assert.equal(p.series[0].xs.length, p.series[0].ys.length);
  assert.equal(p.points[0].label, 'Start');
  const e = energyModel(run('free'), null);
  const total = e.series.find((x) => x.id === 'tot');
  assert.ok(total.ys[total.ys.length - 1] < total.ys[0], 'a damped system loses energy');
  assert.equal(e.y.min, 0);
});

test('a run without a simulation says so instead of failing', () => {
  assert.ok(timeModel({ analysis: fx.chain, response: null }, null, dof, 'u').empty);
  assert.ok(phaseModel({ analysis: fx.chain, response: null }, null, dof).empty);
  assert.ok(energyModel({ analysis: fx.chain, response: null }, null).empty);
  assert.ok(poleModel({ analysis: fx.unsupported }, null).empty);
});

test('the frequency response: V over eta with the operating point of the load and the phase', () => {
  const m = frfModels(run('forced'), null, 0, 0, 0);
  assert.ok(m.amplitude && m.phase);
  const peak = Math.max(...m.amplitude.series[0].ys);
  assert.ok(peak > 4.9 && peak < 5.1, `V_max ${peak} (1 / (2 D sqrt(1 - D^2)) = 5.02)`);
  assert.equal(m.amplitude.vlines.length, 1);
  close(m.amplitude.vlines[0].x, 0.9, 1e-6);
  close(m.amplitude.points[0].y, 3.8208, 1e-3);
  close(m.amplitude.x.max, 3);
  assert.equal(m.phase.fixedY, true);
  const last = m.phase.series[0].ys[m.phase.series[0].ys.length - 1];
  assert.ok(last < -170, 'far above the resonance the response is in antiphase');
  const ref = frfModels(run('forced'), run('forced'), 0, 0, 0);
  assert.equal(ref.amplitude.series.length, 2);
  assert.ok(frfModels(run('free'), null).empty, 'no harmonic load: the reason');
});

test('the poles in the complex plane and the rays of constant damping ratio', () => {
  const m = poleModel(run('free'), null);
  assert.equal(m.points.length, 2);
  close(m.points[0].x, -0.6283185, 1e-6);
  assert.equal(m.equal, true);
  assert.ok(m.rays.find((r) => r.strong), 'D = 1 is marked');
  const o = poleModel(run('over'), run('free'));
  assert.equal(o.points.length, 4); // two real poles of the overdamped system and the faded pair of the reference
  assert.ok(o.points.slice(0, 2).every((p) => p.alpha < 1));
  assert.deepEqual(rangeOf([[1, 1, 1]]).min < 1, true);
});

test('the way to the critical case: c_krit, or the spring or mass that make D = 1 with the damping kept', () => {
  // free: m = 1, k = 39.478, c = 1.2566 (D = 0.1), c_krit = 12.566
  const t = criticalTargets(scene, fx.free);
  assert.equal(t.critical, false);
  assert.deepEqual(t.actions.map((a) => a.key), ['c', 'k', 'm']);
  const [c, k, m] = t.actions.map((a) => a.sets[0].value);
  close(c, fx.free.single.c_crit, 1e-9);
  // with the new value the damping ratio is 1: c = 2 sqrt(k m)
  const one = fx.free.single;
  close(one.c, 2 * Math.sqrt(k * one.m), 1e-6);
  close(one.c, 2 * Math.sqrt(one.k * m), 1e-6);
  assert.ok(k < one.k && m < one.m, 'a softer spring and a lighter mass lead to the limit case from below');
  assert.match(t.actions[0].label, /erhöhen/);
  assert.ok(Object.keys(t.marks).length === 3);
  // above the limit case the directions turn round
  const over = criticalTargets(scene, fx.over);
  assert.match(over.actions[0].label, /senken/);
  assert.match(over.actions[1].label, /steifer/);
});

test('the way to the critical case: scaled dampers for several masses, nothing for an unsupported scene', () => {
  const chain = JSON.parse(fs.readFileSync(new URL('../../scenes/two_mass_chain.json', import.meta.url), 'utf8'));
  const t = criticalTargets(chain, fx.chain);
  assert.ok(t.actions.length <= 1 && t.actions.every((a) => a.key === 'c'));
  assert.deepEqual(criticalTargets(scene, fx.unsupported), { marks: {}, actions: [], critical: false });
});
