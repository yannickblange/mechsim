// panel.js - the displacement graphs: one floating, draggable, resizable panel per mass. DOM glue;
// the data comes from recorder.js and the maths from plot.js.
import { decimal } from '../format.js';
import { envelope, extent, formatTick, lengthUnit, lowerBound, niceTicks } from './plot.js';

const el = (tag, className, attrs = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const DEG = 180 / Math.PI;

// What a panel can show. `series` pick fields of Recorder.displacement(); length series are shown in
// mm or m, rotations in degrees.
export const GRAPH_MODES = {
  xy: { label: 'Verschiebung x, y', quantity: 'length', series: [['x', 'ux', 'plot1'], ['y', 'uy', 'plot2']] },
  mag: { label: 'Verschiebung |u|', quantity: 'length', series: [['|u|', 'umag', 'plot1']] },
  rot: { label: 'Drehung φ', quantity: 'angle', series: [['φ', 'rot', 'plot3']] },
};

export const GRAPH_WINDOWS = { all: ['Ganzer Lauf', Infinity], s5: ['Letzte 5 s', 5], s20: ['Letzte 20 s', 20] };

const MARGIN = { left: 50, right: 10, top: 10, bottom: 24 };

// Everything a panel draws, as numbers: the series scaled to their unit, the visible time range and
// the y range with ticks. Pure, so it can be tested.
export function graphModel(displacement, mode, windowKey) {
  const spec = GRAPH_MODES[mode];
  if (!displacement || !displacement.t.length) return null;
  const { t } = displacement;
  const t1 = Math.max(t[t.length - 1], t[0] + 1e-3);
  const win = GRAPH_WINDOWS[windowKey][1];
  const t0 = Number.isFinite(win) ? Math.max(t[0], t1 - win) : t[0];
  const i0 = lowerBound(t, t0);

  const raw = spec.series.map(([label, key, color]) => ({ label, key, color, values: displacement[key] }));
  let maxAbs = 0;
  for (const s of raw) {
    const e = extent(s.values, i0);
    if (e) maxAbs = Math.max(maxAbs, Math.abs(e[0]), Math.abs(e[1]));
  }
  const unit = spec.quantity === 'angle' ? { name: '°', factor: DEG } : lengthUnit(maxAbs);
  const series = raw.map((s) => ({ ...s, values: s.values.map((v) => v * unit.factor) }));

  let lo = 0;
  let hi = 0;
  for (const s of series) {
    const e = extent(s.values, i0);
    if (e) {
      lo = Math.min(lo, e[0]);
      hi = Math.max(hi, e[1]);
    }
  }
  const pad = (hi - lo) * 0.08 || 1e-3;
  const yTicks = niceTicks(lo - pad, hi + pad, 5);
  return {
    t, t0, t1, unit, series,
    y0: lo - pad, y1: hi + pad,
    yTicks: yTicks.ticks, yStep: yTicks.step,
    xTicks: niceTicks(t0, t1, 6),
  };
}

function draw(canvas, model, theme, hoverT) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  const plot = { x: MARGIN.left, y: MARGIN.top, w: w - MARGIN.left - MARGIN.right, h: h - MARGIN.top - MARGIN.bottom };
  if (plot.w < 20 || plot.h < 20) return;

  ctx.font = '11px system-ui, sans-serif';
  if (!model) {
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.fillText('Noch keine Daten – Start drücken.', w / 2, h / 2);
    return;
  }
  const sx = (t) => plot.x + ((t - model.t0) / (model.t1 - model.t0)) * plot.w;
  const sy = (v) => plot.y + (1 - (v - model.y0) / (model.y1 - model.y0)) * plot.h;

  // grid and tick labels
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const v of model.yTicks) {
    if (v < model.y0 || v > model.y1) continue;
    const y = Math.round(sy(v)) + 0.5;
    ctx.strokeStyle = v === 0 ? theme.axis : theme.gridMajor;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatTick(v, model.yStep), plot.x - 5, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of model.xTicks.ticks) {
    if (v < model.t0 || v > model.t1) continue;
    const x = Math.round(sx(v)) + 0.5;
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatTick(v, model.xTicks.step), x, plot.y + plot.h + 5);
  }
  ctx.strokeStyle = theme.axis;
  ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w, plot.h);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.muted;
  ctx.fillText('t / s', w - 4, h - 14);
  ctx.textAlign = 'left';
  ctx.fillText(model.unit.name, 4, 4);

  // curves, clipped to the plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  for (const s of model.series) {
    ctx.strokeStyle = theme[s.color];
    const cols = envelope(model.t, s.values, model.t0, model.t1, plot.w);
    ctx.beginPath();
    cols.forEach((c, i) => {
      const x = plot.x + c.x;
      if (i === 0) ctx.moveTo(x, sy(c.lo)); else ctx.lineTo(x, sy(c.lo));
      if (c.hi !== c.lo) ctx.lineTo(x, sy(c.hi));
    });
    ctx.stroke();
  }
  ctx.restore();

  // hover read-out
  if (hoverT !== null && hoverT >= model.t0 && hoverT <= model.t1) {
    const i = Math.min(model.t.length - 1, Math.max(0, lowerBound(model.t, hoverT)));
    const x = Math.round(sx(model.t[i])) + 0.5;
    ctx.strokeStyle = theme.muted;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    const lines = [`t = ${decimal(model.t[i], 3)} s`, ...model.series.map((s) => `${s.label} = ${decimal(s.values[i], Math.abs(s.values[i]) < 10 ? 3 : 1)} ${model.unit.name}`)];
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
    const bx = x + 8 + bw > plot.x + plot.w ? x - 8 - bw : x + 8;
    ctx.fillStyle = theme.labelBg;
    ctx.fillRect(bx, plot.y + 4, bw, 6 + 15 * lines.length);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, k) => {
      ctx.fillStyle = k === 0 ? theme.ink : theme[model.series[k - 1].color];
      ctx.fillText(l, bx + 6, plot.y + 8 + 15 * k);
    });
  }
}

