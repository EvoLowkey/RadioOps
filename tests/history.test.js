import test from 'node:test';
import assert from 'node:assert/strict';
import { sortHistoryNewestFirst } from '../src/view-models.js';

test('sorts history newest first', () => {
  const rows = [
    {id:'1', checkoutAt:'2026-08-20T08:00:00.000Z'},
    {id:'2', checkoutAt:'2026-08-22T08:00:00.000Z'}
  ];
  assert.equal(sortHistoryNewestFirst(rows)[0].id, '2');
});
