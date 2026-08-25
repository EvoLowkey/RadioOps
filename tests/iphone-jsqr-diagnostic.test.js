import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html','utf8');
const app = fs.readFileSync('src/app.js','utf8');
const diagnostic = app.split('// DIAGNOSTIC_QR_TEST_BEGIN')[1]?.split('// DIAGNOSTIC_QR_TEST_END')[0] || '';

test('diagnostic scanner loads jsQR and does not depend on BarcodeDetector or ZXing for the test path',()=>{
  assert.match(html,/jsqr@1\.4\.0/i);
  assert.match(diagnostic,/runJsQrDiagnosticScanner/);
  assert.doesNotMatch(diagnostic,/BarcodeDetector/);
  assert.doesNotMatch(diagnostic,/ZXing/);
});

test('diagnostic scanner displays decoded QR text directly without Supabase checkout or return',()=>{
  assert.match(html,/id="diagnosticQrResult"/);
  assert.match(diagnostic,/QR READ:/);
  assert.match(diagnostic,/diagnosticQrResult/);
  assert.doesNotMatch(diagnostic,/checkoutRadioSecure/);
  assert.doesNotMatch(diagnostic,/returnRadioSecure/);
});

test('diagnostic scanner reports frame analysis count',()=>{
  assert.match(html,/id="diagnosticFrameCount"/);
  assert.match(diagnostic,/Frames analyzed:/);
});
