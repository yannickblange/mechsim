// main.js - app bootstrap and UI wiring.
//
// Depends on these module interfaces:
//   Api       (api.js)              health(), listSceneGroups(), getScene(), loadScene(name, source),
//                                   applyScene(scene, name), saveScene(name, scene),
//                                   connect(onMessage, onConnectionChange), send(cmd, extra)
//   AppState  (state.js)            setScene(name, scene, source), applyMessage(msg), setConnected(bool),
//                                   subscribe(fn); fields sceneName, sceneSource, scene, frame, running,
//                                   speed, mode, connected, lastError, editing
//   Renderer  (canvas/renderer.js)  setScene(scene, {fit}), render(frame | null), resize(), getView()
//   Editor    (editor/editor.js)    enable(), disable()  - the layout editor (v0.2)
//   SceneModel(editor/model.js)     the scene being edited
//
// Two modes: "run" (the server simulates the active scene) and "edit" (the scene is edited locally
// and shown at t = 0; Done / Play sends it to the server with /api/scene/apply).
import { Api } from './api.js';
import { AppState } from './state.js';
import { Renderer } from './canvas/renderer.js';
import { Editor } from './editor/editor.js';
import { SceneModel } from './editor/model.js';
import { slugify } from './editor/names.js';
import { applyTheme, currentTheme, otherTheme } from './theme.js';
import { Recorder } from './graphs/recorder.js';
import { GraphManager } from './graphs/panel.js';
import { massesAt } from './editor/hit.js';

const $ = (id) => document.getElementById(id);

const api = new Api();
const state = new AppState();
const renderer = new Renderer($('view'));
const model = new SceneModel();
const stage = document.querySelector('.stage');
const recorder = new Recorder();
const graphs = new GraphManager({ stage, recorder, getTheme: () => renderer.theme });
const editor = new Editor({ renderer, model, stage, onGraph: (id) => graphs.open(id) });

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
  edit: $('btn-edit'),
  newScene: $('btn-new'),
  editControls: $('edit-controls'),
  sceneName: $('scene-name'),
  save: $('btn-save'),
  undo: $('btn-undo'),
  redo: $('btn-redo'),
  theme: $('btn-theme'),
  bendField: $('bend-field'),
  bend: $('bend-scale'),
};

let userScenes = [];
let editOrigin = null; // { source, name } of the scene being edited; null for a new layout

function fmt(x, digits = 3) {
  return Number.isFinite(x) ? x.toFixed(digits) : '–';
}

function showError(message) {
  ui.error.textContent = message || '';
  ui.error.hidden = !message;
}

function updateUi() {
  const f = state.frame;
  const editing = state.editing;
  ui.time.textContent = f && !editing ? fmt(f.t) : '0.000';
  if (f && f.energy && !editing) {
    ui.eKin.textContent = fmt(f.energy.kinetic);
    ui.ePot.textContent = fmt(f.energy.potential);
    ui.eTotal.textContent = fmt(f.energy.kinetic + f.energy.potential);
  } else {
    ui.eKin.textContent = ui.ePot.textContent = ui.eTotal.textContent = '–';
  }
  ui.play.textContent = state.running ? 'Pause' : 'Play';
  ui.step.disabled = editing || state.running || !state.scene;
  ui.reset.disabled = editing || !state.scene || !state.connected;
  ui.play.disabled = !state.connected || (!editing && !state.scene);
  ui.mode.textContent = editing ? 'Editing' : state.mode ? `Engine: ${state.mode}` : '–';
  ui.conn.textContent = state.connected ? 'Connected' : 'Disconnected';
  ui.conn.dataset.connected = String(state.connected);
  ui.edit.textContent = editing ? 'Done' : 'Edit';
  ui.edit.setAttribute('aria-pressed', String(editing));
  ui.editControls.hidden = !editing;
  // the bending selector only matters when there is a beam (in the scene being edited or shown)
  const shown = editing ? model.scene : state.scene;
  ui.bendField.hidden = !(shown && (shown.bodies || []).some((b) => b.type === 'beam'));
  if (ui.bend.value !== String(renderer.bendScale)) ui.bend.value = String(renderer.bendScale);
  const dark = currentTheme() === 'dark';
  ui.theme.textContent = dark ? 'Light' : 'Dark';
  ui.theme.setAttribute('aria-pressed', String(dark));
  ui.undo.disabled = !model.canUndo;
  ui.redo.disabled = !model.canRedo;
  showError(state.lastError);
}

// --- graphs and the run-mode context menu -------------------------------------------------------------------

