import test from 'node:test';
import assert from 'node:assert/strict';
import { getScannerMode, cameraErrorMessage } from '../src/scanner.js';

test('uses native BarcodeDetector when available',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasZxing:true,hasGetUserMedia:true}),'native');
});

test('falls back to ZXing on Safari-style browsers without BarcodeDetector',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:false,hasZxing:true,hasGetUserMedia:true}),'zxing');
});

test('reports unsupported only when camera or both decoders are unavailable',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:false,hasZxing:false,hasGetUserMedia:true}),null);
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasZxing:true,hasGetUserMedia:false}),null);
});

test('camera permission error gives iPhone-friendly guidance',()=>{
  assert.match(cameraErrorMessage({name:'NotAllowedError'}),/Allow camera access/i);
  assert.match(cameraErrorMessage({name:'NotAllowedError'}),/Safari/i);
});
