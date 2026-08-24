export function getApprovalStatus(profile){
  if(!profile) return null;
  if(profile.approval_status) return profile.approval_status;
  return profile.is_active ? 'ACTIVE' : 'DISABLED';
}
export function isActive(profile){
  return Boolean(profile?.is_active ?? profile?.isActive) && getApprovalStatus(profile)==='ACTIVE';
}
export function isManager(profile){ return isActive(profile) && profile?.role === 'MANAGER'; }
export function canManageRadio(profile){ return isManager(profile); }
export function getAccountGate(profile){
  const status=getApprovalStatus(profile);
  if(status==='ACTIVE' && isActive(profile)) return 'ACTIVE';
  if(['PENDING','REJECTED','DISABLED'].includes(status)) return status;
  return profile ? 'DISABLED' : 'SIGNED_OUT';
}
export function effectiveRadioStatus(radio, now=new Date()) {
  const stored=radio?.status;
  const expected=radio?.expected_return_at ?? radio?.expectedReturnAt;
  if (stored==='IN_USE' && expected && new Date(expected).getTime() < now.getTime()) return 'OVERDUE';
  return stored;
}
