// tools.js - the editor tools as small state machines. Pure (no DOM): they receive pointer events
// in world coordinates, edit the SceneModel, and expose a `preview` and a `hint` for the UI.
//
// Event shape: { world: [x, y], shift: boolean }. down() returns true if the tool used the click
// (the canvas must then not start panning). Every tool also has move(), up(), key(name), cancel().
import {
  add, dist, dot, length, normalizeAngle, rotate, roundTo, snapSegmentEnd, sub, supportAngle,
  surfaceAngle, tidy,
} from './geometry.js';
import { FORCE_M_PER_N, hitTest, anchorWorld } from './hit.js';
import { gridStepFor, snapPoint, surfaceNear } from './snap.js';

export const MIN_DRAG_PX = 6; // below this a press-release counts as a click
export const MIN_SIZE_M = 0.05;
export const DEFAULT_MOMENT = 5; // N m, created by clicking with the load tool

class Tool {
  constructor(env) {
    this.env = env; // { model, getScale(), select(sel) }
    this.error = null;
    this.marker = null; // snap marker { point, kind } for the UI
  }

  get scale() { return this.env.getScale(); }
  get scene() { return this.env.model.scene; }
  get step() { return gridStepFor(this.scale); }

  snap(world, opts = {}) {
    return snapPoint(world, this.scene, { scale: this.scale, ...opts });
  }

  down() { return false; }
  move() {}
  up() {}
  key() { return false; }
  cancel() { this.error = null; }
  get preview() { return null; }
  get hint() { return ''; }
}

// --- select -------------------------------------------------------------------------------------

export class SelectTool extends Tool {
  get hint() { return 'Click an object to select it, Delete removes it. Right-click for its properties.'; }

  down(e) {
    const hit = hitTest(this.scene, e.world, this.scale);
    this.env.select(hit);
    return hit !== null;
  }
}

// --- press - drag - release, or click - click ------------------------------------------------------

class TwoPointTool extends Tool {
  constructor(env) {
    super(env);
    this.p1 = null;
    this.end = null;
    this.pressedAt = null;
  }

  // Subclass hooks.
  snapStart(world) { return this.snap(world, { surfaces: true }); }
  constrainEnd(p1, world, e) { return this.snap(world, { surfaces: true, bodies: false }).point; }
  commit() { return false; }

  get active() { return this.p1 !== null; }

  down(e) {
    this.error = null;
    if (this.p1) {
      this.finish(e);
      return true;
    }
    const start = this.snapStart(e.world);
    this.p1 = start.point;
    this.start = start;
    this.end = this.p1;
    this.pressedAt = e.world;
    return true;
  }

  move(e) {
    if (this.p1) {
      this.end = this.constrainEnd(this.p1, e.world, e);
      this.marker = null;
    } else {
      const s = this.snapStart(e.world);
      this.marker = { point: s.point, kind: s.kind };
    }
  }

  up(e) {
    if (!this.p1 || !this.pressedAt) return;
    const movedPx = dist(this.pressedAt, e.world) * this.scale;
    this.pressedAt = null;
    if (movedPx >= MIN_DRAG_PX) this.finish(e); // drag mode; otherwise wait for the second click
  }

  finish(e) {
    const end = this.constrainEnd(this.p1, e.world, e);
    if (!this.commit(this.p1, end, this.start)) this.error = this.error || 'Too small - try again.';
    this.cancel();
  }

  cancel() {
    this.p1 = null;
    this.end = null;
    this.pressedAt = null;
    this.start = null;
  }

  key(name) {
    if (name === 'Escape' && this.p1) {
      this.cancel();
      return true;
    }
    return false;
  }
}

export class RectTool extends TwoPointTool {
  constructor(env) {
    super(env);
    this.angle = 0;
  }

  get hint() {
    return this.p1
      ? 'Release / click the opposite corner.'
      : 'Drag from corner to corner to create a rectangular mass. Start on a surface to align the rectangle with it.';
  }

  down(e) {
    const consumed = super.down(e);
    if (this.p1 && this.start && !this.angleSet) {
      // Starting on a surface aligns the rectangle with it (width along the surface).
      const s = this.start.surface && this.scene.surfaces.find((x) => x.id === this.start.surface);
      this.angle = s ? alignmentAngle(surfaceAngle(s)) : 0;
      this.angleSet = true;
    }
    return consumed;
  }

  constrainEnd(p1, world) {
    return this.snap(world, { surfaces: true, bodies: false }).point;
  }

  // Corners p1, p2 in the (possibly rotated) frame of the rectangle.
  rect(p1, p2) {
    const angle = this.angleSet ? this.angle : 0;
    const l = rotate(sub(p2, p1), -angle);
    return {
      center: add(p1, rotate([l[0] / 2, l[1] / 2], angle)),
      width: Math.abs(l[0]),
      height: Math.abs(l[1]),
      angle,
    };
  }

