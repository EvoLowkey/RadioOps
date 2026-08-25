import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('DYMO handoff dialog explains desktop software workflow',()=>{
  assert.match(html,/id="dymoSoftwareDialog"/);
  assert.match(html,/Open in DYMO Label Software/i);
  assert.match(html,/DYMO 30336/i);
  assert.match(html,/id="dymoDontShowAgain"/);
  assert.match(html,/id="confirmDymoDownloadBtn"/);
});
test('single-label download is gated through DYMO software prompt',()=>{
  assert.match(app,/showDymoSoftwarePrompt/);
  assert.match(app,/vrhqDymoPromptDismissed/);
  assert.match(app,/pendingDymoDownload/);
  assert.match(app,/downloadDymoLabel/);
});
test('bulk label download also uses DYMO software guidance',()=>{
  assert.match(app,/40 DYMO \.label files/i);
  assert.match(app,/extract/i);
});
