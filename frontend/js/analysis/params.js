// params.js - the values of a scene that the analysis window lets you change, and how a change is applied. Pure.
//
// The window works on a copy of the scene: masses (m), springs (k, rest length), dampers (c), harmonic loads (amplitude, frequency),
// the start (deflection u0 from the rest position, velocity v0) and names (`label`). A parameter is { id, group, kind, objId, field,
// symbol, name, unit, value, lo, hi, log } with a slider between lo and hi (logarithmic ones span 0.1 to 10 times the value).

import { sig } from './describe.js';

export const MASS_TYPES = ['block', 'disc', 'node'];
const AXES = ['x', 'y', 'phi'];

export const labelOf = (scene, id) => {
  for (const key of ['bodies', 'elements', 'constraints']) {
    const o = (scene[key] || []).find((x) => x.id === id);
    if (o) return o.label || o.id;
  }
  return id;
};

const log = (value) => ({ log: true, lo: value / 10, hi: value * 10 });

// The damper range: from 0 to 2.5 times the damping at which the least damped mode is critical (D from 0 to 2.5), so the limit case is in the middle.
function damperRange(value, analysis) {
  let critical = null;
  if (analysis && analysis.single && analysis.single.c_crit) critical = analysis.single.c_crit;
  else if (analysis && analysis.modes) {
    const scales = analysis.modes.filter((m) => m.critical_scale && m.zeta > 1e-6).map((m) => m.critical_scale);
    if (scales.length && value > 0) critical = value * Math.min(...scales);
  }
  return { log: false, lo: 0, hi: Math.max(critical ? 2.5 * critical : 0, 2 * value, 1e-3) };
}

// scene: the working copy; analysis: the last answer of /api/analysis (for the ranges and the start values), or null.
export function parametersOf(scene, analysis = null) {
  const out = [];
  for (const b of scene.bodies || []) {
    if (!MASS_TYPES.includes(b.type)) continue;
    out.push({ id: `mass:${b.id}`, group: 'Massen', kind: 'mass', objId: b.id, field: 'mass', symbol: 'm', name: 'Masse', unit: 'kg', value: b.params.mass, ...log(b.params.mass) });
  }
  for (const e of scene.elements || []) {
    if (e.type === 'spring') {
      out.push({ id: `k:${e.id}`, group: 'Federn', kind: 'spring', objId: e.id, field: 'k', symbol: 'k', name: 'Federsteifigkeit', unit: 'N/m', value: e.params.k, ...log(e.params.k) });
    } else if (e.type === 'damper') {
      out.push({ id: `c:${e.id}`, group: 'Dämpfer', kind: 'damper', objId: e.id, field: 'c', symbol: 'c', name: 'Dämpfung', unit: 'N·s/m', value: e.params.c, ...damperRange(e.params.c, analysis) });
    } else if (e.type === 'load' && e.params.mode === 'harmonic') {
      const f = e.params.force || [0, 0];
      const amp = Math.hypot(f[0], f[1]);
      out.push({ id: `F:${e.id}`, group: 'Erregung', kind: 'load', objId: e.id, field: 'amplitude', symbol: 'F₀', name: 'Kraftamplitude', unit: 'N', value: amp, lo: 0, hi: Math.max(3 * amp, 1), log: false });
      const hz = e.params.frequency ?? 1;
      out.push({ id: `f:${e.id}`, group: 'Erregung', kind: 'load', objId: e.id, field: 'frequency', symbol: 'f', name: 'Erregerfrequenz', unit: 'Hz', value: hz, lo: 0, hi: Math.max(3 * hz, 1), log: false });
    }
  }
  // the start: deflection from the rest position and velocity, of every free translation
  for (const dof of (analysis && analysis.dofs) || []) {
    if (dof.axis === 'phi') continue;
    const body = (scene.bodies || []).find((b) => b.id === dof.body);
    if (!body) continue;
    const u0 = ((analysis.start_offset || analysis.initial_offset || {})[dof.body] || [0, 0, 0])[AXES.indexOf(dof.axis)] || 0;
    const v0 = (body.velocity || [0, 0])[AXES.indexOf(dof.axis)] || 0;
    const name = `${dof.axis}(${labelOf(scene, dof.body)})`;
    out.push({ id: `u0:${dof.body}:${dof.axis}`, group: 'Anfang', kind: 'start', objId: dof.body, field: `u0:${dof.axis}`, symbol: `u₀`, name: `Auslenkung ${name}`, unit: 'm', value: u0, lo: -Math.max(3 * Math.abs(u0), 0.2), hi: Math.max(3 * Math.abs(u0), 0.2), log: false });
    out.push({ id: `v0:${dof.body}:${dof.axis}`, group: 'Anfang', kind: 'start', objId: dof.body, field: `v0:${dof.axis}`, symbol: `v₀`, name: `Geschwindigkeit ${name}`, unit: 'm/s', value: v0, lo: -Math.max(3 * Math.abs(v0), 1), hi: Math.max(3 * Math.abs(v0), 1), log: false });
  }
  return out;
}

