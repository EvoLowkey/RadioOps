import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('customer-facing product branding is Valet Radio HQ with Radio Management as the fleet module',()=>{
  const html=read('index.html');
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const callback=read('auth/callback.html');
  assert.match(html,/Valet Radio HQ/);
  assert.match(html,/Professional Valet Radio Management/);
  assert.match(html,/Radio Management/);
  assert.equal(manifest.name,'Valet Radio HQ');
  assert.equal(manifest.short_name,'Valet Radio HQ');
  assert.match(callback,/Valet Radio HQ/);
});

test('sign in screen exposes a forgot password action',()=>{
  const html=read('index.html');
  assert.match(html,/id=["']forgotPasswordBtn["']/);
  assert.match(html,/Forgot password\?/i);
});
