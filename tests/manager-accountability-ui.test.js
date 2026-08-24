import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8'),app=fs.readFileSync('src/app.js','utf8');
test('manager accountability view includes QR label and incident tools',()=>{
  for(const id of ['accountabilityAdmin','qrAdminRows','generateAllQrBtn','exceptionDialog','exceptionForm','qrLabelDialog','qrPrintArea']) assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(app,/rotateRadioQrToken/);
  assert.match(app,/resolveRadioReturnException/);
  assert.match(app,/createRadioDiscipline/);
  assert.match(app,/new QRCode/);
});
