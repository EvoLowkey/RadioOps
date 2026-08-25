import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getScannerMode } from '../src/scanner.js';

const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('styles.css','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('iPhone and iPad prefer ZXing for Code 128 even when BarcodeDetector exists',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasZxing:true,hasGetUserMedia:true,isAppleMobile:true}),'zxing');
  assert.equal(getScannerMode({hasBarcodeDetector:false,hasZxing:true,hasGetUserMedia:true,isAppleMobile:true}),'zxing');
});

test('non-Apple browsers keep native BarcodeDetector as first choice',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasZxing:true,hasGetUserMedia:true,isAppleMobile:false}),'native');
});

test('scanner has a horizontal barcode scan guide and positioning instruction',()=>{
  assert.match(html,/class="barcode-scan-line"/);
  assert.match(html,/Place the barcode across the highlighted line/i);
  assert.match(css,/\.barcode-scan-line/);
});

test('scanner reports detection before secure verification',()=>{
  assert.match(app,/Barcode detected — verifying/i);
});

test('scanner can fall back from native decoding to ZXing after repeated empty reads',()=>{
  assert.match(app,/nativeEmptyReads/);
  assert.match(app,/switchToZxing/);
});
