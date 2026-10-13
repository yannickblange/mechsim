// properties.js - the right-click property forms, as data. Pure: editor.js renders the fields and
// calls applyProperties() with what the user typed.
import { comma, decimal } from '../format.js';
import { anchorWorld, isJoint, isLink, linkEnds } from './hit.js';
import { massEnds, stabClamps } from './ends.js';
import { dist } from './geometry.js';
import {
  E_MODULUS, SECTION_FIELDS, SECTION_LABELS, SECTION_TYPES, beamMass, defaultSection, describeSection,
  sectionError, sectionProps,
} from './section.js';

const RAD = Math.PI / 180;
const SUPPORT_NAMES = {
  pin_support: 'Festlager',
  fixed_support: 'Einspannung',
  roller_support: 'Loslager',
};

const num = (key, label, unit, value, extra = {}) => ({ key, label, unit, type: 'number', value, ...extra });
const select = (key, label, value, options, extra = {}) => ({ key, label, type: 'select', value, options, ...extra });

// { title, info: [string], fields: [...], section?: { ...section } } or null for an unknown id.
// Field: { key, label, unit, type: "number" | "select", value, min?, minExclusive?, options?, reshape?, onDrawing? }
// (`onDrawing`: a dimension of the cross section, entered on the dimensioned drawing, not in a row)
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
      title: `Fläche ${obj.id}`,
      info: [`Länge ${fixed(len)} m, Richtung ${fixed(deg, 1)}°. Im Raum fest; Lager sitzen auf ihr.`],
      fields: [],
    };
  }
  if (kind === 'constraint' && isLink(obj)) return linkForm(model, obj, draft);
  if (kind === 'constraint' && isJoint(obj)) return jointForm(obj);
  if (kind === 'constraint' && obj.type === 'pin_support' && obj.body === null) {
    const where = obj.surface ? `auf Fläche ${obj.surface}` : 'nicht auf einer Fläche';
    return {
      title: `Festlager ${obj.id} (freier Raum)`,
      info: [`Bei (${fixed(obj.point[0])}; ${fixed(obj.point[1])}) m, ${where}.`,
        'Federn, Seile und Stäbe können daran angreifen; mit dem Gelenk-Werkzeug lässt sich darauf eine Masse lagern.'],
      fields: [],
    };
  }
  if (kind === 'constraint') {
    const where = obj.surface ? `auf Fläche ${obj.surface}` : 'nicht auf einer Fläche';
    return {
      title: `${SUPPORT_NAMES[obj.type]} ${obj.id}`,
      info: [`An einem Punkt der Masse ${obj.body}, ${where}.`, SUPPORT_NOTES[obj.type]],
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
  if (allowRigid) options.unshift(['rigid', 'Starr (kein Querschnitt)']);
  const fields = [select('sectionType', 'Querschnitt', rigid ? 'rigid' : section.type, options, { reshape: true })];
  if (!rigid) {
    for (const [key, label] of SECTION_FIELDS[section.type]) {
      fields.push(num(sectionKey(key), label, 'mm', round(section[key] * MM, 4), { minExclusive: 0, onDrawing: true }));
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
    + `EI = ${fixed(E_MODULUS * p.inertia, 1)} N·m² (E = 210 GPa, Stahl).`;
};

const SUPPORT_NOTES = {
  pin_support: 'Sperrt x und y, die Drehung ist frei.',
  fixed_support: 'Sperrt x, y und die Drehung.',
  roller_support: 'Sperrt die Richtung senkrecht zur Fläche; gleitet reibungsfrei an ihr entlang.',
};

const JOINT_NAMES = { pin_joint: 'Gelenk', fixed_joint: 'Starre Verbindung' };

function installedLength(model, link) {
  const ends = linkEnds(model.scene, link);
  return ends ? dist(ends[0], ends[1]) : 0;
}

function linkForm(model, link, draft) {
  const d = installedLength(model, link);
  if (link.type === 'rod') return stabForm(model, link, draft);
  const length = link.params.length ?? d;
  return {
    title: `Seil ${link.id}`,
    info: [`Abstand der Enden ${fixed(d)} m. Das Seil dehnt sich nie, zieht nur und hängt durch, wenn die Enden näher beieinander liegen als seine Länge.`],
    fields: [num('length', 'Länge', 'm', round(length, 6), { min: round(d - 1e-9, 9) })],
  };
}

// K: effective length factor of Euler's cases (both ends pinned 1, one end clamped 0.699, both 0.5; the ends held sideways).
const EULER_K = [1, 0.6991546, 0.5];

const DEFAULT_SEGMENTS = 4; // of an elastic Stab
const DEFAULT_BOW = 0.00001; // initial bow of an elastic Stab, as a fraction of its length (a seed for buckling)

// A Stab: rigid (a constraint) or, with a cross section, an elastic bar: steel, axial stiffness E A / L, and a
// beam-column that bends under its own weight and buckles at the Euler load.
function stabForm(model, stab, draft) {
  const d = installedLength(model, stab);
  const rigid = stab.type === 'rod' ? !draft.sectionType || draft.sectionType === 'rigid' : draft.sectionType === 'rigid';
  const section = rigid ? null : formSection(stab.type === 'bar' ? stab.params.section : null, draft);
  const info = [`Länge ${fixed(d)} m (Abstand seiner Enden). Ein masseloses Zweikraftglied, das Druck und Zug aufnimmt.`];
  const fields = sectionFields(section || defaultSection('square'), { allowRigid: true, rigid: !section });
  // an end on a block or a disc: clamped (an Einspannung, the Stab is a rigid arm of the mass) or a pin
  const clamped = stabClamps(model.scene, stab);
  for (const side of massEnds(model.scene, stab)) {
    const i = side === 'a' ? 0 : 1;
    const kind = draft[`end_${side}`] || (clamped[i] ? 'clamped' : 'hinged');
    fields.push(select(`end_${side}`, `Anschluss Ende ${side.toUpperCase()} (${stab[side].body})`, kind,
      [['clamped', 'Fest eingespannt'], ['hinged', 'Gelenk']]));
  }
  if (massEnds(model.scene, stab).length) {
    info.push('An einer Masse ist das Stabende fest eingespannt: der Stab ist ein starrer Arm der Masse und dreht mit ihr (Einspannung). '
      + '„Gelenk“ macht das Ende zu einem Gelenk, das sich frei dreht.');
  }
  if (section) {
    const p = sectionProps(section);
    const clamps = stabClamps(model.scene, stab).filter(Boolean).length;
    const K = EULER_K[clamps];
    const pcr = (Math.PI ** 2 * p.EI) / ((K * Math.max(d, 1e-9)) ** 2);
    const slender = d / Math.sqrt(p.inertia / p.area);
    const params = stab.type === 'bar' ? stab.params : {};
    info.length = 0;
    info.push(`Länge ${fixed(d)} m. Elastischer Stahlstab, an den Enden gelenkig (an einer Einspannung fest eingespannt): Dehnsteifigkeit E A / L = ${fixed(p.EA / Math.max(d, 1e-9) / 1e6, 2)} MN/m.`);
    info.push(sectionInfo(section));
    const ends = ['beide Enden gelenkig (Eulerfall 2)', 'ein Ende fest eingespannt, das andere seitlich gehalten (Eulerfall 3)',
      'beide Enden fest eingespannt (Eulerfall 4)'][clamps];
    info.push(`Er knickt in der Ebene aus, wenn die Druckkraft die Eulersche Knicklast π² E I / (K L)² = ${fixedForce(pcr)} erreicht `
      + `(${ends}, K = ${fixed(K, 2)}; Schlankheit L / i = ${fixed(slender, 0)}); `
      + 'die Kraftanzeige nennt den Prozentsatz, solange er gedrückt wird. Er biegt sich unter seinem Eigengewicht durch.');
    const massMode = draft.massMode || (params.mass === undefined ? 'steel' : 'given');
    fields.push(num('segments', 'Elemente', '', params.segments ?? DEFAULT_SEGMENTS, { min: 1, max: 16, integer: true }));
    fields.push(select('massMode', 'Masse', massMode, [['steel', 'Stahl'], ['given', 'Vorgegeben']], { reshape: true }));
    if (massMode === 'given') fields.push(num('mass', 'Masse', 'kg', round(params.mass ?? 7850 * p.area * d, 6), { minExclusive: 0 }));
    fields.push(
      num('damping', 'Dämpfung α', '1/s', params.damping ?? 0, { min: 0 }),
      num('bow', 'Vorkrümmung', 'mm', round((params.imperfection ?? DEFAULT_BOW) * d * MM, 4), { min: 0 }),
    );
    info.push('Elemente: 1 ist der reine Zugstab (masselos, kann sich nicht biegen oder knicken). Die Vorkrümmung (eine Halbsinuswelle) lässt eine gerade Stütze überhaupt erst ausknicken.');
  } else {
    info.push('Starr: unendlich steif, ohne Masse, knickt nicht. Mit einem Querschnitt wird daraus ein elastischer Stahlstab.');
  }
  return { title: `${section ? 'Stab (elastisch)' : 'Stab'} ${stab.id}`, info, fields, section };
}

// The end conditions typed into a Stab form ("clamped" | "hinged" per end on a mass).
function setEnds(model, id, parsed) {
  const hinged = {};
  for (const side of ['a', 'b']) if (parsed[`end_${side}`] !== undefined) hinged[side] = parsed[`end_${side}`] === 'hinged';
  if (Object.keys(hinged).length) model.setStabEnds(id, hinged);
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
  const at = `Verbindet ${joint.a.body} und ${joint.b.body}.`;
  return {
    title: `${JOINT_NAMES[joint.type]} ${joint.id}`,
    info: [at, joint.type === 'pin_joint'
      ? 'Die Massen können sich um diesen Punkt gegeneinander drehen.'
      : 'Die Massen können sich überhaupt nicht gegeneinander bewegen.'],
    fields: [{ key: 'jointType', label: 'Art', type: 'select', value: joint.type,
      options: [['pin_joint', JOINT_NAMES.pin_joint], ['fixed_joint', JOINT_NAMES.fixed_joint]] }],
  };
}

function bodyForm(body, draft) {
  if (body.type === 'beam') return beamForm(body, draft);
  const p = body.params;
  const v = body.velocity || [0, 0];
  const fields = [num('mass', 'Masse', 'kg', p.mass, { minExclusive: 0 })];
  if (body.type === 'node') {
    fields.push(num('vx', 'vx (Anfang)', 'm/s', v[0]), num('vy', 'vy (Anfang)', 'm/s', v[1]), num('damping', 'Dämpfung α', '1/s', p.damping ?? 0, { min: 0 }));
    return {
      title: `Knoten ${body.id}`,
      info: ['Ein Knoten ist eine Punktmasse, an der Stäbe zusammentreffen. Lager und Kräfte können an ihm angreifen. '
        + 'Sein Gewicht belastet das Fachwerk; die Masse klein gegenüber den Lasten halten.'],
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
      num('width', 'Breite', 'm', p.width, { minExclusive: 0 }),
      num('height', 'Höhe', 'm', p.height, { minExclusive: 0 }),
    );
  }
  fields.push(
    num('angle', 'Winkel', '°', round((body.angle || 0) / RAD, 4)),
    num('vx', 'vx (Anfang)', 'm/s', v[0]),
    num('vy', 'vy (Anfang)', 'm/s', v[1]),
    num('omega', 'ω (Anfang)', 'rad/s', body.omega || 0),
  );
  return {
    title: `${body.type === 'disc' ? 'Kreisförmige' : 'Rechteckige'} Masse ${body.id}`,
    info: [`Massenträgheitsmoment J = ${fixed(inertia, 4)} kg·m² um den Schwerpunkt.`],
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
    num('length', 'Länge', 'm', length, { minExclusive: 0 }),
    ...sectionFields(section),
    select('massMode', 'Masse', massMode, [['steel', 'Stahl'], ['given', 'Vorgegeben']], { reshape: true }),
  ];
  if (massMode === 'given') fields.push(num('mass', 'Masse', 'kg', round(p.mass ?? steelMass, 6), { minExclusive: 0 }));
  fields.push(
    num('damping', 'Dämpfung α', '1/s', p.damping ?? 0, { min: 0 }),
    num('segments', 'Finite Elemente', '', p.segments ?? 8, { min: 2, integer: true, max: 64 }),
    num('angle', 'Winkel', '°', round((body.angle || 0) / RAD, 4)),
    num('vx', 'vx (Anfang)', 'm/s', v[0]),
    num('vy', 'vy (Anfang)', 'm/s', v[1]),
    num('omega', 'ω (Anfang)', 'rad/s', body.omega || 0),
  );
  const m = massMode === 'given' ? (p.mass ?? steelMass) : steelMass;
  return {
    title: `Balken ${body.id}`,
    info: [
      `${sectionInfo(section)} Masse ${fixed(m, 3)} kg (Stahl: 7850 kg/m³ × A × L, oder vorgegeben).`,
      'Biegt sich in der Ebene (Euler-Bernoulli, große Drehungen erlaubt). Lager, Federn und Lasten können überall am Balken angreifen. '
        + 'Die Knoten setzt der Rechenkern gleichmäßig und an jeder Anbindung. Die Dämpfung α (viskos, Kraft −α m v) lässt ihn zur Ruhe kommen: '
        + 'jede Eigenform klingt wie e^(−α t / 2) ab; 0 = er schwingt ewig (und ein freier Balken fliegt weiter).',
    ],
    fields,
    section,
  };
}

function damperForm(model, damper) {
  const a = anchorWorld(model.scene, damper.a);
  const b = anchorWorld(model.scene, damper.b);
  return {
    title: `Dämpfer ${damper.id}`,
    info: [`Zwischen zwei Punkten im Abstand von ${fixed(a && b ? dist(a, b) : 0)} m. Die Kraft ist c mal die Änderungsrate der Länge: `
      + 'er wirkt jeder Relativbewegung seiner Enden entgegen, speichert keine Energie und hat keine entspannte Länge.'],
    fields: [num('c', 'Dämpfung c', 'N·s/m', damper.params.c, { min: 0 })],
  };
}

function springForm(model, spring) {
  const a = anchorWorld(model.scene, spring.a);
  const b = anchorWorld(model.scene, spring.b);
  const installed = a && b ? dist(a, b) : 0;
  const rest = spring.params.rest_length ?? installed;
  const state = rest < installed - 1e-9 ? 'Zug (zieht die Enden zusammen)'
    : rest > installed + 1e-9 ? 'Druck (drückt die Enden auseinander)' : 'unbelastet';
  return {
    title: `Feder ${spring.id}`,
    info: [`Eingebaute Länge ${fixed(installed)} m. Zu Beginn: ${state}.`],
    fields: [
      num('k', 'Steifigkeit k', 'N/m', spring.params.k, { min: 0 }),
      num('restLength', 'Entspannte Länge (Schatten)', 'm', round(rest, 6), { min: 0 }),
    ],
  };
}

function loadForm(load, draft) {
  const mode = draft.mode || load.params.mode || 'constant';
  const f = load.params.force || [0, 0];
  const impulse = mode === 'impulse';
  const harmonic = mode === 'harmonic';
  const fields = [
    select('mode', 'Art', mode, [['constant', 'Konstant'], ['impulse', 'Impuls bei t = 0'], ['harmonic', 'Harmonisch: F sin(2π f t + φ)']], { reshape: true }),
    num('fx', harmonic ? 'Amplitude x' : 'Kraft x', impulse ? 'N·s' : 'N', f[0]),
    num('fy', harmonic ? 'Amplitude y' : 'Kraft y', impulse ? 'N·s' : 'N', f[1]),
    num('moment', harmonic ? 'Momentamplitude' : 'Moment', impulse ? 'N·m·s' : 'N·m', load.params.moment || 0),
  ];
  let info = 'Eine konstante Last wirkt während der ganzen Simulation; die Kraftrichtung bleibt im Raum fest.';
  if (impulse) info = 'Ein Impuls ist ein Geschwindigkeitssprung bei t = 0 (auch nach dem Zurücksetzen).';
  if (harmonic) {
    const freq = load.params.frequency ?? 1;
    fields.push(
      num('frequency', 'Frequenz f', 'Hz', freq, { minExclusive: 0 }),
      num('phase', 'Phasenwinkel φ', '°', round((load.params.phase || 0) / RAD, 4)),
    );
    info = `Die Kraft ist F₀ sin(2π f t + φ) (Ω = 2π f = ${fixed(2 * Math.PI * freq, 3)} rad/s); ihre Richtung bleibt im Raum fest. `
      + 'Sie verrichtet Arbeit am System: die Energie bleibt nicht erhalten.';
  }
  return {
    title: `${impulse ? 'Impuls' : harmonic ? 'Harmonische Last' : 'Kraft / Moment'} ${load.id}`,
    info: [info],
    fields,
  };
}

// values: { key: string | number } as typed in the form. Returns { ok, errors }. Nothing is changed
// unless every value is valid.
export function applyProperties(model, id, values) {
  const form = propertyFields(model, id, values);
  if (!form) return { ok: false, errors: [`unbekanntes Objekt „${id}“`] };

  const parsed = {};
  const errors = [];
  for (const f of form.fields) {
    if (f.type === 'select') {
      parsed[f.key] = String(values[f.key]);
      if (!f.options.some(([v]) => v === parsed[f.key])) errors.push(`${f.label}: unbekannte Auswahl`);
      continue;
    }
    const text = String(values[f.key] ?? '').trim().replace(',', '.');
    const n = text === '' ? NaN : Number(text);
    if (!Number.isFinite(n)) {
      errors.push(`${f.label}: eine Zahl eingeben`);
    } else if (f.minExclusive !== undefined && !(n > f.minExclusive)) {
      errors.push(`${f.label}: muss größer als ${comma(f.minExclusive)} sein`);
    } else if (f.min !== undefined && n < f.min) {
      errors.push(`${f.label}: muss mindestens ${fixed(f.min, 3)} sein`);
    } else if (f.max !== undefined && n > f.max) {
      errors.push(`${f.label}: darf höchstens ${fixed(f.max, 3)} sein`);
    } else if (f.integer && !Number.isInteger(n)) {
      errors.push(`${f.label}: muss eine ganze Zahl sein`);
    } else {
      parsed[f.key] = n;
    }
  }
  // dimensions that are valid one by one but do not fit together (flanges thicker than the section ...)
  if (!errors.length && form.fields.some((f) => f.key === 'sectionType')) {
    const section = sectionFromValues(parsed);
    const problem = section && sectionError(section);
    if (problem) errors.push(`Querschnitt: ${problem}.`);
  }
  if (errors.length) return { ok: false, errors };

  const found = model.find(id);
  const kind = found.kind;
  if (kind === 'constraint' && found.obj.type === 'rope') {
    const d = installedLength(model, found.obj);
    model.updateRope(id, { length: Math.abs(parsed.length - d) < 1e-6 ? null : parsed.length });
  } else if (kind === 'constraint' && found.obj.type === 'rod') {
    setEnds(model, id, parsed);
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
    setEnds(model, id, parsed);
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

const fixed = decimal;

function round(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
