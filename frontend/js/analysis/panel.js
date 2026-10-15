// panel.js - the analysis window (Schwingungsanalyse): the values of the scene as sliders (named masses, springs, dampers, loads, the start), the
// numbers that matter for a spring-mass-damper system (Dämpfungsgrad D, Eigenwerte, Eigenfrequenz, how close the damping is to the critical case,
// the distance to the resonance), and charts that follow every change at once, the original run faded beside the new one.
//
// The window works on a COPY of the scene and asks the server (POST /api/analysis: the linear analysis and the engine's run) after every change;
// "Übernehmen" hands the changed copy to the app. DOM glue only: the maths is in params.js, describe.js and models.js.
import { decimal } from '../format.js';
import { dataXAt, drawChart } from './chart.js';
import { GAUGE_MAX, criticalText, eigenvalueText, gaugePosition, modeTitle, noteTone, overview, resonanceText, shapeText, sig, zoneOf } from './describe.js';
import { frfModels, timeModel } from './models.js';
import {
  SLIDER_STEPS, addExcitation, applyParameter, criticalTargets, fromSlider, initialOffsets, labelOf, parametersOf, removeExcitation, setLabel, toSlider,
} from './params.js';

const el = (tag, className, attrs = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const text = (node, value) => { node.textContent = value; return node; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const parseNumber = (s) => Number(String(s).trim().replace(',', '.'));
const inputValue = (v) => String(Number(Number(v).toPrecision(5))).replace('.', ',');

const TABS = [['u', 'Verlauf'], ['v', 'Geschwindigkeit'], ['frf', 'Frequenzgang']];
const DURATIONS = [2, 5, 10, 20, 40, 80];
const SAMPLES = 1200;
const DEBOUNCE_MS = 70;
const OBJECT_TAGS = { mass: 'Masse', spring: 'Feder', damper: 'Dämpfer', load: 'Erregung', start: 'Anfang' };

export class AnalysisPanel {
  // stage: the element the window floats in; api: { analyse(body) }; getScene(): the scene to analyse now; getTheme(): the renderer's theme;
  // onApply(scene): the app takes over the changed scene.
  constructor({ stage, api, getScene, getTheme, onApply, onToggle = () => {} }) {
    Object.assign(this, { stage, api, getScene, getTheme, onApply, onToggle });
    this.root = null;
    this.tab = 'u';
    this.dofIndex = 0;
    this.loadIndex = 0;
    this.etaMode = 0;
    this.selectedMode = 0;
    this.tEnd = 10;
    this.showRef = true;
    this.token = 0;
    this.timer = 0;
    this.hover = [null, null];
    this.compact = false;
  }

  get isOpen() { return Boolean(this.root && this.root.isConnected); }

  open() {
    if (this.isOpen) { this.raise(); return; }
    this.build();
    this.reset();
    this.onToggle(true);
  }

  close() {
    if (this.root) this.root.remove();
    this.root = null;
    clearTimeout(this.timer);
    this.token++;
    this.onToggle(false);
  }

  raise() { this.root.style.zIndex = '30'; }

  refreshTheme() { if (this.isOpen) this.drawCharts(); }

  // --- state ------------------------------------------------------------------------------------------------------------------------

  reset() {
    const scene = this.getScene();
    this.original = scene ? clone(scene) : null;
    this.state = { scene: scene ? clone(scene) : null, offsets: null };
    this.cur = null;
    this.ref = null;
    this.analysis = null;
    this.selectedMode = 0;
    this.dofIndex = 0;
    this.structure = '';
    this.applied = null;
    if (!scene) { this.showMessage('Kein Aufbau geladen.'); return; }
    this.showMessage(null);
    text(this.sub, scene.name || '');
    this.request(true);
  }

  schedule() {
    clearTimeout(this.timer);
    this.updateSync();
    this.timer = setTimeout(() => this.request(), DEBOUNCE_MS);
  }

  async request(first = false) {
    if (!this.state.scene) return;
    const token = ++this.token;
    this.root.dataset.busy = 'true';
    let answer;
    try {
      answer = await this.api.analyse({ scene: this.state.scene, t_max: this.tEnd, samples: SAMPLES, offsets: this.state.offsets });
    } catch (err) {
      if (token === this.token) { this.root.dataset.busy = 'false'; this.showError(err.message); }
      return;
    }
    if (token !== this.token || !this.isOpen) return; // a newer change is on its way
    this.root.dataset.busy = 'false';
    this.showError(null);
    this.analysis = answer;
    if (answer.supported && this.state.offsets === null) this.state.offsets = initialOffsets(answer); // the start follows the rest position from now on
    if (this.applied === null) this.applied = this.snapshot(); // what the simulation has
    this.cur = { analysis: answer, response: answer.response };
    if ((first || !this.ref) && answer.supported) this.ref = this.cur; // the first run is the reference until another one is chosen
    this.selectedMode = Math.min(this.selectedMode, Math.max(0, (answer.modes || []).length - 1));
    this.dofIndex = Math.min(this.dofIndex, Math.max(0, (answer.dofs || []).length - 1));
    const structure = this.structureKey();
    if (structure !== this.structure) { this.structure = structure; this.renderParams(); }
    this.renderSummary();
    this.updateMarks();
    this.renderModes();
    this.renderCharts();
    this.updateSync();
  }

  snapshot() { return JSON.stringify([this.state.scene, this.state.offsets]); }

  // Whether the values in the window differ from what the simulation runs.
  updateSync() {
    if (!this.syncBox) return;
    const changed = this.applied !== null && this.snapshot() !== this.applied;
    this.syncBox.dataset.changed = String(changed);
    text(this.syncNote, changed ? 'Die Simulation läuft noch mit den alten Werten.' : 'Die Simulation hat diese Werte.');
    this.applyBtn.disabled = !changed || !this.analysis || !this.analysis.supported;
  }

  // The scene to hand over: the changed values, and the start pose the window runs from (a moved rest position or a start deflection).
  sceneToApply() {
    const scene = clone(this.state.scene);
    const bodies = (this.cur && this.cur.response && this.cur.response.bodies) || {};
    for (const b of scene.bodies) {
      const r = bodies[b.id];
      if (!r) continue;
      const round = (v) => Number(v.toPrecision(9));
      const pos = [round(r.x[0]), round(r.y[0])];
      if (Math.hypot(pos[0] - b.position[0], pos[1] - b.position[1]) > 1e-6) b.position = pos;
      if (Math.abs(r.phi[0] - (b.angle || 0)) > 1e-6) b.angle = round(r.phi[0]);
    }
    return scene;
  }

  structureKey() {
    const a = this.analysis;
    return JSON.stringify([this.state.scene.bodies.map((b) => b.id), this.state.scene.elements.map((e) => [e.id, e.type, e.params.mode]), a && a.supported ? a.dofs.map((d) => d.label) : null]);
  }

  // --- DOM ----------------------------------------------------------------------------------------------------------------------------

  build() {
    const root = el('section', 'ana', { role: 'dialog', 'aria-label': 'Schwingungsanalyse' });
    const head = el('header', 'ana-head');
    this.title = text(el('span', 'ana-title'), 'Schwingungsanalyse');
    this.sub = el('span', 'ana-sub');
    const spacer = el('span', 'ana-spacer');
    const dur = el('select', 'ana-dur', { 'aria-label': 'Dauer des Laufs' });
    for (const d of DURATIONS) dur.append(new Option(`${d} s`, String(d), false, d === this.tEnd));
    const refBtn = text(el('button', 'ana-btn', { type: 'button', title: 'Den aktuellen Lauf als Referenz (blass im Diagramm) festhalten' }), 'Referenz = jetzt');
    const refToggle = el('label', 'ana-check', { title: 'Referenz im Diagramm zeigen' });
    this.refBox = el('input', '', { type: 'checkbox' });
    this.refBox.checked = true;
    refToggle.append(this.refBox, text(el('span'), 'Referenz'));
    const resetBtn = text(el('button', 'ana-btn', { type: 'button', title: 'Alle Werte auf die des Aufbaus zurücksetzen' }), 'Zurücksetzen');
    const close = text(el('button', 'ana-btn ana-close', { type: 'button', 'aria-label': 'Analyse schließen', title: 'Schließen' }), '×');
    head.append(this.title, this.sub, spacer, dur, refBtn, refToggle, resetBtn, close);

    const body = el('div', 'ana-body');
    const side = el('aside', 'ana-params');
    this.paramsEl = el('div', 'ana-params-list');
    this.syncBox = el('div', 'ana-sync');
    this.syncNote = el('p', 'ana-sync-note');
    this.applyBtn = text(el('button', 'ana-apply', { type: 'button', title: 'Die geänderten Werte, Namen und den Start in die Simulation übernehmen' }), 'In die Simulation übernehmen');
    this.syncBox.append(this.syncNote, this.applyBtn);
    side.append(this.paramsEl, this.syncBox);
    const main = el('div', 'ana-main');
    this.messageEl = el('p', 'ana-message');
    this.messageEl.hidden = true;
    this.errorEl = el('p', 'ana-error');
    this.errorEl.hidden = true;
    this.overviewEl = el('p', 'ana-overview');
    this.notesEl = el('div', 'ana-notes');
    this.modesEl = el('div', 'ana-modes');
    this.cardEl = el('div', 'ana-card');
    const charts = el('div', 'ana-charts');
    this.tabsEl = el('div', 'ana-tabs', { role: 'tablist' });
    for (const [id, label] of TABS) {
      const b = text(el('button', 'ana-tab', { type: 'button', role: 'tab', 'data-tab': id }), label);
      b.addEventListener('click', () => { this.tab = id; this.renderCharts(); });
      this.tabsEl.append(b);
    }
    this.selectsEl = el('div', 'ana-selects');
    this.canvasBox = el('div', 'ana-canvases');
    charts.append(this.tabsEl, this.selectsEl, this.canvasBox);
    main.append(this.messageEl, this.errorEl, this.overviewEl, this.notesEl, this.modesEl, this.cardEl, charts);
    body.append(side, main);
    root.append(head, body);
    this.stage.append(root);
    this.root = root;
    const width = root.offsetWidth || 860;
    root.style.left = `${Math.max(8, (this.stage.clientWidth - width) / 2)}px`;
    root.style.top = '10px';

    dur.addEventListener('change', () => { this.tEnd = Number(dur.value); this.request(); });
    refBtn.addEventListener('click', () => { if (this.cur && this.cur.analysis.supported) { this.ref = this.cur; this.renderCharts(); } });
    this.refBox.addEventListener('change', () => { this.showRef = this.refBox.checked; this.renderCharts(); });
    resetBtn.addEventListener('click', () => this.reset());
    this.applyBtn.addEventListener('click', async () => {
      this.applyBtn.disabled = true;
      try {
        const scene = this.sceneToApply();
        await this.onApply(scene);
        this.state.scene = clone(scene);
        this.applied = this.snapshot();
        this.showError(null);
      } catch (err) {
        this.showError(`Übernehmen fehlgeschlagen: ${err.message}`);
      } finally {
        this.updateSync();
      }
    });
    close.addEventListener('click', () => this.close());
    root.addEventListener('pointerdown', () => this.raise());
    this.attachDrag(head);
    new ResizeObserver(() => this.drawCharts()).observe(this.canvasBox);
  }

  attachDrag(handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('select, button, input, label')) return;
      const stage = this.stage.getBoundingClientRect();
      const box = this.root.getBoundingClientRect();
      const dx = e.clientX - box.left;
      const dy = e.clientY - box.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        this.root.style.left = `${Math.min(Math.max(0, ev.clientX - stage.left - dx), stage.width - 80)}px`;
        this.root.style.top = `${Math.min(Math.max(0, ev.clientY - stage.top - dy), stage.height - 30)}px`;
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  showMessage(message) {
    this.messageEl.hidden = !message;
    if (message) text(this.messageEl, message);
  }

  showError(message) {
    this.errorEl.hidden = !message;
    if (message) text(this.errorEl, message);
  }

  // --- the values -----------------------------------------------------------------------------------------------------------------------

  renderParams() {
    const box = this.paramsEl;
    box.replaceChildren();
    this.ticks = new Map();
    const scene = this.state.scene;
    const params = parametersOf(scene, this.analysis && this.analysis.supported ? this.analysis : null);
    const objects = new Map();
    for (const p of params) {
      const key = p.kind === 'start' ? `start:${p.objId}` : p.objId;
      if (!objects.has(key)) objects.set(key, { kind: p.kind, objId: p.objId, params: [] });
      objects.get(key).params.push(p);
    }
    box.append(text(el('h3', 'ana-h'), 'Werte'));
    for (const o of objects.values()) {
      const block = el('div', `ana-obj ana-${o.kind}`);
      const head = el('div', 'ana-obj-head');
      head.append(text(el('span', 'ana-tag'), OBJECT_TAGS[o.kind]));
      if (o.kind === 'start') {
        head.append(text(el('span', 'ana-obj-name'), labelOf(scene, o.objId)));
      } else {
        const name = el('input', 'ana-name', { type: 'text', maxlength: '40', value: labelOf(scene, o.objId), 'aria-label': `Bezeichnung von ${o.objId}`, placeholder: o.objId });
        name.addEventListener('change', () => { setLabel(scene, o.objId, name.value); name.value = labelOf(scene, o.objId); this.structure = ''; this.schedule(); });
        head.append(name);
      }
      block.append(head);
      for (const p of o.params) block.append(this.paramRow(p));
      box.append(block);
    }
    const hasLoad = scene.elements.some((e) => e.type === 'load' && e.params.mode === 'harmonic');
    const add = text(el('button', `ana-add${hasLoad ? ' remove' : ''}`, { type: 'button', title: hasLoad ? 'Die harmonische Erregung entfernen' : 'Eine harmonische Kraft auf die erste Masse: zeigt den Frequenzgang und die Nähe zur Resonanz' }), hasLoad ? '− Erregung entfernen' : '+ Erregung hinzufügen');
    add.addEventListener('click', () => {
      if (hasLoad) removeExcitation(scene);
      else addExcitation(scene, (this.analysis && this.analysis.modes && this.analysis.modes[0] && this.analysis.modes[0].f0) || 1);
      this.structure = '';
      this.request();
    });
    box.append(add);
    this.updateMarks();
  }

  // The marks on the sliders: where the value would take the system to the limit case D = 1 (one degree of freedom).
  updateMarks() {
    if (!this.ticks) return;
    const a = this.analysis;
    const crit = a && a.supported ? criticalTargets(this.state.scene, a, this.selectedMode) : { marks: {} };
    for (const [id, { tick, p }] of this.ticks) {
      const v = crit.marks[id];
      const inside = v !== undefined && v >= p.lo && v <= p.hi;
      tick.hidden = !inside;
      if (!inside) continue;
      tick.style.left = `${(toSlider(p, v) / SLIDER_STEPS) * 100}%`;
      tick.title = `${p.symbol} = ${sig(v)} ${p.unit}: aperiodischer Grenzfall (D = 1)`;
      tick.dataset.label = p.kind === 'damper' ? 'c_krit' : 'D = 1';
    }
  }

  // The buttons that set the values to the limit case.
  criticalBox(a, mode) {
    const crit = criticalTargets(this.state.scene, a, this.selectedMode);
    if (crit.critical) return text(el('p', 'ana-way'), 'Das System ist im aperiodischen Grenzfall: weniger Dämpfung schwingt wieder, mehr kriecht.');
    if (!crit.actions.length) return null;
    const box = el('div', 'ana-way');
    box.append(text(el('span', 'ana-way-title'), 'Zum aperiodischen Grenzfall (D = 1):'));
    for (const action of crit.actions) {
      const b = text(el('button', 'ana-btn ana-way-btn', { type: 'button', title: 'Den Wert setzen und die Schwingung neu rechnen' }), action.label);
      b.addEventListener('click', () => {
        for (const { param, value } of action.sets) applyParameter(this.state, param, value);
        this.renderParams();
        this.schedule();
      });
      box.append(b);
    }
    return box;
  }

  paramRow(p) {
    const row = el('div', 'ana-row');
    const label = el('span', 'ana-sym', { title: p.name });
    label.textContent = p.symbol;
    const range = el('input', 'ana-range', { type: 'range', min: '0', max: String(SLIDER_STEPS), step: '1', 'aria-label': p.name });
    range.value = String(toSlider(p, p.value));
    const number = el('input', 'ana-num', { type: 'text', inputmode: 'decimal', 'aria-label': `${p.name} in ${p.unit}` });
    number.value = inputValue(p.value);
    const unit = text(el('span', 'ana-unit'), p.unit);
    const set = (value) => {
      p.value = value;
      applyParameter(this.state, p, value);
      this.schedule();
    };
    range.addEventListener('input', () => {
      const v = Number(fromSlider(p, Number(range.value)).toPrecision(4));
      number.value = inputValue(v);
      number.classList.remove('bad');
      set(v);
    });
    number.addEventListener('change', () => {
      const v = parseNumber(number.value);
      const ok = Number.isFinite(v) && (p.field === 'mass' || p.field === 'k' ? v > 0 : p.field === 'c' || p.field === 'frequency' || p.field === 'amplitude' ? v >= 0 : true);
      number.classList.toggle('bad', !ok);
      if (!ok) return;
      range.value = String(toSlider(p, v));
      set(v);
    });
    const wrap = el('span', 'ana-range-wrap');
    wrap.append(range);
    if (['mass', 'spring', 'damper'].includes(p.kind)) {
      const tick = el('i', 'ana-tick');
      tick.hidden = true;
      wrap.append(tick);
      this.ticks.set(p.id, { tick, p });
    }
    row.append(label, wrap, number, unit);
    return row;
  }

  // --- the numbers ------------------------------------------------------------------------------------------------------------------------

  renderSummary() {
    const a = this.analysis;
    text(this.overviewEl, a ? (a.supported ? overview(a) : '') : '');
    this.notesEl.replaceChildren();
    if (a && !a.supported) { this.showMessage(a.reason); } else this.showMessage(null);
    for (const n of (a && a.notes) || []) this.notesEl.append(text(el('p', 'ana-note'), n));
    const unsupported = !a || !a.supported;
    for (const node of [this.modesEl, this.cardEl, this.tabsEl.parentElement]) node.hidden = unsupported;
  }

  renderModes() {
    const a = this.analysis;
    this.modesEl.replaceChildren();
    this.cardEl.replaceChildren();
    if (!a || !a.supported) return;
    a.modes.forEach((m, i) => {
      const zone = zoneOf(m);
      const b = el('button', `ana-chip tone-${zone.tone}${i === this.selectedMode ? ' on' : ''}`, { type: 'button', title: zone.label });
      b.textContent = modeTitle(m, i + 1);
      b.addEventListener('click', () => { this.selectedMode = i; this.renderModes(); this.renderCharts(); });
      this.modesEl.append(b);
    });
    this.renderCard(a, a.modes[this.selectedMode]);
  }

  renderCard(a, mode) {
    const card = this.cardEl;
    const zone = zoneOf(mode);
    const head = el('div', `ana-zone tone-${zone.tone}`);
    head.append(text(el('strong'), zone.label), text(el('span'), ` – ${zone.note}`));
    card.append(head);
    if (mode.zeta !== null && mode.zeta !== undefined) card.append(this.gauge(mode.zeta));
    card.append(text(el('p', 'ana-crit'), criticalText(mode)));
    const way = this.criticalBox(a, mode);
    if (way) card.append(way);

    const rows = [];
    if (mode.omega0) {
      rows.push(['Dämpfungsgrad D (Lehr)', decimal(mode.zeta, 4)]);
      rows.push(['Eigenkreisfrequenz ω₀', `${sig(mode.omega0)} rad/s`]);
      rows.push(['Eigenfrequenz f₀', `${sig(mode.f0)} Hz  (T₀ = ${sig(1 / mode.f0)} s)`]);
      if (mode.omega_d > 0) rows.push(['gedämpfte Frequenz ω_d, f_d', `${sig(mode.omega_d)} rad/s, ${sig(mode.f_d)} Hz  (T_d = ${sig(1 / mode.f_d)} s)`]);
      if (mode.delta > 1e-9) rows.push(['Abklingkonstante δ = D·ω₀', `${sig(mode.delta)} s⁻¹`]);
      if (mode.decay_time) rows.push(['Abklingzeit 1/δ', `${sig(mode.decay_time)} s`]);
      if (mode.log_decrement) rows.push(['log. Dekrement Λ = 2πD/√(1−D²)', sig(mode.log_decrement)]);
    } else if (mode.decay_time) {
      rows.push(['Abklingzeit', `${sig(mode.decay_time)} s`]);
    }
    rows.push(['Eigenwert', eigenvalueText(mode)]);
    if (a.single) {
      rows.push(['Dämpfung c / kritisch c_krit', a.single.c_crit ? `${sig(a.single.c)} / ${sig(a.single.c_crit)} N·s/m = ${sig(a.single.c / a.single.c_crit, 3)}` : `${sig(a.single.c)} N·s/m`]);
    } else if (a.dofs.length > 1) {
      rows.push(['Eigenform', shapeText(mode)]);
    }
    const toggle = text(el('button', 'ana-btn ana-toggle', { type: 'button', 'aria-expanded': String(!this.compact) }), this.compact ? 'Kennwerte ▸' : 'Kennwerte ▾');
    toggle.addEventListener('click', () => { this.compact = !this.compact; this.renderCard2(); this.drawCharts(); });
    card.append(toggle);
    const table = el('table', 'ana-table');
    table.hidden = this.compact;
    for (const [k, v] of rows) {
      const tr = el('tr');
      tr.append(text(el('th'), k), text(el('td'), v));
      table.append(tr);
    }
    card.append(table);

    for (const load of a.loads || []) {
      const idx = a.loads.indexOf(load);
      const line = el('p', `ana-res tone-${noteTone(load.eta)}`);
      line.textContent = `${load.label || load.id}: Ω = ${sig(load.omega)} rad/s (${sig(load.frequency)} Hz). ${resonanceText(load, Math.min(this.dofIndex, load.response.length - 1))}`;
      line.dataset.load = String(idx);
      card.append(line);
    }
  }

  gauge(d) {
    const wrap = el('div', 'ana-gauge');
    const bar = el('div', 'ana-gauge-bar');
    const marker = el('i', 'ana-marker');
    marker.style.left = `${gaugePosition(d) * 100}%`;
    marker.title = `D = ${decimal(d, 3)}`;
    bar.append(marker);
    const scale = el('div', 'ana-gauge-scale');
    scale.append(text(el('span'), '0  ungedämpft'), text(el('span'), `D = 1  Grenzfall`), text(el('span'), `D = ${GAUGE_MAX}`));
    wrap.append(bar, scale);
    return wrap;
  }

  // --- the charts ---------------------------------------------------------------------------------------------------------------------

  renderCharts() {
    const a = this.analysis;
    if (!a || !a.supported) return;
    for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.renderSelects(a);
    this.canvasBox.replaceChildren();
    this.canvases = [];
    const count = this.tab === 'frf' && a.loads.length ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const canvas = el('canvas', 'ana-canvas');
      canvas.addEventListener('pointermove', (e) => { this.hover[i] = dataXAt(canvas, this.models && this.models[i], e.clientX); this.drawCharts(); });
      canvas.addEventListener('pointerleave', () => { this.hover[i] = null; this.drawCharts(); });
      this.canvasBox.append(canvas);
      this.canvases.push(canvas);
    }
    requestAnimationFrame(() => this.drawCharts());
  }

  renderSelects(a) {
    const box = this.selectsEl;
    box.replaceChildren();
    const select = (label, options, value, onChange) => {
      const wrap = el('label', 'ana-sel');
      const s = el('select');
      options.forEach(([v, t]) => s.append(new Option(t, String(v), false, String(v) === String(value))));
      s.addEventListener('change', () => onChange(s.value));
      wrap.append(text(el('span'), label), s);
      box.append(wrap);
    };
    if (a.dofs.length > 1) {
      select('Koordinate', a.dofs.map((d, i) => [i, d.label]), this.dofIndex, (v) => { this.dofIndex = Number(v); this.renderCard2(); this.drawCharts(); });
    }
    if (this.tab === 'frf') {
      if (a.loads.length > 1) select('Last', a.loads.map((l, i) => [i, l.label || l.id]), this.loadIndex, (v) => { this.loadIndex = Number(v); this.drawCharts(); });
      const omegaModes = a.modes.map((m, i) => [i, `Mode ${i + 1}: ${m.f0 ? `${sig(m.f0)} Hz` : m.kind}`]).filter(([i]) => a.modes[i].omega0);
      if (omegaModes.length > 1) select('η bezogen auf', omegaModes, this.etaMode, (v) => { this.etaMode = Number(v); this.drawCharts(); });
    }
  }

  renderCard2() {
    this.cardEl.replaceChildren();
    if (this.analysis && this.analysis.supported) this.renderCard(this.analysis, this.analysis.modes[this.selectedMode]);
  }

  currentModels() {
    const a = this.analysis;
    const cur = this.cur;
    const ref = this.showRef && this.ref && this.ref !== this.cur ? this.ref : null;
    const dof = a.dofs[Math.min(this.dofIndex, a.dofs.length - 1)];
    switch (this.tab) {
      case 'u': return [timeModel(cur, ref, dof, 'u')];
      case 'v': return [timeModel(cur, ref, dof, 'v')];
      case 'frf': {
        const m = frfModels(cur, ref, Math.min(this.loadIndex, Math.max(0, a.loads.length - 1)), this.dofIndex, this.etaMode);
        return m.empty ? [m] : [m.amplitude, m.phase];
      }
      default: return [];
    }
  }

  drawCharts() {
    if (!this.isOpen || !this.canvases || !this.analysis || !this.analysis.supported) return;
    this.models = this.currentModels();
    const theme = this.getTheme();
    this.canvases.forEach((canvas, i) => drawChart(canvas, this.models[i], theme, this.hover[i]));
  }
}
