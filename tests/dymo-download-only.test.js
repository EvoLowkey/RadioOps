import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('manager label dialog exposes DYMO download without unreliable direct print',()=>{
 assert.match(html,/id="downloadDymoLabelBtn"/);
 assert.match(html,/Download \.label/i);
 assert.doesNotMatch(html,/id="printDymoDirectBtn"/);
 assert.doesNotMatch(html,/Print DYMO Label/i);
});
test('bulk dialog keeps .label ZIP download and removes direct printer action',()=>{
 assert.match(html,/id="downloadAllDymoBtn"/);
 assert.match(html,/Download All \.label Files/i);
 assert.doesNotMatch(html,/id="printAllDymoDirectBtn"/);
 assert.doesNotMatch(html,/Print All 40 DYMO Labels/i);
});
test('app no longer attempts local DYMO web-service printing',()=>{
 assert.doesNotMatch(app,/getDymoPrinter/);
 assert.doesNotMatch(app,/printDymoXml/);
 assert.doesNotMatch(app,/directPrintOne/);
 assert.doesNotMatch(app,/directPrintAll/);
});
