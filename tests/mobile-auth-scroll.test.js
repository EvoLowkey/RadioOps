import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('mobile auth and account gates allow vertical scrolling for tall forms', () => {
  const mobileFix = css.slice(css.lastIndexOf('/* Mobile auth forms must remain scrollable'));
  assert.match(mobileFix, /@media\(max-width:760px\)/);
  assert.match(mobileFix, /\.auth-gate\{[^}]*display:block[^}]*overflow-y:auto[^}]*\}/s);
  assert.match(mobileFix, /\.auth-panel\{[^}]*margin:0 auto[^}]*\}/s);
  assert.match(mobileFix, /\.account-gate\{[^}]*display:block[^}]*overflow-y:auto[^}]*\}/s);
  assert.match(mobileFix, /safe-area-inset-bottom/);
});
