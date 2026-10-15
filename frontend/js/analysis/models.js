// models.js - what the analysis window's charts draw, as numbers: series, ranges, markers. Pure, tested with Node.
//
// A chart model: { xLabel, yLabel, x: { min, max }, y: { min, max }, series: [{ id, label, color, xs, ys, dash?, alpha?, width? }],
//   vlines: [{ x, label }], points: [{ x, y, label, color }], rays: [{ x0, y0, x1, y1, label?, strong? }], equal?: true, empty?: string }.
// A run is { analysis, response }: the answer of /api/analysis (with its `response`, the engine's run of the scene).
import { lengthUnit } from '../graphs/plot.js';

const DEG = 180 / Math.PI;

const AXIS = { x: ['x', 'vx'], y: ['y', 'vy'], phi: ['phi', 'omega'] };

export const rangeOf = (arrays, pad = 0.06) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of arrays) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(lo <= hi)) return { min: -1, max: 1 };
  if (hi - lo < 1e-12) { lo -= 0.5 * Math.max(1e-9, Math.abs(lo)) || 1; hi += 0.5 * Math.max(1e-9, Math.abs(hi)) || 1; }
  const d = (hi - lo) * pad;
  return { min: lo - d, max: hi + d };
};

// The coordinate `dof` ({ body, axis }) of a run: time, deflection u from the rest position and velocity v. null if the run has none.
export function dofSeries(run, dof) {
  const resp = run && run.response;
  if (!resp || !resp.bodies[dof.body]) return null;
  const [pos, vel] = AXIS[dof.axis];
  const body = resp.bodies[dof.body];
  const rest = resp.rest[dof.body][['x', 'y', 'phi'].indexOf(dof.axis)];
  return { t: resp.t, u: body[pos].map((v) => v - rest), v: body[vel] };
}

// Unit of a deflection series: degrees for a rotation, else mm or m (the graphs of the masses do the same).
function unitFor(dof, arrays) {
  if (dof.axis === 'phi') return { name: '°', factor: DEG };
  let max = 0;
  for (const a of arrays) for (const v of a) max = Math.max(max, Math.abs(v));
  return lengthUnit(max);
}

const velocityUnit = (dof, unit) => (dof.axis === 'phi' ? { name: '°/s', factor: DEG } : { name: `${unit.name}/s`, factor: unit.factor });

const faded = (s) => ({ ...s, id: `${s.id}-ref`, label: `${s.label} (Referenz)`, alpha: 0.4, dash: [5, 4] });

// The deflection u(t) or the velocity v(t) of a coordinate, with the reference run faded and, for one degree of freedom, the envelope.
export function timeModel(cur, ref, dof, quantity = 'u') {
  const a = dofSeries(cur, dof);
  if (!a) return { empty: 'Keine Simulation: der Aufbau lief nicht (kein Rechenkern oder nicht linearisierbar).' };
  const b = ref ? dofSeries(ref, dof) : null;
  const unit = unitFor(dof, [a.u, ...(b ? [b.u] : [])]);
  const vUnit = velocityUnit(dof, unit);
  const f = quantity === 'u' ? unit.factor : vUnit.factor;
  const key = quantity === 'u' ? 'u' : 'v';
  const name = dof.axis === 'phi' ? 'φ' : dof.axis;
  const series = [{ id: 'cur', label: quantity === 'u' ? `${name}(t)` : `v${name === 'φ' ? 'φ' : name}(t)`, color: 'plot1', xs: a.t, ys: a[key].map((v) => v * f), width: 1.8 }];
  if (b) series.push(faded({ id: 'ref', label: series[0].label, color: 'plot1', xs: b.t, ys: b[key].map((v) => v * f) }));
  const env = quantity === 'u' ? envelope(cur, a, unit.factor) : null;
  if (env) series.push(...env);
  const yUnit = quantity === 'u' ? unit : vUnit;
  return {
    xLabel: 't / s', yLabel: `${quantity === 'u' ? 'Auslenkung ' : 'Geschwindigkeit '}${name} / ${yUnit.name}`,
    x: { min: 0, max: a.t[a.t.length - 1] }, y: rangeOf(series.map((s) => s.ys)), series, vlines: [], points: [], unit: yUnit,
  };
}