  commit(p1, p2) {
    const r = this.rect(p1, p2);
    if (r.width < MIN_SIZE_M || r.height < MIN_SIZE_M) return false;
    const id = this.env.model.addBlock({ center: r.center, width: r.width, height: r.height });
    if (r.angle) this.env.model.updateBody(id, { angle: r.angle });
    this.env.created('body', id);
    return true;
  }

  cancel() {
    super.cancel();
    this.angle = 0;
    this.angleSet = false;
  }

  get preview() {
    if (!this.p1) return null;
    const r = this.rect(this.p1, this.end);
    return {
      type: 'rect', ...r,
      label: `${fmt(r.width)} × ${fmt(r.height)} m`,
    };
  }
}

export class CircleTool extends TwoPointTool {
  get hint() {
    return this.p1 ? 'Click / release to set the radius.' : 'Click the centre, then drag or click to set the radius.';
  }

  constrainEnd(p1, world) {
    const r = Math.max(this.step, roundTo(dist(p1, world), this.step));
    const dir = sub(world, p1);
    const len = length(dir);
    if (len < 1e-9) return [p1[0] + r, p1[1]];
    return [p1[0] + (dir[0] / len) * r, p1[1] + (dir[1] / len) * r];
  }

  commit(p1, p2) {
    const radius = dist(p1, p2);
    if (radius < MIN_SIZE_M) return false;
    const id = this.env.model.addDisc({ center: p1, radius });
    this.env.created('body', id);
    return true;
  }

  get preview() {
    if (!this.p1) return null;
    const radius = dist(this.p1, this.end);
    return { type: 'circle', center: this.p1, radius, label: `r = ${fmt(radius)} m` };
  }
}

export class SurfaceTool extends TwoPointTool {
  get hint() {
    return this.p1
      ? 'Release / click the end point. The angle snaps to 0, 30, 45, 60, 90 degrees (hold Shift for free angles).'
      : 'Drag to draw a fixed surface.';
  }

  constrainEnd(p1, world, e) {
    if (e && e.shift) return this.snap(world, { surfaces: true, bodies: false }).point;
    return snapSegmentEnd(p1, world, { step: this.step });
  }

  commit(p1, p2) {
    if (dist(p1, p2) < MIN_SIZE_M) return false;
    const id = this.env.model.addSurface(p1, p2);
    this.env.created('surface', id);
    return true;
  }

  get preview() {
    if (!this.p1) return null;
    const a = surfaceAngle({ p1: this.p1, p2: this.end });
    const deg = Math.round((a * 180) / Math.PI);
    return { type: 'surface', p1: this.p1, p2: this.end, label: `${fmt(dist(this.p1, this.end))} m, ${deg}°` };
  }
}

// --- spring: A, B, then the relaxed length ("ghost") -----------------------------------------------

export class SpringTool extends Tool {
  constructor(env) {
    super(env);
    this.reset();
  }

  reset() {
    this.a = null; // { body, point } as stored in the scene
    this.b = null;
    this.cursor = null;
    this.pressedAt = null;
    this.stage = 0; // 0: pick A, 1: pick B, 2: pick the relaxed length
    this.rest = undefined;
  }

  get hint() {
    return [
      'Click the first end of the spring (on a mass, a surface or free space).',
      'Click the second end (drag from the first end also works).',
      'Move the ghost spring to the relaxed length and click. Enter keeps the installed length.',
    ][this.stage];
  }

  anchorFrom(world) {
    const s = this.snap(world, { interior: true, surfaces: true });
    return {
      body: s.body,
      point: s.body ? s.local : s.point,
      world: s.point,
      kind: s.kind,
    };
  }

  get geometry() {
    if (!this.a || !this.b) return null;
    const a = anchorWorld(this.scene, this.a) || this.a.world;
    const b = anchorWorld(this.scene, this.b) || this.b.world;
    return { a, b, length: dist(a, b) };
  }

  // Relaxed length for a pointer position: projected on the spring axis, snapped to the
  // installed length when close to it, otherwise to the grid.
  restFor(world) {
    const g = this.geometry;
    const u = sub(g.b, g.a);
    const axis = [u[0] / g.length, u[1] / g.length];
    const rest = Math.max(0, dot(sub(world, g.a), axis));
    if (Math.abs(rest - g.length) * this.scale <= 8) return g.length;
    return Math.max(0, roundTo(rest, this.step));
  }

  down(e) {
    this.error = null;
    if (this.stage === 0) {
      this.a = this.anchorFrom(e.world);
      this.cursor = this.a.world;
      this.pressedAt = e.world;
      this.stage = 1;
    } else if (this.stage === 1) {
      this.setB(e.world);
    } else {
      this.commit(this.restFor(e.world));
    }
    return true;
  }