function csv(recorder, id) {
  const d = recorder.displacement(id);
  if (!d) return '';
  const s = recorder.bodies.get(id);
  const rows = ['t_s,x_m,y_m,phi_rad,ux_m,uy_m,rot_rad'];
  d.t.forEach((t, i) => rows.push([t, s.x[i], s.y[i], s.phi[i], d.ux[i], d.uy[i], d.rot[i]].join(',')));
  return rows.join('\n') + '\n';
}

class GraphPanel {
  constructor(manager, id) {
    this.manager = manager;
    this.id = id;
    this.mode = 'xy';
    this.window = 'all';
    this.hoverT = null;
    this.drawnVersion = -1;
    this.root = el('section', 'graph', { role: 'figure', 'aria-label': `Verschiebungsdiagramm von ${id}` });
    const head = el('header', 'graph-head');
    this.title = el('span', 'graph-title');
    this.title.textContent = id;
    this.modeSelect = el('select', 'graph-mode', { 'aria-label': 'Größe' });
    for (const [key, m] of Object.entries(GRAPH_MODES)) this.modeSelect.append(new Option(m.label, key));
    this.windowSelect = el('select', 'graph-window', { 'aria-label': 'Zeitfenster' });
    for (const [key, [label]] of Object.entries(GRAPH_WINDOWS)) this.windowSelect.append(new Option(label, key));
    const save = el('button', 'graph-btn', { type: 'button', title: 'Aufgezeichnete Daten als CSV speichern' });
    save.textContent = 'CSV';
    const close = el('button', 'graph-btn graph-close', { type: 'button', 'aria-label': `Diagramm von ${id} schließen`, title: 'Schließen' });
    close.textContent = '×';
    head.append(this.title, this.modeSelect, this.windowSelect, save, close);
    this.canvas = el('canvas', 'graph-canvas');
    this.root.append(head, this.canvas);

    this.modeSelect.addEventListener('change', () => { this.mode = this.modeSelect.value; this.invalidate(); });
    this.windowSelect.addEventListener('change', () => { this.window = this.windowSelect.value; this.invalidate(); });
    close.addEventListener('click', () => manager.close(id));
    save.addEventListener('click', () => this.download());
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerleave', () => { this.hoverT = null; this.invalidate(); });
    this.root.addEventListener('pointerdown', () => manager.raise(this));
    this.attachDrag(head);
    new ResizeObserver(() => this.invalidate()).observe(this.canvas);
  }

  invalidate() {
    this.drawnVersion = -1;
  }

  hover(e) {
    const model = this.model;
    if (!model) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - MARGIN.left;
    const w = rect.width - MARGIN.left - MARGIN.right;
    this.hoverT = model.t0 + (x / w) * (model.t1 - model.t0);
    this.invalidate();
  }

  attachDrag(handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('select, button')) return;
      const stage = this.manager.stage.getBoundingClientRect();
      const box = this.root.getBoundingClientRect();
      const dx = e.clientX - box.left;
      const dy = e.clientY - box.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - stage.left - dx), stage.width - 80);
        const y = Math.min(Math.max(0, ev.clientY - stage.top - dy), stage.height - 30);
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  download() {
    const blob = new Blob([csv(this.manager.recorder, this.id)], { type: 'text/csv' });
    const a = el('a', '', { href: URL.createObjectURL(blob), download: `${this.id}_displacement.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  render(force = false) {
    const version = this.manager.recorder.version;
    if (!force && version === this.drawnVersion) return;
    this.drawnVersion = version;
    this.model = graphModel(this.manager.recorder.displacement(this.id), this.mode, this.window);
    draw(this.canvas, this.model, this.manager.getTheme(), this.hoverT);
  }
}

// The set of open graphs of one stage. recorder: Recorder; getTheme(): the renderer's theme.
export class GraphManager {
  constructor({ stage, recorder, getTheme }) {
    this.stage = stage;
    this.recorder = recorder;
    this.getTheme = getTheme;
    this.panels = new Map();
    this.z = 10;
  }

  has(id) {
    return this.panels.has(id);
  }

  open(id) {
    const existing = this.panels.get(id);
    if (existing) {
      this.raise(existing);
      return existing;
    }
    const panel = new GraphPanel(this, id);
    const n = this.panels.size;
    this.stage.append(panel.root);
    const width = panel.root.offsetWidth || 380;
    panel.root.style.left = `${Math.max(8, this.stage.clientWidth - width - 16 - (n % 4) * 26)}px`;
    panel.root.style.top = `${12 + (n % 5) * 30}px`;
    this.panels.set(id, panel);
    this.raise(panel);
    panel.render(true);
    return panel;
  }

  close(id) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.root.remove();
    this.panels.delete(id);
  }

  raise(panel) {
    panel.root.style.zIndex = String(++this.z);
  }

  // Close the graphs of masses that are not in the scene (any more).
  sync(bodyIds) {
    const alive = new Set(bodyIds);
    for (const id of [...this.panels.keys()]) if (!alive.has(id)) this.close(id);
  }

  // Redraw what changed; call every animation frame.
  render() {
    for (const panel of this.panels.values()) panel.render();
  }

  refreshTheme() {
    for (const panel of this.panels.values()) panel.render(true);
  }
}