// ±A e^(-delta t): the envelope of the free vibration of one degree of freedom, A from the start (u0, v0).
function envelope(run, a, factor) {
  const an = run.analysis;
  if (!an || !an.single || !an.modes || an.modes.length !== 1) return null;
  const m = an.modes[0];
  if (!(m.delta > 1e-9) || !(m.omega_d > 1e-9)) return null;
  const u0 = a.u[0];
  const v0 = a.v[0];
  const amp = Math.hypot(u0, (v0 + m.delta * u0) / m.omega_d);
  if (!(amp > 0)) return null;
  const xs = a.t;
  const upper = xs.map((t) => amp * Math.exp(-m.delta * t) * factor);
  return [
    { id: 'env+', label: `±A·e^(−δt), δ = ${m.delta.toFixed(3).replace('.', ',')} s⁻¹`, color: 'muted', xs, ys: upper, dash: [2, 3], width: 1.2 },
    { id: 'env-', label: '', color: 'muted', xs, ys: upper.map((v) => -v), dash: [2, 3], width: 1.2 },
  ];
}

// The phase plane: velocity against deflection (a spiral into the rest position for a damped vibration, an ellipse without damping).
export function phaseModel(cur, ref, dof) {
  const a = dofSeries(cur, dof);
  if (!a) return { empty: 'Keine Simulation.' };
  const b = ref ? dofSeries(ref, dof) : null;
  const unit = unitFor(dof, [a.u, ...(b ? [b.u] : [])]);
  const vUnit = velocityUnit(dof, unit);
  const name = dof.axis === 'phi' ? 'φ' : dof.axis;
  const series = [{ id: 'cur', label: 'Verlauf', color: 'plot1', xs: a.u.map((v) => v * unit.factor), ys: a.v.map((v) => v * vUnit.factor), width: 1.6 }];
  if (b) series.push(faded({ id: 'ref', label: 'Verlauf', color: 'plot1', xs: b.u.map((v) => v * unit.factor), ys: b.v.map((v) => v * vUnit.factor) }));
  return {
    xLabel: `Auslenkung ${name} / ${unit.name}`, yLabel: `Geschwindigkeit / ${vUnit.name}`, x: rangeOf(series.map((s) => s.xs)), y: rangeOf(series.map((s) => s.ys)),
    series, vlines: [], points: [{ x: series[0].xs[0], y: series[0].ys[0], label: 'Start', color: 'plot2' }],
  };
}

// Kinetic and potential energy (the potential counted from its lowest value of the run) and their sum: the loss is the damping at work.
export function energyModel(cur, ref) {
  const r = cur && cur.response;
  if (!r) return { empty: 'Keine Simulation.' };
  const lowest = (x) => Math.min(...x.potential);
  const build = (run, suffix) => {
    const e = run.response;
    const low = lowest(e);
    const pot = e.potential.map((v) => v - low);
    const tot = pot.map((v, i) => v + e.kinetic[i]);
    return [
      { id: `kin${suffix}`, label: 'Ekin', color: 'plot1', xs: e.t, ys: e.kinetic },
      { id: `pot${suffix}`, label: 'Epot', color: 'plot2', xs: e.t, ys: pot },
      { id: `tot${suffix}`, label: 'Eges', color: 'ink', xs: e.t, ys: tot, width: 2 },
    ];
  };
  let series = build(cur, '');
  if (ref && ref.response) series = [...series, ...build(ref, '-ref').filter((s) => s.id === 'tot-ref').map((s) => ({ ...s, label: 'Eges (Referenz)', alpha: 0.4, dash: [5, 4] }))];
  return { xLabel: 't / s', yLabel: 'Energie / J', x: { min: 0, max: r.t[r.t.length - 1] }, y: { min: 0, max: rangeOf(series.map((s) => s.ys)).max }, series, vlines: [], points: [] };
}

