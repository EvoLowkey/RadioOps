export function getDockBank(slot){ return slot<=20?'A':'B'; }
export function sortHistoryNewestFirst(rows){ return [...rows].sort((a,b)=>new Date(b.checkoutAt)-new Date(a.checkoutAt)); }
export function filterRadios(radios,query='',status='ALL'){
  const q=query.trim().toLowerCase();
  return radios.filter(r => (status==='ALL'||r.status===status) && (!q || [r.id,r.employeeName,r.employeeId,r.department].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))));
}
export function getRecentActivity(history,limit=5){ return sortHistoryNewestFirst(history).slice(0,limit); }
export function getDockCounts(radios){
  return radios.reduce((acc,r)=>{ acc[r.dockState]=(acc[r.dockState]||0)+1; return acc; },{EMPTY:0,CHARGING:0,FULL:0,FAULT:0});
}
export function getFleetHealth(state){
  const active=state.radios.filter(r=>['IN_USE','OVERDUE'].includes(r.status)).length;
  const attention=state.radios.filter(r=>['OVERDUE','REPAIR'].includes(r.status)).length;
  const ready=state.radios.filter(r=>r.status==='AVAILABLE').length;
  return {ready,active,attention,utilization:Math.round(active/state.radios.length*100)};
}
export function getRadioDetail(state,radioId){
  const r=state.radios.find(x=>x.id===radioId);
  if(!r) return null;
  const labels={AVAILABLE:'Available',IN_USE:'In Use',OVERDUE:'Overdue',REPAIR:'In Repair'};
  return {...r,assignment:r.employeeName||'Unassigned',dockLabel:`Slot ${String(r.dockSlot).padStart(2,'0')}`,statusLabel:labels[r.status]||r.status};
}

export function getWorkspaceMode(profile){
  if(!profile?.is_active) return 'BLOCKED';
  return profile.role==='MANAGER'?'MANAGER':'EMPLOYEE';
}

export function buildProductionState({radios=[],assignments=[],profiles=[],profile,now=new Date()}){
  const profileMap=new Map(profiles.map(p=>[p.id,p]));
  if(profile) profileMap.set(profile.id,profile);
  const manager=profile?.role==='MANAGER' && profile?.is_active;
  const uiRadios=radios.map(r=>{
    const assigned=profileMap.get(r.assigned_profile_id);
    const own=r.assigned_profile_id && r.assigned_profile_id===profile?.id;
    const employeeName=assigned?.display_name || (r.assigned_profile_id ? (manager?'Assigned employee':'Assigned employee') : null);
    return {
      id:r.id,
      assetNumber:r.asset_number,
      status:(r.status==='IN_USE' && r.expected_return_at && new Date(r.expected_return_at)<now)?'OVERDUE':r.status,
      employeeName: own ? profile.display_name : employeeName,
      employeeId: own ? profile.employee_id : (manager?assigned?.employee_id:null),
      department: own ? profile.department : (manager?assigned?.department:null),
      assignedProfileId:r.assigned_profile_id,
      checkoutAt:r.checkout_at,
      expectedReturnAt:r.expected_return_at,
      returnedAt:r.last_returned_at,
      dockSlot:r.dock_slot,
      dockState:r.dock_state
    };
  });
  const uiHistory=assignments.map(a=>({
    id:a.id,radioId:a.radio_id,profileId:a.profile_id,
    employeeId:a.employee_id_snapshot,employeeName:a.employee_name_snapshot,
    department:a.department_snapshot,checkoutAt:a.checkout_at,
    expectedReturnAt:a.expected_return_at,returnAt:a.return_at,
    issuedBy:a.issued_by,returnedBy:a.returned_by
  }));
  return {radios:uiRadios,history:uiHistory};
}

export function filterEmployeesByStatus(rows,status='ALL'){
  return rows.filter(p=>status==='ALL' || (p.approval_status || (p.is_active?'ACTIVE':'DISABLED'))===status);
}
export function summarizeEmployees(rows=[],radios=[]){
  const counts={pending:0,active:0,disabled:0,rejected:0,holding:0};
  for(const p of rows){
    const s=p.approval_status || (p.is_active?'ACTIVE':'DISABLED');
    if(s==='PENDING')counts.pending++;
    else if(s==='ACTIVE')counts.active++;
    else if(s==='DISABLED')counts.disabled++;
    else if(s==='REJECTED')counts.rejected++;
  }
  const holders=new Set(radios.filter(r=>r.assignedProfileId).map(r=>r.assignedProfileId));
  counts.holding=holders.size;
  return counts;
}
export function getEmployeeWorkspace(state,profile){
  const activeRadio=state.radios.find(r=>r.assignedProfileId===profile?.id && ['IN_USE','OVERDUE'].includes(r.status)) || null;
  const availableRadios=state.radios.filter(r=>r.status==='AVAILABLE');
  return {
    activeRadio,
    availableRadios,
    availableCount:availableRadios.length,
    canCheckout:!activeRadio && availableRadios.length>0,
    recentHistory:sortHistoryNewestFirst(state.history.filter(h=>h.profileId===profile?.id)).slice(0,5)
  };
}
