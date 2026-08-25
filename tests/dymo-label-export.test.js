import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDymo30336Label, dymoFilename } from '../src/dymo-label.js';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('DYMO 30336 label XML contains radio id, Code 128 type, and secure token',()=>{
  const xml=buildDymo30336Label('WT-01','A7K9Q2M4X8');
  assert.match(xml,/Small30336/);
  assert.match(xml,/30336 1 in x 2-1\/8 in/);
  assert.match(xml,/WT-01/);
  assert.match(xml,/A7K9Q2M4X8/);
  assert.match(xml,/Code128Auto/);
  assert.match(xml,/SCAN TO CHECK OUT \/ RETURN/);
});

test('DYMO label export escapes XML-sensitive token text',()=>{
  const xml=buildDymo30336Label('WT-02','A&B<C>D');
  assert.match(xml,/A&amp;B&lt;C&gt;D/);
});

test('DYMO filenames are stable and radio-specific',()=>{
  assert.equal(dymoFilename('WT-01'),'Valet-Radio-HQ-WT-01-30336.label');
  assert.equal(dymoFilename('wt-40'),'Valet-Radio-HQ-WT-40-30336.label');
});

test('manager UI uses DYMO download actions instead of browser print dialogs',()=>{
  assert.match(html,/Download DYMO Label/i);
  assert.match(html,/Download All DYMO Labels/i);
  assert.doesNotMatch(app,/window\.print\(/);
  assert.match(app,/buildDymo30336Label/);
  assert.match(app,/JSZip/);
});
