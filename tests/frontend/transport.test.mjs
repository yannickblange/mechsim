// v0.5 UI: icon transport buttons, the time bar with an editable t_max, the floating dark-mode button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../frontend/', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const css = readFileSync(new URL('css/main.css', root), 'utf8');
const main = readFileSync(new URL('js/main.js', root), 'utf8');

const tag = (id) => html.match(new RegExp(`<(button|input)[^>]*id="${id}"[^>]*>`))?.[0];
const buttonBody = (id) => html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`))?.[1];

test('play, step and reset are icon buttons with accessible names', () => {
  for (const id of ['btn-play', 'btn-step', 'btn-reset']) {
    assert.ok(tag(id)?.includes('aria-label='), `${id} has an aria-label`);
    assert.match(buttonBody(id), /<svg/, `${id} holds an icon`);
    assert.equal(buttonBody(id).replace(/<svg[\s\S]*?<\/svg>/g, '').trim(), '', `${id} has no text`);
  }
  assert.match(buttonBody('btn-play'), /ico-play[\s\S]*ico-pause/, 'play toggles between two icons');
});

test('the time bar is a range input next to an editable t_max', () => {
  assert.match(tag('timeline'), /type="range"/);
  assert.match(tag('t-max'), /type="number"/);
  assert.match(tag('t-max'), /aria-label="Endzeit/);
  assert.match(html, /<output id="time"/);
  assert.ok(html.indexOf('id="timeline"') < html.indexOf('id="t-max"'));
});

test('main.js sends seek and tmax', () => {
  assert.match(main, /api\.send\('seek'/);
  assert.match(main, /api\.send\('tmax'/);
});

test('the dark-mode switch is a round moon button in the bottom-right corner of the stage', () => {
  const stage = html.slice(html.indexOf('<main class="stage">'), html.indexOf('</main>'));
  assert.match(stage, /id="btn-theme"/, 'inside the stage, not the toolbar');
  assert.ok(!html.slice(0, html.indexOf('<main')).includes('btn-theme'));
  assert.match(buttonBody('btn-theme'), /<svg/);
  const rule = css.match(/\.theme-fab \{([^}]*)\}/)[1];
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /right:\s*\d+px/);
  assert.match(rule, /bottom:\s*\d+px/);
  assert.match(rule, /border-radius:\s*50%/);
  // the moon turns round when the scheme changes, and the button changes its colours with it
  assert.match(css, /:root\[data-theme='dark'\] \.theme-fab \.ico \{\s*transform:\s*rotate\(360deg\)/);
  assert.match(css, /--c-fab-bg/);
});
