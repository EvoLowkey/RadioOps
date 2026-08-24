import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRadioCode } from '../src/scanner.js';

test('accepts WT-01 through WT-40', () => {
  assert.equal(parseRadioCode('WT-01'), 'WT-01');
  assert.equal(parseRadioCode(' wt-40 '), 'WT-40');
});

test('rejects codes outside inventory', () => {
  assert.equal(parseRadioCode('WT-00'), null);
  assert.equal(parseRadioCode('WT-41'), null);
  assert.equal(parseRadioCode('hello'), null);
});
