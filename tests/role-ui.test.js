import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProductionState, getWorkspaceMode } from '../src/view-models.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('production shell contains authentication, identity, connection and audit surfaces',()=>{
  for(const id of ['authGate','signInForm','connectionBanner','identityName','signOutBtn','audit','auditRows','employeeWorkspace']){
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  }
});

test('employee workspace mode is role-aware',()=>{
  assert.equal(getWorkspaceMode({role:'EMPLOYEE',is_active:true}),'EMPLOYEE');
  assert.equal(getWorkspaceMode({role:'MANAGER',is_active:true}),'MANAGER');
  assert.equal(getWorkspaceMode({role:'MANAGER',is_active:false}),'BLOCKED');
});

test('production state maps backend snake_case records into UI model and anonymizes other assignments for employees',()=>{
  const profile={id:'me',role:'EMPLOYEE',is_active:true,display_name:'Alex',employee_id:'1001',department:'Security'};
  const radios=[{id:'WT-01',asset_number:1,status:'IN_USE',dock_slot:1,dock_state:'EMPTY',assigned_profile_id:'other',checkout_at:'2026-08-23T10:00:00Z',expected_return_at:null}];
  const assignments=[];
  const state=buildProductionState({radios,assignments,profiles:[],profile,now:new Date('2026-08-23T11:00:00Z')});
  assert.equal(state.radios[0].employeeName,'Assigned employee');
  assert.equal(state.radios[0].dockSlot,1);
});
