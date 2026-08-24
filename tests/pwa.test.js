import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('manifest and PWA metadata are present',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name,'Valet Ops HQ');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
  const html=read('index.html');
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html,/rel="apple-touch-icon"/);
  assert.ok(fs.existsSync(new URL('icons/icon-192.png',root)));
  assert.ok(fs.existsSync(new URL('icons/icon-512.png',root)));
});

test('service worker caches shell but not runtime or authenticated API data',()=>{
  const sw=read('service-worker.js');
  assert.match(sw,/STATIC_SHELL/);
  assert.match(sw,/manifest\.webmanifest/);
  assert.doesNotMatch(sw,/\/api\/runtime-config/);
  assert.match(sw,/request\.method !== 'GET'/);
  assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
});
