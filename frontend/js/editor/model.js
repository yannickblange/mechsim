// model.js - the scene being edited: creation, editing, deletion (with cascades), undo / redo.
// Holds a plain scene object (contracts/scene.schema.json, version 0.4) and never touches the DOM.
import { dist, nextId, roundTo, sub, tidy, tidyPoint } from './geometry.js';
import { normalizeRopes } from './moves.js';
import { defaultSection } from './section.js';

export const DEFAULT_MASS = 1.0;
export const DEFAULT_SPRING_K = 100.0;
export const DEFAULT_DAMPING = 10.0; // N s / m
export const DEFAULT_NODE_MASS = 1.0; // kg of a Knoten (the weight is small next to typical truss loads)
export const DEFAULT_FREQUENCY = 1.0; // Hz of a new harmonic load
const HISTORY_LIMIT = 100;

const SUPPORT_TYPES = {
  pin_support: 'A', // Festlager
  fixed_support: 'E', // Lager / Einspannung
  roller_support: 'B', // Loslager
};

const JOINT_TYPES = {
  pin_joint: 'G', // Gelenk
  fixed_joint: 'W', // rigid connection ("weld")
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const anchor = ({ body, point }) => ({ body, point: tidyPoint(point) });

export class SceneModel {
  constructor(scene = SceneModel.emptyScene()) {
    this.listeners = new Set();
    this.load(scene);
  }

  static emptyScene() {
    return {
      version: '0.4',
      name: '',
      gravity: [0, -9.81],
      solver: { dt: 0.001 },
      view: { center: [0, 1], width: 6 },
      surfaces: [],
      bodies: [],
      elements: [],
      constraints: [],
    };
  }

  // Replace the whole scene (also resets undo history and the dirty flag).
  load(scene) {
    const s = clone(scene);
    s.version = '0.4';
    for (const key of ['surfaces', 'bodies', 'elements', 'constraints']) s[key] ||= [];
    this.scene = s;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false; // changed since load or the last save
    this.revision = 0; // number of changes since load (saving does not reset it)
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn(this);
  }

  toJSON() {
    return clone(this.scene);
  }

  // --- undo / redo ----------------------------------------------------------------------------

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // Run `change` as one undoable step. Returns whatever `change` returns.
  #edit(change) {
    const before = clone(this.scene);
    const result = change(this.scene);
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.revision++;
    this.emit();
    return result;
  }

  // A drag as one undoable step. update(fn) shows the result of fn(scene) applied to the scene as it
  // was when the transaction began (so every pointer move starts from the same state); commit()
  // records one undo step; cancel() restores the original.
  transaction() {
    const before = clone(this.scene);
    let changed = false;
    return {
      update: (fn) => {
        this.scene = clone(before);
        fn(this.scene);
        changed = true;
        this.emit();
      },
      commit: () => {
        // A drag that ended where it began (or was refused everywhere) records nothing.
        if (!changed || JSON.stringify(this.scene) === JSON.stringify(before)) return false;
        this.undoStack.push(before);
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
        this.redoStack = [];
        this.dirty = true;
        this.revision++;
        this.emit();
        return true;
      },
      cancel: () => {
        if (!changed) return;
        this.scene = before;
        this.emit();
      },
    };
  }

  undo() {
    if (!this.canUndo) return false;
    this.redoStack.push(this.scene);
    this.scene = this.undoStack.pop();
    this.dirty = true;
    this.revision++;
    this.emit();
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.undoStack.push(this.scene);
    this.scene = this.redoStack.pop();
    this.dirty = true;
    this.revision++;
    this.emit();
    return true;
  }

  // --- queries --------------------------------------------------------------------------------

  allIds() {
    const s = this.scene;
    return [...s.surfaces, ...s.bodies, ...s.elements, ...s.constraints].map((o) => o.id);
  }

  // { kind: "surface" | "body" | "element" | "constraint", obj } or null.
  find(id) {
    for (const [kind, list] of [
      ['surface', this.scene.surfaces], ['body', this.scene.bodies],
      ['element', this.scene.elements], ['constraint', this.scene.constraints],
    ]) {
      const obj = list.find((o) => o.id === id);
      if (obj) return { kind, obj };
    }
    return null;
  }

  body(id) {
    return this.scene.bodies.find((b) => b.id === id) || null;
  }

  // --- creation -------------------------------------------------------------------------------

  addBlock({ center, width, height, mass = DEFAULT_MASS }) {
    return this.#edit((s) => {
      const id = nextId('m', this.allIds());
      s.bodies.push({
        id, type: 'block', position: tidyPoint(center), angle: 0,
        params: { mass, width: tidy(width), height: tidy(height) },
      });
      return id;
    });
  }

  addDisc({ center, radius, mass = DEFAULT_MASS }) {
    return this.#edit((s) => {
      const id = nextId('m', this.allIds());
      s.bodies.push({
        id, type: 'disc', position: tidyPoint(center), angle: 0,
        params: { mass, radius: tidy(radius) },
      });
      return id;
    });
  }

  // Knoten: the point where Stabs meet (a point mass; supports and loads can sit on it).
  addNode({ point, mass = DEFAULT_NODE_MASS }) {
    return this.#edit((s) => addNodeTo(s, point, mass));
  }

  // Bendable beam from the start to the end of its axis; the default cross section is a square whose
  // side follows the length (L / 40, between 10 and 100 mm).
  addBeam({ start, end, section, mass }) {
    return this.#edit((s) => {
      const id = nextId('b', this.allIds());
      const L = dist(start, end);
      const side = Math.min(0.1, Math.max(0.01, roundTo(L / 40, 0.005)));
      const d = sub(end, start);
      const params = { length: tidy(L), section: section || defaultSection('square', side) };
      if (mass !== undefined) params.mass = mass;
      s.bodies.push({
        id, type: 'beam', position: tidyPoint([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]),
        angle: tidy(Math.atan2(d[1], d[0])), params,
      });
      return id;
    });
  }

  addSurface(p1, p2) {
    return this.#edit((s) => {
      const id = nextId('s', this.allIds());
      s.surfaces.push({ id, p1: tidyPoint(p1), p2: tidyPoint(p2) });
      return id;
    });
  }

  // a, b: { body: id | null, point: [x, y] }. restLength defaults to the installed length.
  // The end on the ground is stored first, so the relaxed ("ghost") spring hangs from it.
  addSpring({ a, b, k = DEFAULT_SPRING_K, restLength }) {
    return this.#edit((s) => {
      const [first, second] = a.body !== null && b.body === null ? [b, a] : [a, b];
      const id = nextId('k', this.allIds());
      const spring = {
        id, type: 'spring',
        a: { body: first.body, point: tidyPoint(first.point) },
        b: { body: second.body, point: tidyPoint(second.point) },
        params: { k },
      };
      if (restLength !== undefined) spring.params.rest_length = tidy(restLength);
      s.elements.push(spring);
      return id;
    });
  }

  // Damper between two ends { body: id | null, point } (at least one on a mass, different masses).
  addDamper({ a, b, c = DEFAULT_DAMPING }) {
    return this.#edit((s) => {
      const id = nextId('c', this.allIds());
      s.elements.push({ id, type: 'damper', a: anchor(a), b: anchor(b), params: { c } });
      return id;
    });
  }

  addLoad({ body, point, force = [0, 0], moment = 0, mode = 'constant' }) {
    return this.#edit((s) => {
      const id = nextId('F', this.allIds());
      s.elements.push({
        id, type: 'load', body, point: tidyPoint(point),
        params: { force: tidyPoint(force), moment: tidy(moment), mode },
      });
      return id;
    });
  }

  // Rope (infinitely strong, tension only) between two ends { body: id | null, point }. `length`
  // (>= the distance between the ends) makes it slack; without it the rope starts taut.
  addRope({ a, b, length }) {
    return this.#edit((s) => {
      const id = nextId('R', this.allIds());
      const rope = { id, type: 'rope', a: anchor(a), b: anchor(b), params: {} };
      if (length !== undefined) rope.params.length = tidy(length);
      s.constraints.push(rope);
      return id;
    });
  }

  // Stab: massless two-force member; its length is the distance between its ends. An end given as
  // { node: true, point } is a free end: a Knoten (point mass) is made there, or the one that is
  // already there is used, so Stabs can be joined to a Fachwerk. Nothing is pinned to empty space: a
  // fixed point is a Festlager in free space (or a support on a Knoten) that the user places.
  addRod({ a, b }) {
    return this.#edit((s) => {
      const end = (e) => (e.node ? nodeAt(s, e.point) : anchor(e));
      const ends = [end(a), end(b)];
      const id = nextId('S', this.allIds());
      s.constraints.push({ id, type: 'rod', a: ends[0], b: ends[1], params: {} });
      return id;
    });
  }

  // The Stab becomes elastic with a cross section ({ type, ...dimensions }, a bar: axial stiffness
  // E A / L), or rigid again for null. Same id, same ends.
  setStabSection(id, section) {
    const found = this.find(id);
    if (!found || !['rod', 'bar'].includes(found.obj.type)) throw new Error(`no Stab "${id}"`);
    return this.#edit((s) => {
      const stab = { ...found.obj };
      s.constraints = s.constraints.filter((c) => c.id !== id);
      s.elements = s.elements.filter((e) => e.id !== id);
      if (section) {
        stab.type = 'bar';
        stab.params = { section: clone(section) };
        s.elements.push(stab);
      } else {
        stab.type = 'rod';
        stab.params = {};
        s.constraints.push(stab);
      }
    });
  }

  // patch for a bar: { section }.
  updateBar(id, patch) {
    const found = this.find(id);
    if (!found || found.obj.type !== 'bar') throw new Error(`no bar "${id}"`);
    return this.#edit((s) => {
      if (patch.section) s.elements.find((e) => e.id === id).params.section = clone(patch.section);
    });
  }

  // type: pin_joint (Gelenk) | fixed_joint (rigid). a, b: { body, point } on two different masses.
  addJoint(type, { a, b }) {
    if (!JOINT_TYPES[type]) throw new Error(`unknown joint type "${type}"`);
    return this.#edit((s) => {
      const id = nextId(JOINT_TYPES[type], this.allIds());
      s.constraints.push({ id, type, a: anchor(a), b: anchor(b), params: {} });
      return id;
    });
  }

  // Festlager in free space: a pin at a world point that spring, rope and rod ends can be attached to.
  addGroundPin({ point, surface = null, angle = 0 }) {
    return this.#edit((s) => {
      const id = nextId('A', this.allIds());
      s.constraints.push({
        id, type: 'pin_support', body: null, point: tidyPoint(point), surface, params: { angle: tidy(angle) },
      });
      return id;
    });
  }

  // Pins a mass to a Festlager in free space: the pin becomes a normal Festlager on that mass (same
  // id, surface and angle; spring / rope / rod ends anchored at its point stay on the ground).
  attachPin(id, { body, point }) {
    const found = this.find(id);
    if (!found || found.obj.type !== 'pin_support' || found.obj.body !== null) throw new Error(`no free-space Festlager "${id}"`);
    return this.#edit((s) => {
      const pin = s.constraints.find((c) => c.id === id);
      pin.body = body;
      pin.point = tidyPoint(point);
    });
  }

  // Joint type switch (hinge <-> rigid) keeps the object, its place in the list and its anchors.
  setJointType(id, type) {
    if (!JOINT_TYPES[type]) throw new Error(`unknown joint type "${type}"`);
    const found = this.find(id);
    if (!found || found.kind !== 'constraint' || !found.obj.type.endsWith('_joint')) throw new Error(`no joint "${id}"`);
    return this.#edit((s) => { s.constraints.find((c) => c.id === id).type = type; });
  }

  // patch for a rope: { length: number | null } (null = taut).
  updateRope(id, patch) {
    const found = this.find(id);
    if (!found || found.obj.type !== 'rope') throw new Error(`no rope "${id}"`);
    return this.#edit((s) => {
      const rope = s.constraints.find((c) => c.id === id);
      if (patch.length === null) delete rope.params.length;
      else if (patch.length !== undefined) rope.params.length = tidy(patch.length);
    });
  }

  // type: pin_support | fixed_support | roller_support. angle: see supportAngle() in geometry.js.
  addSupport(type, { body, point, surface = null, angle = 0 }) {
    if (!SUPPORT_TYPES[type]) throw new Error(`unknown support type "${type}"`);
    return this.#edit((s) => {
      const id = nextId(SUPPORT_TYPES[type], this.allIds());
      s.constraints.push({
        id, type, body, point: tidyPoint(point), surface, params: { angle: tidy(angle) },
      });
      return id;
    });
  }

  // --- editing --------------------------------------------------------------------------------

  // The display name stored in the scene. Not an undoable edit and does not mark the model dirty.
  setName(name) {
    this.scene.name = name;
  }

  // Remember the camera so the saved layout opens with the same view. Not undoable.
  setView(view) {
    this.scene.view = { center: tidyPoint(view.center), width: tidy(view.width) };
  }

  // patch: { mass, width, height, radius, length, section, segments, angle, velocity: [vx, vy], omega }.
  // `mass: null` of a beam means "from the section" (density x area x length). Points attached to
  // the body (spring ends, loads, supports) are scaled with it so a corner stays a corner; on a beam
  // only along its length.
  updateBody(id, patch) {
    const found = this.find(id);
    if (!found || found.kind !== 'body') throw new Error(`no body "${id}"`);
    return this.#edit((s) => {
      const body = s.bodies.find((b) => b.id === id);
      const old = { ...body.params };
      for (const key of ['mass', 'width', 'height', 'radius', 'length']) {
        if (patch[key] !== undefined && patch[key] !== null && key in body.params) body.params[key] = tidy(patch[key]);
      }
      if (body.type === 'beam') {
        if (patch.mass === null) delete body.params.mass;
        else if (patch.mass !== undefined) body.params.mass = tidy(patch.mass);
        if (patch.section) body.params.section = clone(patch.section);
        if (patch.segments !== undefined) {
          if (patch.segments === null) delete body.params.segments;
          else body.params.segments = patch.segments;
        }
      }
      if (patch.angle !== undefined) body.angle = tidy(patch.angle);
      if (patch.velocity !== undefined) body.velocity = tidyPoint(patch.velocity);
      if (patch.omega !== undefined) body.omega = tidy(patch.omega);
      let sx = 1;
      let sy = 1;
      if (body.type === 'disc') sx = sy = body.params.radius / old.radius;
      else if (body.type === 'block') [sx, sy] = [body.params.width / old.width, body.params.height / old.height];
      else if (body.type === 'beam') sx = body.params.length / old.length;
      if (sx !== 1 || sy !== 1) {
        rescaleAttachments(s, id, sx, sy);
        normalizeRopes(s);
      }
    });
  }

  // patch for a spring: { k, restLength | null }; for a load: { force, moment, mode }.
  updateElement(id, patch) {
    const found = this.find(id);
    if (!found || found.kind !== 'element') throw new Error(`no element "${id}"`);
    return this.#edit((s) => {
      const el = s.elements.find((e) => e.id === id);
      if (patch.k !== undefined) el.params.k = patch.k;
      if (patch.c !== undefined) el.params.c = patch.c;
      if (patch.restLength === null) delete el.params.rest_length;
      else if (patch.restLength !== undefined) el.params.rest_length = tidy(patch.restLength);
      if (patch.force !== undefined) el.params.force = tidyPoint(patch.force);
      if (patch.moment !== undefined) el.params.moment = tidy(patch.moment);
      if (patch.mode !== undefined) {
        el.params.mode = patch.mode;
        if (patch.mode === 'harmonic') el.params.frequency ??= DEFAULT_FREQUENCY;
        else {
          delete el.params.frequency;
          delete el.params.phase;
        }
      }
      if (patch.frequency !== undefined && el.params.mode === 'harmonic') el.params.frequency = tidy(patch.frequency);
      if (patch.phase !== undefined && el.params.mode === 'harmonic') el.params.phase = tidy(patch.phase);
    });
  }

  // --- deletion -------------------------------------------------------------------------------

  // Removes the object and everything that cannot exist without it: deleting a body also deletes
  // its springs, loads and supports; deleting a surface only detaches the supports on it (they
  // keep their angle). Returns the ids that were removed.
  remove(id) {
    const found = this.find(id);
    if (!found) return [];
    return this.#edit((s) => {
      if (found.kind === 'surface') {
        for (const c of s.constraints) if (c.surface === id) c.surface = null;
        s.surfaces = s.surfaces.filter((o) => o.id !== id);
        return [id];
      }
      const removed = [id];
      if (found.kind === 'body') {
        // springs, loads, supports, ropes, rods and joints on this mass cannot exist without it
        const dependent = (o) =>
          o.body === id || (o.a && o.a.body === id) || (o.b && o.b.body === id);
        for (const o of [...s.elements, ...s.constraints]) if (dependent(o)) removed.push(o.id);
      }
      const keep = (o) => !removed.includes(o.id);
      s.bodies = s.bodies.filter(keep);
      s.elements = s.elements.filter(keep);
      s.constraints = s.constraints.filter(keep);
      return removed;
    });
  }
}

