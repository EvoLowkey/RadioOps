import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');
const scanner=fs.readFileSync('src/scanner.js','utf8');
const migration=fs.readFileSync('supabase/migrations/202608240012_code128_radio_credentials.sql','utf8');

test('production UI loads QR render and scan libraries',()=>{
  assert.match(html,/qrcodejs/i);
  assert.match(html,/@zxing\/library/i);
});

test('employee secure scanner accepts QR in native detector and ZXing fallback',()=>{
  assert.match(app,/formats:\s*\['qr_code'\]/);
  assert.match(scanner,/jsQR|zxing/i);
});

test('manager label renderer uses QR rather than QRCode',()=>{
  assert.match(app,/renderSecureQr/);
  assert.match(app,/new QRCode\(/);
});

test('new credentials are compact random tokens suitable for DYMO QR',()=>{
  assert.match(migration,/gen_random_bytes\(9\)/);
  assert.match(migration,/translate\(/i);
  assert.match(migration,/rotate_radio_qr_token/i);
  assert.match(migration,/rotate_all_radio_qr_tokens/i);
});
