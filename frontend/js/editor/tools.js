// tools.js - the editor tools as small state machines. Pure (no DOM): they receive pointer events
// in world coordinates, edit the SceneModel, and expose a `preview` and a `hint` for the UI.
//
// Event shape: { world: [x, y], shift: boolean }. down() returns true if the tool used the click
// (the canvas must then not start panning). Every tool also has move(), up(), key(name), cancel().
import {
  add, dist, dot, length, normalizeAngle, rotate, roundTo, snapSegmentEnd, sub, surfaceAngle, tidy,
  worldToLocal,
} from './geometry.js';
import { FORCE_M_PER_N, hitTest, anchorWorld, moveTarget } from './hit.js';
import {
  contactOffset, jointGroup, linkProblem, moveBodies, movePin, moveSurface, reattachEnd,
  replaceLoad, replaceSupport,
} from './moves.js';
import { SUPPORT_LABELS, describeSupport, pickSupportPoint, surfaceUnder } from './placement.js';
import { SNAP_TOLERANCE_PX, bodiesAt, gridStepFor, snapPoint, surfaceNear } from './snap.js';

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
    const s = this.snap(world, { interior: true, surfaces: true, pins: true });
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
    const s = this.snap(e.world, { interior: true, surfaces: true, pins: true });
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

// Two clicks: a point of a mass (centre, corner, edge snapping), then the surface the support sits
// on. The symbol adapts to the surface angle and spans the distance between the point and the
// surface (the renderer scales it). A Festlager clicked in free space needs only one click.
export class SupportTool extends Tool {
  constructor(env, type) {
    super(env);
    this.type = type;
    this.first = null; // the picked point of a mass, after the first click
    this.last = null; // what the pointer would place, for the preview
  }

  get hint() {
    const name = SUPPORT_LABELS[this.type];
    if (this.first) {
      return this.type === 'roller_support'
        ? 'Now click the surface the Loslager rolls on. It slides along it and adapts to its angle.'
        : `Now click the surface the ${name} sits on: it adapts to its angle and spans the distance. `
          + 'Click elsewhere for a support without a surface.';
    }
    if (this.type === 'roller_support') return 'Click a point of a mass, then the surface it rolls on.';
    const free = this.type === 'pin_support' ? ' Click free space to place a Festlager that ropes, Stabs and springs can attach to.' : '';
    return `Click a point of a mass for the ${name}, then the surface it sits on.${free}`;
  }

  // What a click at `world` would do right now.
  place(world) {
    if (!this.first) return pickSupportPoint(this.scene, this.type, world, this.scale);
    const surface = surfaceUnder(this.scene, world, this.scale);
    if (!surface && this.type === 'roller_support') {
      return { error: 'A Loslager needs a surface: click on one.', point: this.first.point };
    }
    return { ...describeSupport(this.scene, this.first, surface), point: this.first.point, kind: this.first.kind, surfaceId: surface && surface.id };
  }

  move(e) {
    const p = this.place(e.world);
    this.last = p;
    if (this.first) {
      this.marker = { point: this.first.point, kind: this.first.kind };
    } else {
      this.marker = { point: p.point, kind: p.error ? 'invalid' : p.kind };
    }
  }

  down(e) {
    this.error = null;
    const p = this.place(e.world);
    if (p.error) {
      this.error = p.error;
      return true;
    }
    if (!this.first) {
      if (p.free) {
        const id = this.env.model.addGroundPin({ point: p.point, surface: p.surface, angle: p.angle });
        this.env.created('constraint', id);
      } else {
        this.first = p;
        this.last = null;
      }
      return true;
    }
    const id = this.env.model.addSupport(this.type, {
      body: p.body, point: p.local, surface: p.surface, angle: p.angle,
    });
    this.env.created('constraint', id);
    this.first = null;
    this.last = null;
    return true;
  }

  key(name) {
    if (name === 'Escape' && this.first) {
      this.cancel();
      return true;
    }
    return false;
  }

  get preview() {
    const p = this.last;
    if (!p) return null;
    const height = p.surfaceId ? this.heightFor(p) : 0;
    return {
      type: 'support', supportType: this.type, point: p.point, angle: p.angle || 0, height,
      surface: p.surfaceId || null, valid: !p.error,
      label: p.error ? '' : `${SUPPORT_LABELS[this.type]}${p.free ? ' (free space)' : ''}`,
    };
  }

