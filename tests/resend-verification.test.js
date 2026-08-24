import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRadioOpsApi } from '../src/api.js';

function fakeClient(){
  const calls=[];
  return {calls,auth:{resend:async payload=>{calls.push(payload);return {data:{},error:null};}}};
}

test('api resends signup verification to branded callback',async()=>{
  const client=fakeClient();
  const api=createRadioOpsApi(client);
  await api.resendVerification('person@example.com');
  assert.equal(client.calls[0].type,'signup');
  assert.equal(client.calls[0].email,'person@example.com');
  assert.match(client.calls[0].options.emailRedirectTo,/\/auth\/callback$/);
});

test('sign in screen exposes resend verification action and app wires it',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(html,/id="resendVerificationBtn"/);
  assert.match(app,/resendVerification/);
  assert.match(app,/resendVerificationBtn/);
});
