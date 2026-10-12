// Prints area and second moment of a few sections as computed by the editor (for the parity test
// against the native engine: tests/python/test_section_parity.py).
import { sectionProps } from '../../frontend/js/editor/section.js';

const sections = [
  { type: 'square', a: 0.04 },
  { type: 'square', a: 0.0125 },
  { type: 'L', b: 0.08, h: 0.12, t: 0.01 },
  { type: 'L', b: 0.05, h: 0.03, t: 0.004 },
  { type: 'T', b: 0.1, h: 0.1, tf: 0.01, tw: 0.01 },
  { type: 'T', b: 0.06, h: 0.14, tf: 0.008, tw: 0.005 },
  { type: 'H', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 },
  { type: 'H', b: 0.3, h: 0.3, tf: 0.019, tw: 0.011 },
  { type: 'I', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 },
  { type: 'I', b: 0.055, h: 0.12, tf: 0.0063, tw: 0.0044 },
];
console.log(JSON.stringify(sections.map((section) => {
  const p = sectionProps(section);
  return { section, area: p.area, inertia: p.inertia };
})));
