// properties.js - the right-click property forms, as data. Pure: editor.js renders the fields and
// calls applyProperties() with what the user typed.
import { anchorWorld, isJoint, isLink, linkEnds } from './hit.js';
import { dist } from './geometry.js';
import {
  E_MODULUS, SECTION_FIELDS, SECTION_LABELS, SECTION_TYPES, beamMass, defaultSection, describeSection,
  sectionError, sectionProps,
} from './section.js';

const RAD = Math.PI / 180;
const SUPPORT_NAMES = {
  pin_support: 'Festlager',
  fixed_support: 'Lager (fixed)',
  roller_support: 'Loslager',
};

const num = (key, label, unit, value, extra = {}) => ({ key, label, unit, type: 'number', value, ...extra });
const select = (key, label, value, options, extra = {}) => ({ key, label, type: 'select', value, options, ...extra });

// { title, info: [string], fields: [...], section?: { ...section } } or null for an unknown id.
// Field: { key, label, unit, type: "number" | "select", value, min?, minExclusive?, options?, reshape? }
// `draft` holds what the user has typed so far ({ key: string }): a select with `reshape` changes which
// fields exist (the cross-section type, the load type), so the form is built again with the draft.
export function propertyFields(model, id, draft = {}) {
  const found = model.find(id);
  if (!found) return null;
  const { kind, obj } = found;

  if (kind === 'body') return bodyForm(obj, draft);
  if (kind === 'surface') {
    const len = dist(obj.p1, obj.p2);
    const deg = (Math.atan2(obj.p2[1] - obj.p1[1], obj.p2[0] - obj.p1[0]) / RAD);
    return {
      title: `Surface ${obj.id}`,
      info: [`Length ${fixed(len)} m, direction ${fixed(deg, 1)}°. Fixed in space; supports sit on it.`],
      fields: [],
    };
  }
  if (kind === 'constraint' && isLink(obj)) return linkForm(model, obj, draft);
  if (kind === 'constraint' && isJoint(obj)) return jointForm(obj);
  if (kind === 'constraint' && obj.type === 'pin_support' && obj.body === null) {
    const where = obj.surface ? `on surface ${obj.surface}` : 'not on a surface';
    return {
      title: `Festlager ${obj.id} (free space)`,
      info: [`At (${fixed(obj.point[0])}, ${fixed(obj.point[1])}) m, ${where}.`,
        'Springs, ropes and Stabs can be attached to it; use the joint tool on it to pin a mass.'],
      fields: [],
    };
  }
  if (kind === 'constraint') {
    const where = obj.surface ? `on surface ${obj.surface}` : 'not on a surface';
    return {
      title: `${SUPPORT_NAMES[obj.type]} ${obj.id}`,
      info: [`At a point of mass ${obj.body}, ${where}.`, SUPPORT_NOTES[obj.type]],
      fields: [],
    };
  }
  if (obj.type === 'damper') return damperForm(model, obj);
  if (obj.type === 'bar') return stabForm(model, obj, draft);
  return obj.type === 'spring' ? springForm(model, obj) : loadForm(obj, draft);
}

// --- cross sections -----------------------------------------------------------------------------

const MM = 1000;
const sectionKey = (k) => `sec_${k}`;

// The section a form shows: the object's own, or - after the type select changed - a default one of the
// new type with the same depth.
function formSection(current, draft, fallbackType = 'square') {
  const chosen = draft.sectionType;
  if (chosen && chosen !== 'rigid' && (!current || chosen !== current.type)) {
    const depth = current && !sectionError(current) ? sectionProps(current).depth : undefined;
    return defaultSection(chosen, depth);
  }
  return current || defaultSection(fallbackType);
}

// Fields of a cross section: type select plus the dimensions of the type, in mm.
function sectionFields(section, { allowRigid = false, rigid = false } = {}) {
  const options = SECTION_TYPES.map((t) => [t, SECTION_LABELS[t]]);
  if (allowRigid) options.unshift(['rigid', 'Rigid (no cross section)']);
  const fields = [select('sectionType', 'Cross section', rigid ? 'rigid' : section.type, options, { reshape: true })];
  if (!rigid) {
    for (const [key, label] of SECTION_FIELDS[section.type]) {
      fields.push(num(sectionKey(key), label, 'mm', round(section[key] * MM, 4), { minExclusive: 0 }));
    }
  }
  return fields;
}

