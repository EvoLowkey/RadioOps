import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioOpsApi } from '../src/api.js';

function fakeClient(){
  const calls=[];
  const chain={select(){return this;},eq(){return this;},single:async()=>({data:{},error:null}),order:async()=>({data:[],error:null})};
  return {calls,auth:{signUp:async payload=>{calls.push(['signup',payload]);return {data:{user:{id:'u1'}},error:null};},signInWithPassword:async()=>({data:{session:null},error:null}),signOut:async()=>({data:null,error:null}),getSession:async()=>({data:{session:null},error:null})},from(name){calls.push(['from',name]);return chain;},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{id:'p1'},error:null};},channel(){return {on(){return this;},subscribe(){return this;}}},removeChannel(){}};
}

test('signup sends only approved employee metadata',async()=>{
  const c=fakeClient(); const api=createRadioOpsApi(c);
  await api.signUpEmployee({email:'person@example.com',password:'pass1234',displayName:'  Alex Doe  ',employeeId:'  2042 ',department:' Security '});
  assert.deepEqual(c.calls.find(x=>x[0]==='signup'),['signup',{email:'person@example.com',password:'pass1234',options:{emailRedirectTo:'https://radio-ops.vercel.app/auth/callback',data:{display_name:'Alex Doe',employee_id:'2042',department:'Valet Associate'}}}]);
});

test('manager employee actions use security definer RPCs',async()=>{
  const c=fakeClient(); const api=createRadioOpsApi(c);
  await api.approveEmployee('p1'); await api.rejectEmployee('p2'); await api.disableEmployee('p3'); await api.enableEmployee('p4');
  assert.deepEqual(c.calls.filter(x=>x[0]==='rpc').map(x=>[x[1],x[2]]),[
    ['approve_employee',{p_profile_id:'p1'}],['reject_employee',{p_profile_id:'p2'}],['disable_employee',{p_profile_id:'p3'}],['enable_employee',{p_profile_id:'p4'}]
  ]);
});
