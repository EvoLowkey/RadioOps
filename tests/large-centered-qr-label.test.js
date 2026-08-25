import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDymo30336Label } from '../src/dymo-label.js';

test('DYMO 30336 QR uses large QR sizing and a centered production square',()=>{
  const xml = buildDymo30336Label('WT-01','SECURE-TOKEN');
  assert.match(xml,/<Type>QRCode<\/Type><Size>Large<\/Size>/);
  assert.match(xml,/<Bounds X="730" Y="100" Width="1600" Height="1600" \/>/);
});

test('label keeps visible radio ID and scan instruction',()=>{
  const xml = buildDymo30336Label('WT-40','SECURE-TOKEN');
  assert.match(xml,/WT-40/);
  assert.match(xml,/SCAN TO CHECK OUT \/ RETURN/);
});

test('only label generation changes; proven production jsQR scanner stays intact',()=>{
  const app=fs.readFileSync('src/app.js','utf8');
  assert.match(app,/runJsQrProductionScanner/);
  assert.match(app,/globalThis\.jsQR/);
});