// The amplitude response of a harmonic load (the magnification V = |X| / static deflection against eta = Omega / omega_0 of a mode) and the phase.
// Returns { amplitude, phase } models, or { empty } without a load.
export function frfModels(cur, ref, loadIndex = 0, dofIndex = 0, modeIndex = 0) {
  const an = cur && cur.analysis;
  if (!an || !an.supported || !an.frf || !an.frf.loads.length) return { empty: 'Keine harmonische Last im Aufbau: „Erregung hinzufügen“ oder im Editor eine Kraft mit Art „Harmonisch“ setzen.' };
  const curve = (analysis) => {
    const frf = analysis && analysis.frf;
    if (!frf || !frf.loads[loadIndex]) return null;
    const mode = analysis.modes[modeIndex] || analysis.modes[0];
    const base = mode && mode.omega0 ? mode.omega0 : null;
    const xs = base ? frf.omega.map((w) => w / base) : frf.f;
    const stat = frf.loads[loadIndex].static;
    const amp = frf.loads[loadIndex].amplitude[dofIndex];
    const ys = stat && Math.abs(stat[dofIndex]) > 1e-15 ? amp.map((v) => v / Math.abs(stat[dofIndex])) : amp;
    return { xs, ys, phase: frf.loads[loadIndex].phase_deg[dofIndex], normalised: Boolean(stat && Math.abs(stat[dofIndex]) > 1e-15), base };
  };
  const a = curve(an);
  const b = ref && ref.analysis && ref.analysis.supported ? curve(ref.analysis) : null;
  const load = an.loads[loadIndex];
  const base = a.base;
  const xLabel = base ? 'η = Ω / ω₀' : 'f / Hz';
  const xMax = Math.min(a.xs[a.xs.length - 1], base ? 3 : Infinity);
  const clip = (c) => {
    const keep = c.xs.map((x, i) => i).filter((i) => c.xs[i] <= xMax + 1e-9);
    return { xs: keep.map((i) => c.xs[i]), ys: keep.map((i) => c.ys[i]), phase: keep.map((i) => c.phase[i]) };
  };
  const ca = clip(a);
  const cb = b ? clip(b) : null;
  const eta = base ? load.omega / base : load.frequency;
  const marker = { x: eta, label: base ? `Erregung η = ${eta.toFixed(2).replace('.', ',')}` : 'Erregung' };
  const operating = load.magnification ? load.magnification[dofIndex] : null;
  const seriesA = [{ id: 'cur', label: a.normalised ? 'V(η)' : '|X|', color: 'plot1', xs: ca.xs, ys: ca.ys, width: 1.8 }];
  if (cb) seriesA.push(faded({ id: 'ref', label: 'V(η)', color: 'plot1', xs: cb.xs, ys: cb.ys }));
  const seriesP = [{ id: 'cur', label: 'φ(η)', color: 'plot2', xs: ca.xs, ys: ca.phase, width: 1.8 }];
  if (cb) seriesP.push(faded({ id: 'ref', label: 'φ(η)', color: 'plot2', xs: cb.xs, ys: cb.phase }));
  const peak = Math.max(...ca.ys);
  return {
    amplitude: {
      xLabel, yLabel: a.normalised ? 'Vergrößerung V = |X| / x_stat' : 'Amplitude', x: { min: 0, max: xMax }, y: { min: 0, max: Math.max(peak, operating || 0) * 1.1 || 1 },
      series: seriesA, vlines: [marker], points: operating !== null && operating !== undefined ? [{ x: eta, y: operating, label: `V = ${operating.toFixed(2).replace('.', ',')}`, color: 'plot3' }] : [],
    },
    phase: { xLabel, yLabel: 'Phasenlage / °', x: { min: 0, max: xMax }, y: { min: -190, max: 10 }, series: seriesP, vlines: [marker], points: [], fixedY: true },
  };
}

// The poles in the complex plane (Re lambda, Im lambda in 1/s), the rays of constant damping ratio D, and the reference poles faded.
export function poleModel(cur, ref) {
  const an = cur && cur.analysis;
  if (!an || !an.supported) return { empty: an ? an.reason : 'Noch keine Analyse.' };
  const poles = (analysis, color, alpha) => {
    const out = [];
    for (const m of analysis.modes) for (const [re, im] of m.eigenvalues) out.push({ x: re, y: im, label: m.f0 ? '' : '', color, alpha });
    return out;
  };
  const points = poles(an, 'plot1', 1);
  const refPoints = ref && ref.analysis && ref.analysis.supported ? poles(ref.analysis, 'plot1', 0.35) : [];
  const all = [...points, ...refPoints];
  const radius = Math.max(1, ...all.map((p) => Math.hypot(p.x, p.y))) * 1.25;
  const rays = [];
  for (const d of [0.1, 0.2, 0.3, 0.5, 0.7, 1.0]) {
    const s = Math.sqrt(Math.max(0, 1 - d * d));
    rays.push({ x0: 0, y0: 0, x1: -d * radius, y1: s * radius, label: `D = ${String(d).replace('.', ',')}`, strong: d === 1 });
    if (s > 0) rays.push({ x0: 0, y0: 0, x1: -d * radius, y1: -s * radius, strong: false });
  }
  return {
    xLabel: 'Re λ / s⁻¹', yLabel: 'Im λ / s⁻¹', x: { min: -radius, max: radius * 0.25 }, y: { min: -radius, max: radius }, equal: true,
    series: [], vlines: [], points: [...refPoints, ...points], rays,
  };
}
