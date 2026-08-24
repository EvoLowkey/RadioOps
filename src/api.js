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
  return {
    async signIn(email,password){ return unwrap(await client.auth.signInWithPassword({email,password}),'Sign in failed'); },
    async signUpEmployee({email,password,displayName,employeeId,department}){
      const payload={email:email.trim(),password,options:{data:{display_name:displayName.trim(),employee_id:employeeId.trim(),department:department.trim()}}};
      return unwrap(await client.auth.signUp(payload),'Account creation failed');
    },
    async signOut(){ return unwrap(await client.auth.signOut(),'Sign out failed'); },
    async getSession(){ const data=unwrap(await client.auth.getSession(),'Unable to restore session'); return data?.session ?? null; },
    async loadProfile(userId){ return unwrap(await client.from('profiles').select('*').eq('id',userId).single(),'Profile unavailable'); },
    async listProfiles(){ return unwrap(await client.from('profiles').select('id,employee_id,display_name,department,email,role,is_active,approval_status,approved_at,approved_by,rejected_at,disabled_at,last_status_change_at,created_at').order('display_name',{ascending:true}),'Unable to load employees') || []; },
    async listRadios(){ return unwrap(await client.from('radios').select('*').order('asset_number',{ascending:true}),'Unable to load radios') || []; },
    async listAssignments(profileId=null){ let q=client.from('assignments').select('*'); if(profileId) q=q.eq('profile_id',profileId); return unwrap(await q.order('checkout_at',{ascending:false}),'Unable to load assignments') || []; },
    async listAuditEvents(){ return unwrap(await client.from('audit_events').select('*').order('created_at',{ascending:false}),'Unable to load audit events') || []; },
    async checkoutRadio(radioId,targetProfileId,expectedReturnAt=null){ return unwrap(await client.rpc('checkout_radio',{p_radio_id:radioId,p_target_profile_id:targetProfileId,p_expected_return_at:expectedReturnAt}),'Checkout failed'); },
    async returnRadio(radioId){ return unwrap(await client.rpc('return_radio',{p_radio_id:radioId}),'Return failed'); },
    async setRepairState(radioId,inRepair){ return unwrap(await client.rpc('set_radio_repair',{p_radio_id:radioId,p_in_repair:Boolean(inRepair)}),'Repair update failed'); },
    async setDockState(radioId,dockState){ return unwrap(await client.rpc('set_dock_state',{p_radio_id:radioId,p_dock_state:dockState}),'Dock update failed'); },
    async approveEmployee(profileId){ return unwrap(await client.rpc('approve_employee',{p_profile_id:profileId}),'Employee approval failed'); },
    async rejectEmployee(profileId){ return unwrap(await client.rpc('reject_employee',{p_profile_id:profileId}),'Employee rejection failed'); },
    async disableEmployee(profileId){ return unwrap(await client.rpc('disable_employee',{p_profile_id:profileId}),'Employee disable failed'); },
    async enableEmployee(profileId){ return unwrap(await client.rpc('enable_employee',{p_profile_id:profileId}),'Employee enable failed'); },
    subscribeFleet(onChange){
      const channel=client.channel('radioops-fleet')
        .on('postgres_changes',{event:'*',schema:'public',table:'radios'},onChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'assignments'},onChange)
        .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},onChange)
        .subscribe();
      return ()=>client.removeChannel(channel);
    }
  };
}
export { normalizeError };