  // Distance (m) from the picked point to the surface the pointer is over.
  heightFor(p) {
    const s = this.scene.surfaces.find((x) => x.id === p.surfaceId);
    const nx = -Math.sin(p.angle);
    const ny = Math.cos(p.angle);
    return s ? Math.max(0, (p.point[0] - s.p1[0]) * nx + (p.point[1] - s.p1[1]) * ny) : 0;
  }

  cancel() {
    super.cancel();
    this.first = null;
    this.last = null;
  }
}

// --- rope and Stab ----------------------------------------------------------------------------------

const LINK_NAMES = { rope: 'rope', rod: 'Stab', damper: 'damper' };

// Two ends, each on a mass, on a Festlager in free space, or on the ground. The rope never stretches
// but may go slack; the Stab keeps its length and takes push and pull; the damper resists the
// relative motion of its ends.
export class LinkTool extends Tool {
  constructor(env, kind) {
    super(env);
    this.kind = kind;
    this.reset();
  }

  reset() {
    this.a = null;
    this.cursor = null;
    this.pressedAt = null;
  }

  get hint() {
    if (this.kind === 'rod') {
      return this.a
        ? 'Click the second end: a mass, a node, a Festlager - or free space, which makes a node there.'
        : 'Click the first end of the Stab: a mass, a node, a Festlager in free space - or free space, which makes a new node (Knoten). '
          + 'Join Stabs in nodes to build a Fachwerk; a fixed point needs a Festlager.';
    }
    if (this.a) return 'Click the second end (or release after dragging from the first).';
    const extra = this.kind === 'rope' ? ' It never stretches; set a longer length in its properties to let it hang slack.'
      : this.kind === 'damper' ? ' Set its damping c in its properties.' : '';
    return `Click the first end of the ${LINK_NAMES[this.kind]}: a point of a mass, a Festlager in free space, or the ground.${extra}`;
  }

  // A Stab never pins itself to empty space: its free ends become nodes (made when the Stab is created).
  anchorFrom(world) {
    const s = this.snap(world, { interior: true, surfaces: this.kind !== 'rod', pins: true });
    const node = this.kind === 'rod' && !s.body && s.kind !== 'pin';
    return { body: s.body, point: s.body ? s.local : s.point, world: s.point, kind: s.kind, node };
  }

  down(e) {
    this.error = null;
    if (!this.a) {
      this.a = this.anchorFrom(e.world);
      this.cursor = this.a.world;
      this.pressedAt = e.world;
    } else {
      this.finish(e.world);
    }
    return true;
  }

  move(e) {
    const s = this.anchorFrom(e.world);
    this.cursor = s.world;
    this.marker = this.a ? null : { point: s.world, kind: s.kind };
  }

  up(e) {
    if (!this.a || !this.pressedAt) return;
    const movedPx = dist(this.pressedAt, e.world) * this.scale;
    this.pressedAt = null;
    if (movedPx >= MIN_DRAG_PX) this.finish(e.world);
  }

  finish(world) {
    const b = this.anchorFrom(world);
    const strip = ({ body, point, node }) => (node ? { body: null, point, node: true } : { body, point });
    const link = { a: strip(this.a), b: strip(b) };
    const problem = linkProblem(this.scene, link);
    if (problem) {
      this.error = problem;
      return; // keep the first end, try the second again
    }
    if (this.kind === 'damper') {
      this.env.created('element', this.env.model.addDamper(link));
    } else {
      this.env.created('constraint', this.kind === 'rope' ? this.env.model.addRope(link) : this.env.model.addRod(link));
    }
    this.reset();
  }

