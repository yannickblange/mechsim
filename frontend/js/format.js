// format.js - numbers as the German UI shows them: decimal comma. Pure.
// Typed numbers accept both "0,5" and "0.5" (see properties.js); data and CSV files keep the dot.

// x with a fixed number of decimals ("–" for NaN / Infinity).
export function decimal(x, digits = 2) {
  return Number.isFinite(x) ? x.toFixed(digits).replace('.', ',') : '–';
}

// A number or a string that is already formatted with a dot, with the comma.
export const comma = (value) => String(value).replace('.', ',');