// The section typed into a submitted form (values in m), or null for "rigid".
export function sectionFromValues(values) {
  const type = values.sectionType;
  if (!type || type === 'rigid') return null;
  const section = { type };
  for (const [key] of SECTION_FIELDS[type] || []) section[key] = values[sectionKey(key)] / MM;
  return section;
}

const sectionInfo = (section) => {
  const p = sectionProps(section);
  return `${describeSection(section)}: A = ${fixed(p.area * 1e4, 2)} cm², I = ${fixed(p.inertia * 1e8, 2)} cm⁴, `
    + `EI = ${fixed(E_MODULUS * p.inertia, 1)} N·m² (E = 210 GPa, steel).`;
};

const SUPPORT_NOTES = {
  pin_support: 'Locks x and y, rotation is free.',
  fixed_support: 'Locks x, y and rotation.',
  roller_support: 'Locks the direction normal to the surface; slides along it without friction.',
};

const JOINT_NAMES = { pin_joint: 'Hinge (Gelenk)', fixed_joint: 'Rigid joint' };

function installedLength(model, link) {
  const ends = linkEnds(model.scene, link);
  return ends ? dist(ends[0], ends[1]) : 0;
}

function linkForm(model, link, draft) {
  const d = installedLength(model, link);
  if (link.type === 'rod') return stabForm(model, link, draft);
  const length = link.params.length ?? d;
  return {
    title: `Rope ${link.id}`,
    info: [`Distance between the ends ${fixed(d)} m. The rope never stretches, only pulls, and hangs slack when the ends are closer than its length.`],
    fields: [num('length', 'Length', 'm', round(length, 6), { min: round(d - 1e-9, 9) })],
  };
}

const DEFAULT_SEGMENTS = 4; // of an elastic Stab
const DEFAULT_BOW = 0.00001; // initial bow of an elastic Stab, as a fraction of its length (a seed for buckling)

// A Stab: rigid (a constraint) or, with a cross section, an elastic bar: steel, axial stiffness E A / L, and a
// beam-column that bends under its own weight and buckles at the Euler load.
function stabForm(model, stab, draft) {
  const d = installedLength(model, stab);
  const rigid = stab.type === 'rod' ? !draft.sectionType || draft.sectionType === 'rigid' : draft.sectionType === 'rigid';
  const section = rigid ? null : formSection(stab.type === 'bar' ? stab.params.section : null, draft);
  const info = [`Length ${fixed(d)} m (the distance between its ends). A massless two-force member that takes push and pull.`];
  const fields = sectionFields(section || defaultSection('square'), { allowRigid: true, rigid: !section });
  if (section) {
    const p = sectionProps(section);
    const pcr = (Math.PI ** 2 * p.EI) / (Math.max(d, 1e-9) ** 2);
    const slender = d / Math.sqrt(p.inertia / p.area);
    const params = stab.type === 'bar' ? stab.params : {};
    info.length = 0;
    info.push(`Length ${fixed(d)} m. Elastic steel member, pinned at both ends: axial stiffness E A / L = ${fixed(p.EA / Math.max(d, 1e-9) / 1e6, 2)} MN/m.`);
    info.push(sectionInfo(section));
    info.push(`It buckles in the plane when the compression reaches the Euler load π² E I / L² = ${fixedForce(pcr)} (slenderness L / i = ${fixed(slender, 0)}); `
      + 'the force labels show the percentage while it is compressed. It bends under its own weight.');
    const massMode = draft.massMode || (params.mass === undefined ? 'steel' : 'given');
    fields.push(num('segments', 'Elements', '', params.segments ?? DEFAULT_SEGMENTS, { min: 1, max: 16, integer: true }));
    fields.push(select('massMode', 'Mass', massMode, [['steel', 'Steel'], ['given', 'Given']], { reshape: true }));
    if (massMode === 'given') fields.push(num('mass', 'Mass', 'kg', round(params.mass ?? 7850 * p.area * d, 6), { minExclusive: 0 }));
    fields.push(
      num('damping', 'Damping α', '1/s', params.damping ?? 0, { min: 0 }),
      num('bow', 'Initial bow', 'mm', round((params.imperfection ?? DEFAULT_BOW) * d * MM, 4), { min: 0 }),
    );
    info.push('Elements: 1 is the pure axial bar (massless, cannot bend or buckle). The initial bow (a half sine) is what lets a straight column buckle at all.');
  } else {
    info.push('Rigid: infinitely stiff, no mass, cannot buckle. Give it a cross section to make it an elastic steel bar.');
  }
  return { title: `${section ? 'Stab (elastic)' : 'Stab'} ${stab.id}`, info, fields, section };
}

