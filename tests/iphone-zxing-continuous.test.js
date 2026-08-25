import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('src/app.js','utf8');
const scanner=fs.readFileSync('src/scanner.js','utf8');

test('iPhone ZXing path uses continuous decode from live video device',()=>{
 assert.match(app,/decodeFromVideoDevice/);
 assert.match(app,/startZxingContinuousScan/);
});
test('continuous scanner constrains ZXing to Code 128',()=>{
 assert.match(scanner,/POSSIBLE_FORMATS/);
 assert.match(scanner,/CODE_128/);
 assert.match(scanner,/BrowserMultiFormatReader/);
});
test('continuous scanner resets reader when stopped',()=>{
 assert.match(app,/zxingControls/);
 assert.match(app,/\.reset\(\)/);
});
test('decoded value still enters secure verification path',()=>{
 assert.match(app,/Barcode detected — verifying radio/);
 assert.match(app,/checkoutRadioSecure/);
 assert.match(app,/returnRadioSecure/);
});
