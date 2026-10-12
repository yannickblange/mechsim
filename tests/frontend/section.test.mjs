import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DENSITY, E_MODULUS, SECTION_FIELDS, SECTION_TYPES, beamMass, defaultSection, describeSection, sectionError,
  sectionProps, sectionRects, sectionWidth,
} from '../../frontend/js/editor/section.js';
import { close } from './helpers.mjs';

// Independent check: sum rectangles (parallel axis) from sectionRects.
function integrate(rects) {
  let area = 0;
  let sy = 0;
  for (const [z0, z1, y0, y1] of rects) {
    const a = (z1 - z0) * (y1 - y0);
    area += a;
    sy += (a * (y0 + y1)) / 2;
  }
  const yc = sy / area;
  let inertia = 0;
  for (const [z0, z1, y0, y1] of rects) inertia += ((z1 - z0) * ((y1 - yc) ** 3 - (y0 - yc) ** 3)) / 3;
  return { area, yc, inertia };
}

test('square: a^2 and a^4 / 12', () => {
  const p = sectionProps({ type: 'square', a: 0.05 });
  close(p.area, 0.0025, 1e-15);
  close(p.inertia, 0.05 ** 4 / 12, 1e-18);
  close(p.EI, E_MODULUS * 0.05 ** 4 / 12, 1e-3);
  close(p.yBottom, 0.025);
  close(p.yTop, 0.025);
});

test('values of a hand calculation: IPE-like I section and the T section', () => {
  const I = sectionProps({ type: 'I', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 });
  close(I.area, 0.00308, 1e-12);
  assert.ok(Math.abs(I.inertia / 2.0983e-5 - 1) < 1e-3, `I = ${I.inertia}`);
  const H = sectionProps({ type: 'H', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 });
  close(H.area, I.area, 1e-12);
  assert.ok(H.inertia < I.inertia / 5, 'the H is the weak-axis I');
  close(H.depth, 0.1);
});

for (const type of SECTION_TYPES) {
  test(`${type}: area, inertia and extents agree with summing the rectangles`, () => {
    const s = type === 'square' ? { type, a: 0.04 }
      : type === 'L' ? { type, b: 0.08, h: 0.12, t: 0.01 }
        : { type, b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 };
    const p = sectionProps(s);
    const m = integrate(sectionRects(s));
    close(p.area, m.area, 1e-12);
    assert.ok(Math.abs(p.inertia / m.inertia - 1) < 1e-9, `${p.inertia} vs ${m.inertia}`);
    close(m.yc, 0, 1e-12, 'the rectangles are centred on the centroid');
    // the rectangles reach from -yBottom to +yTop
    const ys = sectionRects(s).flatMap((r) => [r[2], r[3]]);
    close(Math.min(...ys), -p.yBottom, 1e-12);
    close(Math.max(...ys), p.yTop, 1e-12);
    // and are as wide as sectionWidth says
    const zs = sectionRects(s).flatMap((r) => [r[0], r[1]]);
    close(Math.max(...zs) - Math.min(...zs), sectionWidth(s), 1e-12);
  });
}

test('T and L are not symmetric: the centroid is on the side of the material', () => {
  const T = sectionProps({ type: 'T', b: 0.1, h: 0.1, tf: 0.01, tw: 0.01 });
  assert.ok(T.yTop < T.yBottom);
  const L = sectionProps({ type: 'L', b: 0.08, h: 0.12, t: 0.01 });
  assert.ok(L.yBottom < L.yTop);
  close(T.depth, 0.1);
  close(L.depth, 0.12);
});

test('sectionError names what does not fit', () => {
  assert.equal(sectionError({ type: 'square', a: 0.05 }), null);
  assert.match(sectionError({ type: 'square', a: 0 }), /Side a/);
  assert.match(sectionError({ type: 'I', b: 0.1, h: 0.02, tf: 0.02, tw: 0.01 }), /flanges/);
  assert.match(sectionError({ type: 'I', b: 0.1, h: 0.2, tf: 0.01, tw: 0.2 }), /web/);
  assert.match(sectionError({ type: 'T', b: 0.1, h: 0.1, tf: 0.1, tw: 0.01 }), /flange thickness/);
  assert.match(sectionError({ type: 'L', b: 0.01, h: 0.1, t: 0.02 }), /foot/);
  assert.match(sectionError({ type: 'round', a: 1 }), /unknown/);
  assert.match(sectionError({ type: 'L', b: 0.1, h: 0.1 }), /Thickness t/);
  assert.throws(() => sectionProps({ type: 'T', b: 0.1, h: 0.1, tf: 0.1, tw: 0.01 }), /flange thickness/);
});

test('defaultSection of every type is valid and has the requested depth', () => {
  for (const type of SECTION_TYPES) {
    const s = defaultSection(type);
    assert.equal(sectionError(s), null, type);
    assert.deepEqual(Object.keys(s).sort(), ['type', ...SECTION_FIELDS[type].map(([k]) => k)].sort());
    close(sectionProps(defaultSection(type, 0.1)).depth, 0.1, 1e-6, type);
    close(sectionProps(defaultSection(type, 0.01)).depth, 0.01, 1e-6, type);
  }
  assert.throws(() => defaultSection('round'), /unknown/);
});

test('beamMass is density x area x length; text description', () => {
  close(beamMass({ type: 'square', a: 0.02 }, 2), DENSITY * 0.0004 * 2, 1e-12);
  assert.equal(describeSection({ type: 'I', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 }), 'I 100 x 200 x 10 x 6 mm');
  assert.equal(describeSection({ type: 'square', a: 0.0125 }), 'Square 12.5 mm');
});
