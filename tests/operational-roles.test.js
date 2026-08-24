import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE, canViewOperationalRadioData, canMutateFleet, canManageRoles, canManageDiscipline } from '../src/permissions.js';

test('captain and cashier have read-only operational access while manager has mutations',()=>{
  assert.equal(canViewOperationalRadioData(ROLE.VALET_ASSOCIATE),false);
  assert.equal(canViewOperationalRadioData(ROLE.GSC_CAPTAIN),true);
  assert.equal(canViewOperationalRadioData(ROLE.CASHIER),true);
  assert.equal(canViewOperationalRadioData(ROLE.MANAGER),true);
  assert.equal(canMutateFleet(ROLE.GSC_CAPTAIN),false);
  assert.equal(canMutateFleet(ROLE.CASHIER),false);
  assert.equal(canManageRoles(ROLE.GSC_CAPTAIN),false);
  assert.equal(canManageRoles(ROLE.CASHIER),false);
  assert.equal(canManageRoles(ROLE.MANAGER),true);
  assert.equal(canManageDiscipline(ROLE.MANAGER),true);
});
