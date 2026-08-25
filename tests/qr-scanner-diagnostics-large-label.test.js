import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDymo30336Label } from '../src/dymo-label.js';
const app=fs.readFileSync('src/app.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('30336 QR uses a substantially larger centered square',()=>{
 const xml=buildDymo30336Label('WT-01','TEST-TOKEN');
 assert.match(xml,/<Type>QRCode<\/Type>/);
 assert.match(xml,/<Bounds X="780" Y="130" Width="1500" Height="1500" \/>/);
});
test('scanner exposes diagnostic stages',()=>{
 for(const stage of ['Camera ready','QR decoder loaded','Scanning frames','QR detected — verifying radio']) assert.match(app,new RegExp(stage));
});
test('scanner diagnostics are visible in the scanner dialog',()=>{
 assert.match(html,/id="scannerDiagnostic"/);
 assert.match(app,/scannerDiagnostic/);
});
