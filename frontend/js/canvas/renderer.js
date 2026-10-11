// renderer.js - draws grid, constraints, elements and bodies.
import { Camera } from './camera.js';
import { drawGrid } from './grid.js';
import { bodySymbols, elementSymbols, constraintSymbols } from './symbols/index.js';

const THEME_VARS = {
  background: ['--c-bg', '#22332b'],
  grid: ['--c-grid', 'rgba(233,238,228,0.07)'],
  ink: ['--c-ink', '#e9eee4'],
  muted: ['--c-muted', '#9fb0a4'],
  spring: ['--c-spring', '#f0c96a'],
  support: ['--c-support', '#9cc3e6'],
  force: ['--c-force', '#e8868a'],
};

const rotate = ([x, y], phi) => {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [c * x - s * y, s * x + c * y];
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = new Camera();
    this.scene = null;
    this.theme = Renderer.readTheme();
    this.bodies = new Map();
    this.elements = new Map();
    this.constraints = new Map();
    this.warned = new Set();
    this.attachInput();
  }

  // Colours come from the CSS custom properties on :root.
  static readTheme() {
    const style = getComputedStyle(document.documentElement);
    const theme = {};
    for (const [key, [name, fallback]] of Object.entries(THEME_VARS)) {
      theme[key] = style.getPropertyValue(name).trim() || fallback;
    }
    return theme;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cam.width = rect.width;
    this.cam.height = rect.height;
  }

  setScene(scene) {
    this.scene = scene;
    const byId = (list) => new Map((list || []).map((spec) => [spec.id, spec]));
    this.bodies = byId(scene.bodies);
    this.elements = byId(scene.elements);
    this.constraints = byId(scene.constraints);
    this.theme = Renderer.readTheme();
    this.fitToScene();
  }

  // scene.view if given, else the bounding box of bodies and ground anchors with 50 % padding.
  fitToScene() {
    const scene = this.scene;
    if (!scene) return;
    if (scene.view) {
      this.cam.fit(scene.view.center, scene.view.width);
      return;
    }
    const points = (scene.bodies || []).map((b) => b.position);
    for (const el of scene.elements || []) {
      for (const anchor of [el.a, el.b]) if (anchor.body === null) points.push(anchor.point);
    }
    if (points.length === 0) return;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const width = Math.max(1, 1.5 * Math.max(maxX - minX, maxY - minY));
    this.cam.fit([(minX + maxX) / 2, (minY + maxY) / 2], width);
  }

  render(frame) {
    const { ctx, cam, theme } = this;
    ctx.save();
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cam.width, cam.height);
    ctx.restore();
    drawGrid(ctx, cam, theme);
    if (!this.scene) return;

    const f = frame || this.initialFrame();
    this.drawAll(f.elements, this.elements, elementSymbols);
    this.drawAll(f.bodies, this.bodies, bodySymbols);
    this.drawAll(f.constraints, this.constraints, constraintSymbols);
  }

  drawAll(entries, specs, symbols) {
    for (const entry of entries || []) {
      const spec = specs.get(entry.id);
      if (!spec) continue;
      const draw = symbols[spec.type];
      if (!draw) {
        if (!this.warned.has(spec.type)) {
          this.warned.add(spec.type);
          console.warn(`No drawing symbol for type "${spec.type}"`);
        }
        continue;
      }
      draw(this.ctx, this.cam, spec, entry, this.theme);
    }
  }

  // The frame a freshly loaded scene would have at t = 0, computed from the scene alone.
  initialFrame() {
    const scene = this.scene;
    const pose = new Map(
      (scene.bodies || []).map((b) => [b.id, { pos: b.position, phi: b.angle || 0 }]),
    );
    const world = (body, point) => {
      if (body === null) return point;
      const { pos, phi } = pose.get(body);
      const r = rotate(point, phi);
      return [pos[0] + r[0], pos[1] + r[1]];
    };
    return {
      t: 0,
      bodies: (scene.bodies || []).map((b) => ({
        id: b.id, x: b.position[0], y: b.position[1], phi: b.angle || 0, vx: 0, vy: 0, omega: 0,
      })),
      elements: (scene.elements || []).map((e) => ({
        id: e.id, type: e.type, p1: world(e.a.body, e.a.point), p2: world(e.b.body, e.b.point), force: 0,
      })),
      constraints: (scene.constraints || []).map((c) => ({
        id: c.id, type: c.type, position: world(c.body, c.point), reaction: [0, 0],
      })),
    };
  }

  attachInput() {
    const canvas = this.canvas;
    let dragging = false;
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        this.cam.zoomAt([event.offsetX, event.offsetY], factor);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (dragging) this.cam.panBy(event.movementX, event.movementY);
    });
    const stop = () => { dragging = false; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('dblclick', () => this.fitToScene());
  }
}
