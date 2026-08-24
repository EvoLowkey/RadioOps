import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIFT_DEFINITIONS, resolveShiftWindow, getReturnReminderState } from '../src/shift-policy.js';

test('defines AM PM and Overnight shifts with approved times',()=>{
  assert.deepEqual(SHIFT_DEFINITIONS.AM,{label:'AM Shift',start:'06:55',end:'15:00'});
  assert.deepEqual(SHIFT_DEFINITIONS.PM,{label:'PM Shift',start:'15:00',end:'23:00'});
  assert.equal(SHIFT_DEFINITIONS.OVERNIGHT.crossesMidnight,true);
});

test('resolves overnight shift across midnight in America Chicago',()=>{
  const w=resolveShiftWindow('OVERNIGHT','2026-08-24','America/Chicago');
  assert.equal(w.label,'Overnight Shift');
  assert.ok(new Date(w.endsAt)>new Date(w.startsAt));
  assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',day:'numeric'}).format(new Date(w.endsAt)),'25');
});

test('return reminder state changes at 15 minutes and shift end',()=>{
  const w=resolveShiftWindow('PM','2026-08-24','America/Chicago');
  assert.equal(getReturnReminderState(new Date(new Date(w.reminderAt).getTime()-1000),w),'none');
  assert.equal(getReturnReminderState(new Date(w.reminderAt),w),'fifteen_minutes');
  assert.equal(getReturnReminderState(new Date(new Date(w.endsAt).getTime()-1000),w),'fifteen_minutes');
  assert.equal(getReturnReminderState(new Date(w.endsAt),w),'shift_ended');
});

test('overnight checkout after midnight belongs to the prior work date', async()=>{
  const { getShiftWorkDate }=await import('../src/shift-policy.js');
  assert.equal(getShiftWorkDate('OVERNIGHT',new Date(2026,7,25,1,30,0)),'2026-08-24');
  assert.equal(getShiftWorkDate('OVERNIGHT',new Date(2026,7,24,23,15,0)),'2026-08-24');
  assert.equal(getShiftWorkDate('PM',new Date(2026,7,24,15,15,0)),'2026-08-24');
});
