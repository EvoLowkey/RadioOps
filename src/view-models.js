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
  const attention=state.radios.filter(r=>['OVERDUE','REPAIR','LOST','DAMAGED'].includes(r.status)).length;
  const ready=state.radios.filter(r=>r.status==='AVAILABLE').length;
  return {ready,active,attention,utilization:Math.round(active/state.radios.length*100)};
}
export function getRadioDetail(state,radioId){
  const r=state.radios.find(x=>x.id===radioId);
  if(!r) return null;
  const labels={AVAILABLE:'Available',IN_USE:'In Use',OVERDUE:'Overdue',REPAIR:'In Repair',LOST:'Lost',DAMAGED:'Damaged'};
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
      dockState:r.dock_state,
      conditionReason:r.condition_reason||null,
      conditionUpdatedAt:r.condition_updated_at||null,
      conditionUpdatedBy:r.condition_updated_by||null
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
  const activeRadio=state.radios.find(r=>r.assignedProfileId===profile?.id && ['IN_USE','OVERDUE','LOST'].includes(r.status)) || null;
  const availableRadios=state.radios.filter(r=>r.status==='AVAILABLE');
  return {
    activeRadio,
    availableRadios,
    availableCount:availableRadios.length,
    canCheckout:!activeRadio && availableRadios.length>0,
    recentHistory:sortHistoryNewestFirst(state.history.filter(h=>h.profileId===profile?.id)).slice(0,5)
  };
}

export function getLastKnownHolder(state,radioId){
  const radio=(state?.radios||[]).find(r=>r.id===radioId);
  if(radio?.assignedProfileId || radio?.employeeName){
    return {
      employeeName:radio.employeeName||'Assigned employee',
      employeeId:radio.employeeId||null,
      department:radio.department||null,
      checkoutAt:radio.checkoutAt||null,
      profileId:radio.assignedProfileId||null
    };
  }
  const latest=(state?.history||[])
    .filter(h=>h.radioId===radioId)
    .sort((a,b)=>new Date(b.checkoutAt||0)-new Date(a.checkoutAt||0))[0];
  if(!latest)return null;
  return {employeeName:latest.employeeName||'Unknown employee',employeeId:latest.employeeId||null,department:latest.department||null,checkoutAt:latest.checkoutAt||null,profileId:latest.profileId||null};
}

function opsSearchText(state,radio){
  const holder=getLastKnownHolder(state,radio.id);
  return [radio.id,radio.status,radio.employeeName,radio.employeeId,radio.department,holder?.employeeName,holder?.employeeId,holder?.department,radio.conditionReason].filter(Boolean).join(' ').toLowerCase();
}

export function getManagerOperationsOverview(state,query='',filter='ALL',department='ALL'){
  const radios=state?.radios||[];
  const q=String(query||'').trim().toLowerCase();
  const matchesGroup=r=>filter==='ALL' || (filter==='CHECKED_OUT'&&['IN_USE','OVERDUE'].includes(r.status)) || (filter==='OVERDUE'&&r.status==='OVERDUE') || (filter==='UNAVAILABLE'&&['LOST','DAMAGED','REPAIR'].includes(r.status)) || r.status===filter;
  const matchesDepartment=r=>{
    if(!department||department==='ALL')return true;
    const holder=getLastKnownHolder(state,r.id);
    return (r.department||holder?.department||'')===department;
  };
  const all=radios.filter(r=>matchesGroup(r)&&matchesDepartment(r)&&(!q||opsSearchText(state,r).includes(q)));
  const withHolder=r=>({...r,lastHolder:getLastKnownHolder(state,r.id)});
  const checkedOut=all.filter(r=>['IN_USE','OVERDUE'].includes(r.status)).sort((a,b)=>{
    if(a.status!==b.status)return a.status==='OVERDUE'?-1:1;
    return new Date(a.checkoutAt||0)-new Date(b.checkoutAt||0);
  }).map(withHolder);
  const overdue=all.filter(r=>r.status==='OVERDUE').sort((a,b)=>new Date(a.checkoutAt||0)-new Date(b.checkoutAt||0)).map(withHolder);
  const unavailable=all.filter(r=>['LOST','DAMAGED','REPAIR'].includes(r.status)).sort((a,b)=>a.id.localeCompare(b.id)).map(withHolder);
  const counts={
    available:radios.filter(r=>r.status==='AVAILABLE').length,
    checkedOut:radios.filter(r=>['IN_USE','OVERDUE'].includes(r.status)).length,
    overdue:radios.filter(r=>r.status==='OVERDUE').length,
    lost:radios.filter(r=>r.status==='LOST').length,
    damaged:radios.filter(r=>r.status==='DAMAGED').length,
    repair:radios.filter(r=>r.status==='REPAIR').length
  };
  return {counts,all,checkedOut,overdue,unavailable};
}

export function getOperationalActivity(auditEvents=[],profiles=[],limit=8){
  const profileMap=new Map(profiles.map(p=>[p.id,p]));
  return [...auditEvents]
    .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))
    .slice(0,limit)
    .map(e=>({
      id:e.id,
      type:e.event_type||'SYSTEM_EVENT',
      radioId:e.radio_id||null,
      actorName:profileMap.get(e.actor_profile_id)?.display_name||e.actor_profile_id||'System',
      createdAt:e.created_at||null,
      metadata:e.metadata||{}
    }));
}
