export function isActive(profile){ return Boolean(profile?.is_active ?? profile?.isActive); }
export function isManager(profile){ return isActive(profile) && profile?.role === 'MANAGER'; }
export function canManageRadio(profile){ return isManager(profile); }
export function effectiveRadioStatus(radio, now=new Date()) {
  const stored=radio?.status;
  const expected=radio?.expected_return_at ?? radio?.expectedReturnAt;
  if (stored==='IN_USE' && expected && new Date(expected).getTime() < now.getTime()) return 'OVERDUE';
  return stored;
}
