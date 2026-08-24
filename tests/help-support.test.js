import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('app includes role-aware Help and Support plus privacy and terms footer controls',()=>{
  assert.match(html,/data-view="help"/);
  assert.match(html,/id="help"/);
  assert.match(html,/Employee Help/);
  assert.match(html,/Manager Help/);
  assert.match(html,/Contact your manager for assistance/);
  assert.match(html,/data-legal="privacy"/);
  assert.match(html,/data-legal="terms"/);
  assert.match(html,/id="legalDialog"/);
  assert.match(app,/legalDialog/);
});
