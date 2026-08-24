import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('customer-facing product branding is Valet Ops HQ while RadioOps remains the fleet module',()=>{
  const html=read('index.html');
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const callback=read('auth/callback.html');
  assert.match(html,/Valet Ops HQ/);
  assert.match(html,/Valet Operations (?:&|&amp;) Equipment Management/);
  assert.match(html,/RadioOps/);
  assert.equal(manifest.name,'Valet Ops HQ');
  assert.equal(manifest.short_name,'Valet Ops HQ');
  assert.match(callback,/Valet Ops HQ/);
});

test('sign in screen exposes a forgot password action',()=>{
  const html=read('index.html');
  assert.match(html,/id=["']forgotPasswordBtn["']/);
  assert.match(html,/Forgot password\?/i);
});
