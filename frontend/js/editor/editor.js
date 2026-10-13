// editor.js - the layout editor: toolbox, pointer handling, keyboard shortcuts, property popup.
// DOM glue only; the logic lives in tools.js, model.js, snap.js, hit.js and properties.js.
import { ICONS } from './icons.js';
import { hitTest } from './hit.js';
import { applyProperties, propertyFields } from './properties.js';
import { drawOverlay } from './preview.js';
import { FIELD_H, FIELD_W, sectionDrawing } from './sectiondim.js';
import { comma } from '../format.js';
import { TOOL_DEFS, createTools } from './tools.js';

const el = (tag, className, attrs = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const isTyping = (target) => target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

export class Editor {
  // stage: the element that contains the canvas (the toolbox and popups are placed in it).
  // onGraph(id): optional, shows the displacement graph of a mass (offered in its popup).
  constructor({ renderer, model, stage, onGraph = null }) {
    this.renderer = renderer;
    this.onGraph = onGraph;
    this.model = model;
    this.stage = stage;
    this.canvas = renderer.canvas;
    this.enabled = false;
    this.selection = null;
    this.tools = createTools({
      model,
      getScale: () => renderer.cam.scale,
      select: (sel) => this.select(sel),
      created: (kind, id) => this.select({ kind, id }),
    });
    this.toolId = 'select';
    this.pointerId = null;

    this.buildToolbox();
    this.buildHint();
    this.buildPopup();
    this.listeners = {
      key: (e) => this.onKey(e),
      context: (e) => this.onContextMenu(e),
      modelChange: () => this.onModelChange(),
    };
    this.interceptor = {
      pointerdown: (e) => this.onPointerDown(e),
      pointermove: (e) => this.onPointerMove(e),
      pointerup: (e) => this.onPointerUp(e),
      pointerleave: () => this.onPointerLeave(),
    };
  }

  get tool() { return this.tools.get(this.toolId); }

  // --- lifecycle ------------------------------------------------------------------------------

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.renderer.interceptor = this.interceptor;
    this.renderer.overlay = (ctx, cam, theme) =>
      drawOverlay(ctx, cam, theme, this.model.scene, this.tool, this.selection);
    this.unsubscribe = this.model.subscribe(this.listeners.modelChange);
    window.addEventListener('keydown', this.listeners.key);
    this.canvas.addEventListener('contextmenu', this.listeners.context);
    this.toolbox.hidden = false;
    this.setTool('select');
    this.onModelChange();
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.tool.cancel();
    this.renderer.interceptor = null;
    this.renderer.overlay = null;
    this.unsubscribe();
    window.removeEventListener('keydown', this.listeners.key);
    this.canvas.removeEventListener('contextmenu', this.listeners.context);
    this.closePopup();
    this.select(null);
    this.setToolboxOpen(false);
    this.toolbox.hidden = true;
    this.hint.hidden = true;
  }

  // --- tools ------------------------------------------------------------------------------------

  setTool(id) {
    if (!this.tools.has(id)) return;
    this.tool.cancel();
    this.toolId = id;
    for (const b of this.toolbox.querySelectorAll('.tool')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    }
    this.canvas.style.cursor = id === 'select' ? '' : id === 'move' ? 'move' : 'crosshair';
    this.updateHint();
  }

  select(sel) {
    this.selection = sel;
    if (sel === null) this.closePopup();
  }

  // Delete the selected object (and everything that depends on it).
  deleteSelection() {
    if (!this.selection) return;
    this.model.remove(this.selection.id);
    this.select(null);
  }

  onModelChange() {
    this.renderer.setScene(this.model.scene, { fit: false });
    if (this.selection && !this.model.find(this.selection.id)) this.select(null);
    this.updateHint();
  }

  // --- pointer ----------------------------------------------------------------------------------

  event(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      world: this.renderer.cam.toWorld([e.clientX - rect.left, e.clientY - rect.top]),
      shift: e.shiftKey,
    };
  }

  onPointerDown(e) {
    this.closePopup();
    const consumed = this.tool.down(this.event(e));
    if (consumed) {
      this.pointerId = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
    }
    this.updateHint();
    return consumed;
  }

  onPointerMove(e) {
    this.tool.move(this.event(e));
    return false;
  }

  onPointerUp(e) {
    if (this.pointerId === null) return false;
    this.pointerId = null;
    this.tool.up(this.event(e));
    this.updateHint();
    return true;
  }

  onPointerLeave() {
    this.tool.marker = null;
  }

  // --- keyboard -----------------------------------------------------------------------------------

  onKey(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (!this.popup.hidden) this.closePopup();
      else if (!this.tool.key('Escape')) {
        if (this.toolId !== 'select') this.setTool('select');
        else this.select(null);
      }
      this.updateHint();
      return;
    }
    if (isTyping(e.target)) return;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.model.redo(); else this.model.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.model.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelection();
    } else if (e.key === 'Enter') {
      this.tool.key('Enter');
      this.updateHint();
    }
  }

  // --- toolbox ----------------------------------------------------------------------------------

  buildToolbox() {
    const box = el('div', 'toolbox', { id: 'toolbox' });
    box.hidden = true;
    const fab = el('button', 'fab', { type: 'button', 'aria-label': 'Bauteil hinzufügen', 'aria-expanded': 'false', title: 'Bauteil hinzufügen' });
    fab.textContent = '+';
    const row = el('div', 'tools', { role: 'toolbar', 'aria-label': 'Bauteile' });
    TOOL_DEFS.forEach((def, i) => {
      const b = el('button', 'tool', { type: 'button', 'data-tool': def.id, 'aria-label': def.label, 'aria-pressed': 'false' });
      b.style.setProperty('--i', String(i));
      b.innerHTML = `${ICONS[def.icon]}<span class="tip">${def.label}</span>`;
      b.addEventListener('click', () => this.setTool(def.id));
      row.append(b);
    });
    fab.addEventListener('click', () => this.setToolboxOpen(box.dataset.open !== 'true'));
    box.append(fab, row);
    this.stage.append(box);
    this.toolbox = box;
    this.fab = fab;
  }

  setToolboxOpen(open) {
    this.toolbox.dataset.open = String(open);
    this.fab.setAttribute('aria-expanded', String(open));
    if (!open) this.setTool('select');
  }

  // --- hint line --------------------------------------------------------------------------------

  buildHint() {
    this.hint = el('div', 'editor-hint', { role: 'status' });
    this.hint.hidden = true;
    this.stage.append(this.hint);
  }

  updateHint() {
    const tool = this.tool;
    this.hint.hidden = !this.enabled;
    this.hint.dataset.error = String(Boolean(tool.error));
    // Shift works in every tool: nothing snaps (grid, points, surfaces, angles) while it is held
    this.hint.textContent = tool.error || (this.toolId === 'select' ? tool.hint : `${tool.hint} Umschalt gedrückt: kein Einrasten.`);
  }

  // --- right-click properties -------------------------------------------------------------------

  buildPopup() {
    this.popup = el('form', 'props', { role: 'dialog', 'aria-label': 'Eigenschaften' });
    this.popup.hidden = true;
    this.popup.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitPopup();
    });
    this.stage.append(this.popup);
  }

  onContextMenu(e) {
    e.preventDefault();
    const { world } = this.event(e);
    const hit = hitTest(this.model.scene, world, this.renderer.cam.scale);
    this.tool.cancel();
    this.select(hit);
    if (hit) {
      const rect = this.stage.getBoundingClientRect();
      this.openPopup(hit.id, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      this.closePopup();
    }
    this.updateHint();
  }

  // draft: what the user has typed (a select that changes the form builds it again with the draft).
  openPopup(id, x, y, draft = {}, focus = null) {
    const form = propertyFields(this.model, id, draft);
    if (!form) return;
    this.popupId = id;
    const p = this.popup;
    p.replaceChildren();
    p.append(el('h2', 'props-title'));
    p.firstChild.textContent = form.title;
    for (const line of form.info) {
      const info = el('p', 'props-info');
      info.textContent = line;
      p.append(info);
    }
    p.classList.toggle('props-wide', Boolean(form.section) && form.fields.some((f) => f.onDrawing));
    let drawn = false;
    for (const f of form.fields) {
      if (f.onDrawing && form.section) { // a dimension of the cross section: a field on the drawing
        if (!drawn) p.append(this.buildDrawing(form));
        drawn = true;
        continue;
      }
      const row = el('label', 'props-row');
      const name = el('span');
      name.textContent = f.label;
      let input;
      if (f.type === 'select') {
        input = el('select', '', { name: f.key });
        for (const [value, text] of f.options) input.append(new Option(text, value, false, value === f.value));
        if (f.reshape) input.addEventListener('change', () => this.reshapePopup(f.key));
      } else {
        input = el('input', '', { name: f.key, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: comma(f.value) });
      }
      const unit = el('span', 'unit');
      unit.textContent = f.unit || '';
      row.append(name, input, unit);
      p.append(row);
    }
    const errors = el('p', 'props-errors', { role: 'alert' });
    errors.hidden = true;
    const buttons = el('div', 'props-buttons');
    if (form.fields.length) {
      const apply = el('button', 'primary', { type: 'submit' });
      apply.textContent = 'Übernehmen';
      buttons.append(apply);
    }
    const found = this.model.find(id);
    if (this.onGraph && found && found.kind === 'body') {
      const graph = el('button', '', { type: 'button', title: 'Die Verschiebung dieser Masse über der Zeit darstellen' });
      graph.textContent = 'Diagramm';
      graph.addEventListener('click', () => {
        this.onGraph(id);
        this.closePopup();
      });
      buttons.append(graph);
    }
    const del = el('button', 'danger', { type: 'button' });
    del.textContent = 'Löschen';
    del.addEventListener('click', () => {
      this.deleteSelection();
      this.closePopup();
    });
    buttons.append(del);
    p.append(errors, buttons);
    p.hidden = false;

    // Keep the popup inside the stage.
    const maxX = this.stage.clientWidth - p.offsetWidth - 8;
    const maxY = this.stage.clientHeight - p.offsetHeight - 8;
    p.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    p.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
    const first = (focus && p.querySelector(`[name="${focus}"]`)) || p.querySelector('input, select');
    if (first) first.focus();
  }

  // The cross section as a dimensioned drawing; its fields (named like the form's) sit on the dimension lines.
  buildDrawing(form) {
    const drawing = sectionDrawing(form.section);
    const box = el('figure', 'sec-drawing');
    box.style.width = `${drawing.width}px`;
    box.style.height = `${drawing.height}px`;
    box.innerHTML = drawing.svg;
    const fields = new Map(form.fields.map((f) => [f.key, f]));
    for (const d of drawing.fields) {
      const place = (node) => {
        node.style.left = `${d.x}px`;
        node.style.top = `${d.y}px`;
        if (!node.classList.contains('dim-echo')) {
          node.style.width = `${FIELD_W}px`;
          node.style.height = `${FIELD_H}px`;
        }
        box.append(node);
      };
      if (d.echo) {
        const echo = el('span', 'dim-field dim-echo');
        echo.textContent = d.symbol;
        place(echo);
        continue;
      }
      const f = fields.get(`sec_${d.key}`);
      const label = el('label', 'dim-field', { title: f.label });
      const symbol = el('span', 'sym');
      symbol.textContent = d.symbol;
      const input = el('input', '', {
        name: f.key, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: comma(f.value), 'aria-label': f.label,
      });
      label.append(symbol, input);
      place(label);
    }
    const caption = el('figcaption', 'sec-caption');
    caption.textContent = drawing.caption;
    box.append(caption);
    return box;
  }

  // A select changed which fields exist: build the form again, keeping what was typed.
  reshapePopup(focusKey) {
    const draft = Object.fromEntries(new FormData(this.popup).entries());
    const left = parseFloat(this.popup.style.left) || 8;
    const top = parseFloat(this.popup.style.top) || 8;
    this.openPopup(this.popupId, left, top, draft, focusKey);
  }

  submitPopup() {
    const values = Object.fromEntries(new FormData(this.popup).entries());
    const { ok, errors } = applyProperties(this.model, this.popupId, values);
    const box = this.popup.querySelector('.props-errors');
    if (ok) {
      this.closePopup();
    } else {
      box.textContent = errors.join(' ');
      box.hidden = false;
    }
  }

  closePopup() {
    this.popup.hidden = true;
    this.popupId = null;
  }
}
