import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesAssignedRadio, getPreferredCameraConstraints } from '../src/scanner.js';

test('QR return only accepts the employee assigned radio', () => {
  assert.equal(matchesAssignedRadio('WT-17','WT-17'), true);
  assert.equal(matchesAssignedRadio('WT-22','WT-17'), false);
  assert.equal(matchesAssignedRadio('bad','WT-17'), false);
});

test('camera constraints prefer the rear environment camera', () => {
  assert.deepEqual(getPreferredCameraConstraints(), { video: { facingMode: { ideal: 'environment' } }, audio: false });
});

test('employee return UI requires QR verification and exposes camera permission control', () => {
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(html,/employeeReturnBtn/);
  assert.match(html,/Scan QR to Return/);
  assert.match(app,/employeeReturn/);
  assert.match(app,/QR Verified Return/);
  assert.doesNotMatch(app,/employeeReturnBtn[^\n]+api\.returnRadio\(id\)/);
});

test('migration blocks ordinary employee return RPC and records QR verified return', () => {
  const sql=fs.readFileSync(new URL('../supabase/migrations/202608230005_qr_verified_returns.sql',import.meta.url),'utf8');
  assert.match(sql,/create or replace function public\.return_radio_verified/i);
  assert.match(sql,/QR_VERIFIED_RETURN/);
  assert.match(sql,/manager required/i);
  assert.match(sql,/employees may only return their own radio/i);
});
