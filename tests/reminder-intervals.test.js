import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveShiftWindow,getReturnReminderState} from '../src/shift-policy.js';
import {accountabilityBanner,shouldNotifyAccountability} from '../src/accountability.js';

test('shift window exposes 30 and 15 minute reminder boundaries',()=>{
 const w=resolveShiftWindow('PM','2026-08-24','America/Chicago');
 assert.equal(getReturnReminderState(new Date(new Date(w.endsAt)-30*60*1000),w),'thirty_minutes');
 assert.equal(getReturnReminderState(new Date(new Date(w.endsAt)-15*60*1000),w),'fifteen_minutes');
 assert.equal(getReturnReminderState(new Date(w.endsAt),w),'shift_ended');
});
test('accountability has distinct notification messages for 30, 15, and shift end',()=>{
 assert.match(accountabilityBanner({computed_return_status:'RETURN_DUE_30'}).message,/30 minutes/i);
 assert.match(accountabilityBanner({computed_return_status:'RETURN_DUE_15'}).message,/15 minutes/i);
 assert.match(accountabilityBanner({computed_return_status:'UNRETURNED_AFTER_SHIFT'}).message,/shift has ended/i);
 assert.equal(shouldNotifyAccountability({computed_return_status:'RETURN_DUE_15'},'RETURN_DUE_30'),true);
});
