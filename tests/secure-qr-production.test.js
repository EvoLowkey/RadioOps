import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDymo30336Label, dymoFilename } from '../src/dymo-label.js';
import { getScannerMode } from '../src/scanner.js';

const app=fs.readFileSync('src/app.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('DYMO 30336 production label uses QR, not Code 128',()=>{
 const xml=buildDymo30336Label('WT-01','SECURE-RANDOM-TOKEN');
 assert.match(xml,/<Type>QRCode<\/Type>/);
 assert.doesNotMatch(xml,/Code128/i);
 assert.match(xml,/SECURE-RANDOM-TOKEN/);
 assert.match(xml,/WT-01/);
});
test('DYMO filenames identify secure QR labels',()=>{
 assert.equal(dymoFilename('WT-01'),'Valet-Radio-HQ-WT-01-QR-30336.label');
});
test('employee scanner prefers QR-capable native detector and has jsQR fallback',()=>{
 assert.equal(getScannerMode({hasBarcodeDetector:true,hasZxing:true,hasGetUserMedia:true,isAppleMobile:true}),'native');
 assert.match(app,/formats:\['qr_code'\]/);
 assert.match(app,/decodeFrameWithJsQr/);
});
test('manager preview renders QR and user-facing copy says QR',()=>{
 assert.match(app,/renderSecureQr/);
 assert.match(html,/secure QR/i);
 assert.doesNotMatch(html,/Code 128/i);
});
test('secure checkout and return RPC paths remain unchanged',()=>{
 assert.match(app,/checkoutRadioSecure/);
 assert.match(app,/returnRadioSecure/);
});
