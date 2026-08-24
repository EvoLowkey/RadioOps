import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);

test('vercel routes auth callback to the branded callback page',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('vercel.json',root),'utf8'));
  assert.ok(config.rewrites.some(r=>r.source==='/auth/callback' && r.destination==='/auth/callback.html'));
  assert.ok(config.rewrites.some(r=>r.source==='/runtime-config.js' && r.destination==='/api/runtime-config'));
});
