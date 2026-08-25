import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/202608240009_secure_accountability.sql',import.meta.url),'utf8');
test('security-definer QR functions schema-qualify pgcrypto functions',()=>{
  assert.match(sql,/extensions\.gen_random_bytes\(32\)/);
  assert.doesNotMatch(sql,/(?<!\.)\bgen_random_bytes\(32\)/);
  assert.match(sql,/extensions\.digest\(token,'sha256'\)/);
  assert.match(sql,/extensions\.digest\(trim\(p_token\),'sha256'\)/);
});
