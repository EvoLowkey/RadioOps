import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiSource=fs.readFileSync(new URL('../src/api.js',import.meta.url),'utf8');
const appSource=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const migration=fs.existsSync(new URL('../supabase/migrations/202608230006_employee_removal.sql',import.meta.url))
  ? fs.readFileSync(new URL('../supabase/migrations/202608230006_employee_removal.sql',import.meta.url),'utf8') : '';
const endpoint=fs.existsSync(new URL('../api/remove-employee.js',import.meta.url))
  ? fs.readFileSync(new URL('../api/remove-employee.js',import.meta.url),'utf8') : '';

test('employee removal migration preserves archival profiles and allows future re-signup',()=>{
  assert.match(migration,/approval_status[^\n]+REMOVED|REMOVED[^\n]+approval_status/i);
  assert.match(migration,/drop constraint if exists profiles_employee_id_key/i);
  assert.match(migration,/where approval_status <> 'REMOVED'/i);
  assert.match(migration,/drop constraint if exists profiles_id_fkey/i);
  assert.match(migration,/EMPLOYEE_REMOVED/i);
  assert.match(migration,/assigned radio|open assignment|return_at is null/i);
});

test('server removal endpoint requires manager auth and service-role secret',()=>{
  assert.match(endpoint,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(endpoint,/authorization/i);
  assert.match(endpoint,/role[^\n]+MANAGER|MANAGER[^\n]+role/i);
  assert.match(endpoint,/approval_status[^\n]+ACTIVE|ACTIVE[^\n]+approval_status/i);
  assert.match(endpoint,/auth\/v1\/admin\/users/i);
  assert.match(endpoint,/archive_employee_for_removal/i);
});

test('browser API posts removal request with current access token',()=>{
  assert.match(apiSource,/removeEmployee\s*\(/);
  assert.match(apiSource,/\/api\/remove-employee/);
  assert.match(apiSource,/Bearer/);
});

test('manager employee table exposes permanent removal with confirmation',()=>{
  assert.match(appSource,/data-employee-admin="remove"/);
  assert.match(appSource,/must sign up again|sign up again/i);
  assert.match(appSource,/confirm\s*\(/);
});
