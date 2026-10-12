// properties.js - the right-click property forms, as data. Pure: editor.js renders the fields and
// calls applyProperties() with what the user typed.
import { anchorWorld, isJoint, isLink, linkEnds } from './hit.js';
import { dist } from './geometry.js';

const RAD = Math.PI / 180;
const SUPPORT_NAMES = {
  pin_support: 'Festlager',
  fixed_support: 'Lager (fixed)',
  roller_support: 'Loslager',
};

const num = (key, label, unit, value, extra = {}) => ({ key, label, unit, type: 'number', value, ...extra });

// { title, info: [string], fields: [...] , deletable: true } or null for an unknown id.
// Field: { key, label, unit, type: "number" | "select", value, min?, minExclusive?, options? }
export function propertyFields(model, id) {
  const found = model.find(id);
  if (!found) return null;
  const { kind, obj } = found;

  if (kind === 'body') return bodyForm(obj);
  if (kind === 'surface') {
    const len = dist(obj.p1, obj.p2);
    const deg = (Math.atan2(obj.p2[1] - obj.p1[1], obj.p2[0] - obj.p1[0]) / RAD);
    return {
      title: `Surface ${obj.id}`,
      info: [`Length ${fixed(len)} m, direction ${fixed(deg, 1)}°. Fixed in space; supports sit on it.`],
      fields: [],
    };
  }
  if (kind === 'constraint' && isLink(obj)) return linkForm(model, obj);
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
  return obj.type === 'spring' ? springForm(model, obj) : loadForm(obj);
}

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

function linkForm(model, link) {
  const d = installedLength(model, link);
  if (link.type === 'rod') {
    return {
      title: `Stab ${link.id}`,
      info: [`Length ${fixed(d)} m (the distance between its ends). A massless two-force member: it takes push and pull and has no other properties.`],
      fields: [],
    };
  }
  const length = link.params.length ?? d;
  return {
    title: `Rope ${link.id}`,
    info: [`Distance between the ends ${fixed(d)} m. The rope never stretches, only pulls, and hangs slack when the ends are closer than its length.`],
    fields: [num('length', 'Length', 'm', round(length, 6), { min: round(d - 1e-9, 9) })],
  };
}

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

function bodyForm(body) {
  const p = body.params;
  const inertia = body.type === 'disc'
    ? 0.5 * p.mass * p.radius ** 2
    : (p.mass * (p.width ** 2 + p.height ** 2)) / 12;
  const v = body.velocity || [0, 0];
  const fields = [num('mass', 'Mass', 'kg', p.mass, { minExclusive: 0 })];
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

function loadForm(load) {
  const mode = load.params.mode || 'constant';
  const f = load.params.force || [0, 0];
  const impulse = mode === 'impulse';
  return {
    title: `${impulse ? 'Impulse' : 'Force / moment'} ${load.id}`,
    info: [impulse
      ? 'An impulse is a velocity jump at t = 0 (also after Reset).'
      : 'A constant load acts for the whole simulation; the force direction stays fixed in the world.'],
    fields: [
      { key: 'mode', label: 'Type', type: 'select', value: mode,
        options: [['constant', 'Constant'], ['impulse', 'Impulse at t = 0']] },
      num('fx', 'Force x', impulse ? 'N·s' : 'N', f[0]),
      num('fy', 'Force y', impulse ? 'N·s' : 'N', f[1]),
      num('moment', 'Moment', impulse ? 'N·m·s' : 'N·m', load.params.moment || 0),
    ],
  };
}

// values: { key: string | number } as typed in the form. Returns { ok, errors }. Nothing is changed
// unless every value is valid.
export function applyProperties(model, id, values) {
  const form = propertyFields(model, id);
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
    } else {
      parsed[f.key] = n;
    }
  }
  if (errors.length) return { ok: false, errors };

  const found = model.find(id);
  const kind = found.kind;
  if (kind === 'constraint' && found.obj.type === 'rope') {
    const d = installedLength(model, found.obj);
    model.updateRope(id, { length: Math.abs(parsed.length - d) < 1e-6 ? null : parsed.length });
  } else if (kind === 'constraint' && isJoint(found.obj)) {
    if (parsed.jointType !== found.obj.type) model.setJointType(id, parsed.jointType);
  } else if (kind === 'body') {
    const patch = { mass: parsed.mass, angle: parsed.angle * RAD, velocity: [parsed.vx, parsed.vy], omega: parsed.omega };
    for (const key of ['width', 'height', 'radius']) if (key in parsed) patch[key] = parsed[key];
    model.updateBody(id, patch);
  } else if (kind === 'element' && 'c' in parsed) {
    model.updateElement(id, { c: parsed.c });
  } else if (kind === 'element' && 'k' in parsed) {
    model.updateElement(id, { k: parsed.k, restLength: parsed.restLength });
  } else if (kind === 'element') {
    model.updateElement(id, { mode: parsed.mode, force: [parsed.fx, parsed.fy], moment: parsed.moment });
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