  key(name) {
    if (name === 'Escape' && this.a) {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel() {
    super.cancel();
    this.reset();
  }

  get preview() {
    if (!this.a) return null;
    const newNodes = []; // free Stab ends: a node is made there
    if (this.kind === 'rod') {
      if (this.a.node) newNodes.push(this.a.world);
      if (this.cursor && this.anchorFrom(this.cursor).node) newNodes.push(this.cursor);
    }
    return {
      type: 'link', kind: this.kind, a: this.a.world, b: this.cursor, newNodes,
      label: `${LINK_NAMES[this.kind]} ${dist(this.a.world, this.cursor).toFixed(2)} m`,
    };
  }
}

// --- node (Knoten) ----------------------------------------------------------------------------------

// The joint of a Fachwerk: a point mass that Stabs, supports and forces attach to. Stabs also make
// their own nodes at free ends; this tool places one first (to put a support on it, say).
export class NodeTool extends Tool {
  get hint() {
    return 'Click to place a node (Knoten), where Stabs meet. Supports and forces can sit on it; '
      + 'a Stab that ends in free space makes one by itself.';
  }

  pick(world) {
    const s = this.snap(world, { surfaces: true });
    const existing = (this.scene.bodies || []).find((b) => b.type === 'node' && dist(b.position, s.point) < 1e-6);
    return { ...s, existing: existing ? existing.id : null };
  }

  move(e) {
    const s = this.pick(e.world);
    this.marker = { point: s.point, kind: s.existing ? 'invalid' : s.kind };
  }

  down(e) {
    this.error = null;
    const s = this.pick(e.world);
    if (s.existing) {
      this.error = `There is already a node here (${s.existing}).`;
      return true;
    }
    this.env.created('body', this.env.model.addNode({ point: s.point }));
    return true;
  }

  get preview() {
    return null;
  }
}

// --- beam (bendable mass object) -------------------------------------------------------------------

export const MIN_BEAM_M = 0.1;

// Press at one end of the beam, drag (or click) to the other: the axis, at an angle snapped to
// 0, 30, 45, 60, 90 degrees (Shift for free angles). The cross section is chosen in its properties.
export class BeamTool extends TwoPointTool {
  get hint() {
    return this.p1
      ? 'Release / click the other end of the beam. Hold Shift for free angles.'
      : 'Drag along the beam axis to create a bendable beam (steel); choose its cross section with a right-click.';
  }

  snapStart(world) { return this.snap(world, { surfaces: true, pins: true }); }

  constrainEnd(p1, world, e) {
    if (e && e.shift) return this.snap(world, { surfaces: true, bodies: false }).point;
    return snapSegmentEnd(p1, world, { step: this.step });
  }

  commit(p1, p2) {
    if (dist(p1, p2) < MIN_BEAM_M) return false;
    this.env.created('body', this.env.model.addBeam({ start: p1, end: p2 }));
    return true;
  }

  get preview() {
    if (!this.p1) return null;
    return { type: 'beam', start: this.p1, end: this.end, label: `${fmt(dist(this.p1, this.end))} m beam` };
  }
}

// --- joints ---------------------------------------------------------------------------------------

const JOINT_NAMES = { pin_joint: 'hinge (Gelenk)', fixed_joint: 'rigid joint' };

// Joins two masses where they touch or overlap (hinge or rigid connection); on a Festlager in free
// space with a mass on it, it pins that mass to the Festlager.
export class JointTool extends Tool {
  constructor(env, type) {
    super(env);
    this.type = type;
    this.last = null;
  }

  get hint() {
    return `Click where two masses touch or overlap to join them with a ${JOINT_NAMES[this.type]}. `
      + 'On a Festlager in free space it pins the mass that lies on it.';
  }

  find(world) {
    const s = this.snap(world, { interior: true, pins: true });
    if (s.kind === 'pin') {
      const body = bodiesAt(s.point, this.scene, this.scale)[0];
      if (!body) return { error: 'Move a mass onto the Festlager first.', point: s.point };
      return { pin: s.pin, body, point: s.point };
    }
    const bodies = bodiesAt(s.point, this.scene, this.scale);
    if (bodies.length < 2) {
      return { error: 'A joint connects two masses: click where they touch or overlap.', point: s.point };
    }
    return { a: bodies[0], b: bodies[1], point: s.point, many: bodies.length > 2 };
  }

  move(e) {
    this.last = this.find(e.world);
    this.marker = { point: this.last.point, kind: this.last.error ? 'invalid' : 'joint' };
  }

  down(e) {
    this.error = null;
    const f = this.find(e.world);
    if (f.error) {
      this.error = f.error;
      return true;
    }
    if (f.pin) {
      this.env.model.attachPin(f.pin, { body: f.body.id, point: worldToLocal(f.body, f.point) });
      this.env.created('constraint', f.pin);
      return true;
    }
    const end = (body) => ({ body: body.id, point: worldToLocal(body, f.point) });
    const id = this.env.model.addJoint(this.type, { a: end(f.a), b: end(f.b) });
    if (f.many) this.error = 'More than two masses meet here: joined the top two.';
    this.env.created('constraint', id);
    return true;
  }

  get preview() {
    const p = this.last;
    if (!p || p.error) return null;
    return { type: 'joint', jointType: this.type, point: p.point, label: p.pin ? 'pin the mass' : JOINT_NAMES[this.type] };
  }

  cancel() {
    super.cancel();
    this.last = null;
  }
}

// --- move -----------------------------------------------------------------------------------------

const selectionOf = (t) => {
  if (t.type === 'end') return { kind: t.kind, id: t.id };
  if (t.type === 'support' || t.type === 'pin') return { kind: 'constraint', id: t.id };
  if (t.type === 'load') return { kind: 'element', id: t.id };
  return { kind: t.type, id: t.id };
};

// Drag a mass (with what is attached to it and the masses joined to it), a surface or a Festlager in
// free space; drag a support or load to another point of a mass; drag the end of a spring, rope or
// Stab to attach it elsewhere. One drag is one undo step. Shift turns the grid snap off.
export class MoveTool extends Tool {
  constructor(env) {
    super(env);
    this.drag = null;
    this.hover = null; // { type, id, end? } under the pointer, for the highlight
  }

  get tol() { return SNAP_TOLERANCE_PX / this.scale; }

  get hint() {
    if (this.drag) return 'Release to drop it here. Escape cancels. Hold Shift to switch the grid snap off.';
    return 'Drag a mass, surface or Festlager to move it. Drag a support or load to re-place it, '
      + 'or the end of a spring, rope or Stab to attach it elsewhere.';
  }

  move(e) {
    if (this.drag) this.dragTo(e);
    else this.hover = moveTarget(this.scene, e.world, this.scale);
  }

  down(e) {
    this.error = null;
    const target = moveTarget(this.scene, e.world, this.scale);
    this.env.select(target ? selectionOf(target) : null);
    if (!target) return false; // empty space: the canvas pans
    const base = JSON.parse(JSON.stringify(this.scene));
    const body = target.type === 'body' ? base.bodies.find((b) => b.id === target.id) : null;
    this.drag = {
      target, base, start: e.world, started: false, tx: this.env.model.transaction(),
      group: body ? jointGroup(base, body.id) : null,
    };
    this.hover = target;
    return true;
  }

  up(e) {
    if (!this.drag) return;
    this.dragTo(e);
    this.drag.tx.commit();
    this.drag = null;
  }

  cancel() {
    super.cancel();
    if (this.drag) this.drag.tx.cancel();
    this.drag = null;
    this.hover = null;
  }

  key(name) {
    if (name === 'Escape' && this.drag) {
      this.cancel();
      return true;
    }
    return false;
  }

  snapTo(point, e) {
    const step = this.step;
    return e.shift ? point : [roundTo(point[0], step), roundTo(point[1], step)];
  }

  dragTo(e) {
    const d = this.drag;
    if (!d.started && dist(d.start, e.world) * this.scale < MIN_DRAG_PX) return;
    d.started = true;
    const raw = sub(e.world, d.start);
    const t = d.target;
    const { base, tx } = d;
    this.error = null;

    if (t.type === 'body') {
      const body = base.bodies.find((b) => b.id === t.id);
      const target = this.snapTo(add(body.position, raw), e);
      let delta = sub(target, body.position);
      delta = add(delta, contactOffset(base, t.id, delta, this.tol)); // lands exactly on a nearby surface
      tx.update((scene) => moveBodies(scene, d.group, delta, this.tol));
    } else if (t.type === 'surface') {
      const s = base.surfaces.find((x) => x.id === t.id);
      const delta = sub(this.snapTo(add(s.p1, raw), e), s.p1);
      tx.update((scene) => moveSurface(scene, t.id, delta, this.tol));
    } else if (t.type === 'pin') {
      const pin = base.constraints.find((c) => c.id === t.id);
      const target = snapPoint(add(pin.point, raw), base, { scale: this.scale, bodies: false, surfaces: true, grid: !e.shift }).point;
      const delta = sub(target, pin.point);
      tx.update((scene) => movePin(scene, t.id, delta, this.tol));
    } else if (t.type === 'end') {
      this.dragEnd(e, d);
    } else if (t.type === 'support' || t.type === 'load') {
      this.dragAttachment(e, d);
    }
  }

  dragEnd(e, d) {
    const { target: t, base, tx } = d;
    const s = snapPoint(e.world, base, { scale: this.scale, interior: true, surfaces: true, pins: true, grid: !e.shift });
    const anchor = { body: s.body, point: s.body ? s.local : s.point };
    const test = JSON.parse(JSON.stringify(base));
    reattachEnd(test, t.id, t.end, anchor);
    const link = [...test.elements, ...test.constraints].find((o) => o.id === t.id);
    // A Stab is never pinned to empty space: it ends on a mass, a node or a Festlager.
    const stab = link.type === 'rod' || link.type === 'bar';
    const problem = stab && anchor.body === null && s.kind !== 'pin'
      ? 'A Stab ends on a mass, a node or a Festlager. Draw it from a free point to make a node there.'
      : linkProblem(test, link);
    this.marker = { point: s.point, kind: problem ? 'invalid' : s.kind };
    if (problem) {
      this.error = problem;
      tx.update(() => {});
      return;
    }
    tx.update((scene) => reattachEnd(scene, t.id, t.end, anchor));
  }

  dragAttachment(e, d) {
    const { target: t, base, tx } = d;
    if (t.type === 'support') {
      const old = base.constraints.find((c) => c.id === t.id);
      const pt = pickSupportPoint(base, old.type, e.world, this.scale);
      this.marker = { point: pt.point, kind: pt.error || pt.free ? 'invalid' : pt.kind };
      if (pt.error || pt.free) {
        this.error = pt.error || 'A support must sit on a mass.';
        tx.update(() => {});
        return;
      }
      // The support keeps the surface it sits on (it may be some distance away); one without a
      // surface adopts one that it now touches.
      const surface = base.surfaces.find((x) => x.id === old.surface) || surfaceNear(pt.point, base.surfaces, this.scale);
      const placement = describeSupport(base, pt, surface);
      if (!surface) placement.angle = old.params.angle || 0;
      tx.update((scene) => replaceSupport(scene, t.id, placement));
    } else {
      const s = snapPoint(e.world, base, { scale: this.scale, interior: true });
      this.marker = { point: s.point, kind: s.body ? s.kind : 'invalid' };
      if (!s.body) {
        this.error = 'A load must act on a mass.';
        tx.update(() => {});
        return;
      }
      tx.update((scene) => replaceLoad(scene, t.id, { body: s.body, point: s.local }));
    }
  }
}

// --- registry -------------------------------------------------------------------------------------

// The toolbox order. `icon` names are drawn by editor/icons.js.
export const TOOL_DEFS = [
  { id: 'select', label: 'Select', icon: 'select', make: (env) => new SelectTool(env) },
  { id: 'move', label: 'Move', icon: 'move', make: (env) => new MoveTool(env) },
  { id: 'rect', label: 'Rectangular mass', icon: 'rect', make: (env) => new RectTool(env) },
  { id: 'circle', label: 'Circular mass', icon: 'circle', make: (env) => new CircleTool(env) },
  { id: 'beam', label: 'Beam (bendable)', icon: 'beam', make: (env) => new BeamTool(env) },
  { id: 'surface', label: 'Surface', icon: 'surface', make: (env) => new SurfaceTool(env) },
  { id: 'spring', label: 'Spring', icon: 'spring', make: (env) => new SpringTool(env) },
  { id: 'damper', label: 'Damper', icon: 'damper', make: (env) => new LinkTool(env, 'damper') },
  { id: 'rope', label: 'Rope', icon: 'rope', make: (env) => new LinkTool(env, 'rope') },
  { id: 'rod', label: 'Stab (rod)', icon: 'rod', make: (env) => new LinkTool(env, 'rod') },
  { id: 'node', label: 'Node (Knoten)', icon: 'node', make: (env) => new NodeTool(env) },
  { id: 'load', label: 'Force / moment', icon: 'load', make: (env) => new LoadTool(env) },
  { id: 'pin', label: 'Festlager', icon: 'pin', make: (env) => new SupportTool(env, 'pin_support') },
  { id: 'fixed', label: 'Lager (fixed)', icon: 'fixed', make: (env) => new SupportTool(env, 'fixed_support') },
  { id: 'roller', label: 'Loslager', icon: 'roller', make: (env) => new SupportTool(env, 'roller_support') },
  { id: 'joint', label: 'Joint (hinge)', icon: 'joint', make: (env) => new JointTool(env, 'pin_joint') },
  { id: 'weld', label: 'Rigid joint', icon: 'weld', make: (env) => new JointTool(env, 'fixed_joint') },
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
