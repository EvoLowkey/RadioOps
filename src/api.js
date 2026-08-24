function normalizeError(error, fallback='Operation failed') {
  if (!error) return null;
  const message=error.message || error.details || fallback;
  const lower=String(message).toLowerCase();
  let code='BACKEND_ERROR';
  if (lower.includes('jwt') || lower.includes('session') || lower.includes('auth')) code='AUTH_ERROR';
  else if (lower.includes('permission') || lower.includes('policy') || lower.includes('not allowed') || lower.includes('forbidden')) code='PERMISSION_DENIED';
  else if (lower.includes('available') || lower.includes('already checked')) code='RADIO_UNAVAILABLE';
  return Object.assign(new Error(message),{code,original:error});
}
function unwrap(result, fallback){ if(result?.error) throw normalizeError(result.error,fallback); return result?.data ?? null; }

export function createRadioOpsApi(client){
  if(!client) throw new Error('Supabase client is required');
  let activeFleetChannel=null;
  let fleetChannelSerial=0;
  return {
    async signIn(email,password){ return unwrap(await client.auth.signInWithPassword({email,password}),'Sign in failed'); },
    async signUpEmployee({email,password,displayName,employeeId}){
      const origin=globalThis?.location?.origin || 'https://www.valetopshq.com';
      const payload={email:email.trim(),password,options:{emailRedirectTo:`${origin}/auth/callback`,data:{display_name:displayName.trim(),employee_id:employeeId.trim(),department:'Valet Associate'}}};
      return unwrap(await client.auth.signUp(payload),'Account creation failed');
    },
    async requestPasswordReset(email){
      const origin=globalThis?.location?.origin || 'https://www.valetopshq.com';
      return unwrap(await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${origin}/auth/reset-password`}),'Password reset request failed');
    },
    async resendVerification(email){
      const origin=globalThis?.location?.origin || 'https://www.valetopshq.com';
      return unwrap(await client.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${origin}/auth/callback`}}),'Verification email could not be resent');
    },
    async signOut(){ return unwrap(await client.auth.signOut(),'Sign out failed'); },
    async getSession(){ const data=unwrap(await client.auth.getSession(),'Unable to restore session'); return data?.session ?? null; },
    async loadProfile(userId){ return unwrap(await client.from('profiles').select('*').eq('id',userId).single(),'Profile unavailable'); },
    async listProfiles(){ return unwrap(await client.from('profiles').select('id,employee_id,display_name,department,email,role,operational_role,is_active,approval_status,is_primary_manager,approved_at,approved_by,rejected_at,disabled_at,last_status_change_at,created_at').neq('approval_status','REMOVED').order('display_name',{ascending:true}),'Unable to load employees') || []; },
    async listRadios(){ return unwrap(await client.from('radios').select('*').order('asset_number',{ascending:true}),'Unable to load radios') || []; },
    async listAssignments(profileId=null){ let q=client.from('assignments').select('*'); if(profileId) q=q.eq('profile_id',profileId); return unwrap(await q.order('checkout_at',{ascending:false}),'Unable to load assignments') || []; },
    async listAuditEvents(){ return unwrap(await client.from('audit_events').select('*').order('created_at',{ascending:false}),'Unable to load audit events') || []; },
    async checkoutRadio(radioId,targetProfileId,expectedReturnAt=null){ return unwrap(await client.rpc('checkout_radio',{p_radio_id:radioId,p_target_profile_id:targetProfileId,p_expected_return_at:expectedReturnAt}),'Checkout failed'); },
    async checkoutRadioVerified(radioId,expectedReturnAt=null){ return unwrap(await client.rpc('checkout_radio_verified',{p_radio_id:radioId,p_expected_return_at:expectedReturnAt}),'QR verified checkout failed'); },
    async checkoutRadioSecure(token,shiftCode,shiftDate){ return unwrap(await client.rpc('checkout_radio_secure',{p_token:token,p_shift_code:shiftCode,p_shift_date:shiftDate}),'Secure QR checkout failed'); },
    async returnRadioSecure(token){ return unwrap(await client.rpc('return_radio_secure',{p_token:token}),'Secure QR return failed'); },
    async getCurrentEquipmentAgreement(){ return unwrap(await client.rpc('get_current_equipment_agreement',{}),'Unable to load equipment agreement'); },
    async getMyAgreementAcceptance(version){ return unwrap(await client.rpc('get_my_agreement_acceptance',{p_version:version}),'Unable to load agreement acceptance'); },
    async acceptEquipmentAgreement(version){ return unwrap(await client.rpc('accept_equipment_agreement',{p_version:version}),'Agreement acceptance failed'); },
    async getMyRadioAccountability(){ return unwrap(await client.rpc('get_my_radio_accountability',{}),'Unable to load radio accountability'); },
    async rotateRadioQrToken(radioId){ return unwrap(await client.rpc('rotate_radio_qr_token',{p_radio_id:radioId}),'QR regeneration failed'); },
    async rotateAllRadioQrTokens(){ return unwrap(await client.rpc('rotate_all_radio_qr_tokens',{}),'Bulk QR generation failed') || []; },
    async resolveRadioReturnException(assignmentId,incidentType,radioStatus,explanation){ return unwrap(await client.rpc('resolve_radio_return_exception',{p_assignment_id:assignmentId,p_incident_type:incidentType,p_radio_status:radioStatus,p_explanation:explanation}),'Radio exception resolution failed'); },
    async createRadioDiscipline(incidentId,level,managerNotes,financialReviewRequired=false){ return unwrap(await client.rpc('create_radio_discipline',{p_incident_id:incidentId,p_level:level,p_manager_notes:managerNotes,p_financial_review_required:Boolean(financialReviewRequired)}),'Disciplinary record creation failed'); },
    async submitDisciplineStatement(recordId,statement=''){ return unwrap(await client.rpc('submit_discipline_statement',{p_disciplinary_record_id:recordId,p_employee_statement:statement}),'Employee statement submission failed'); },
    async submitWriteupResponse(recordId,statement='',acknowledgeReceipt=false){ return unwrap(await client.rpc('submit_writeup_response',{p_disciplinary_record_id:recordId,p_employee_statement:statement,p_acknowledge_receipt:Boolean(acknowledgeReceipt)}),'Write-up acknowledgment failed'); },
    async setEmployeeOperationalRole(profileId,newRole){ return unwrap(await client.rpc('set_employee_operational_role',{p_profile_id:profileId,p_new_role:newRole}),'Operational role update failed'); },
    async listOperationalCheckedOut(){ return unwrap(await client.rpc('list_operational_checked_out',{}),'Unable to load checked out radios') || []; },
    async listOperationalRadioHistory(limit=200){ return unwrap(await client.rpc('list_operational_radio_history',{p_limit:limit}),'Unable to load radio history') || []; },
    async listMyDisciplinaryRecords(){ return unwrap(await client.rpc('list_my_disciplinary_records',{}),'Unable to load notices') || []; },
    async listManagerRadioIncidents(){ return unwrap(await client.rpc('list_manager_radio_incidents',{}),'Unable to load radio incidents') || []; },
    async listManagerDisciplinaryRecords(){ return unwrap(await client.rpc('list_manager_disciplinary_records',{}),'Unable to load disciplinary records') || []; },
    async listRadioQrStatus(){ return unwrap(await client.rpc('list_radio_qr_status',{}),'Unable to load QR status') || []; },
    async returnRadio(radioId){ return unwrap(await client.rpc('return_radio',{p_radio_id:radioId}),'Return failed'); },
    async returnRadioVerified(radioId){ return unwrap(await client.rpc('return_radio_verified',{p_radio_id:radioId}),'QR verified return failed'); },
    async setRepairState(radioId,inRepair){ return unwrap(await client.rpc('set_radio_repair',{p_radio_id:radioId,p_in_repair:Boolean(inRepair)}),'Repair update failed'); },
    async setRadioCondition(radioId,status,reason=''){ return unwrap(await client.rpc('set_radio_condition',{p_radio_id:radioId,p_status:String(status).toUpperCase(),p_reason:String(reason||'').trim()||null}),'Radio condition update failed'); },
    async setDockState(radioId,dockState){ return unwrap(await client.rpc('set_dock_state',{p_radio_id:radioId,p_dock_state:dockState}),'Dock update failed'); },
    async approveEmployee(profileId){ return unwrap(await client.rpc('approve_employee',{p_profile_id:profileId}),'Employee approval failed'); },
    async rejectEmployee(profileId){ return unwrap(await client.rpc('reject_employee',{p_profile_id:profileId}),'Employee rejection failed'); },
    async disableEmployee(profileId){ return unwrap(await client.rpc('disable_employee',{p_profile_id:profileId}),'Employee disable failed'); },
    async enableEmployee(profileId){ return unwrap(await client.rpc('enable_employee',{p_profile_id:profileId}),'Employee enable failed'); },
    async promoteToManager(profileId){ return unwrap(await client.rpc('promote_to_manager',{p_profile_id:profileId}),'Manager promotion failed'); },
    async demoteManager(profileId){ return unwrap(await client.rpc('demote_manager',{p_profile_id:profileId}),'Manager demotion failed'); },
    async removeEmployee(profileId){
      const sessionData=unwrap(await client.auth.getSession(),'Unable to verify Manager session');
      const token=sessionData?.session?.access_token;
      if(!token) throw normalizeError({message:'Authentication required'},'Employee removal failed');
      const response=await fetch('/api/remove-employee',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({profileId})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok) throw normalizeError({message:body?.error||'Employee removal failed'},'Employee removal failed');
      return body;
    },
    subscribeFleet(onChange){
      if(activeFleetChannel) client.removeChannel(activeFleetChannel);
      const channel=client.channel(`radioops-fleet-${++fleetChannelSerial}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'radios'},onChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'assignments'},onChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},onChange)
        .subscribe();
      activeFleetChannel=channel;
      return ()=>{
        if(activeFleetChannel!==channel) return;
        activeFleetChannel=null;
        client.removeChannel(channel);
      };
    }
  };
}
export { normalizeError };
