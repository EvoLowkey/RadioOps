import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRadioOpsApi } from '../src/api.js';
import { getFleetHealth, buildProductionState, getRadioDetail } from '../src/view-models.js';

const migration=fs.readFileSync(new URL('../supabase/migrations/202608240007_radio_condition_management.sql',import.meta.url),'utf8');

function fakeClient(){
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push([name,args]);return {data:{ok:true},error:null};}};
}

test('radio condition migration adds lost/damaged states, reason fields, and manager RPC',()=>{
  assert.match(migration,/LOST/);
  assert.match(migration,/DAMAGED/);
  assert.match(migration,/condition_reason/);
  assert.match(migration,/set_radio_condition/);
  assert.match(migration,/role='MANAGER'/);
  assert.match(migration,/RADIO_CONDITION_CHANGED/);
  assert.match(migration,/condition_reason=null/);
  assert.match(migration,/QR_VERIFIED_RETURN/);
});

test('api changes radio condition through manager RPC',async()=>{
  const client=fakeClient();
  const api=createRadioOpsApi(client);
  await api.setRadioCondition('WT-04','LOST','Missing after evening shift');
  assert.deepEqual(client.calls[0],['set_radio_condition',{p_radio_id:'WT-04',p_status:'LOST',p_reason:'Missing after evening shift'}]);
});

test('production state exposes condition metadata and fleet health treats lost/damaged as attention',()=>{
  const state=buildProductionState({
    radios:[
      {id:'WT-01',asset_number:'WT-01',status:'AVAILABLE',dock_slot:1,dock_state:'FULL'},
      {id:'WT-02',asset_number:'WT-02',status:'LOST',dock_slot:2,dock_state:'EMPTY',condition_reason:'Not returned',condition_updated_at:'2026-08-24T01:00:00Z'},
      {id:'WT-03',asset_number:'WT-03',status:'DAMAGED',dock_slot:3,dock_state:'FAULT',condition_reason:'Cracked screen'}
    ],assignments:[],profiles:[],profile:{id:'m',role:'MANAGER',is_active:true}
  });
  assert.equal(state.radios[1].conditionReason,'Not returned');
  assert.equal(getFleetHealth(state).attention,2);
  assert.equal(getRadioDetail(state,'WT-03').statusLabel,'Damaged');
});