// The state the window edits: the scene copy and the start offsets ({ body: { x, y } } from the rest position, or null = the scene's own start).
export function applyParameter(state, param, value) {
  const { scene } = state;
  const body = () => scene.bodies.find((b) => b.id === param.objId);
  const element = () => scene.elements.find((e) => e.id === param.objId);
  switch (param.kind) {
    case 'mass': body().params.mass = value; break;
    case 'spring': element().params[param.field] = value; break;
    case 'damper': element().params.c = value; break;
    case 'load': {
      const p = element().params;
      if (param.field === 'frequency') p.frequency = value;
      else {
        const f = p.force || [1, 0];
        const mag = Math.hypot(f[0], f[1]);
        p.force = mag > 0 ? [f[0] / mag * value, f[1] / mag * value] : [value, 0];
      }
      break;
    }
    case 'start': {
      const [what, axis] = param.field.split(':');
      if (what === 'u0') {
        state.offsets = state.offsets || {};
        state.offsets[param.objId] = { ...(state.offsets[param.objId] || {}), [axis]: value };
      } else {
        const b = body();
        const v = [...(b.velocity || [0, 0])];
        v[AXES.indexOf(axis)] = value;
        b.velocity = v;
      }
      break;
    }
    default: throw new Error(`unknown parameter kind ${param.kind}`);
  }
}

export function setLabel(scene, id, text) {
  for (const key of ['bodies', 'elements', 'constraints']) {
    const o = (scene[key] || []).find((x) => x.id === id);
    if (!o) continue;
    const t = String(text).trim().slice(0, 40);
    if (t && t !== o.id) o.label = t;
    else delete o.label;
    return;
  }
}

// --- sliders ---------------------------------------------------------------------------------------------------

export const SLIDER_STEPS = 1000;

export function toSlider(param, value) {
  if (param.log) {
    const v = Math.min(param.hi, Math.max(param.lo, value));
    return Math.round((Math.log(v / param.lo) / Math.log(param.hi / param.lo)) * SLIDER_STEPS);
  }
  return Math.round(((Math.min(param.hi, Math.max(param.lo, value)) - param.lo) / (param.hi - param.lo || 1)) * SLIDER_STEPS);
}

export function fromSlider(param, position) {
  const t = position / SLIDER_STEPS;
  return param.log ? param.lo * (param.hi / param.lo) ** t : param.lo + t * (param.hi - param.lo);
}

// A harmonic load to try resonance with: on the first mass, along x, at the frequency of the first mode.
export function addExcitation(scene, frequency) {
  let n = 1;
  const ids = new Set([...scene.bodies, ...scene.elements, ...scene.constraints].map((o) => o.id));
  while (ids.has(`F${n}`)) n++;
  const body = scene.bodies.find((b) => MASS_TYPES.includes(b.type));
  scene.elements.push({ id: `F${n}`, type: 'load', body: body.id, point: [0, 0], label: 'Erregung', params: { force: [1, 0], moment: 0, mode: 'harmonic', frequency: Math.round(frequency * 1000) / 1000, phase: 0 } });
  return `F${n}`;
}

