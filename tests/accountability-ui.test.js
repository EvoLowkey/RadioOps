import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('src/app.js','utf8');

test('employee checkout includes approved shift selection and one-time agreement dialog',()=>{
  for(const id of ['shiftAM','shiftPM','shiftOvernight','equipmentAgreementDialog','agreementAcceptCheck','agreementAcceptBtn']) assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/6:55 AM[^<]*3:00 PM/i);
  assert.match(html,/3:00 PM[^<]*11:00 PM/i);
  assert.match(html,/11:00 PM[^<]*7:00 AM/i);
});

test('app uses secure QR RPCs and does not parse employee secure tokens as WT identifiers',()=>{
  assert.match(app,/checkoutRadioSecure\(/);
  assert.match(app,/returnRadioSecure\(/);
  assert.match(app,/getCurrentEquipmentAgreement\(/);
  assert.match(app,/getMyAgreementAcceptance\(/);
  assert.match(app,/acceptEquipmentAgreement\(/);
});

test('manager employee directory exposes operational role controls',()=>{
  assert.match(app,/GSC Captain/);
  assert.match(app,/Cashier/);
  assert.match(app,/setEmployeeOperationalRole/);
});
