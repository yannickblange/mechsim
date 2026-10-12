// section.js - cross sections of bars and beams: square, L, T, H, I (v0.4). Pure.
//
// Mirrors native/engine/core/section.cpp (a test compares both). Seen along the member axis, "up" is
// the in-plane direction normal to the axis and z the out-of-plane one; bending in the simulation plane
// is about z, so I = integral of y^2 dA about the centroid, y along "up".
//
//   square  a                  solid square
//   L       b, h, t            leg of height h (up) with a foot of width b at the bottom, both t thick
//   T       b, h, tf, tw       flange (width b, thickness tf) on top of a stem (width tw), total height h
//   I       b, h, tf, tw       two flanges (width b, thickness tf) at the top and bottom of a web (thickness tw)
//   H       b, h, tf, tw       the I turned by 90 degrees: weak axis
//
// One Young's modulus for everything.
export const E_MODULUS = 210e9; // Pa
export const DENSITY = 7850; // kg / m^3

export const SECTION_TYPES = ['square', 'L', 'T', 'H', 'I'];
export const SECTION_LABELS = { square: 'Square', L: 'L', T: 'T', H: 'H', I: 'I' };

// [key, label] of the dimensions of each type, in m.
export const SECTION_FIELDS = {
  square: [['a', 'Side a']],
  L: [['b', 'Foot width b'], ['h', 'Leg height h'], ['t', 'Thickness t']],
  T: [['b', 'Flange width b'], ['h', 'Height h'], ['tf', 'Flange thickness tf'], ['tw', 'Stem width tw']],
  H: [['b', 'Flange length b'], ['h', 'Height h'], ['tf', 'Flange thickness tf'], ['tw', 'Web thickness tw']],
  I: [['b', 'Flange width b'], ['h', 'Height h'], ['tf', 'Flange thickness tf'], ['tw', 'Web thickness tw']],
};

// Dimensions of a reference section of each type, with the depth (extent "up") given below.
const REFERENCE = {
  square: { a: 0.04 },
  L: { b: 0.04, h: 0.04, t: 0.005 },
  T: { b: 0.04, h: 0.04, tf: 0.005, tw: 0.005 },
  H: { b: 0.04, h: 0.06, tf: 0.006, tw: 0.004 },
  I: { b: 0.04, h: 0.06, tf: 0.006, tw: 0.004 },
};
const REFERENCE_DEPTH = { square: 0.04, L: 0.04, T: 0.04, H: 0.04, I: 0.06 };

const round6 = (x) => Math.round(x * 1e6) / 1e6;

// A section of `type` whose depth is `depth` (all dimensions scaled from the reference section).
export function defaultSection(type, depth = REFERENCE_DEPTH[type]) {
  if (!REFERENCE[type]) throw new Error(`unknown section type "${type}"`);
  const k = depth / REFERENCE_DEPTH[type];
  const section = { type };
  for (const [key, value] of Object.entries(REFERENCE[type])) section[key] = round6(value * k);
  return section;
}

// Why a section cannot exist, or null. Mirrors section.cpp.
export function sectionError(s) {
  if (!s || !SECTION_FIELDS[s.type]) return `unknown section type "${s && s.type}"`;
  for (const [key, label] of SECTION_FIELDS[s.type]) {
    if (!(Number(s[key]) > 0)) return `${label} must be greater than 0`;
  }
  if (s.type === 'I' || s.type === 'H') {
    if (!(2 * s.tf < s.h)) return 'the flanges (2 tf) must be thinner than the height h';
    if (!(s.tw < s.b)) return 'the web thickness tw must be smaller than the width b';
  } else if (s.type === 'T') {
    if (!(s.tf < s.h)) return 'the flange thickness tf must be smaller than the height h';
    if (!(s.tw < s.b)) return 'the stem width tw must be smaller than the flange width b';
  } else if (s.type === 'L') {
    if (!(s.t < s.b)) return 'the thickness t must be smaller than the foot width b';
    if (!(s.t < s.h)) return 'the thickness t must be smaller than the leg height h';
  }
  return null;
}

// Second moment about the centroid axis of a rectangle `wd` wide, `ht` tall, centre `offset` above it.
const rectInertia = (wd, ht, offset) => (wd * ht ** 3) / 12 + wd * ht * offset * offset;

