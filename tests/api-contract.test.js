import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioOpsApi } from '../src/api.js';

function fakeClient(){
  const calls=[];
  const result={data:[],error:null};
  const chain={
    select(){calls.push(['select']);return chain;},eq(k,v){calls.push(['eq',k,v]);return chain;},order(k,o){calls.push(['order',k,o]);return Promise.resolve(result);},single(){calls.push(['single']);return Promise.resolve({data:{id:'p1',role:'EMPLOYEE',is_active:true},error:null});}
  };
  return {calls,auth:{signInWithPassword:async p=>({data:{user:{id:'u1'}},error:null}),signOut:async()=>({error:null}),getSession:async()=>({data:{session:null},error:null})},from(name){calls.push(['from',name]);return chain;},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{ok:true},error:null};},channel(){return {on(){return this;},subscribe(){return this;}}},removeChannel(){}};
}

test('api sends checkout through atomic checkout_radio rpc', async()=>{
  const client=fakeClient();
  const api=createRadioOpsApi(client);
  await api.checkoutRadio('WT-07','profile-7','2026-08-23T18:00:00.000Z');
  assert.deepEqual(client.calls.find(c=>c[0]==='rpc'),['rpc','checkout_radio',{p_radio_id:'WT-07',p_target_profile_id:'profile-7',p_expected_return_at:'2026-08-23T18:00:00.000Z'}]);
});

test('api sends returns and management changes through rpc functions', async()=>{
  const client=fakeClient(); const api=createRadioOpsApi(client);
  await api.returnRadio('WT-02'); await api.setRepairState('WT-03',true); await api.setDockState('WT-04','FULL');
  assert.equal(client.calls.filter(c=>c[0]==='rpc').length,3);
  assert.equal(client.calls.filter(c=>c[0]==='rpc')[0][1],'return_radio');
  assert.equal(client.calls.filter(c=>c[0]==='rpc')[1][1],'set_radio_repair');
  assert.equal(client.calls.filter(c=>c[0]==='rpc')[2][1],'set_dock_state');
});
