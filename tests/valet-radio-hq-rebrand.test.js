import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('public product is branded Valet Radio HQ with dedicated logo assets',()=>{
  const html=read('index.html');
  const callback=read('auth/callback.html');
  const reset=read('auth/reset-password.html');
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.match(html,/Valet Radio HQ/);
  assert.doesNotMatch(html,/Valet Ops HQ/);
  assert.match(html,/\/branding\/valet-radio-hq-logo\.png/);
  assert.match(html,/\/branding\/valet-radio-hq-mark\.png/);
  assert.equal(manifest.name,'Valet Radio HQ');
  assert.equal(manifest.short_name,'Valet Radio HQ');
  assert.match(callback,/Valet Radio HQ/);
  assert.match(reset,/Valet Radio HQ/);
  assert.ok(fs.existsSync(new URL('branding/valet-radio-hq-logo.png',root)));
  assert.ok(fs.existsSync(new URL('branding/valet-radio-hq-mark.png',root)));
});

test('radio module uses Radio Management wording instead of RadioOps branding',()=>{
  const html=read('index.html');
  assert.match(html,/Radio Management/);
  assert.doesNotMatch(html,/>RadioOps</);
});

test('service worker caches Valet Radio HQ brand assets for installed app shells',()=>{
  const sw=read('service-worker.js');
  assert.match(sw,/\/branding\/valet-radio-hq-logo\.png/);
  assert.match(sw,/\/branding\/valet-radio-hq-mark\.png/);
  assert.match(sw,/\/branding\/favicon-64\.png/);
});
