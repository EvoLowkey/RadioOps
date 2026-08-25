import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/api.js',import.meta.url),'utf8');

test('employee checkout is scan-only with no manual radio selector',()=>{
  assert.doesNotMatch(html,/id=["']employeeRadioSelect["']/);
  assert.doesNotMatch(html,/id=["']employeeCheckoutBtn["']/);
  assert.match(html,/id=["']employeeScanBtn["']/);
  assert.match(html,/Scan Radio to Check Out/);
});

test('employee barcode checkout uses secure token RPC directly from scanner',()=>{
  assert.match(api,/checkoutRadioSecure/);
  assert.match(api,/checkout_radio_secure/);
  assert.match(app,/Barcode Verified/);
  assert.match(app,/api\.checkoutRadioSecure\(raw,selectedShiftCode/);
});

test('verified checkout migration preserves manager checkout and requires employee QR path',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/202608240008_qr_verified_checkouts.sql',import.meta.url),'utf8');
  assert.match(sql,/create or replace function public\.checkout_radio_verified/i);
  assert.match(sql,/QR_VERIFIED_CHECKOUT/);
  assert.match(sql,/manager required for manual checkout/i);
  assert.match(sql,/grant execute on function public\.checkout_radio_verified/i);
});
