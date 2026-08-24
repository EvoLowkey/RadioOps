import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getEmployeeWorkspace } from '../src/view-models.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('employee workspace surface exists',()=>{
  for(const id of ['employeeHome','employeeMyRadio','employeeAvailableCount','employeeRadioSelect','employeeCheckoutBtn','employeeReturnBtn','employeeRecentHistory'])
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
});

test('employee workspace detects current assignment and prevents second checkout',()=>{
  const profile={id:'me'};
  const state={radios:[{id:'WT-01',status:'IN_USE',assignedProfileId:'me',checkoutAt:'2026-08-23T12:00:00Z'},{id:'WT-02',status:'AVAILABLE',assignedProfileId:null}],history:[]};
  const vm=getEmployeeWorkspace(state,profile);
  assert.equal(vm.activeRadio.id,'WT-01');
  assert.equal(vm.canCheckout,false);
  assert.equal(vm.availableCount,1);
});
