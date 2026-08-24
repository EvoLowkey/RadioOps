import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/202608240009_secure_accountability.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/api.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('bulk QR generation uses one manager RPC so all token rotations are transactional',()=>{
  assert.match(migration,/rotate_all_radio_qr_tokens\(\)/);
  assert.match(api,/rotateAllRadioQrTokens\(\).*rotate_all_radio_qr_tokens/s);
  assert.match(app,/api\.rotateAllRadioQrTokens\(\)/);
});
