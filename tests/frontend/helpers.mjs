// Shared helpers for the editor unit tests.
import assert from 'node:assert/strict';
import { SceneModel } from '../../frontend/js/editor/model.js';
import { createTools } from '../../frontend/js/editor/tools.js';

export const close = (actual, expected, eps = 1e-9, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} expected ${expected}, got ${actual}`);

export const closePoint = (actual, expected, eps = 1e-9, msg = '') => {
  close(actual[0], expected[0], eps, `${msg} x:`);
  close(actual[1], expected[1], eps, `${msg} y:`);
};

// A model plus the tools wired to it, like editor.js does. scale = px per metre.
export function setup(scene = undefined, scale = 400) {
  const model = new SceneModel(scene);
  const log = { selected: null, created: [] };
  const env = {
    model,
    getScale: () => scale,
    select: (sel) => { log.selected = sel; },
    created: (kind, id) => log.created.push([kind, id]),
  };
  return { model, tools: createTools(env), log, scale };
}

// Press at a, move to b, release at b (drag mode).
export function drag(tool, a, b, extra = {}) {
  tool.move({ world: a, ...extra });
  const consumed = tool.down({ world: a, ...extra });
  tool.move({ world: b, ...extra });
  tool.up({ world: b, ...extra });
  return consumed;
}

// Press-release at p, as a click.
export function click(tool, p, extra = {}) {
  tool.move({ world: p, ...extra });
  const consumed = tool.down({ world: p, ...extra });
  tool.up({ world: p, ...extra });
  return consumed;
}

export const block = (id, x, y, w, h, extra = {}) => ({
  id, type: 'block', position: [x, y], angle: 0, params: { mass: 1, width: w, height: h }, ...extra,
});
export const disc = (id, x, y, r) => ({ id, type: 'disc', position: [x, y], angle: 0, params: { mass: 1, radius: r } });
export const sceneWith = (parts) => ({ ...SceneModel.emptyScene(), ...parts });
