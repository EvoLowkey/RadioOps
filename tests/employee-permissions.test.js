import test from 'node:test';
import assert from 'node:assert/strict';
import { isActive,isManager,getAccountGate } from '../src/permissions.js';
import { summarizeEmployees, filterEmployeesByStatus } from '../src/view-models.js';

test('active and manager checks require ACTIVE approval status',()=>{
  assert.equal(isActive({is_active:true,approval_status:'ACTIVE'}),true);
  assert.equal(isActive({is_active:true,approval_status:'PENDING'}),false);
  assert.equal(isManager({role:'MANAGER',is_active:true,approval_status:'ACTIVE'}),true);
  assert.equal(isManager({role:'MANAGER',is_active:true,approval_status:'DISABLED'}),false);
});

test('account gate distinguishes pending rejected disabled and active',()=>{
  assert.equal(getAccountGate({approval_status:'PENDING',is_active:false}),'PENDING');
  assert.equal(getAccountGate({approval_status:'REJECTED',is_active:false}),'REJECTED');
  assert.equal(getAccountGate({approval_status:'DISABLED',is_active:false}),'DISABLED');
  assert.equal(getAccountGate({approval_status:'ACTIVE',is_active:true}),'ACTIVE');
});

test('employee directory summaries count statuses and radio holders',()=>{
  const rows=[
    {id:'1',approval_status:'PENDING'},
    {id:'2',approval_status:'ACTIVE'},
    {id:'3',approval_status:'DISABLED'},
    {id:'4',approval_status:'ACTIVE'}
  ];
  const radios=[{assignedProfileId:'2'},{assignedProfileId:null},{assignedProfileId:'4'}];
  assert.deepEqual(summarizeEmployees(rows,radios),{pending:1,active:2,disabled:1,rejected:0,holding:2});
  assert.equal(filterEmployeesByStatus(rows,'ACTIVE').length,2);
});