  setB(world) {
    const b = this.anchorFrom(world);
    if (this.a.body === null && b.body === null) {
      this.error = 'A spring needs at least one end on a mass.';
      return;
    }
    if (dist(this.a.world, b.world) < MIN_SIZE_M) {
      this.error = 'The spring is too short.';
      return;
    }
    // Keep the end on the ground first: the relaxed ("ghost") spring hangs from it, and so does
    // the stored spring (SceneModel.addSpring).
    if (this.a.body !== null && b.body === null) {
      this.b = this.a;
      this.a = b;
    } else {
      this.b = b;
    }
    this.cursor = b.world;
    this.stage = 2;
  }

  move(e) {
    if (this.stage === 2) {
      this.cursor = e.world;
      this.rest = this.restFor(e.world);
      this.marker = null;
      return;
    }
    const s = this.snap(e.world, { interior: true, surfaces: true });
    this.cursor = s.point;
    this.marker = { point: s.point, kind: s.kind };
  }

  up(e) {
    if (this.stage === 1 && this.pressedAt) {
      const movedPx = dist(this.pressedAt, e.world) * this.scale;
      this.pressedAt = null;
      if (movedPx >= MIN_DRAG_PX) this.setB(e.world);
    }
  }

  key(name) {
    if (name === 'Escape' && this.stage > 0) {
      this.cancel();
      return true;
    }
    if (name === 'Enter' && this.stage === 2) {
      this.commit(this.geometry.length);
      return true;
    }
    return false;
  }

  commit(rest) {
    const g = this.geometry;
    const strip = ({ body, point }) => ({ body, point });
    const spec = { a: strip(this.a), b: strip(this.b) };
    // Without a pre-stress the engine default (installed length) applies.
    if (Math.abs(rest - g.length) > 1e-9) spec.restLength = rest;
    const id = this.env.model.addSpring(spec);
    this.env.created('element', id);
    this.reset();
  }

  cancel() {
    super.cancel();
    this.reset();
  }

  get preview() {
    if (this.stage === 0) return null;
    if (this.stage === 1) {
      return { type: 'spring', a: this.a.world, b: this.cursor, label: `L = ${fmt(dist(this.a.world, this.cursor))} m` };
    }
    const g = this.geometry;
    const rest = this.rest ?? g.length;
    const u = sub(g.b, g.a);
    const axis = [u[0] / g.length, u[1] / g.length];
    return {
      type: 'spring', a: g.a, b: g.b,
      ghost: { from: g.a, to: [g.a[0] + axis[0] * rest, g.a[1] + axis[1] * rest] },
      label: `L = ${fmt(g.length)} m, relaxed L0 = ${fmt(rest)} m (${rest < g.length - 1e-9 ? 'tension' : rest > g.length + 1e-9 ? 'compression' : 'unloaded'})`,
    };
  }
}

// --- load -----------------------------------------------------------------------------------------

export class LoadTool extends Tool {
  constructor(env) {
    super(env);
    this.start = null;
    this.tip = null;
    this.pressedAt = null;
  }

  get hint() {
    return this.start
      ? 'Release to set the force vector.'
      : 'Press on a mass (centre, corner or edge) and drag to set a force. A plain click adds a moment.';
  }

  pick(world) {
    return this.snap(world, { interior: true });
  }

  down(e) {
    this.error = null;
    const s = this.pick(e.world);
    if (!s.body) {
      this.error = 'Place a force or moment on a mass.';
      return true;
    }
    this.start = s;
    this.tip = s.point;
    this.pressedAt = e.world;
    return true;
  }

  move(e) {
    if (this.start) {
      this.tip = this.snap(e.world, { bodies: false }).point;
      this.marker = null;
    } else {
      const s = this.pick(e.world);
      this.marker = { point: s.point, kind: s.body ? s.kind : 'invalid' };
    }
  }

  up(e) {
    if (!this.start) return;
    const tip = this.snap(e.world, { bodies: false }).point;
    const movedPx = dist(this.pressedAt, e.world) * this.scale;
    const params = { body: this.start.body, point: this.start.local };
    if (movedPx >= MIN_DRAG_PX) {
      const v = sub(tip, this.start.point);
      params.force = [tidy(v[0] / FORCE_M_PER_N), tidy(v[1] / FORCE_M_PER_N)];
    } else {
      params.moment = DEFAULT_MOMENT;
    }
    const id = this.env.model.addLoad(params);
    this.env.created('element', id);
    this.cancel();
  }

