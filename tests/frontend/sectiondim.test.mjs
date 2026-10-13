// v0.6: the cross section as a dimensioned drawing with its fields on the dimension lines.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decimal, comma } from '../../frontend/js/format.js';
import { SECTION_TYPES, defaultSection } from '../../frontend/js/editor/section.js';
import { FIELD_H, FIELD_W, dimensionKeys, sectionDrawing } from '../../frontend/js/editor/sectiondim.js';

// default sections, a very thin web / flange, and tall / wide proportions
const SECTIONS = [
  ...SECTION_TYPES.map((t) => defaultSection(t)),
  { type: 'I', b: 0.2, h: 0.1, tf: 0.004, tw: 0.002 },
  { type: 'I', b: 0.03, h: 0.3, tf: 0.01, tw: 0.012 },
  { type: 'H', b: 0.2, h: 0.1, tf: 0.004, tw: 0.002 },
  { type: 'H', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 },
  { type: 'T', b: 0.2, h: 0.05, tf: 0.003, tw: 0.003 },
  { type: 'L', b: 0.3, h: 0.02, t: 0.004 },
  { type: 'square', a: 0.5 },
];

// an echo is only the letter of the dimension, a field has a symbol and an input
// absurd proportions: the fields still stay inside the drawing (they may crowd each other)
const EXTREME = [{ type: 'H', b: 0.05, h: 0.4, tf: 0.02, tw: 0.04 }, { type: 'I', b: 0.5, h: 0.04, tf: 0.015, tw: 0.4 }];

const rect = (f) => (f.echo
  ? { x: f.x - 7, y: f.y - 9, w: 14, h: 18 }
  : { x: f.x - FIELD_W / 2, y: f.y - FIELD_H / 2, w: FIELD_W, h: FIELD_H });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('every dimension of a section has exactly one field on the drawing', () => {
  for (const s of SECTIONS) {
    const keys = sectionDrawing(s).fields.filter((f) => !f.echo).map((f) => f.key).sort();
    assert.deepEqual(keys, [...dimensionKeys(s.type)].sort(), s.type);
  }
});

test('the fields lie inside the drawing, apart from each other and from the section', () => {
  for (const s of SECTIONS) {
    const d = sectionDrawing(s);
    const boxes = d.fields.map(rect);
    boxes.forEach((r, i) => {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= d.width && r.y + r.h <= d.height, `${s.type} field ${d.fields[i].key} inside`);
      for (const part of d.body) assert.ok(!overlap(r, part), `${s.type} field ${d.fields[i].key} off the section`);
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(r, boxes[j]), `${s.type} fields ${d.fields[i].key} and ${d.fields[j].key} apart`);
    });
  }
});

test('even absurd proportions keep every field inside the drawing', () => {
  for (const s of EXTREME) {
    const d = sectionDrawing(s);
    for (const f of d.fields.filter((x) => !x.echo)) {
      const r = rect(f);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= d.width && r.y + r.h <= d.height, `${s.type} field ${f.key} inside`);
    }
  }
});

test('the drawing is an SVG with the section rectangles, dimension lines and arrows', () => {
  const d = sectionDrawing(defaultSection('I'));
  assert.equal((d.svg.match(/<rect/g) || []).length, 3);
  assert.match(d.svg, /<path d="M[^"]*Z"/); // closed arrowheads
  assert.match(d.svg, /aria-label="Querschnitt I mit Bemaßung"/);
  assert.equal(d.caption, 'Maße in mm');
});

test('dimension lines are labelled with the symbols of the dimensions', () => {
  assert.deepEqual(sectionDrawing(defaultSection('I')).fields.map((f) => f.symbol).sort(), ['b', 'h', 'tf', 'tw']);
  const l = sectionDrawing(defaultSection('L')).fields;
  assert.deepEqual(l.filter((f) => f.echo).map((f) => f.symbol), ['t']);
  assert.equal(l.length, 4);
});

test('German number format: decimal comma', () => {
  assert.equal(decimal(1.5, 2), '1,50');
  assert.equal(decimal(-0.25, 3), '-0,250');
  assert.equal(decimal(NaN), '–');
  assert.equal(comma(0.04), '0,04');
  assert.equal(comma('3.5'), '3,5');
});
