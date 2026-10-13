import { decimal } from '../format.js';

// plot.js - the maths of the displacement graphs: tick marks, units, and a min / max envelope so
// that hundreds of thousands of samples draw as fast as a few hundred. Pure, tested with Node.

// "Nice" tick values covering [lo, hi]: steps of 1, 2, 5 x 10^k, about `count` of them.
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag; // the nearest of 1, 2, 5, 10
  const first = Math.ceil(lo / step - 1e-9);
  const ticks = [];
  for (let i = first; i * step <= hi + step * 1e-9; i++) ticks.push(Number((i * step).toPrecision(12)));
  return { ticks, step };
}

// Tick label with just enough decimals for the step.
export function formatTick(value, step) {
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
  const v = Math.abs(value) < step * 1e-6 ? 0 : value;
  return decimal(v, decimals);
}

// Unit for displacements: millimetres when everything stays below 5 cm, metres otherwise.
export function lengthUnit(maxAbs) {
  return maxAbs > 0 && maxAbs < 0.05 ? { name: 'mm', factor: 1000 } : { name: 'm', factor: 1 };
}

// Index of the first sample with t >= value (t is sorted).
export function lowerBound(t, value) {
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// [min, max] of values[i0 .. i1) or null.
export function extent(values, i0 = 0, i1 = values.length) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = i0; i < i1; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

// What to draw for the samples in [t0, t1] on a plot `width` px wide: a list of columns
// { x (px), lo, hi } (the min and max of the samples that fall into the pixel column), or, for few
// samples, the raw points as columns with lo = hi. Keeps every spike of a fast oscillation.
export function envelope(t, values, t0, t1, width) {
  const i0 = Math.max(0, lowerBound(t, t0) - 1);
  const i1 = Math.min(t.length, lowerBound(t, t1) + 1);
  const span = t1 - t0 || 1;
  const px = (time) => ((time - t0) / span) * width;
  if (i1 - i0 <= 2 * width) {
    const out = [];
    for (let i = i0; i < i1; i++) out.push({ x: px(t[i]), lo: values[i], hi: values[i] });
    return out;
  }
  const columns = new Map();
  for (let i = i0; i < i1; i++) {
    const c = Math.max(0, Math.min(width, Math.round(px(t[i]))));
    const col = columns.get(c);
    if (!col) columns.set(c, { x: c, lo: values[i], hi: values[i] });
    else {
      if (values[i] < col.lo) col.lo = values[i];
      if (values[i] > col.hi) col.hi = values[i];
    }
  }
  return [...columns.values()].sort((a, b) => a.x - b.x);
}
