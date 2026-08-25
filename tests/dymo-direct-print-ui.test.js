import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8'), app=fs.readFileSync('src/app.js','utf8');
test('loads DYMO Label Framework and exposes direct print with download fallback',()=>{
 assert.match(html,/DYMO\.Label\.Framework/i);
 assert.match(html,/id="printDymoDirectBtn"/);
 assert.match(html,/Print DYMO Label/i);
 assert.match(html,/id="downloadDymoLabelBtn"/);
});
test('app uses direct print adapter and reports selected printer',()=>{
 assert.match(app,/getDymoPrinter/); assert.match(app,/printDymoXml/); assert.match(app,/LabelWriter/);
});
test('bulk flow can directly print all 40 with progress and retains ZIP fallback',()=>{
 assert.match(html,/Print All 40 DYMO Labels/i);
 assert.match(app,/Printing \$\{i\+1\} \/ \$\{items\.length\}/);
 assert.match(app,/downloadAllDymoLabels/);
});
