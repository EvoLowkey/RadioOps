import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState,
  checkoutRadio,
  returnRadio,
  setRadioRepair,
  setDockState,
  getDashboardCounts,
} from '../src/state.js';

test('initializes 40 radios WT-01 through WT-40 with matching dock slots', () => {
  const state = createInitialState();
  assert.equal(state.radios.length, 40);
  assert.equal(state.radios[0].id, 'WT-01');
  assert.equal(state.radios[39].id, 'WT-40');
  assert.equal(state.radios[0].dockSlot, 1);
  assert.equal(state.radios[39].dockSlot, 40);
});

test('checkout assigns a radio and creates an open history record', () => {
  const state = createInitialState();
  checkoutRadio(state, {
    radioId: 'WT-07', employeeName: 'Alex Morgan', employeeId: '1042',
    department: 'Security', checkoutAt: '2026-08-23T08:00:00.000Z', expectedReturnAt: '2026-08-23T16:00:00.000Z'
  });
  const radio = state.radios.find(r => r.id === 'WT-07');
  assert.equal(radio.status, 'IN_USE');
  assert.equal(radio.employeeName, 'Alex Morgan');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].returnAt, null);
});

test('checkout blocks radios already in use or in repair', () => {
  const state = createInitialState();
  checkoutRadio(state, {radioId:'WT-01',employeeName:'A',employeeId:'1',department:'Security'});
  assert.throws(() => checkoutRadio(state, {radioId:'WT-01',employeeName:'B',employeeId:'2',department:'Front Desk'}));
  setRadioRepair(state, 'WT-02', true);
  assert.throws(() => checkoutRadio(state, {radioId:'WT-02',employeeName:'B',employeeId:'2',department:'Front Desk'}));
});

test('return makes radio available and closes history', () => {
  const state = createInitialState();
  checkoutRadio(state, {radioId:'WT-03',employeeName:'Sam',employeeId:'8',department:'Engineering',checkoutAt:'2026-08-23T08:00:00.000Z'});
  returnRadio(state, 'WT-03', '2026-08-23T15:00:00.000Z');
  const radio = state.radios.find(r => r.id === 'WT-03');
  assert.equal(radio.status, 'AVAILABLE');
  assert.equal(radio.employeeName, null);
  assert.equal(state.history[0].returnAt, '2026-08-23T15:00:00.000Z');
});

test('dashboard counts track available, checked out, overdue, and repair', () => {
  const state = createInitialState();
  checkoutRadio(state, {radioId:'WT-01',employeeName:'Sam',employeeId:'8',department:'Security'});
  setRadioRepair(state, 'WT-02', true);
  state.radios.find(r=>r.id==='WT-03').status = 'OVERDUE';
  const counts = getDashboardCounts(state);
  assert.deepEqual(counts, {total:40, available:37, checkedOut:1, overdue:1, repair:1});
});

test('dock state updates', () => {
  const state = createInitialState();
  setDockState(state, 'WT-10', 'CHARGING');
  assert.equal(state.radios.find(r=>r.id==='WT-10').dockState, 'CHARGING');
});
