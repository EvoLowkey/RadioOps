import test from 'node:test';
import assert from 'node:assert/strict';
import { getScannerMode, cameraErrorMessage } from '../src/scanner.js';

test('uses native BarcodeDetector when available',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasJsQr:true,hasGetUserMedia:true}),'native');
});

test('falls back to jsQR on Safari-style browsers without BarcodeDetector',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:false,hasJsQr:true,hasGetUserMedia:true}),'jsqr');
});

test('reports unsupported only when camera or both decoders are unavailable',()=>{
  assert.equal(getScannerMode({hasBarcodeDetector:false,hasJsQr:false,hasGetUserMedia:true}),null);
  assert.equal(getScannerMode({hasBarcodeDetector:true,hasJsQr:true,hasGetUserMedia:false}),null);
});

test('camera permission error gives iPhone-friendly guidance',()=>{
  assert.match(cameraErrorMessage({name:'NotAllowedError'}),/Allow camera access/i);
  assert.match(cameraErrorMessage({name:'NotAllowedError'}),/Safari/i);
});