// Every frame message (with its trace) feeds the recorder; a new scene starts a new recording.
state.onFrame((msg) => {
  recorder.bindScene(state.sceneVersion);
  recorder.ingest(msg);
});
state.subscribe(() => {
  recorder.bindScene(state.sceneVersion);
  if (state.scene && !state.editing) graphs.sync(state.scene.bodies.map((b) => b.id));
});
model.subscribe(() => {
  if (state.editing) graphs.sync(model.scene.bodies.map((b) => b.id));
});

let contextMenu = null;

function closeContextMenu() {
  if (contextMenu) contextMenu.remove();
  contextMenu = null;
}

// Right-click on a mass while the simulation is shown (the editor has its own popup): a small menu with
// the displacement graph of every mass under the pointer, where the masses are now.
function openContextMenu(event) {
  event.preventDefault();
  closeContextMenu();
  if (state.editing || !state.scene) return;
  const rect = renderer.canvas.getBoundingClientRect();
  const world = renderer.cam.toWorld([event.clientX - rect.left, event.clientY - rect.top]);
  const ids = massesAt(state.scene, state.frame, world).slice(0, 5);
  if (ids.length === 0) return;
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  const title = document.createElement('div');
  title.className = 'ctx-title';
  title.textContent = ids.length === 1 ? ids[0] : 'Masses here';
  menu.append(title);
  for (const id of ids) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = ids.length === 1 ? 'Displacement graph' : `Displacement graph of ${id}`;
    item.addEventListener('click', () => {
      graphs.open(id);
      closeContextMenu();
    });
    menu.append(item);
  }
  contextMenu = menu;
  const stageBox = stage.getBoundingClientRect();
  stage.append(menu);
  menu.style.left = `${Math.min(event.clientX - stageBox.left, stage.clientWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(event.clientY - stageBox.top, stage.clientHeight - menu.offsetHeight - 8)}px`;
  menu.querySelector('button').focus();
}

renderer.canvas.addEventListener('contextmenu', openContextMenu);
window.addEventListener('pointerdown', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) closeContextMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeContextMenu();
});

// --- scene list -------------------------------------------------------------------------------------

const keyOf = (source, name) => `${source}:${name}`;

function fillSceneSelect(examples, mine, current) {
  const group = (label, source, names) => {
    const g = document.createElement('optgroup');
    g.label = label;
    g.append(...names.map((n) => new Option(n.replaceAll('_', ' '), keyOf(source, n))));
    return g;
  };
  const groups = [group('Examples', 'example', examples)];
  if (mine.length) groups.push(group('My layouts', 'user', mine));
  if (current && current.source === 'draft') {
    const g = document.createElement('optgroup');
    g.label = 'Not saved';
    g.append(new Option(`${current.name} (unsaved)`, keyOf('draft', current.name)));
    groups.push(g);
  }
  ui.sceneSelect.replaceChildren(...groups);
  if (current) ui.sceneSelect.value = keyOf(current.source, current.name);
}

async function refreshSceneList() {
  const groups = await api.listSceneGroups();
  userScenes = groups.user_scenes || [];
  fillSceneSelect(groups.scenes, userScenes, state.sceneName ? { source: state.sceneSource, name: state.sceneName } : null);
  return groups;
}

// --- run mode -----------------------------------------------------------------------------------------

async function loadFromServer(source, name) {
  const { scene } = await api.loadScene(name, source);
  state.setScene(name, scene, source);
  return scene;
}

async function selectScene(value) {
  const [source, ...rest] = value.split(':');
  const name = rest.join(':');
  if (source === 'draft') return;
  if (state.editing && model.dirty && !window.confirm('Discard the unsaved changes of this layout?')) {
    ui.sceneSelect.value = keyOf(state.sceneSource, state.sceneName);
    return;
  }
  try {
    const scene = await loadFromServer(source, name);
    if (state.editing) {
      model.load(scene);
      editOrigin = { source, name };
      ui.sceneName.value = scene.name || name;
      renderer.setScene(model.scene);
    } else {
      renderer.setScene(scene);
    }
  } catch (err) {
    state.lastError = `Could not load scene "${name}": ${err.message}`;
    updateUi();
  }
}

// --- edit mode ----------------------------------------------------------------------------------------

function enterEdit(scene, displayName, origin = null) {
  api.send('pause');
  state.editing = true;
  editOrigin = origin;
  model.load(scene);
  ui.sceneName.value = displayName ?? '';
  renderer.setScene(model.scene); // fit the camera once, then the editor keeps it where it is
  editor.enable();
  state.lastError = null;
  state.notify();
}