export function removeExcitation(scene) {
  scene.elements = scene.elements.filter((e) => !(e.type === 'load' && e.params.mode === 'harmonic'));
}

// The scene's own start as offsets from the rest position ({ body: { x, y, phi } }, only the free coordinates), so that the start follows the rest
// position when a value moves it (a weight on a spring that gets stiffer starts the same distance above its new rest position).
export function initialOffsets(analysis) {
  const out = {};
  for (const dof of (analysis && analysis.dofs) || []) {
    const v = ((analysis.initial_offset || {})[dof.body] || [0, 0, 0])[AXES.indexOf(dof.axis)] || 0;
    (out[dof.body] ||= {})[dof.axis] = v;
  }
  return out;
}

// --- the way to the critical case ---------------------------------------------------------------------------------------------

// What takes the system to the aperiodic limit case (D = 1). One degree of freedom: the damping c_krit = 2 sqrt(k m), or, with the damping kept, the spring
// k = c^2 / 4 m or the mass m = c^2 / 4 k. Several: every damper scaled by 1 / D of the chosen mode.
// Returns { marks: { <param id>: value }, actions: [{ key, label, sets: [{ param, value }] }], critical: bool }. Pure.
export function criticalTargets(scene, analysis, modeIndex = 0) {
  const out = { marks: {}, actions: [], critical: false };
  if (!analysis || !analysis.supported) return out;
  const params = parametersOf(scene, analysis);
  const dampers = params.filter((q) => q.kind === 'damper');
  const springs = params.filter((q) => q.kind === 'spring');
  const masses = params.filter((q) => q.kind === 'mass');
  const one = analysis.single;
  if (one && one.c_crit) {
    const { m, c, k, c_crit: ck } = one;
    const d = c / ck;
    if (Math.abs(d - 1) < 1e-6) { out.critical = true; return out; }
    const less = d < 1; // below the limit case: more damping, a softer spring or a lighter mass lead to it
    if (dampers.length === 1) {
      out.marks[dampers[0].id] = ck;
      out.actions.push({ key: 'c', label: `Dämpfung ${less ? 'erhöhen' : 'senken'} auf c_krit = ${sig(ck)} N·s/m`, sets: [{ param: dampers[0], value: ck }] });
    } else if (dampers.length > 1 && c > 0) {
      out.actions.push({ key: 'c', label: `Alle Dämpfer ×${sig(ck / c)} (c = c_krit = ${sig(ck)} N·s/m)`, sets: dampers.map((q) => ({ param: q, value: q.value * (ck / c) })) });
    }
    if (c > 0 && springs.length === 1) {
      const kk = (c * c) / (4 * m);
      out.marks[springs[0].id] = kk;
      out.actions.push({ key: 'k', label: `oder Feder ${less ? 'weicher' : 'steifer'}: k = ${sig(kk)} N/m`, sets: [{ param: springs[0], value: kk }] });
    }
    if (c > 0 && masses.length === 1) {
      const mm = (c * c) / (4 * k);
      out.marks[masses[0].id] = mm;
      out.actions.push({ key: 'm', label: `oder Masse ${less ? 'kleiner' : 'größer'}: m = ${sig(mm)} kg`, sets: [{ param: masses[0], value: mm }] });
    }
    return out;
  }
  const mode = analysis.modes[modeIndex];
  if (mode && mode.critical_scale && mode.zeta > 1e-9 && dampers.length) {
    if (Math.abs(mode.zeta - 1) < 1e-6) { out.critical = true; return out; }
    out.actions.push({ key: 'c', label: `Alle Dämpfer ×${sig(mode.critical_scale)}: Mode ${modeIndex + 1} wird kritisch`, sets: dampers.map((q) => ({ param: q, value: q.value * mode.critical_scale })) });
  }
  return out;
}