  key(name) {
    if (name === 'Escape' && this.start) {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel() {
    super.cancel();
    this.start = null;
    this.tip = null;
    this.pressedAt = null;
  }

  get preview() {
    if (!this.start) return null;
    const v = sub(this.tip, this.start.point);
    const force = [v[0] / FORCE_M_PER_N, v[1] / FORCE_M_PER_N];
    return { type: 'load', point: this.start.point, force, label: `F = ${fmt(length(force), 1)} N` };
  }
}

// --- supports -------------------------------------------------------------------------------------

const SUPPORT_LABELS = {
  pin_support: 'Festlager',
  fixed_support: 'Lager (fixed)',
  roller_support: 'Loslager',
};

export class SupportTool extends Tool {
  constructor(env, type) {
    super(env);
    this.type = type;
    this.last = null;
  }

  get hint() {
    return this.type === 'roller_support'
      ? 'Click a point of a mass that touches a surface. The Loslager slides along that surface.'
      : `Click a point of a mass to place the ${SUPPORT_LABELS[this.type]}. It sits on the surface it touches.`;
  }

  // Where would the support go for this pointer position? null if it cannot be placed here.
  place(world) {
    const s = this.snap(world, { interior: true });
    if (!s.body) return { error: 'Place the support on a mass.', point: s.point };
    const body = this.env.model.body(s.body);
    const surface = surfaceNear(s.point, this.scene.surfaces, this.scale);
    if (!surface && this.type === 'roller_support') {
      return { error: 'A Loslager needs a surface - draw one under the mass first.', point: s.point };
    }
    const angle = surface ? supportAngle(surface, body.position) : 0;
    return {
      body: s.body, point: s.point, local: s.local, kind: s.kind,
      surface: surface ? surface.id : null, angle: normalizeAngle(angle),
    };
  }

  move(e) {
    this.last = this.place(e.world);
    this.marker = { point: this.last.point, kind: this.last.error ? 'invalid' : this.last.kind };
  }

  down(e) {
    this.error = null;
    const p = this.place(e.world);
    if (p.error) {
      this.error = p.error;
      return true;
    }
    const id = this.env.model.addSupport(this.type, {
      body: p.body, point: p.local, surface: p.surface, angle: p.angle,
    });
    this.env.created('constraint', id);
    return true;
  }

  get preview() {
    const p = this.last;
    if (!p) return null;
    return {
      type: 'support', supportType: this.type, point: p.point, angle: p.angle || 0,
      valid: !p.error, label: p.error ? '' : SUPPORT_LABELS[this.type],
    };
  }

  cancel() {
    super.cancel();
    this.last = null;
  }
}

// --- registry -------------------------------------------------------------------------------------

// The toolbox order. `icon` names are drawn by editor/icons.js.
export const TOOL_DEFS = [
  { id: 'select', label: 'Select', icon: 'select', make: (env) => new SelectTool(env) },
  { id: 'rect', label: 'Rectangular mass', icon: 'rect', make: (env) => new RectTool(env) },
  { id: 'circle', label: 'Circular mass', icon: 'circle', make: (env) => new CircleTool(env) },
  { id: 'surface', label: 'Surface', icon: 'surface', make: (env) => new SurfaceTool(env) },
  { id: 'spring', label: 'Spring', icon: 'spring', make: (env) => new SpringTool(env) },
  { id: 'load', label: 'Force / moment', icon: 'load', make: (env) => new LoadTool(env) },
  { id: 'pin', label: 'Festlager', icon: 'pin', make: (env) => new SupportTool(env, 'pin_support') },
  { id: 'fixed', label: 'Lager (fixed)', icon: 'fixed', make: (env) => new SupportTool(env, 'fixed_support') },
  { id: 'roller', label: 'Loslager', icon: 'roller', make: (env) => new SupportTool(env, 'roller_support') },
];

export function createTools(env) {
  return new Map(TOOL_DEFS.map((def) => [def.id, def.make(env)]));
}

function fmt(x, digits = 2) {
  return Number.isFinite(x) ? x.toFixed(digits) : '–';
}

// Rectangle angle for a rectangle that starts on a surface. Floors, ceilings and walls give 0: an
// axis-aligned rectangle looks the same and keeps width and height where the user expects them.
function alignmentAngle(surfaceAngleRad) {
  const a = wrapHalfTurn(surfaceAngleRad);
  const axisParallel = Math.abs(a) < 1e-6 || Math.abs(Math.abs(a) - Math.PI / 2) < 1e-6;
  return axisParallel ? 0 : a;
}

// An angle equivalent modulo pi, within (-pi/2, pi/2].
function wrapHalfTurn(a) {
  let r = normalizeAngle(a);
  if (r > Math.PI / 2) r -= Math.PI;
  if (r <= -Math.PI / 2) r += Math.PI;
  return r;
}
