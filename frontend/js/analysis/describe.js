// describe.js - what the numbers of an analysis mean, in words and as a position on a gauge. Pure (German texts).
import { decimal } from '../format.js';

// A number with `digits` significant digits and the decimal comma; very small or large ones in the e-notation.
export function sig(x, digits = 3) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  if (x < 0) return `−${sig(-x, digits)}`;
  x = Number(x.toPrecision(digits)); // (so that 9.999 is 10,0, not 10,00)
  const mag = Math.floor(Math.log10(Math.abs(x)));
  if (mag < -3 || mag > 5) {
    const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    const [m, e] = x.toExponential(digits - 1).split('e');
    return `${m.replace('.', ',')}·10${String(Number(e)).split('').map((c) => sup[c]).join('')}`;
  }
  return decimal(x, Math.max(0, digits - 1 - mag));
}

export const ZONES = {
  undamped: { key: 'undamped', label: 'ungedämpft', note: 'Die Schwingung klingt nicht ab.', tone: 'warn' },
  under: { key: 'under', label: 'unterkritisch gedämpft (schwingfähig)', note: 'Die Schwingung klingt exponentiell ab.', tone: 'ok' },
  critical: { key: 'critical', label: 'aperiodischer Grenzfall', note: 'Schnellste Rückkehr in die Ruhelage ohne Überschwingen.', tone: 'crit' },
  over: { key: 'over', label: 'überkritisch gedämpft (kriechend)', note: 'Keine Schwingung: die Rückkehr in die Ruhelage ist langsamer als im Grenzfall.', tone: 'ok' },
  unstable: { key: 'unstable', label: 'instabil', note: 'Die Auslenkung wächst: negative Steifigkeit oder negative Dämpfung.', tone: 'bad' },
  rigid: { key: 'rigid', label: 'Starrkörperbewegung', note: 'Keine Rückstellkraft: die Masse bleibt nicht in einer Ruhelage.', tone: 'warn' },
  creeping: { key: 'creeping', label: 'aperiodisch (kriechend)', note: 'Exponentielles Abklingen ohne Schwingung.', tone: 'ok' },
};

export function zoneOf(mode) {
  switch (mode.kind) {
    case 'ungedämpft': return ZONES.undamped;
    case 'unterkritisch': return ZONES.under;
    case 'aperiodischer Grenzfall': return ZONES.critical;
    case 'überkritisch': return ZONES.over;
    case 'instabil': return ZONES.unstable;
    case 'Starrkörper': return ZONES.rigid;
    default: return ZONES.creeping;
  }
}

// Where D is on the gauge (0 at the left, 1 at the right): the scale runs from D = 0 to D = 2, so the limit case D = 1 is in the middle.
export const GAUGE_MAX = 2;
export const gaugePosition = (d) => Math.min(1, Math.max(0, d / GAUGE_MAX));

// "How close to the critical case": a sentence for the damping of a mode.
export function criticalText(mode) {
  const d = mode.zeta;
  if (d === null || d === undefined) return mode.kind === 'instabil' ? 'Instabil: es gibt keinen kritischen Fall, die Auslenkung wächst.' : 'Kein Dämpfungsgrad (keine Schwingung).';
  if (d < 1e-9) return 'Keine Dämpfung (D = 0): der Abstand zum aperiodischen Grenzfall ist die ganze Dämpfung.';
  const pct = sig(d * 100, 3);
  if (d < 1 - 1e-6) {
    return `${pct} % der kritischen Dämpfung. Die Dämpfung müsste um den Faktor ${sig(1 / d, 3)} steigen, bis die Schwingung im aperiodischen Grenzfall verschwindet.`;
  }
  if (d <= 1 + 1e-6) return 'Genau im aperiodischen Grenzfall (D = 1).';
  return `${pct} % der kritischen Dämpfung: ${sig(d, 3)}-fach über dem Grenzfall. Die Dämpfung müsste auf ${sig(100 / d, 3)} % sinken, bis die Schwingung einsetzt.`;
}

export function eigenvalueText(mode) {
  const [re, im] = mode.eigenvalue;
  if (!im || Math.abs(im) < 1e-9) {
    return mode.eigenvalues && mode.eigenvalues.length === 2 && mode.eigenvalues[0][0] !== mode.eigenvalues[1][0]
      ? `λ₁ = ${sig(mode.eigenvalues[0][0])} s⁻¹, λ₂ = ${sig(mode.eigenvalues[1][0])} s⁻¹`
      : `λ = ${sig(re)} s⁻¹`;
  }
  return `λ₁,₂ = ${sig(re)} ± ${sig(Math.abs(im))} i s⁻¹`;
}

// The first line of a mode in a list: its number, frequency and damping.
export function modeTitle(mode, number) {
  if (mode.f0 === null || mode.f0 === undefined) return `Mode ${number}: ${mode.kind}`;
  return `Mode ${number}: f₀ = ${sig(mode.f0)} Hz, D = ${sig(mode.zeta, 2)}`;
}

// The dominant coordinates of a mode shape ("x(Masse) 1,00, φ(Masse) 0,64"): the entries above 5 % of the largest.
export function shapeText(mode, maxEntries = 4) {
  const entries = mode.shape.map((s) => ({ label: s.label, value: Math.hypot(s.re, s.im) * (s.re < 0 ? -1 : 1) }));
  const top = Math.max(...entries.map((e) => Math.abs(e.value)), 1e-12);
  return entries.filter((e) => Math.abs(e.value) > 0.05 * top).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, maxEntries)
    .map((e) => `${e.label} ${decimal(e.value / top, 2)}`).join(', ');
}

// The sentence for a harmonic load: how far from the resonance, and what that does to the amplitude.
export function resonanceText(load, dofIndex = 0) {
  if (load.eta === null || load.eta === undefined) return 'Keine Resonanzfrequenz (keine Schwingung).';
  const eta = load.eta;
  const v = load.magnification ? load.magnification[dofIndex] : null;
  let where;
  if (Math.abs(eta - 1) < 0.05) where = 'in der Resonanz';
  else if (Math.abs(eta - 1) < 0.15) where = 'nahe der Resonanz';
  else where = eta < 1 ? 'unterkritisch erregt (unter der Resonanz)' : 'überkritisch erregt (über der Resonanz)';
  const gain = v ? `, Vergrößerung V = ${sig(v)}` : '';
  return `η = Ω/ω₀ = ${decimal(eta, 3)}: ${where}${gain}.`;
}

export function noteTone(eta) {
  if (eta === null || eta === undefined) return 'ok';
  return Math.abs(eta - 1) < 0.05 ? 'bad' : Math.abs(eta - 1) < 0.15 ? 'warn' : 'ok';
}

// What to say about the system as a whole.
export function overview(analysis) {
  if (!analysis) return '';
  if (!analysis.supported) return analysis.reason;
  const n = analysis.dofs.length;
  const one = analysis.single;
  if (one) {
    return `Ein Freiheitsgrad: m = ${sig(one.m)} kg, c = ${sig(one.c)} N·s/m, k = ${sig(one.k)} N/m`
      + (one.c_crit ? `; kritische Dämpfung c_krit = 2√(k·m) = ${sig(one.c_crit)} N·s/m.` : '.');
  }
  return `${n} Freiheitsgrade, ${analysis.modes.length} Eigenformen (Moden).`;
}
