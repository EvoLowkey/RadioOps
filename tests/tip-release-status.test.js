import test from 'node:test';
import assert from 'node:assert/strict';
import { getManagerOperationsOverview } from '../src/view-models.js';

test('overdue open assignment is surfaced as Tip Release Pending for manager operations',()=>{
  const state={radios:[{id:'WT-01',status:'OVERDUE',assignedProfileId:'u1',employeeName:'Alex',checkoutAt:'2026-08-24T10:00:00Z'}],history:[{id:'a1',radioId:'WT-01',profileId:'u1',checkoutAt:'2026-08-24T10:00:00Z',returnAt:null,shiftCode:'AM',tipReleaseStatus:'NOT_APPLICABLE'}]};
  const vm=getManagerOperationsOverview(state);
  assert.equal(vm.overdue[0].tipReleaseStatus,'TIP_RELEASE_PENDING');
  assert.equal(vm.overdue[0].shiftCode,'AM');
});
