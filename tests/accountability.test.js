import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateString, operationalRoleLabel, accountabilityBanner, shouldNotifyAccountability } from '../src/accountability.js';

test('accountability helper labels roles and reminders',()=>{
  assert.equal(operationalRoleLabel('GSC_CAPTAIN'),'GSC Captain');
  assert.equal(operationalRoleLabel('CASHIER'),'Cashier');
  assert.equal(localDateString(new Date(2026,7,24)),'2026-08-24');
  assert.match(accountabilityBanner({computed_return_status:'RETURN_DUE_SOON'}).message,/15 minutes/i);
  assert.match(accountabilityBanner({computed_return_status:'UNRETURNED_AFTER_SHIFT'}).title,/Tip Release Pending/i);
  assert.equal(shouldNotifyAccountability({computed_return_status:'UNRETURNED_AFTER_SHIFT'},'RETURN_DUE_SOON'),true);
});
