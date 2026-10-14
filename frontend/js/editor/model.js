// model.js - the scene being edited: creation, editing, deletion (with cascades), undo / redo.
// Holds a plain scene object (contracts/scene.schema.json, version 0.4) and never touches the DOM.
import { clampableEnds, hasEinspannung, standingEnds } from './ends.js';
import { bodyToWorld, dist, nextId, normalizeAngle, roundTo, sub, supportAngleAt, tidy, tidyPoint } from './geometry.js';
import { normalizeRopes, refreshSupports } from './moves.js';
import { defaultSection } from './section.js';
import { surfaceAtPoint } from './snap.js';
import { flipSurface, surfaceFields } from './surfaces.js';

export const DEFAULT_MASS = 1.0;
export const DEFAULT_SPRING_K = 100.0;
export const DEFAULT_DAMPING = 10.0; // N s / m
export const DEFAULT_NODE_MASS = 1.0; // kg of a Knoten (the weight is small next to typical truss loads)
export const DEFAULT_FREQUENCY = 1.0; // Hz of a new harmonic load
export const DEFAULT_ELEMENT_DAMPING = 5.0; // 1/s: new beams settle (every mode decays like e^(-alpha t / 2))
export const DEFAULT_STAB_DAMPING = 8.0; // 1/s: an elastic Stab, as the I-beam example (it is stiffer and lighter than a beam: it rings longer)
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
  // side follows the length (L / 40, between 10 and 100 mm). `clamps`: [{ end: "start" | "end", surface, angle }]
  // are the ends that sit on a surface: each gets an Einspannung (fixed_support) there.
  addBeam({ start, end, section, mass, clamps = [] }) {
    return this.#edit((s) => {
      const id = nextId('b', this.allIds());
      const L = dist(start, end);
      const side = Math.min(0.1, Math.max(0.01, roundTo(L / 40, 0.005)));
      const d = sub(end, start);
      const params = { length: tidy(L), section: section || defaultSection('square', side), damping: DEFAULT_ELEMENT_DAMPING };
      if (mass !== undefined) params.mass = mass;
      s.bodies.push({
        id, type: 'beam', position: tidyPoint([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]),
        angle: tidy(Math.atan2(d[1], d[0])), params,
      });
      for (const c of clamps) { // the beam lies along its local x axis, the start at -L/2
        pushSupport(s, 'fixed_support', { body: id, point: [c.end === 'start' ? -L / 2 : L / 2, 0], surface: c.surface, angle: c.angle });
      }
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

  // A curved surface (v0.8): "spline" through the control points, or "arc": a half circle on the diameter control[0] - control[1], `kind`
  // "bowl" (open upwards, the free side inside) or "dome" (the free side outside). The scene gets the dense polyline for the engine and
  // the control points so that the curve stays editable. Two control points of a spline are a straight surface.
  addCurve(shape, control, kind = 'bowl') {
    return this.#edit((s) => {
      const id = nextId('s', this.allIds());
      s.surfaces.push({ id, ...surfaceFields(control.length < 3 && shape === 'spline' ? 'line' : shape, control, kind) });
      return id;
    });
  }

  // patch: { friction (mu >= 0), restitution (0..1) }; the defaults (0) are not stored.
  updateSurface(id, patch) {
    const found = this.find(id);
    if (!found || found.kind !== 'surface') throw new Error(`no surface "${id}"`);
    return this.#edit((s) => {
      const surface = s.surfaces.find((o) => o.id === id);
      for (const key of ['friction', 'restitution']) {
        if (patch[key] === undefined) continue;
        if (patch[key] > 0) surface[key] = tidy(patch[key]);
        else delete surface[key];
      }
    });
  }

  // The surface run the other way: its free side and its hatching change sides. Supports on it keep their side of it.
  flipSurface(id) {
    const found = this.find(id);
    if (!found || found.kind !== 'surface') throw new Error(`no surface "${id}"`);
    return this.#edit((s) => {
      flipSurface(s.surfaces.find((o) => o.id === id));
      refreshSupports(s, 1e-3);
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
  // fixed point is a Festlager in free space (or a support on a Knoten) that the user places. `clampOnSurfaces`: an end whose
  // Knoten lies on a surface and has no support yet gets an Einspannung there (fest eingespannt; it acts once the Stab is elastic).
  addRod({ a, b, clampOnSurfaces = false }) {
    return this.#edit((s) => {
      const end = (e) => (e.node ? nodeAt(s, e.point) : anchor(e));
      const ends = [end(a), end(b)];
      const id = nextId('S', this.allIds());
      const rod = { id, type: 'rod', a: ends[0], b: ends[1], params: {} };
      s.constraints.push(rod);
      if (clampOnSurfaces) clampStandingEnds(s, rod, { joined: true });
      return id;
    });
  }

  // The Stab becomes elastic with a cross section ({ type, ...dimensions }, a bar: axial stiffness
  // E A / L; it also bends and buckles), or rigid again for null. Same id, same ends. `params` are
  // more bar parameters (segments, mass, damping, imperfection); a new bar settles (damping 5 / s).
  setStabSection(id, section, params = {}) {
    const found = this.find(id);
    if (!found || !['rod', 'bar'].includes(found.obj.type)) throw new Error(`no Stab "${id}"`);
    return this.#edit((s) => {
      const stab = { ...found.obj };
      s.constraints = s.constraints.filter((c) => c.id !== id);
      s.elements = s.elements.filter((e) => e.id !== id);
      if (section) {
        stab.type = 'bar';
        stab.params = { section: clone(section), damping: DEFAULT_STAB_DAMPING, ...hingedParams(found.obj.params), ...params };
        s.elements.push(stab);
        if (found.obj.type === 'rod') clampStandingEnds(s, stab);
      } else {
        stab.type = 'rod';
        stab.params = hingedParams(found.obj.params);
        s.constraints.push(stab);
      }
    });
  }

  // End conditions of a Stab (rod or bar): { a: true, b: false }: hinged (true) or clamped (false) at an end on a block
  // or a disc. Clamped is the default and stored as no flag.
  setStabEnds(id, hinged) {
    const found = this.find(id);
    if (!found || !['rod', 'bar'].includes(found.obj.type)) throw new Error(`no Stab "${id}"`);
    return this.#edit((s) => {
      const stab = [...s.constraints, ...s.elements].find((o) => o.id === id);
      stab.params ||= {};
      for (const side of ['a', 'b']) {
        if (hinged[side] === undefined) continue;
        if (hinged[side]) stab.params[`hinged_${side}`] = true;
        else delete stab.params[`hinged_${side}`];
      }
    });
  }

  // Clamping of the ends of a Stab on a Knoten or on the ground: { a: true, b: false }: clamped (true, an Einspannung on the Knoten; an
  // end on the ground becomes a Knoten with one) or a pin (false: an Einspannung there becomes a Festlager, which keeps the Knoten
  // where it is). An elastic Stab keeps the rotation of a Knoten that an Einspannung holds; a rigid one is a pin there. The
  // Einspannung belongs to the Knoten: other Stabs that end there follow it.
  setStabClamps(id, clamped) {
    const found = this.find(id);
    if (!found || !['rod', 'bar'].includes(found.obj.type)) throw new Error(`no Stab "${id}"`);
    return this.#edit((s) => {
      const stab = [...s.constraints, ...s.elements].find((o) => o.id === id);
      for (const { side, node } of clampableEnds(s, stab)) {
        if (clamped[side] === undefined) continue;
        if (node && clamped[side] === hasEinspannung(s, node.id)) continue;
        if (!node && !clamped[side]) continue; // a ground end is a pin already
        if (clamped[side]) clampEnd(s, stab, side);
        else for (const c of s.constraints) if (c.type === 'fixed_support' && c.body === node.id) c.type = 'pin_support';
      }
    });
  }

  // patch for a bar: { section, segments, mass, damping, imperfection }. null removes segments, mass and
  // imperfection (back to the default: 4 elements, the mass of the steel, a bow of L / 1000).
  updateBar(id, patch) {
    const found = this.find(id);
    if (!found || found.obj.type !== 'bar') throw new Error(`no bar "${id}"`);
    return this.#edit((s) => {
      const params = s.elements.find((e) => e.id === id).params;
      if (patch.section) params.section = clone(patch.section);
      for (const key of ['segments', 'mass', 'imperfection']) {
        if (patch[key] === null) delete params[key];
        else if (patch[key] !== undefined) params[key] = key === 'segments' ? patch[key] : tidy(patch[key]);
      }
      if (patch.damping !== undefined) params.damping = tidy(patch.damping);
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
    return this.#edit((s) => pushSupport(s, type, { body, point, surface, angle }));
  }

  // --- editing --------------------------------------------------------------------------------

  // The display name stored in the scene. Not an undoable edit and does not mark the model dirty.
  setName(name) {
    this.scene.name = name;
  }

  // Remember the camera so the saved layout opens with the same view. Not undoable.
  setView(view) {
    this.scene.view = { center: tidyPoint(view.center), width: tidy(view.width) };
    if (view.bend && view.bend !== 1) this.scene.view.bend = view.bend;
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
      if (patch.damping !== undefined && (body.type === 'beam' || body.type === 'node')) {
        if (patch.damping > 0 || body.type === 'beam') body.params.damping = tidy(patch.damping);
        else delete body.params.damping;
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

// An elastic Stab that stands on a surface is fest eingespannt there: an end whose Knoten lies on a surface, has no
// support yet and is the end of this Stab only (a Knoten that joins several members is a Fachwerk joint) gets an
// Einspannung. The engine then clamps the end (the bar keeps the rotation of its node, which the support holds).
function clampStandingEnds(scene, stab, options) {
  for (const { node, surface, far } of standingEnds(scene, stab, options)) {
    pushSupport(scene, 'fixed_support', {
      body: node.id, point: [0, 0], surface: surface.id, angle: supportAngleAt(surface, node.position, far),
    });
  }
}

// An Einspannung at the end of a Stab: on the Knoten there, or on a new Knoten that takes the place of a ground anchor (the Festlager
// in free space at that point becomes the Einspannung, unless another member is anchored to it). The Einspannung sits on the surface
// the Knoten lies on (the Stab on its left side), else it is free with its symbol turned away from the Stab. It replaces a Festlager
// on the Knoten (a point carries one support).
function clampEnd(scene, stab, side) {
  const other = stab[side === 'a' ? 'b' : 'a'];
  const far = other.body === null ? other.point : bodyToWorld(scene.bodies.find((b) => b.id === other.body), other.point);
  const ground = stab[side].body === null;
  const here = ground ? stab[side].point : scene.bodies.find((b) => b.id === stab[side].body).position;
  if (ground) stab[side] = nodeAt(scene, here);
  const body = stab[side].body;
  const surface = surfaceAtPoint(scene, here);
  const pin = ground && scene.constraints.find((c) => c.type === 'pin_support' && c.body === null && dist(c.point, here) < 1e-6);
  const shared = pin && [...scene.elements, ...scene.constraints].some((o) => o !== stab && o !== pin
    && [o.a, o.b].some((e) => e && e.body === null && dist(e.point, here) < 1e-6));
  if (pin && !shared) { // the Festlager becomes the Einspannung (same id, surface and angle)
    Object.assign(pin, { type: 'fixed_support', body, point: [0, 0] });
    return;
  }
  const angle = surface
    ? supportAngleAt(surface, here, far)
    : normalizeAngle(Math.atan2(far[1] - here[1], far[0] - here[0]) - Math.PI / 2);
  pushSupport(scene, 'fixed_support', { body, point: [0, 0], surface: surface ? surface.id : null, angle });
}

// The end-condition flags of a Stab's params (they stay when a rigid Stab becomes elastic and back).
const hingedParams = (params = {}) => Object.fromEntries(['hinged_a', 'hinged_b'].filter((k) => params[k]).map((k) => [k, true]));

// A support (inside a model edit); returns its id.
// A point carries one support: a Festlager or Einspannung there replaces whatever support the point has (they lock the
// same motion twice, which the engine cannot solve); two Loslager on different surfaces may share a point.
function pushSupport(scene, type, { body, point, surface = null, angle = 0 }) {
  const here = (c) => SUPPORT_TYPES[c.type] && c.body === body && body !== null && dist(c.point, tidyPoint(point)) < 1e-6;
  const lockXY = (t) => t !== 'roller_support';
  scene.constraints = scene.constraints.filter((c) => !(here(c) && (lockXY(type) || lockXY(c.type))));
  const allIds = [...scene.surfaces, ...scene.bodies, ...scene.elements, ...scene.constraints].map((o) => o.id);
  const id = nextId(SUPPORT_TYPES[type], allIds);
  scene.constraints.push({ id, type, body, point: tidyPoint(point), surface, params: { angle: tidy(angle) } });
  return id;
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
