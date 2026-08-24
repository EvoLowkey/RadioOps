import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRadioOpsApi } from '../src/api.js';

const migrationPath='supabase/migrations/202608240009_secure_accountability.sql';

test('secure accountability migration defines protected QR, agreements, incidents, discipline, shifts and role RPCs',()=>{
  const sql=fs.readFileSync(migrationPath,'utf8');
  for(const needle of [
    'radio_qr_credentials','equipment_agreements','equipment_agreement_acceptances','radio_incidents','disciplinary_records',
    'checkout_radio_secure','return_radio_secure','rotate_radio_qr_token','accept_equipment_agreement',
    'resolve_radio_return_exception','create_radio_discipline','submit_writeup_response','set_employee_operational_role'
  ]) assert.match(sql,new RegExp(needle,'i'));
  assert.match(sql,/digest\s*\(/i);
  assert.match(sql,/financial_review_required/i);
  assert.doesNotMatch(sql,/employee.*must pay/i);
});

test('api exposes secure accountability RPC contracts',async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push([name,args]);return {data:{ok:true},error:null};},auth:{getSession:async()=>({data:{session:null}})}};
  const api=createRadioOpsApi(client);
  await api.checkoutRadioSecure('secret-token','PM','2026-08-24');
  await api.returnRadioSecure('secret-token');
  await api.acceptEquipmentAgreement(1);
  await api.rotateRadioQrToken('WT-01');
  await api.setEmployeeOperationalRole('u1','GSC_CAPTAIN');
  assert.deepEqual(calls.map(c=>c[0]),['checkout_radio_secure','return_radio_secure','accept_equipment_agreement','rotate_radio_qr_token','set_employee_operational_role']);
});