// What the submitted form says about an elastic Stab beyond its section (the bar parameters), for a Stab of length d.
function stabParams(parsed, d) {
  const params = { damping: parsed.damping, segments: parsed.segments === DEFAULT_SEGMENTS ? null : parsed.segments };
  params.mass = parsed.massMode === 'given' ? parsed.mass : null;
  const ratio = parsed.bow / MM / Math.max(d, 1e-9);
  params.imperfection = Math.abs(ratio - DEFAULT_BOW) < 1e-9 ? null : ratio;
  return params;
}

const fixedForce = (n) => (n >= 1e4 ? `${fixed(n / 1e3, 1)} kN` : `${fixed(n, 0)} N`);

function jointForm(joint) {
  const at = `Joins ${joint.a.body} and ${joint.b.body}.`;
  return {
    title: `${JOINT_NAMES[joint.type]} ${joint.id}`,
    info: [at, joint.type === 'pin_joint'
      ? 'The masses can rotate against each other about this point.'
      : 'The masses cannot move against each other at all.'],
    fields: [{ key: 'jointType', label: 'Type', type: 'select', value: joint.type,
      options: [['pin_joint', JOINT_NAMES.pin_joint], ['fixed_joint', JOINT_NAMES.fixed_joint]] }],
  };
}

function bodyForm(body, draft) {
  if (body.type === 'beam') return beamForm(body, draft);
  const p = body.params;
  const v = body.velocity || [0, 0];
  const fields = [num('mass', 'Mass', 'kg', p.mass, { minExclusive: 0 })];
  if (body.type === 'node') {
    fields.push(num('vx', 'Initial vx', 'm/s', v[0]), num('vy', 'Initial vy', 'm/s', v[1]), num('damping', 'Damping α', '1/s', p.damping ?? 0, { min: 0 }));
    return {
      title: `Node ${body.id}`,
      info: ['A node (Knoten) is a point mass where Stabs meet. Supports and forces can sit on it. '
        + 'Its weight loads the Fachwerk; keep the mass small next to the loads.'],
      fields,
    };
  }
  const inertia = body.type === 'disc'
    ? 0.5 * p.mass * p.radius ** 2
    : (p.mass * (p.width ** 2 + p.height ** 2)) / 12;
  if (body.type === 'disc') {
    fields.push(num('radius', 'Radius', 'm', p.radius, { minExclusive: 0 }));
  } else {
    fields.push(
      num('width', 'Width', 'm', p.width, { minExclusive: 0 }),
      num('height', 'Height', 'm', p.height, { minExclusive: 0 }),
    );
  }
  fields.push(
    num('angle', 'Angle', '°', round((body.angle || 0) / RAD, 4)),
    num('vx', 'Initial vx', 'm/s', v[0]),
    num('vy', 'Initial vy', 'm/s', v[1]),
    num('omega', 'Initial ω', 'rad/s', body.omega || 0),
  );
  return {
    title: `${body.type === 'disc' ? 'Circular' : 'Rectangular'} mass ${body.id}`,
    info: [`Moment of inertia J = ${fixed(inertia, 4)} kg·m² about the centre of mass.`],
    fields,
  };
}

