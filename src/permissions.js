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

export const ROLE=Object.freeze({VALET_ASSOCIATE:'VALET_ASSOCIATE',GSC_CAPTAIN:'GSC_CAPTAIN',CASHIER:'CASHIER',MANAGER:'MANAGER'});
export function normalizeOperationalRole(value){
  const v=String(value||'').trim().toUpperCase().replace(/\s+/g,'_');
  if(v==='GSC_CAPTAIN')return ROLE.GSC_CAPTAIN;
  if(v==='CASHIER')return ROLE.CASHIER;
  if(v==='MANAGER')return ROLE.MANAGER;
  return ROLE.VALET_ASSOCIATE;
}
export function canViewOperationalRadioData(role){return [ROLE.GSC_CAPTAIN,ROLE.CASHIER,ROLE.MANAGER].includes(normalizeOperationalRole(role));}
export function canMutateFleet(role){return normalizeOperationalRole(role)===ROLE.MANAGER;}
export function canManageRoles(role){return normalizeOperationalRole(role)===ROLE.MANAGER;}
export function canManageDiscipline(role){return normalizeOperationalRole(role)===ROLE.MANAGER;}
