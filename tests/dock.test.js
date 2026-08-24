import test from 'node:test';
import assert from 'node:assert/strict';
import { getDockBank } from '../src/view-models.js';

test('maps slots 1-20 to Bank A and 21-40 to Bank B', () => {
  assert.equal(getDockBank(1), 'A');
  assert.equal(getDockBank(20), 'A');
  assert.equal(getDockBank(21), 'B');
  assert.equal(getDockBank(40), 'B');
});
