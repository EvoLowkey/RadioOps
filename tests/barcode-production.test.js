import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const scanner=fs.readFileSync('src/scanner.js','utf8');
const migration=fs.readFileSync('supabase/migrations/202608240012_code128_radio_credentials.sql','utf8');

test('production UI loads Code 128 render and scan libraries',()=>{
  assert.match(html,/JsBarcode/i);
  assert.match(html,/@zxing\/library/i);
  assert.doesNotMatch(html,/qrcodejs/i);
});

test('employee secure scanner accepts Code 128 in native detector and ZXing fallback',()=>{
  assert.match(app,/code_128/);
  assert.match(scanner,/zxing/i);
  assert.doesNotMatch(app,/formats:\s*\['qr_code'\]/);
});

test('manager label renderer uses Code 128 rather than QRCode',()=>{
  assert.match(app,/JsBarcode/);
  assert.match(app,/CODE128/);
  assert.doesNotMatch(app,/new QRCode\(/);
});

test('new credentials are compact random tokens suitable for DYMO Code 128',()=>{
  assert.match(migration,/gen_random_bytes\(9\)/);
  assert.match(migration,/translate\(/i);
  assert.match(migration,/rotate_radio_qr_token/i);
  assert.match(migration,/rotate_all_radio_qr_tokens/i);
});