// Send the edited scene to the server. Stays in edit mode and shows the message if it is rejected.
async function leaveEdit({ play = false } = {}) {
  if (model.revision === 0 && editOrigin) {
    // Nothing changed since the scene was loaded: the server still has it, just rewind.
    editor.disable();
    state.editing = false;
    api.send('reset');
    state.notify();
    if (play) api.send('play');
    return;
  }
  model.setView(renderer.getView());
  const typed = ui.sceneName.value.trim();
  if (typed) model.setName(typed);
  const name = typed ? slugify(typed) : 'untitled';
  try {
    const { scene } = await api.applyScene(model.toJSON(), name);
    editor.disable();
    state.editing = false;
    const saved = userScenes.includes(name) && !model.dirty;
    state.setScene(name, scene, saved ? 'user' : 'draft');
    renderer.setScene(scene, { fit: false });
    await refreshSceneList();
    if (play) api.send('play');
  } catch (err) {
    state.lastError = `This layout cannot run: ${err.message}`;
    state.notify();
  }
}

async function saveLayout() {
  const typed = ui.sceneName.value.trim();
  if (!typed) {
    state.lastError = 'Enter a name for the layout first.';
    state.notify();
    ui.sceneName.focus();
    return;
  }
  model.setView(renderer.getView());
  model.setName(typed);
  const name = slugify(typed);
  try {
    await api.saveScene(name, model.toJSON());
    model.dirty = false;
    state.lastError = null;
    state.sceneName = name;
    state.sceneSource = 'user';
    await refreshSceneList();
    state.notify();
  } catch (err) {
    state.lastError = `Could not save "${name}": ${err.message}`;
    state.notify();
  }
}

function newLayout() {
  if (state.editing && model.dirty && !window.confirm('Discard the unsaved changes of this layout?')) return;
  if (state.editing) {
    model.load(SceneModel.emptyScene());
    editOrigin = null;
    ui.sceneName.value = '';
    renderer.setScene(model.scene);
    state.notify();
  } else {
    enterEdit(SceneModel.emptyScene(), '');
  }
}

// --- startup ------------------------------------------------------------------------------------------

async function init() {
  try {
    const health = await api.health();
    state.mode = health.mode;
    const groups = await refreshSceneList();
    const current = await api.getScene();
    if (current.name) {
      state.setScene(current.name, current.scene, current.source || 'example');
      renderer.setScene(current.scene);
      await refreshSceneList();
    } else if (groups.scenes.length > 0) {
      await selectScene(keyOf('example', groups.scenes[0]));
      ui.sceneSelect.value = keyOf('example', groups.scenes[0]);
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
ui.play.addEventListener('click', () => {
  if (state.editing) leaveEdit({ play: true });
  else api.send(state.running ? 'pause' : 'play');
});
ui.step.addEventListener('click', () => api.send('step'));
ui.reset.addEventListener('click', () => api.send('reset'));
ui.speed.addEventListener('change', () => api.send('speed', { value: Number(ui.speed.value) }));
ui.edit.addEventListener('click', () => {
  if (state.editing) leaveEdit();
  else if (state.scene) enterEdit(state.scene, state.scene.name ?? state.sceneName, { source: state.sceneSource, name: state.sceneName });
  else enterEdit(SceneModel.emptyScene(), '');
});
ui.bend.addEventListener('change', () => {
  renderer.bendScale = Number(ui.bend.value);
});
ui.theme.addEventListener('click', () => {
  applyTheme(otherTheme(currentTheme()));
  renderer.refreshTheme();
  graphs.refreshTheme();
  updateUi();
});
ui.newScene.addEventListener('click', newLayout);
ui.save.addEventListener('click', saveLayout);
ui.undo.addEventListener('click', () => model.undo());
ui.redo.addEventListener('click', () => model.redo());
ui.sceneName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveLayout();
});
window.addEventListener('resize', () => renderer.resize());

state.subscribe(updateUi);
model.subscribe(updateUi);

function loop() {
  // While editing, show the layout at t = 0 (no frame); ghosts are shown whenever nothing moves.
  renderer.showGhosts = state.editing || !state.running;
  renderer.render(state.editing ? null : state.frame);
  graphs.render();
  requestAnimationFrame(loop);
}

// Handle for debugging in the browser console (and for UI tests).
window.__mechsim = { api, state, renderer, model, editor, recorder, graphs };

renderer.resize();
init();
requestAnimationFrame(loop);