// A bendable beam: length, cross section, mass from the steel or given, and the usual start values.
function beamForm(body, draft) {
  const p = body.params;
  const v = body.velocity || [0, 0];
  const section = formSection(p.section, draft);
  const length = p.length;
  const massMode = draft.massMode || (p.mass === undefined ? 'steel' : 'given');
  const steelMass = beamMass(section, length);
  const fields = [
    num('length', 'Length', 'm', length, { minExclusive: 0 }),
    ...sectionFields(section),
    select('massMode', 'Mass', massMode, [['steel', 'Steel'], ['given', 'Given']], { reshape: true }),
  ];
  if (massMode === 'given') fields.push(num('mass', 'Mass', 'kg', round(p.mass ?? steelMass, 6), { minExclusive: 0 }));
  fields.push(
    num('damping', 'Damping α', '1/s', p.damping ?? 0, { min: 0 }),
    num('segments', 'Finite elements', '', p.segments ?? 8, { min: 2, integer: true, max: 64 }),
    num('angle', 'Angle', '°', round((body.angle || 0) / RAD, 4)),
    num('vx', 'Initial vx', 'm/s', v[0]),
    num('vy', 'Initial vy', 'm/s', v[1]),
    num('omega', 'Initial ω', 'rad/s', body.omega || 0),
  );
  const m = massMode === 'given' ? (p.mass ?? steelMass) : steelMass;
  return {
    title: `Beam ${body.id}`,
    info: [
      `${sectionInfo(section)} Mass ${fixed(m, 3)} kg (steel: 7850 kg/m³ × A × L, or given).`,
      'Bends in the plane (Euler-Bernoulli, large rotations allowed). Supports, springs and loads may attach anywhere along it. '
        + 'The nodes are placed by the engine, evenly and at every attachment. Damping α (viscous, force -α m v) lets it settle: '
        + 'every mode decays like e^(-α t / 2); 0 = it swings for ever (and a free beam keeps flying).',
    ],
    fields,
    section,
  };
}

function damperForm(model, damper) {
  const a = anchorWorld(model.scene, damper.a);
  const b = anchorWorld(model.scene, damper.b);
  return {
    title: `Damper ${damper.id}`,
    info: [`Between two points ${fixed(a && b ? dist(a, b) : 0)} m apart. The force is c times the rate of change of the length: `
      + 'it resists every relative motion of its ends, stores no energy and has no relaxed length.'],
    fields: [num('c', 'Damping c', 'N·s/m', damper.params.c, { min: 0 })],
  };
}

function springForm(model, spring) {
  const a = anchorWorld(model.scene, spring.a);
  const b = anchorWorld(model.scene, spring.b);
  const installed = a && b ? dist(a, b) : 0;
  const rest = spring.params.rest_length ?? installed;
  const state = rest < installed - 1e-9 ? 'tension (pulls the ends together)'
    : rest > installed + 1e-9 ? 'compression (pushes the ends apart)' : 'unloaded';
  return {
    title: `Spring ${spring.id}`,
    info: [`Installed length ${fixed(installed)} m. At the start the spring is in ${state}.`],
    fields: [
      num('k', 'Stiffness k', 'N/m', spring.params.k, { min: 0 }),
      num('restLength', 'Relaxed length (ghost)', 'm', round(rest, 6), { min: 0 }),
    ],
  };
}

function loadForm(load, draft) {
  const mode = draft.mode || load.params.mode || 'constant';
  const f = load.params.force || [0, 0];
  const impulse = mode === 'impulse';
  const harmonic = mode === 'harmonic';
  const fields = [
    select('mode', 'Type', mode, [['constant', 'Constant'], ['impulse', 'Impulse at t = 0'], ['harmonic', 'Harmonic: F sin(2π f t + φ)']], { reshape: true }),
    num('fx', harmonic ? 'Amplitude x' : 'Force x', impulse ? 'N·s' : 'N', f[0]),
    num('fy', harmonic ? 'Amplitude y' : 'Force y', impulse ? 'N·s' : 'N', f[1]),
    num('moment', harmonic ? 'Moment amplitude' : 'Moment', impulse ? 'N·m·s' : 'N·m', load.params.moment || 0),
  ];
  let info = 'A constant load acts for the whole simulation; the force direction stays fixed in the world.';
  if (impulse) info = 'An impulse is a velocity jump at t = 0 (also after Reset).';
  if (harmonic) {
    const freq = load.params.frequency ?? 1;
    fields.push(
      num('frequency', 'Frequency f', 'Hz', freq, { minExclusive: 0 }),
      num('phase', 'Phase φ', '°', round((load.params.phase || 0) / RAD, 4)),
    );
    info = `The force is F₀ sin(2π f t + φ) (Ω = 2π f = ${fixed(2 * Math.PI * freq, 3)} rad/s); its direction stays fixed in the world. `
      + 'It does work on the system: the energy is not conserved.';
  }
  return {
    title: `${impulse ? 'Impulse' : harmonic ? 'Harmonic load' : 'Force / moment'} ${load.id}`,
    info: [info],
    fields,
  };
}

