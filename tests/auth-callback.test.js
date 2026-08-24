import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('signup redirects verification to RadioOps callback',()=>{
  const api=read('src/api.js');
  assert.match(api,/emailRedirectTo/);
  assert.match(api,/\/auth\/callback/);
});

test('callback has branded success and error states without token output',()=>{
  const html=read('auth/callback.html');
  const js=read('src/auth-callback.js');
  assert.match(html,/Email verified successfully/);
  assert.match(html,/We couldn't verify this email link/);
  assert.match(js,/exchangeCodeForSession|getSession/);
  assert.doesNotMatch(js,/textContent\s*=\s*.*access_token/);
  assert.doesNotMatch(js,/innerHTML\s*=\s*.*refresh_token/);
});


test('successful verification shows a clear top login-ready message',()=>{
  const callbackHtml=read('auth/callback.html');
  const indexHtml=read('index.html');
  const app=read('src/app.js');
  assert.match(callbackHtml,/id=["']verificationSuccessBanner["']/);
  assert.match(callbackHtml,/Your email has been successfully verified\. You can now log in to RadioOps\./);
  assert.match(callbackHtml,/href=["']\/\?verified=1["'][^>]*>Log In</);
  assert.match(indexHtml,/id=["']verifiedLoginBanner["']/);
  assert.match(app,/URLSearchParams/);
  assert.match(app,/verified/);
});
