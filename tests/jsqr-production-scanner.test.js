import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('employee production scanner uses the proven jsQR path',()=>{
 assert.match(html,/jsqr@1\.4\.0/i);
 assert.match(app,/runJsQrProductionScanner/);
 assert.match(app,/globalThis\.jsQR/);
});

test('decoded secure QR reconnects to existing checkout and return RPCs',()=>{
 const block=app.split('// JSQR_PRODUCTION_BEGIN')[1]?.split('// JSQR_PRODUCTION_END')[0]||'';
 assert.match(block,/checkoutRadioSecure/);
 assert.match(block,/returnRadioSecure/);
 assert.match(block,/QR detected — verifying radio/);
});

test('temporary diagnostic counters and plain QR output are removed from production UI',()=>{
 assert.doesNotMatch(html,/diagnosticFrameCount/);
 assert.doesNotMatch(html,/diagnosticQrResult/);
 assert.doesNotMatch(html,/Frames analyzed:/);
 assert.doesNotMatch(html,/QR READ:/);
});

test('employee scan button uses production jsQR scanner',()=>{
 assert.match(app,/employeeScanBtn[^\n]*beginEmployeeJsQrScan/);
});