// values: { key: string | number } as typed in the form. Returns { ok, errors }. Nothing is changed
// unless every value is valid.
export function applyProperties(model, id, values) {
  const form = propertyFields(model, id, values);
  if (!form) return { ok: false, errors: [`unknown object "${id}"`] };

  const parsed = {};
  const errors = [];
  for (const f of form.fields) {
    if (f.type === 'select') {
      parsed[f.key] = String(values[f.key]);
      if (!f.options.some(([v]) => v === parsed[f.key])) errors.push(`${f.label}: unknown option`);
      continue;
    }
    const text = String(values[f.key] ?? '').trim().replace(',', '.');
    const n = text === '' ? NaN : Number(text);
    if (!Number.isFinite(n)) {
      errors.push(`${f.label}: enter a number`);
    } else if (f.minExclusive !== undefined && !(n > f.minExclusive)) {
      errors.push(`${f.label}: must be greater than ${f.minExclusive}`);
    } else if (f.min !== undefined && n < f.min) {
      errors.push(`${f.label}: must be at least ${fixed(f.min, 3)}`);
    } else if (f.max !== undefined && n > f.max) {
      errors.push(`${f.label}: must be at most ${fixed(f.max, 3)}`);
    } else if (f.integer && !Number.isInteger(n)) {
      errors.push(`${f.label}: must be a whole number`);
    } else {
      parsed[f.key] = n;
    }
  }
  // dimensions that are valid one by one but do not fit together (flanges thicker than the section ...)
  if (!errors.length && form.fields.some((f) => f.key === 'sectionType')) {
    const section = sectionFromValues(parsed);
    const problem = section && sectionError(section);
    if (problem) errors.push(`Cross section: ${problem}.`);
  }
  if (errors.length) return { ok: false, errors };

  const found = model.find(id);
  const kind = found.kind;
  if (kind === 'constraint' && found.obj.type === 'rope') {
    const d = installedLength(model, found.obj);
    model.updateRope(id, { length: Math.abs(parsed.length - d) < 1e-6 ? null : parsed.length });
  } else if (kind === 'constraint' && found.obj.type === 'rod') {
    const section = sectionFromValues(parsed);
    if (section) {
      const extra = stabParams(parsed, installedLength(model, found.obj));
      model.setStabSection(id, section, Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null)));
    }
  } else if (kind === 'constraint' && isJoint(found.obj)) {
    if (parsed.jointType !== found.obj.type) model.setJointType(id, parsed.jointType);
  } else if (kind === 'body') {
    const patch = { mass: parsed.mass, angle: parsed.angle * RAD, velocity: [parsed.vx, parsed.vy], omega: parsed.omega };
    if (found.obj.type === 'node') {
      delete patch.angle;
      delete patch.omega;
      patch.damping = parsed.damping;
    }
    for (const key of ['width', 'height', 'radius', 'length']) if (key in parsed) patch[key] = parsed[key];
    if (found.obj.type === 'beam') {
      patch.section = sectionFromValues(parsed);
      patch.mass = parsed.massMode === 'given' ? parsed.mass : null;
      patch.segments = parsed.segments === 8 && found.obj.params.segments === undefined ? undefined : parsed.segments;
      patch.damping = parsed.damping;
    }
    model.updateBody(id, patch);
  } else if (kind === 'element' && found.obj.type === 'bar') {
    const section = sectionFromValues(parsed);
    if (section) model.updateBar(id, { section, ...stabParams(parsed, installedLength(model, found.obj)) });
    else model.setStabSection(id, null);
  } else if (kind === 'element' && 'c' in parsed) {
    model.updateElement(id, { c: parsed.c });
  } else if (kind === 'element' && 'k' in parsed) {
    model.updateElement(id, { k: parsed.k, restLength: parsed.restLength });
  } else if (kind === 'element') {
    const patch = { mode: parsed.mode, force: [parsed.fx, parsed.fy], moment: parsed.moment };
    if (parsed.mode === 'harmonic') Object.assign(patch, { frequency: parsed.frequency, phase: parsed.phase * RAD });
    model.updateElement(id, patch);
  }
  return { ok: true, errors: [] };
}

function fixed(x, digits = 2) {
  return Number.isFinite(x) ? x.toFixed(digits) : '–';
}

function round(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
