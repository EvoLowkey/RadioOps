import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/202608240009_secure_accountability.sql', import.meta.url),'utf8');

test('sensitive table revokes occur after the tables are created',()=>{
  for(const table of ['equipment_agreements','equipment_agreement_acceptances','radio_incidents','disciplinary_records']){
    const create=sql.indexOf(`create table if not exists public.${table}`);
    const revoke=sql.indexOf(`revoke all on public.${table}`);
    assert.ok(create>=0,`${table} create missing`);
    assert.ok(revoke>create,`${table} revoke must come after create`);
  }
});
