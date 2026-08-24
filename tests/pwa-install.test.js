import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('app includes PWA install and offline hooks',()=>{
  const app=read('src/app.js');
  const html=read('index.html');
  assert.match(app,/beforeinstallprompt/);
  assert.match(app,/navigator\.serviceWorker\.register/);
  assert.match(app,/navigator\.onLine/);
  assert.match(app,/standalone/);
  assert.match(html,/id="installAppBtn"/);
  assert.match(html,/id="iosInstallGuide"/);
});