// { area, inertia, yBottom, yTop, depth, EA, EI } of a valid section (throws otherwise).
export function sectionProps(s) {
  const problem = sectionError(s);
  if (problem) throw new Error(problem);
  let area;
  let inertia;
  let yBottom;
  let yTop;
  switch (s.type) {
    case 'square':
      area = s.a * s.a;
      inertia = s.a ** 4 / 12;
      yBottom = yTop = s.a / 2;
      break;
    case 'I':
      area = 2 * s.b * s.tf + (s.h - 2 * s.tf) * s.tw;
      inertia = (s.b * s.h ** 3 - (s.b - s.tw) * (s.h - 2 * s.tf) ** 3) / 12;
      yBottom = yTop = s.h / 2;
      break;
    case 'H':
      area = 2 * s.b * s.tf + (s.h - 2 * s.tf) * s.tw;
      inertia = (2 * s.tf * s.b ** 3 + (s.h - 2 * s.tf) * s.tw ** 3) / 12;
      yBottom = yTop = s.b / 2;
      break;
    case 'T': {
      const stem = s.h - s.tf;
      const aStem = s.tw * stem;
      const aFlange = s.b * s.tf;
      area = aStem + aFlange;
      const yc = (aStem * stem / 2 + aFlange * (s.h - s.tf / 2)) / area;
      inertia = rectInertia(s.tw, stem, stem / 2 - yc) + rectInertia(s.b, s.tf, s.h - s.tf / 2 - yc);
      yBottom = yc;
      yTop = s.h - yc;
      break;
    }
    default: { // L
      const aLeg = s.t * s.h;
      const aFoot = (s.b - s.t) * s.t;
      area = aLeg + aFoot;
      const yc = (aLeg * s.h / 2 + aFoot * s.t / 2) / area;
      inertia = rectInertia(s.t, s.h, s.h / 2 - yc) + rectInertia(s.b - s.t, s.t, s.t / 2 - yc);
      yBottom = yc;
      yTop = s.h - yc;
    }
  }
  return {
    area, inertia, yBottom, yTop, depth: yBottom + yTop, EA: E_MODULUS * area, EI: E_MODULUS * inertia,
  };
}

// The cross section as rectangles [z0, z1, y0, y1], y measured from the centroid (up positive), z
// from the middle. For the drawing in the property popup.
export function sectionRects(s) {
  const { yBottom } = sectionProps(s);
  const up = (y) => y - yBottom; // from "bottom of the section" to "from the centroid"
  switch (s.type) {
    case 'square': return [[-s.a / 2, s.a / 2, -s.a / 2, s.a / 2]];
    case 'I': return [
      [-s.b / 2, s.b / 2, -s.h / 2, -s.h / 2 + s.tf],
      [-s.b / 2, s.b / 2, s.h / 2 - s.tf, s.h / 2],
      [-s.tw / 2, s.tw / 2, -s.h / 2 + s.tf, s.h / 2 - s.tf],
    ];
    case 'H': return [
      [-s.h / 2, -s.h / 2 + s.tf, -s.b / 2, s.b / 2],
      [s.h / 2 - s.tf, s.h / 2, -s.b / 2, s.b / 2],
      [-s.h / 2 + s.tf, s.h / 2 - s.tf, -s.tw / 2, s.tw / 2],
    ];
    case 'T': return [
      [-s.tw / 2, s.tw / 2, up(0), up(s.h - s.tf)],
      [-s.b / 2, s.b / 2, up(s.h - s.tf), up(s.h)],
    ];
    default: return [ // L: leg on the left, foot to the right
      [-s.b / 2, -s.b / 2 + s.t, up(0), up(s.h)],
      [-s.b / 2 + s.t, s.b / 2, up(0), up(s.t)],
    ];
  }
}

// Total width of the section in z (for the preview).
export function sectionWidth(s) {
  switch (s.type) {
    case 'square': return s.a;
    case 'H': return s.h;
    default: return s.b;
  }
}

// Mass of a beam of the given length when its mass is not set explicitly: density x area x length.
export const beamMass = (section, length) => DENSITY * sectionProps(section).area * length;

// Compact text for property popups: "I 100 x 200 x 10 x 6 mm".
export function describeSection(s) {
  const mm = (v) => String(Math.round(v * 1e4) / 10);
  const dims = SECTION_FIELDS[s.type].map(([key]) => mm(s[key]));
  return `${SECTION_LABELS[s.type]} ${dims.join(' x ')} mm`;
}
