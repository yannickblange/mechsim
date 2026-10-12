// model.js - the scene being edited: creation, editing, deletion (with cascades), undo / redo.
// Holds a plain scene object (contracts/scene.schema.json, version 0.2) and never touches the DOM.
import { nextId, tidy, tidyPoint } from './geometry.js';

export const DEFAULT_MASS = 1.0;
export const DEFAULT_SPRING_K = 100.0;
const HISTORY_LIMIT = 100;

const SUPPORT_TYPES = {
  pin_support: 'A', // Festlager
  fixed_support: 'E', // Lager / Einspannung
  roller_support: 'B', // Loslager
};

const clone = (x) => JSON.parse(JSON.stringify(x));

export class SceneModel {
  constructor(scene = SceneModel.emptyScene()) {
    this.listeners = new Set();
    this.load(scene);
  }

  static emptyScene() {
    return {
      version: '0.2',
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
    s.version = '0.2';
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

  // patch: { mass, width, height, radius, angle, velocity: [vx, vy], omega }. Points attached to
  // the body (spring ends, loads, supports) are scaled with it so a corner stays a corner.
  updateBody(id, patch) {
    const found = this.find(id);
    if (!found || found.kind !== 'body') throw new Error(`no body "${id}"`);
    return this.#edit((s) => {
      const body = s.bodies.find((b) => b.id === id);
      const old = { ...body.params };
      for (const key of ['mass', 'width', 'height', 'radius']) {
        if (patch[key] !== undefined && key in body.params) body.params[key] = tidy(patch[key]);
      }
      if (patch.angle !== undefined) body.angle = tidy(patch.angle);
      if (patch.velocity !== undefined) body.velocity = tidyPoint(patch.velocity);
      if (patch.omega !== undefined) body.omega = tidy(patch.omega);
      const sx = body.type === 'disc' ? body.params.radius / old.radius : body.params.width / old.width;
      const sy = body.type === 'disc' ? sx : body.params.height / old.height;
      if (sx !== 1 || sy !== 1) rescaleAttachments(s, id, sx, sy);
    });
  }

  // patch for a spring: { k, restLength | null }; for a load: { force, moment, mode }.
  updateElement(id, patch) {
    const found = this.find(id);
    if (!found || found.kind !== 'element') throw new Error(`no element "${id}"`);
    return this.#edit((s) => {
      const el = s.elements.find((e) => e.id === id);
      if (patch.k !== undefined) el.params.k = patch.k;
      if (patch.restLength === null) delete el.params.rest_length;
      else if (patch.restLength !== undefined) el.params.rest_length = tidy(patch.restLength);
      if (patch.force !== undefined) el.params.force = tidyPoint(patch.force);
      if (patch.moment !== undefined) el.params.moment = tidy(patch.moment);
      if (patch.mode !== undefined) el.params.mode = patch.mode;
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

function rescaleAttachments(scene, bodyId, sx, sy) {
  const scalePoint = (p) => tidyPoint([p[0] * sx, p[1] * sy]);
  for (const el of scene.elements) {
    if (el.type === 'spring') {
      for (const end of [el.a, el.b]) if (end.body === bodyId) end.point = scalePoint(end.point);
    } else if (el.body === bodyId) {
      el.point = scalePoint(el.point);
    }
  }
  for (const c of scene.constraints) if (c.body === bodyId) c.point = scalePoint(c.point);
}
