// recorder.js - keeps the pose history of every body, fed by the frame messages (and their traces).
// Pure: no DOM. The graph panels read it; it never draws.

export const MAX_SAMPLES = 200000;

export class Recorder {
  constructor() {
    this.clear();
  }

  clear() {
    this.t = [];
    this.bodies = new Map(); // id -> { x: [], y: [], phi: [], x0, y0, phi0 }
    this.version = 0; // bumped on every change, so panels know when to redraw
    this.sceneVersion = null;
  }

  // Start a new recording when the scene is another one than before.
  bindScene(version) {
    if (this.sceneVersion !== version) {
      this.clear();
      this.sceneVersion = version;
    }
  }

  get duration() {
    return this.t.length ? this.t[this.t.length - 1] : 0;
  }

  has(id) {
    return this.bodies.has(id);
  }

  // One frame message of the protocol: { data: frame, trace?: { ids, t, q } }.
  ingest(msg) {
    if (!msg || !msg.data) return;
    if (msg.trace && msg.trace.t && msg.trace.t.length) {
      const { ids, t, q } = msg.trace;
      // The first sample of a trace comes after a step, so a rewind shows as an earlier frame time.
      if (this.t.length && msg.data.t < this.duration - 1e-12) this.restart();
      for (let i = 0; i < t.length; i++) {
        const pose = new Map(ids.map((id, k) => [id, [q[i][3 * k], q[i][3 * k + 1], q[i][3 * k + 2]]]));
        this.push(t[i], pose);
      }
      return;
    }
    const pose = new Map(msg.data.bodies.map((b) => [b.id, [b.x, b.y, b.phi]]));
    if (this.t.length && msg.data.t < this.duration - 1e-12) this.restart();
    // A frame that repeats the last time (a paused client reconnecting) adds nothing.
    if (this.t.length && Math.abs(msg.data.t - this.duration) < 1e-12) return;
    this.push(msg.data.t, pose);
  }

  // Reset: keep nothing but the shape of the data.
  restart() {
    this.t = [];
    this.bodies = new Map();
    this.version++;
  }

  push(time, pose) {
    for (const [id, [x, y, phi]] of pose) {
      let s = this.bodies.get(id);
      if (!s) {
        s = { x: [], y: [], phi: [], x0: x, y0: y, phi0: phi };
        this.bodies.set(id, s);
      }
      s.x.push(x);
      s.y.push(y);
      s.phi.push(phi);
    }
    this.t.push(time);
    if (this.t.length > MAX_SAMPLES) this.trim(Math.floor(MAX_SAMPLES / 4));
    this.version++;
  }

  // Drop the oldest `n` samples (the reference pose x0, y0, phi0 stays the pose at t = 0).
  trim(n) {
    this.t.splice(0, n);
    for (const s of this.bodies.values()) {
      s.x.splice(0, n);
      s.y.splice(0, n);
      s.phi.splice(0, n);
    }
  }

  // Displacement of a body from its pose at the start of the recording:
  //   { t, ux, uy, umag, rot } (m, m, m, rad), or null if the body has no samples.
  displacement(id) {
    const s = this.bodies.get(id);
    if (!s || !s.x.length) return null;
    const ux = s.x.map((v) => v - s.x0);
    const uy = s.y.map((v) => v - s.y0);
    return {
      t: this.t,
      ux,
      uy,
      umag: ux.map((v, i) => Math.hypot(v, uy[i])),
      rot: s.phi.map((v) => v - s.phi0),
    };
  }
}
