// main.js - app bootstrap and UI wiring. Complete for v0.1; only integration tickets edit this.
//
// Depends on these module interfaces (implemented in tickets B2-B4):
//   Api       (api.js)              health(), listScenes(), getScene(), loadScene(name),
//                                   connect(onMessage, onConnectionChange), send(cmd, extra)
//   AppState  (state.js)            setScene(name, scene), applyMessage(msg), setConnected(bool),
//                                   subscribe(fn); fields sceneName, scene, frame, running,
//                                   speed, mode, connected, lastError
//   Renderer  (canvas/renderer.js)  setScene(scene), render(frame | null), resize()
import { Api } from './api.js';
import { AppState } from './state.js';
import { Renderer } from './canvas/renderer.js';

const $ = (id) => document.getElementById(id);

const api = new Api();
const state = new AppState();
const renderer = new Renderer($('view'));

const ui = {
  sceneSelect: $('scene-select'),
  play: $('btn-play'),
  step: $('btn-step'),
  reset: $('btn-reset'),
  speed: $('speed'),
  time: $('time'),
  eKin: $('e-kin'),
  ePot: $('e-pot'),
  eTotal: $('e-total'),
  mode: $('mode'),
  conn: $('conn'),
  error: $('error'),
};

function fmt(x, digits = 3) {
  return Number.isFinite(x) ? x.toFixed(digits) : '–';
}

function showError(message) {
  ui.error.textContent = message || '';
  ui.error.hidden = !message;
}

function updateUi() {
  const f = state.frame;
  ui.time.textContent = f ? fmt(f.t) : '0.000';
  if (f && f.energy) {
    ui.eKin.textContent = fmt(f.energy.kinetic);
    ui.ePot.textContent = fmt(f.energy.potential);
    ui.eTotal.textContent = fmt(f.energy.kinetic + f.energy.potential);
  } else {
    ui.eKin.textContent = ui.ePot.textContent = ui.eTotal.textContent = '–';
  }
  ui.play.textContent = state.running ? 'Pause' : 'Play';
  ui.step.disabled = state.running || !state.scene;
  ui.play.disabled = ui.reset.disabled = !state.scene || !state.connected;
  ui.mode.textContent = state.mode ? `Engine: ${state.mode}` : '–';
  ui.conn.textContent = state.connected ? 'Connected' : 'Disconnected';
  ui.conn.dataset.connected = String(state.connected);
  showError(state.lastError);
}

async function selectScene(name) {
  try {
    const { name: loaded, scene } = await api.loadScene(name);
    state.setScene(loaded, scene);
    renderer.setScene(scene);
  } catch (err) {
    state.lastError = `Could not load scene "${name}": ${err.message}`;
    updateUi();
  }
}

async function init() {
  try {
    const health = await api.health();
    state.mode = health.mode;
    const names = await api.listScenes();
    ui.sceneSelect.replaceChildren(
      ...names.map((n) => new Option(n.replaceAll('_', ' '), n)),
    );
    const current = await api.getScene();
    if (current.name) {
      ui.sceneSelect.value = current.name;
      state.setScene(current.name, current.scene);
      renderer.setScene(current.scene);
    } else if (names.length > 0) {
      await selectScene(names[0]);
    }
  } catch (err) {
    state.lastError = `Server not reachable: ${err.message}`;
  }

  api.connect(
    (msg) => state.applyMessage(msg),
    (connected) => state.setConnected(connected),
  );
  updateUi();
}

ui.sceneSelect.addEventListener('change', () => selectScene(ui.sceneSelect.value));
ui.play.addEventListener('click', () => api.send(state.running ? 'pause' : 'play'));
ui.step.addEventListener('click', () => api.send('step'));
ui.reset.addEventListener('click', () => api.send('reset'));
ui.speed.addEventListener('change', () => api.send('speed', { value: Number(ui.speed.value) }));
window.addEventListener('resize', () => renderer.resize());

state.subscribe(updateUi);

function loop() {
  renderer.render(state.frame);
  requestAnimationFrame(loop);
}

renderer.resize();
init();
requestAnimationFrame(loop);
