import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('auth shell includes sign up controls and account state gate',()=>{
  for(const id of ['authSignInTab','authSignUpTab','signUpForm','signUpName','signUpEmployeeId','signUpDepartment','signUpEmail','signUpPassword','signUpConfirmPassword','accountGate','accountGateTitle','accountGateDetails','refreshAccountStatus'])
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
});

test('manager shell includes employees administration view',()=>{
  for(const id of ['employees','employeeSummary','employeeStatusFilter','employeeRows'])
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  assert.match(html,/data-view=["']employees["']/);
});

test('production runtime config uses server endpoint',()=>{
  assert.match(html,/script src=["']\/api\/runtime-config["']/);
});
