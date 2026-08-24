import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, checkoutRadio, setRadioRepair, setDockState } from '../src/state.js';
import { getRecentActivity, getFleetHealth, getDockCounts, getRadioDetail } from '../src/view-models.js';

test('professional dashboard helpers summarize fleet and recent activity', () => {
  const state=createInitialState();
  checkoutRadio(state,{radioId:'WT-01',employeeName:'Alex',employeeId:'1001',department:'Security',checkoutAt:'2026-08-23T14:00:00.000Z'});
  setRadioRepair(state,'WT-02',true);
  setDockState(state,'WT-03','CHARGING');

  const health=getFleetHealth(state);
  assert.deepEqual(health,{ready:38,active:1,attention:1,utilization:3});

  const dock=getDockCounts(state.radios);
  assert.equal(dock.FULL,37);
  assert.equal(dock.EMPTY,1);
  assert.equal(dock.CHARGING,1);
  assert.equal(dock.FAULT,1);

  const activity=getRecentActivity(state.history,3);
  assert.equal(activity.length,1);
  assert.equal(activity[0].radioId,'WT-01');
  assert.equal(activity[0].employeeName,'Alex');
});

test('radio detail returns a normalized record', () => {
  const state=createInitialState();
  const detail=getRadioDetail(state,'WT-12');
  assert.equal(detail.id,'WT-12');
  assert.equal(detail.assignment,'Unassigned');
  assert.equal(detail.dockLabel,'Slot 12');
  assert.equal(detail.statusLabel,'Available');
});
