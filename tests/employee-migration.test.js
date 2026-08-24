import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path=new URL('../supabase/migrations/202608230002_employee_signup_approval.sql',import.meta.url);

test('employee approval migration defines onboarding state, trigger safeguards, and manager RPCs',()=>{
  assert.equal(fs.existsSync(path),true,'migration file missing');
  const sql=fs.readFileSync(path,'utf8');
  for(const needle of [
    'approval_status','approved_at','approved_by','rejected_at','disabled_at','last_status_change_at',
    'handle_new_radioops_user','on_auth_user_created_radioops',
    "role = 'EMPLOYEE'","approval_status = 'PENDING'","is_active = false",
    'approve_employee','reject_employee','disable_employee','enable_employee',
    "approval_status='ACTIVE'","role='MANAGER'"
  ]) assert.match(sql,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`missing ${needle}`);
  assert.match(sql,/grant execute on function public\.approve_employee\(uuid\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.reject_employee\(uuid\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.disable_employee\(uuid\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.enable_employee\(uuid\) to authenticated/i);
});