// A node at a world point: the one that is there, or a new one (inside a model edit).
function addNodeTo(scene, point, mass) {
  const allIds = [...scene.surfaces, ...scene.bodies, ...scene.elements, ...scene.constraints].map((o) => o.id);
  const id = nextId('N', allIds);
  scene.bodies.push({ id, type: 'node', position: tidyPoint(point), angle: 0, params: { mass } });
  return id;
}

function nodeAt(scene, point) {
  const there = scene.bodies.find((b) => b.type === 'node' && dist(b.position, point) < 1e-6);
  return { body: there ? there.id : addNodeTo(scene, point, DEFAULT_NODE_MASS), point: [0, 0] };
}

function rescaleAttachments(scene, bodyId, sx, sy) {
  const scalePoint = (p) => tidyPoint([p[0] * sx, p[1] * sy]);
  for (const el of scene.elements) {
    if (el.a) { // spring, damper
      for (const end of [el.a, el.b]) if (end.body === bodyId) end.point = scalePoint(end.point);
    } else if (el.body === bodyId) {
      el.point = scalePoint(el.point);
    }
  }
  for (const c of scene.constraints) {
    if (c.a) {
      for (const end of [c.a, c.b]) if (end.body === bodyId) end.point = scalePoint(end.point);
    } else if (c.body === bodyId) {
      c.point = scalePoint(c.point);
    }
  }
}
