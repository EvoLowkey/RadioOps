import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('api requests a branded password recovery redirect',()=>{
  const api=read('src/api.js');
  assert.match(api,/resetPasswordForEmail/);
  assert.match(api,/\/auth\/reset-password/);
});

test('password reset page accepts a new password and updates the signed-in recovery session',()=>{
  const html=read('auth/reset-password.html');
  const js=read('src/reset-password.js');
  assert.match(html,/Reset your Valet Radio HQ password/i);
  assert.match(html,/id=["']newPassword["']/);
  assert.match(html,/id=["']confirmNewPassword["']/);
  assert.match(js,/exchangeCodeForSession|getSession/);
  assert.match(js,/updateUser\s*\(\s*\{\s*password/);
  assert.match(html,/Password updated successfully/i);
});

test('Vercel and service worker know the password reset route',()=>{
  const vercel=read('vercel.json');
  const sw=read('service-worker.js');
  assert.match(vercel,/\/auth\/reset-password/);
  assert.match(sw,/auth\/reset-password/);
});

test('returning from password reset shows a login-ready success banner',()=>{
  const html=read('index.html');
  const app=read('src/app.js');
  assert.match(html,/id=["']verifiedLoginBanner["']/);
  assert.match(app,/passwordReset/);
  assert.match(app,/Password updated successfully/);
});
