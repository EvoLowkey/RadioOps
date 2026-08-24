import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/config.js';
import { isManager, canManageRadio, effectiveRadioStatus } from '../src/permissions.js';

test('runtime config requires public Supabase URL and anon key', () => {
  assert.equal(validateRuntimeConfig({SUPABASE_URL:'https://demo.supabase.co',SUPABASE_ANON_KEY:'public-anon'}).ok, true);
  assert.equal(validateRuntimeConfig({SUPABASE_URL:'',SUPABASE_ANON_KEY:''}).ok, false);
});

test('manager permissions come from trusted profile role', () => {
  assert.equal(isManager({role:'MANAGER',is_active:true}), true);
  assert.equal(canManageRadio({role:'EMPLOYEE',is_active:true}), false);
  assert.equal(canManageRadio({role:'MANAGER',is_active:false}), false);
});

test('effective status marks late in-use radios overdue without changing stored status', () => {
  const radio={status:'IN_USE',expected_return_at:'2026-08-23T10:00:00.000Z'};
  assert.equal(effectiveRadioStatus(radio,new Date('2026-08-23T11:00:00.000Z')), 'OVERDUE');
  assert.equal(effectiveRadioStatus(radio,new Date('2026-08-23T09:00:00.000Z')), 'IN_USE');
});
