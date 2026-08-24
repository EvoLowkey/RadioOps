import test from 'node:test';
import assert from 'node:assert/strict';
import { getManagerOperationsOverview, getLastKnownHolder, getOperationalActivity } from '../src/view-models.js';

const state={
  radios:[
    {id:'WT-01',status:'AVAILABLE',department:null,employeeName:null,employeeId:null,assignedProfileId:null,checkoutAt:null},
    {id:'WT-02',status:'IN_USE',department:'Valet Associate',employeeName:'Alex',employeeId:'2001',assignedProfileId:'p1',checkoutAt:'2026-08-24T12:00:00Z'},
    {id:'WT-03',status:'OVERDUE',department:'Valet Associate',employeeName:'Blair',employeeId:'2002',assignedProfileId:'p2',checkoutAt:'2026-08-24T10:00:00Z'},
    {id:'WT-04',status:'LOST',department:'Valet Associate',employeeName:'Casey',employeeId:'2003',assignedProfileId:'p3',checkoutAt:'2026-08-23T20:00:00Z',conditionReason:'Not returned'},
    {id:'WT-05',status:'DAMAGED',department:null,employeeName:null,employeeId:null,assignedProfileId:null,checkoutAt:null,conditionReason:'Screen cracked'},
    {id:'WT-06',status:'REPAIR',department:null,employeeName:null,employeeId:null,assignedProfileId:null,checkoutAt:null,conditionReason:'USB-C port'}
  ],
  history:[
    {radioId:'WT-05',employeeName:'Dana',employeeId:'2004',department:'Valet Associate',checkoutAt:'2026-08-22T12:00:00Z',returnAt:'2026-08-22T20:00:00Z'},
    {radioId:'WT-05',employeeName:'Older',employeeId:'1999',department:'Valet Associate',checkoutAt:'2026-08-20T12:00:00Z',returnAt:'2026-08-20T20:00:00Z'}
  ]
};

test('manager operations overview groups active, overdue, and unavailable radios with counts',()=>{
  const vm=getManagerOperationsOverview(state);
  assert.deepEqual(vm.counts,{available:1,checkedOut:2,overdue:1,lost:1,damaged:1,repair:1});
  assert.deepEqual(vm.checkedOut.map(r=>r.id),['WT-03','WT-02']);
  assert.deepEqual(vm.overdue.map(r=>r.id),['WT-03']);
  assert.deepEqual(vm.unavailable.map(r=>r.id),['WT-04','WT-05','WT-06']);
});

test('last known holder uses current assignment first and latest history otherwise',()=>{
  assert.equal(getLastKnownHolder(state,'WT-04').employeeName,'Casey');
  assert.equal(getLastKnownHolder(state,'WT-05').employeeName,'Dana');
  assert.equal(getLastKnownHolder(state,'WT-01'),null);
});

test('overview filters by radio, employee, status group, and department',()=>{
  assert.deepEqual(getManagerOperationsOverview(state,'Blair').checkedOut.map(r=>r.id),['WT-03']);
  assert.deepEqual(getManagerOperationsOverview(state,'','UNAVAILABLE').all.map(r=>r.id),['WT-04','WT-05','WT-06']);
  assert.deepEqual(getManagerOperationsOverview(state,'','ALL','Valet Associate').all.map(r=>r.id),['WT-02','WT-03','WT-04','WT-05']);
});

test('operational activity renders newest audit events with actor names',()=>{
  const profiles=[{id:'m1',display_name:'Jonathan'},{id:'p1',display_name:'Alex'}];
  const events=[
    {id:'e1',created_at:'2026-08-24T12:00:00Z',event_type:'RADIO_CHECKOUT',radio_id:'WT-02',actor_profile_id:'m1',metadata:{}},
    {id:'e2',created_at:'2026-08-24T13:00:00Z',event_type:'RADIO_CONDITION_CHANGED',radio_id:'WT-05',actor_profile_id:'m1',metadata:{status:'DAMAGED'}},
    {id:'e3',created_at:'2026-08-24T11:00:00Z',event_type:'EMPLOYEE_APPROVED',radio_id:null,actor_profile_id:'m1',metadata:{profile_id:'p1'}}
  ];
  const activity=getOperationalActivity(events,profiles,2);
  assert.equal(activity.length,2);
  assert.equal(activity[0].type,'RADIO_CONDITION_CHANGED');
  assert.equal(activity[0].actorName,'Jonathan');
  assert.equal(activity[0].radioId,'WT-05');
});
