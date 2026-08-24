import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRadioOpsApi } from '../src/api.js';

function fakeClient(){
  const calls=[];
  const chain={select(){return this;},eq(){return this;},single:async()=>({data:{},error:null}),order:async()=>({data:[],error:null})};
  return {
    calls,
    auth:{signUp:async()=>({data:{},error:null}),signInWithPassword:async()=>({data:{},error:null}),signOut:async()=>({data:null,error:null}),getSession:async()=>({data:{session:null},error:null})},
    from(name){calls.push(['from',name]);return chain;},
    rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{id:'p1'},error:null};},
    channel(){return {on(){return this;},subscribe(){return this;}}},
    removeChannel(){}
  };
}

test('manager promotion API uses protected RPCs',async()=>{
  const c=fakeClient();
  const api=createRadioOpsApi(c);
  await api.promoteToManager('p1');
  await api.demoteManager('p2');
  assert.deepEqual(c.calls.filter(x=>x[0]==='rpc').map(x=>[x[1],x[2]]),[
    ['promote_to_manager',{p_profile_id:'p1'}],
    ['demote_manager',{p_profile_id:'p2'}]
  ]);
});

test('manager role migration protects a primary manager and last manager',()=>{
  const path=new URL('../supabase/migrations/202608230004_manager_roles.sql',import.meta.url);
  assert.equal(fs.existsSync(path),true,'manager migration missing');
  const sql=fs.readFileSync(path,'utf8');
  for(const needle of [
    'is_primary_manager',
    'promote_to_manager',
    'demote_manager',
    "department='Management'",
    "department='Valet Associate'",
    'Primary Manager cannot be demoted',
    'last remaining Manager cannot be demoted',
    "employee_id='1001'"
  ]) assert.match(sql,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`missing ${needle}`);
});

test('manager directory offers manager filter and promotion controls',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(html,/option value=["']MANAGERS["']/i);
  assert.match(app,/data-employee-admin=["']promote["']/i);
  assert.match(app,/data-employee-admin=["']demote["']/i);
  assert.match(app,/Primary Manager/i);
});
