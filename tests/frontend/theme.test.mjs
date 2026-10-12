// The colour schemes live in css/main.css as custom properties. Light is the default (white board,
// grey grid, blue forces, black lines); [data-theme='dark'] must override the same tokens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../frontend/', import.meta.url);
const css = readFileSync(new URL('css/main.css', root), 'utf8');

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block exists`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--c-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = tokens(':root');
const dark = tokens(":root[data-theme='dark']");

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) => rgb(hex).reduce((a, b) => a + b, 0) / 3;

test('dark overrides every colour token of the light scheme', () => {
  for (const name of Object.keys(light)) assert.ok(name in dark, `${name} missing in dark`);
  for (const name of Object.keys(dark)) assert.ok(name in light, `${name} missing in light`);
});

test('light scheme: white background, black lines, grey grid, blue forces', () => {
  assert.equal(light['--c-bg'], '#ffffff');
  for (const k of ['--c-ink', '--c-spring', '--c-support', '--c-rope', '--c-damper']) {
    assert.ok(luminance(light[k]) < 40, `${k} is (nearly) black`);
  }
  for (const k of ['--c-grid', '--c-grid-major', '--c-axis']) {
    const [r, g, b] = rgb(light[k]);
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 6, `${k} is grey`);
  }
  const [r, g, b] = rgb(light['--c-force']);
  assert.ok(b > r + 60 && b > g + 30, 'forces are blue');
});

test('dark scheme: dark background, light lines, blue forces', () => {
  assert.ok(luminance(dark['--c-bg']) < 40);
  assert.ok(luminance(dark['--c-ink']) > 200);
  const [r, g, b] = rgb(dark['--c-force']);
  assert.ok(b > r + 60 && b > g, 'forces are blue');
});

test('the renderer only reads tokens that exist', () => {
  const src = readFileSync(new URL('js/canvas/renderer.js', root), 'utf8');
  const used = [...src.matchAll(/'(--c-[\w-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 10);
  for (const name of used) assert.ok(name in light, `${name} is not defined in main.css`);
});

test('index.html applies the remembered scheme before the first paint', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /dataset\.theme\s*=/);
  assert.match(html, /id="btn-theme"/);
});
