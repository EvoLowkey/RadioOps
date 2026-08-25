import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/202608240013_fix_digest_signature.sql','utf8');

test('hotfix resolves pgcrypto digest with explicit bytea and text argument types',()=>{
  assert.match(sql,/extensions\.digest\(convert_to\([^,]+,'UTF8'::text\),'sha256'::text\)/i);
});
test('hotfix updates secure checkout and return functions',()=>{
  assert.match(sql,/create or replace function public\.checkout_radio_secure/i);
  assert.match(sql,/create or replace function public\.return_radio_secure/i);
});
test('hotfix preserves secure token lookup and does not expose raw stored tokens',()=>{
  assert.match(sql,/radio_qr_credentials/i);
  assert.doesNotMatch(sql,/add column\s+token\s+text/i);
});
