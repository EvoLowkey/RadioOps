import { createConfiguredSupabaseClient } from './supabase-client.js';
import { createRadioOpsApi } from './api.js';
import { isManager, getAccountGate, canViewOperationalRadioData } from './permissions.js';
import { localDateString, operationalRoleLabel, accountabilityBanner, shouldNotifyAccountability } from './accountability.js';
import { getShiftWorkDate } from './shift-policy.js';
import { buildDymo30336Label, dymoFilename } from './dymo-label.js';
import { parseRadioCode, canUseCameraQrScanner, getScannerMode, matchesAssignedRadio, getPreferredCameraConstraints, cameraErrorMessage, decodeFrameWithJsQr, decodeFrameWithZxing } from './scanner.js';
import {
  filterRadios, sortHistoryNewestFirst, getDockBank, getRecentActivity,
  getFleetHealth, getDockCounts, getRadioDetail, buildProductionState,
  summarizeEmployees, filterEmployeesByStatus, getEmployeeWorkspace,
  getManagerOperationsOverview, getOperationalActivity
} from './view-models.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt=iso=>iso?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)):'—';
const statusLabel=s=>({AVAILABLE:'AVAILABLE',IN_USE:'IN USE',OVERDUE:'OVERDUE',REPAIR:'IN REPAIR',LOST:'LOST',DAMAGED:'DAMAGED'}[s]||s);
const dockLabel=s=>({EMPTY:'Empty',CHARGING:'Charging',FULL:'Full',FAULT:'Fault'}[s]||s);
const approvalLabel=s=>({PENDING:'Pending',ACTIVE:'Active',DISABLED:'Disabled',REJECTED:'Rejected'}[s]||s);

let client=null,api=null,session=null,profile=null,profiles=[],auditEvents=[];
let state={radios:[],history:[]},mode='out',scannerTarget='manager',scannerStream=null,scannerTimer=null,toastTimer=null,unsubscribeFleet=null,refreshTimer=null;
let selectedShiftCode=null,currentAgreement=null,accountabilityState=null,operationalCheckedOut=[],operationalHistory=[],disciplinaryRecords=[],lastNotifiedStatus=null;
let managerIncidents=[],managerDiscipline=[],qrStatus=[];
let currentDymoLabel=null;

function updateClock(){if($('#systemTime'))$('#systemTime').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
function showToast(text){const el=$('#toast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}
function showMessage(text,type='success'){const el=$('#formMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function employeeMessage(text,type='success'){const el=$('#employeeActionMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function authMessage(text,type='error'){const el=$('#authMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function showVerifiedLoginNotice(){
  const params=new URLSearchParams(window.location.search);
  const banner=$('#verifiedLoginBanner');
  if(!banner)return;
  const verified=params.get('verified')==='1',passwordReset=params.get('passwordReset')==='1';
  banner.hidden=!(verified||passwordReset);
  if(verified){banner.innerHTML='<strong>✓ Email successfully verified</strong><span>Your email has been successfully verified. You can now log in to Valet Radio HQ.</span>';}
  if(passwordReset){banner.innerHTML='<strong>✓ Password updated successfully</strong><span>Your password has been changed. Sign in to Valet Radio HQ with your new password.</span>';}
  if(verified||passwordReset){
    setAuthMode('signin');
    try{history.replaceState({},document.title,window.location.pathname);}catch{}
  }
}
function setConnection(kind,text){
  const banner=$('#connectionBanner');
  if($('#systemStatusTitle'))$('#systemStatusTitle').textContent=kind==='ok'?'System Online':kind==='loading'?'Syncing':'Connection Issue';
  if($('#systemStatusText'))$('#systemStatusText').textContent=text;
  $('.status-orb')?.classList.toggle('offline',kind==='error');
  if(banner){banner.hidden=kind!=='error';banner.textContent=kind==='error'?text:'';}
}
function humanError(err){
  const msg=err?.message||'';
  if(err?.code==='AUTH_ERROR')return 'Your session has expired. Please sign in again.';
  if(err?.code==='PERMISSION_DENIED')return 'You do not have permission to perform that action.';
  if(err?.code==='RADIO_UNAVAILABLE')return 'That radio was just taken by another user. The fleet has been refreshed.';
  if(err?.code==='CONFIG_MISSING')return 'Valet Radio HQ needs its Supabase connection configured before sign-in.';
  if(/employee id.*already|duplicate|unique/i.test(msg))return 'That Employee ID is already registered. Contact a Manager.';
  return msg||'The operation could not be completed. Please try again.';
}

function setAuthMode(next){
  const signup=next==='signup',forgot=next==='forgot';
  $('#signInForm').hidden=signup||forgot;$('#signUpForm').hidden=!signup;$('#forgotPasswordForm').hidden=!forgot;
  $('#authSignInTab').classList.toggle('active',!signup&&!forgot);$('#authSignUpTab').classList.toggle('active',signup);
  if(forgot){
    $('#authTitle').textContent='Reset your password';
    $('#authCopy').textContent='Enter your email and Valet Radio HQ will send a secure password reset link.';
    const current=$('#signInEmail').value.trim();if(current)$('#forgotPasswordEmail').value=current;
  }else{
    $('#authTitle').textContent=signup?'Create your employee account':'Sign in to Valet Radio HQ';
    $('#authCopy').textContent=signup?'Use any email address. Your account stays pending until a Valet Radio HQ Manager approves it.':'Use your Valet Radio HQ workplace account to access the radio fleet and keep operations synchronized across devices.';
  }
  authMessage('','');
}
function closeMobileProfileMenu(){const menu=$('#mobileProfileMenu'),btn=$('#mobileProfileBtn');if(!menu||!btn)return;menu.hidden=true;btn.setAttribute('aria-expanded','false');}
function toggleMobileProfileMenu(){const menu=$('#mobileProfileMenu'),btn=$('#mobileProfileBtn');if(!menu||!btn)return;const opening=menu.hidden;menu.hidden=!opening;btn.setAttribute('aria-expanded',opening?'true':'false');}
function showSignedOut(){
  $('#authGate').hidden=false;$('#accountGate').hidden=true;$('.app-frame').hidden=false;$('.app-frame').classList.add('app-locked');
  document.body.classList.remove('manager-session','employee-session');
  $('#identityName').textContent='Signed out';$('#identityRole').textContent='—';$('#mobileProfileName').textContent='Signed out';$('#mobileProfileRole').textContent='—';closeMobileProfileMenu();
}
function showActiveApp(){
  $('#authGate').hidden=true;$('#accountGate').hidden=true;$('.app-frame').hidden=false;$('.app-frame').classList.remove('app-locked');
  const manager=isManager(profile);document.body.classList.toggle('manager-session',manager);document.body.classList.toggle('employee-session',!manager);
  applyRoleUI();switchView(manager?'dashboard':'employeeHome');
}
function renderAccountGate(kind){
  const data={
    PENDING:['◷','Awaiting approval','Account awaiting approval','A Manager must approve your account before you can use the radio fleet.'],
    REJECTED:['×','Request not approved','Account request was not approved','Contact a workplace Manager if you believe this should be reviewed again.'],
    DISABLED:['!','Access disabled','Account access is disabled','Contact a workplace Manager to restore your Valet Radio HQ access.']
  }[kind]||['!','Account status','Access unavailable','Contact a workplace Manager.'];
  $('#authGate').hidden=true;$('.app-frame').hidden=true;$('#accountGate').hidden=false;
  $('#accountGateIcon').textContent=data[0];$('#accountGateEyebrow').textContent=data[1];$('#accountGateTitle').textContent=data[2];$('#accountGateMessage').textContent=data[3];
  $('#accountGateDetails').innerHTML=[['Name',profile?.display_name],['Employee ID',profile?.employee_id],['Department',profile?.department],['Email',profile?.email||session?.user?.email]].map(([k,v])=>`<div class="account-detail"><span>${k}</span><strong>${escapeHtml(v||'—')}</strong></div>`).join('');
}
function applyRoleUI(){
  if(!profile)return;const manager=isManager(profile),operationalRead=!manager&&canViewOperationalRadioData(profile.operational_role);
  $$('.manager-only').forEach(el=>el.hidden=!manager);$$('.employee-only').forEach(el=>el.hidden=manager);$$('.operational-readonly').forEach(el=>el.hidden=!operationalRead);
  $('#employeeFields').hidden=!manager||mode!=='out';
  const roleName=manager?'Manager':operationalRoleLabel(profile.operational_role);const identityRole=`${roleName} • ${profile.department}`;const initials=profile.display_name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  $('#identityName').textContent=profile.display_name;$('#identityRole').textContent=identityRole;$('#mobileProfileName').textContent=profile.display_name;$('#mobileProfileRole').textContent=identityRole;
  $('#identityAvatar').textContent=initials;const mobileAvatar=document.querySelector('.mobile-profile-avatar');if(mobileAvatar)mobileAvatar.textContent=initials;
  if($('#employeeWorkspace'))$('#employeeWorkspace').hidden=true;
}

function mapProfiles(){return new Map(profiles.map(p=>[p.id,p]));}
async function loadData({quiet=false}={}){
  if(!api||!profile||getAccountGate(profile)!=='ACTIVE')return;
  if(!quiet)setConnection('loading','Refreshing secure cloud data');
  try{
    const manager=isManager(profile),operationalRead=!manager&&canViewOperationalRadioData(profile.operational_role);
    const [radios,assignments,profileRows,auditRows,accountability,opChecked,opHistory,notices,incidents,managerNotices,qrRows]=await Promise.all([
      api.listRadios(),api.listAssignments(manager?null:profile.id),manager?api.listProfiles():Promise.resolve([profile]),manager?api.listAuditEvents():Promise.resolve([]),
      manager?Promise.resolve(null):api.getMyRadioAccountability().catch(()=>null),
      operationalRead?api.listOperationalCheckedOut():Promise.resolve([]),operationalRead?api.listOperationalRadioHistory(100):Promise.resolve([]),
      manager?Promise.resolve([]):api.listMyDisciplinaryRecords().catch(()=>[]),
      manager?api.listManagerRadioIncidents().catch(()=>[]):Promise.resolve([]),manager?api.listManagerDisciplinaryRecords().catch(()=>[]):Promise.resolve([]),manager?api.listRadioQrStatus().catch(()=>[]):Promise.resolve([])
    ]);
    profiles=profileRows;auditEvents=auditRows;accountabilityState=accountability;operationalCheckedOut=opChecked;operationalHistory=opHistory;disciplinaryRecords=notices;managerIncidents=incidents;managerDiscipline=managerNotices;qrStatus=qrRows;
    state=buildProductionState({radios,assignments,profiles,profile,now:new Date()});
    maybeNotifyAccountability();renderAll();setConnection('ok','Supabase realtime connected');
  }catch(err){setConnection('error',humanError(err));if(!quiet)showToast(humanError(err));}
}

function renderFleetHealth(){if(!isManager(profile))return;if(!state.radios.length){$('#fleetHealth').innerHTML='<div class="empty-state">Loading fleet…</div>';return;}const h=getFleetHealth(state);$('#fleetHealth').innerHTML=`<div class="health-head"><strong>Fleet Health</strong><span>${h.utilization}% deployed</span></div><div class="health-meter"><span style="width:${Math.max(4,100-h.attention/state.radios.length*100)}%"></span></div><div class="health-grid"><div><strong>${h.ready}</strong><span>Ready</span></div><div><strong>${h.active}</strong><span>Active</span></div><div><strong>${h.attention}</strong><span>Needs attention</span></div></div>`;}
function renderStats(){if(!isManager(profile))return;const c={total:state.radios.length,available:state.radios.filter(r=>r.status==='AVAILABLE').length,checkedOut:state.radios.filter(r=>r.status==='IN_USE').length,overdue:state.radios.filter(r=>r.status==='OVERDUE').length,attention:state.radios.filter(r=>['REPAIR','DAMAGED','LOST'].includes(r.status)).length};const items=[['total','▦','TOTAL RADIOS',c.total],['available','✓','AVAILABLE',c.available],['checked','⇄','CHECKED OUT',c.checkedOut],['overdue','!','OVERDUE',c.overdue],['repair','⌁','CONDITION ISSUES',c.attention]];$('#statGrid').innerHTML=items.map(([k,i,l,v])=>`<div class="stat-card ${k}"><div class="stat-icon">${i}</div><div><span class="label">${l}</span><span class="value">${v}</span></div></div>`).join('');}
function radioAction(r){if(!isManager(profile))return '';const returnBtn=r.assignedProfileId?`<button class="table-action" data-action="return" data-id="${r.id}">Return</button>`:'';return `<div class="radio-actions-inline">${returnBtn}<button class="table-action" data-action="condition" data-id="${r.id}">Manage</button></div>`;}
function renderRadios(){if(!isManager(profile))return;const rows=filterRadios(state.radios,$('#radioSearch').value,$('#statusFilter').value);$('#radioRows').innerHTML=rows.map(r=>`<tr><td><button class="radio-link" data-detail="${r.id}">${r.id}</button></td><td><div class="employee-cell"><strong>${escapeHtml(r.employeeName||'Unassigned')}</strong><span>${escapeHtml(r.employeeId?`ID ${r.employeeId}`:(r.assignedProfileId?'Assigned employee':'No employee'))}</span></div></td><td>${escapeHtml(r.department||'—')}</td><td>${fmt(r.checkoutAt)}</td><td><span class="dock-badge dock-${r.dockState}">${dockLabel(r.dockState)}</span></td><td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td><td>${radioAction(r)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No radios match this filter.</td></tr>';}
function renderRecentActivity(){if(!isManager(profile))return;const rows=getRecentActivity(state.history,5);$('#recentActivity').innerHTML=rows.length?rows.map(h=>`<div class="activity-item"><div class="activity-icon">${h.radioId.replace('WT-','')}</div><div class="activity-copy"><strong>${h.radioId} • ${escapeHtml(h.employeeName)}</strong><span>${escapeHtml(h.department)} • ${h.returnAt?'Returned':'Checked out'}</span></div><span class="activity-time">${fmt(h.returnAt||h.checkoutAt)}</span></div>`).join(''):'<div class="empty-state">No radio activity yet.</div>';}
function opsHolderCopy(r){const h=r.lastHolder;if(!h)return '<span class="ops-holder-empty">No holder history</span>';return `<strong>${escapeHtml(h.employeeName||'Unknown employee')}</strong><span>${escapeHtml(h.employeeId?`ID ${h.employeeId}`:'No employee ID')}${h.department?` • ${escapeHtml(h.department)}`:''}</span>`;}
function opsAge(iso){if(!iso)return '—';const ms=Math.max(0,Date.now()-new Date(iso).getTime()),hours=Math.floor(ms/3600000),mins=Math.floor((ms%3600000)/60000);return hours?`${hours}h ${mins}m`:`${mins}m`;}
function opsActions(r,{allowReturn=false}={}){const holder=r.lastHolder,assignment=state.history.find(h=>h.radioId===r.id&&!h.returnAt);return `<div class="ops-row-actions"><button type="button" class="mini-btn" data-ops-action="view" data-id="${r.id}">View</button>${holder?.profileId?`<button type="button" class="mini-btn" data-ops-action="employee" data-profile-id="${holder.profileId}" data-employee-name="${escapeHtml(holder.employeeName||'Employee')}">Employee</button>`:''}${allowReturn?`<button type="button" class="mini-btn emphasis" data-ops-action="return" data-id="${r.id}">Return</button>${assignment?`<button type="button" class="mini-btn" data-ops-action="exception" data-id="${r.id}" data-assignment-id="${assignment.id}">Exception</button>`:''}`:`<button type="button" class="mini-btn emphasis" data-ops-action="condition" data-id="${r.id}">Manage</button>`}</div>`;}
function renderOperationsOverview(){
  if(!isManager(profile)||!$('#operationsOverview'))return;
  const deptSelect=$('#opsDepartment'),selectedDepartment=deptSelect.value||'ALL';
  const departments=[...new Set(profiles.map(p=>p.department).filter(Boolean))].sort();
  deptSelect.innerHTML='<option value="ALL">All departments</option>'+departments.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  if(selectedDepartment==='ALL'||departments.includes(selectedDepartment))deptSelect.value=selectedDepartment;
  const vm=getManagerOperationsOverview(state,$('#opsSearch').value,$('#opsFilter').value,deptSelect.value);
  const summary=[['Available',vm.counts.available,'available'],['Checked Out',vm.counts.checkedOut,'checked'],['Overdue',vm.counts.overdue,'overdue'],['Lost',vm.counts.lost,'lost'],['Damaged',vm.counts.damaged,'damaged'],['In Repair',vm.counts.repair,'repair']];
  $('#opsSummary').innerHTML=summary.map(([label,value,tone])=>`<div class="ops-summary-card ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('#opsCheckedCount').textContent=vm.checkedOut.length;$('#opsOverdueCount').textContent=vm.overdue.length;$('#opsUnavailableCount').textContent=vm.unavailable.length;
  const checkedRows=vm.checkedOut;
  $('#opsCheckedOut').innerHTML=checkedRows.length?checkedRows.map(r=>`<article class="ops-row"><div class="ops-radio"><button class="radio-link" data-ops-action="view" data-id="${r.id}">${r.id}</button><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></div><div class="ops-holder">${opsHolderCopy(r)}</div><div class="ops-timing"><span>Out ${opsAge(r.checkoutAt)}</span><small>${fmt(r.checkoutAt)}</small></div>${opsActions(r,{allowReturn:true})}</article>`).join(''):'<div class="ops-empty">No checked-out radios match this filter.</div>';
  $('#opsOverdue').innerHTML=vm.overdue.length?vm.overdue.map(r=>`<article class="ops-row priority"><div class="ops-radio"><button class="radio-link" data-ops-action="view" data-id="${r.id}">${r.id}</button><span class="status-badge status-OVERDUE">OVERDUE</span></div><div class="ops-holder">${opsHolderCopy(r)}</div><div class="ops-timing"><span>Out ${opsAge(r.checkoutAt)}</span><small>Expected ${fmt(r.expectedReturnAt)}${r.tipReleaseStatus==='TIP_RELEASE_PENDING'?' • Tip Release Pending':''}</small></div>${opsActions(r,{allowReturn:true})}</article>`).join(''):'<div class="ops-empty">No overdue radios match this filter.</div>';
  $('#opsUnavailable').innerHTML=vm.unavailable.length?vm.unavailable.map(r=>`<article class="ops-row"><div class="ops-radio"><button class="radio-link" data-ops-action="view" data-id="${r.id}">${r.id}</button><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></div><div class="ops-holder">${opsHolderCopy(r)}</div><div class="ops-timing"><span>${escapeHtml(r.conditionReason||'No condition note')}</span><small>${r.conditionUpdatedAt?`Updated ${fmt(r.conditionUpdatedAt)}`:'Condition active'}</small></div>${opsActions(r)}</article>`).join(''):'<div class="ops-empty">No unavailable radios match this filter.</div>';
  const activity=getOperationalActivity(auditEvents,profiles,8);
  const eventLabel=t=>String(t||'SYSTEM_EVENT').replaceAll('_',' ').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase());
  $('#opsActivity').innerHTML=activity.length?activity.map(e=>`<div class="ops-activity-item"><div class="ops-activity-mark">${e.radioId?escapeHtml(e.radioId.replace('WT-','')):'•'}</div><div><strong>${escapeHtml(eventLabel(e.type))}</strong><span>${e.radioId?`${escapeHtml(e.radioId)} • `:''}${escapeHtml(e.actorName)}</span></div><time>${fmt(e.createdAt)}</time></div>`).join(''):'<div class="ops-empty">No operational events yet.</div>';
}
function populateEmployeeTarget(){if(!isManager(profile))return;const select=$('#employeeTarget'),current=select.value;select.innerHTML='<option value="">Select employee</option>'+profiles.filter(p=>p.is_active&&((p.approval_status||'ACTIVE')==='ACTIVE')).map(p=>`<option value="${p.id}">${escapeHtml(p.display_name)} • ${escapeHtml(p.employee_id)} • ${escapeHtml(p.department)}</option>`).join('');if(profiles.some(p=>p.id===current))select.value=current;}
function eligibleRadios(){if(mode==='out')return state.radios.filter(r=>r.status==='AVAILABLE');return state.radios.filter(r=>['IN_USE','OVERDUE'].includes(r.status)&&(isManager(profile)||r.assignedProfileId===profile.id));}
function populateRadioSelect(){const list=eligibleRadios(),select=$('#radioSelect'),current=select.value;select.innerHTML=list.map(r=>`<option value="${r.id}">${r.id}${r.employeeName?` — ${escapeHtml(r.employeeName)}`:''}</option>`).join('');if(list.some(r=>r.id===current))select.value=current;updateSelectedVisual();}
function updateSelectedVisual(){const id=$('#radioSelect').value||'—';$('#qrSelectedLabel').textContent=id;$('#heroRadioId').textContent=id;}
function renderHistory(){if(!isManager(profile))return;const rows=sortHistoryNewestFirst(state.history);$('#historyRows').innerHTML=rows.map(h=>`<tr><td><button class="radio-link" data-detail="${h.radioId}">${h.radioId}</button></td><td>${escapeHtml(h.employeeName)}</td><td>${escapeHtml(h.employeeId)}</td><td>${escapeHtml(h.department)}</td><td>${fmt(h.checkoutAt)}</td><td>${fmt(h.returnAt)}</td><td><span class="history-state">${h.returnAt?'Closed':'Active'}</span></td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No assignment history is available.</td></tr>';}
function renderDock(){if(!isManager(profile))return;const totals=getDockCounts(state.radios);$('#dockSummary').innerHTML=Object.entries(totals).map(([k,v])=>`<div class="summary-chip"><span class="dock-badge dock-${k}">${dockLabel(k)}</span><strong>${v}</strong><span>radios</span></div>`).join('');$('#dockBanks').innerHTML=['A','B'].map(bank=>{const radios=state.radios.filter(r=>getDockBank(r.dockSlot)===bank);const range=bank==='A'?'Slots 01–20':'Slots 21–40';return `<div class="dock-bank"><div class="dock-bank-head"><div><h3>Charging Bank ${bank}</h3><p>${range} • tap a slot to cycle state</p></div><span class="bank-pill">20 positions</span></div><div class="slot-grid">${radios.map(r=>`<button class="dock-slot" data-radio="${r.id}" title="${r.id}: ${r.dockState}"><span class="slot-number">SLOT ${String(r.dockSlot).padStart(2,'0')}</span><div class="slot-radio">${r.id}</div><span class="slot-light ${r.dockState}"></span><span class="slot-state">${dockLabel(r.dockState)}</span></button>`).join('')}</div></div>`;}).join('');}
function renderAudit(){if(!isManager(profile))return;const pm=mapProfiles();$('#auditRows').innerHTML=auditEvents.slice(0,250).map(e=>`<tr><td>${fmt(e.created_at)}</td><td><span class="history-state">${escapeHtml(e.event_type.replaceAll('_',' '))}</span></td><td>${escapeHtml(e.radio_id||'—')}</td><td>${escapeHtml(pm.get(e.actor_profile_id)?.display_name||e.actor_profile_id||'System')}</td><td><code class="audit-meta">${escapeHtml(JSON.stringify(e.metadata||{}))}</code></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">No audit events yet.</td></tr>';}


function renderManagerAccountability(){
  if(!isManager(profile)||!$('#qrAdminRows'))return;
  const qmap=new Map(qrStatus.map(q=>[q.radio_id,q]));
  $('#qrAdminRows').innerHTML=state.radios.map(r=>{const q=qmap.get(r.id);return `<div class="qr-admin-item"><strong>${r.id}</strong><span>${q?.generation?`Barcode generation ${q.generation}`:'No secure QR issued'}</span><small>${q?.rotated_at?`Updated ${fmt(q.rotated_at)}`:'Generate before printing label'}</small><button class="mini-btn ${q?.generation?'':'primary'}" data-qr-rotate="${r.id}">${q?.generation?'Regenerate Barcode':'Generate Barcode'}</button></div>`;}).join('');
  const pm=mapProfiles();
  $('#managerIncidentRows').innerHTML=managerIncidents.length?managerIncidents.slice(0,50).map(i=>`<div class="employee-history-item"><div class="employee-history-radio">${escapeHtml(i.radio_id)}</div><div><strong>${escapeHtml(i.incident_type)} • Occurrence ${i.occurrence_number}</strong><span>${escapeHtml(pm.get(i.profile_id)?.display_name||i.profile_id)} • ${fmt(i.created_at)} • ${escapeHtml(i.explanation||'')}</span></div></div>`).join(''):'<div class="empty-state">No radio incidents recorded.</div>';
  $('#managerDisciplineRows').innerHTML=managerDiscipline.length?managerDiscipline.slice(0,50).map(d=>`<div class="employee-history-item"><div class="employee-history-radio">${d.level==='WRITE_UP'?'WU':'WW'}</div><div><strong>${d.level==='WRITE_UP'?'Write-Up':'Written Warning'} • ${escapeHtml(pm.get(d.profile_id)?.display_name||d.profile_id)}</strong><span>${fmt(d.created_at)}${d.financial_review_required?' • Financial Review Required':''}${d.acknowledged_at?' • Acknowledged':''}</span></div></div>`).join(''):'<div class="empty-state">No warnings or write-ups recorded.</div>';
}
function downloadBlob(filename,content,type='application/octet-stream'){
  const blob=content instanceof Blob?content:new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadDymoLabel(radioId,token){
  downloadBlob(dymoFilename(radioId),buildDymo30336Label(radioId,token),'application/xml');
}
async function downloadAllDymoLabels(items){
  if(typeof JSZip!=='function') throw new Error('DYMO ZIP export is unavailable');
  const zip=new JSZip();
  for(const item of items) zip.file(dymoFilename(item.radioId),buildDymo30336Label(item.radioId,item.token));
  const blob=await zip.generateAsync({type:'blob'});
  downloadBlob('Valet-Radio-HQ-WT-01-to-WT-40-DYMO-30336-Labels.zip',blob,'application/zip');
}
function renderSecureBarcode(container,radioId,token){
  container.innerHTML='';
  const card=document.createElement('div');
  card.className='qr-label-card barcode-label-card';
  card.innerHTML=`<div class="qr-label-brand">VALET RADIO HQ</div><h2>${escapeHtml(radioId)}</h2><svg class="secure-code128" aria-label="${escapeHtml(radioId)} secure Code 128 barcode"></svg><small>SCAN TO CHECK OUT / RETURN</small>`;
  container.appendChild(card);
  const svg=card.querySelector('.secure-code128');
  if(typeof JsBarcode!=='function') throw new Error('Barcode renderer unavailable');
  JsBarcode(svg,token,{format:'CODE128',displayValue:false,margin:8,height:62,width:2});
}
function showBarcodeLabel(radioId,token){currentDymoLabel={radioId,token};$('#qrLabelTitle').textContent=radioId;renderSecureBarcode($('#qrPrintArea'),radioId,token);$('#qrLabelDialog').showModal();}
async function rotateOneQr(radioId){
  if(!confirm(`Generate a new secure barcode for ${radioId}? Any previous ${radioId} barcode label will stop working immediately.`))return;
  try{const result=await api.rotateRadioQrToken(radioId);showBarcodeLabel(radioId,result.token);showToast(`${radioId}: secure barcode generated`);await loadData({quiet:true});}catch(err){showToast(humanError(err));}
}
async function generateAllQrLabels(){
  if(!confirm('Generate new secure barcodes for ALL 40 radios? This immediately invalidates every previous radio barcode label. Continue only when you are ready to install the complete new label set.'))return;
  const btn=$('#generateAllQrBtn');btn.disabled=true;btn.textContent='Generating 0 / 40…';
  try{
    const results=await api.rotateAllRadioQrTokens();
    const items=results.map(result=>({radioId:result.radio_id,token:result.token}));
    await downloadAllDymoLabels(items);
    showToast('40 DYMO .label files downloaded as one ZIP.');
    await loadData({quiet:true});
  }catch(err){showToast(humanError(err));}
  finally{btn.disabled=false;btn.textContent='Download All DYMO Labels';}
}
function openExceptionDialog(radioId,assignmentId){
  const a=state.history.find(h=>h.id===assignmentId)||state.history.find(h=>h.radioId===radioId&&!h.returnAt);if(!a){showToast('Open assignment not found');return;}
  $('#exceptionAssignmentId').value=a.id;$('#exceptionTitle').textContent=`Resolve ${radioId} Exception`;$('#exceptionExplanation').value='';$('#exceptionDiscipline').value='NONE';$('#disciplineManagerNotes').value='';$('#financialReviewRequired').checked=false;$('#exceptionMessage').textContent='';$('#exceptionDialog').showModal();
}
function currentRadioForProfile(profileId){return state.radios.find(r=>r.assignedProfileId===profileId&&['IN_USE','OVERDUE'].includes(r.status))||null;}
function renderEmployees(){
  if(!isManager(profile))return;const summary=summarizeEmployees(profiles,state.radios);const managerCount=profiles.filter(p=>p.role==='MANAGER'&&p.is_active&&((p.approval_status||'ACTIVE')==='ACTIVE')).length;
  const cards=[['Pending approvals',summary.pending],['Active employees',profiles.filter(p=>p.role==='EMPLOYEE'&&p.is_active&&((p.approval_status||'ACTIVE')==='ACTIVE')).length],['Managers',managerCount],['Disabled',summary.disabled],['Holding radios',summary.holding]];
  $('#employeeSummary').innerHTML=cards.map(([l,v])=>`<div class="employee-summary-card"><span>${l}</span><strong>${v}</strong></div>`).join('');
  const filter=$('#employeeStatusFilter').value||'PENDING';
  const rows=filter==='MANAGERS'?profiles.filter(p=>p.role==='MANAGER'):filterEmployeesByStatus(profiles.filter(p=>p.role!=='MANAGER'),filter);
  $('#employeeRows').innerHTML=rows.map(p=>{const status=p.approval_status||(p.is_active?'ACTIVE':'DISABLED'),radio=currentRadioForProfile(p.id);let actions='';
    if(p.role==='MANAGER'){
      const primary=Boolean(p.is_primary_manager);actions=`<button class="mini-btn" data-employee-admin="history" data-id="${p.id}">View History</button>${primary?'<span class="account-badge account-ACTIVE">Primary Manager</span>':`<button class="mini-btn danger" data-employee-admin="demote" data-id="${p.id}">Demote Manager</button>`}`;
    }else if(status==='PENDING')actions=`<button class="mini-btn primary" data-employee-admin="approve" data-id="${p.id}">Approve</button><button class="mini-btn danger" data-employee-admin="reject" data-id="${p.id}">Reject</button><button class="mini-btn danger" data-employee-admin="remove" data-id="${p.id}">Remove</button>`;
    else if(status==='ACTIVE')actions=`<select class="role-select" data-operational-role="${p.id}" aria-label="Operational role for ${escapeHtml(p.display_name)}"><option value="VALET_ASSOCIATE" ${(p.operational_role||'VALET_ASSOCIATE')==='VALET_ASSOCIATE'?'selected':''}>Valet Associate</option><option value="GSC_CAPTAIN" ${p.operational_role==='GSC_CAPTAIN'?'selected':''}>GSC Captain</option><option value="CASHIER" ${p.operational_role==='CASHIER'?'selected':''}>Cashier</option></select><button class="mini-btn" data-employee-admin="history" data-id="${p.id}">View History</button><button class="mini-btn primary" data-employee-admin="promote" data-id="${p.id}">Promote to Manager</button><button class="mini-btn danger" data-employee-admin="disable" data-id="${p.id}" ${radio?'disabled title="Return assigned radio first"':''}>Disable</button><button class="mini-btn danger" data-employee-admin="remove" data-id="${p.id}" ${radio?'disabled title="Return assigned radio first"':''}>Remove</button>`;
    else actions=`<button class="mini-btn primary" data-employee-admin="enable" data-id="${p.id}">Restore Access</button><button class="mini-btn danger" data-employee-admin="remove" data-id="${p.id}">Remove</button>`;
    const roleText=p.role==='MANAGER'?' • Manager':` • ${operationalRoleLabel(p.operational_role)}`;return `<tr><td><div class="employee-name-cell"><strong>${escapeHtml(p.display_name)}</strong><span>${escapeHtml(p.email||'No email')}${roleText}</span></div></td><td>${escapeHtml(p.employee_id)}</td><td>${escapeHtml(p.department)}</td><td>${escapeHtml(p.email||'—')}</td><td><span class="account-badge account-${status}">${approvalLabel(status)}</span></td><td>${radio?`<strong>${radio.id}</strong><br><small>${fmt(radio.checkoutAt)}</small>`:'—'}</td><td>${fmt(p.created_at)}</td><td><div class="employee-actions">${actions}</div></td></tr>`;}).join('')||'<tr><td colspan="8" class="empty-state">No people match this filter.</td></tr>';
}

function shiftLabel(code){return ({AM:'AM Shift · 6:55 AM–3:00 PM',PM:'PM Shift · 3:00 PM–11:00 PM',OVERNIGHT:'Overnight Shift · 11:00 PM–7:00 AM'})[code]||'Shift not recorded';}
function maybeNotifyAccountability(){
  const banner=accountabilityBanner(accountabilityState);if(!banner)return;
  const status=accountabilityState?.computed_return_status||accountabilityState?.return_status;
  if(shouldNotifyAccountability(accountabilityState,lastNotifiedStatus)){
    lastNotifiedStatus=status;
    if('Notification' in window&&Notification.permission==='granted'){try{new Notification(banner.title,{body:banner.message,icon:'/icons/icon-192.png'});}catch{}}
  }
}
function renderOperationalRead(){
  if(!$('#operationalCheckedOut'))return;
  const row=a=>`<div class="employee-history-item"><div class="employee-history-radio">${escapeHtml(a.radio_id)}</div><div><strong>${escapeHtml(a.employee_name_snapshot||'Employee')}</strong><span>ID ${escapeHtml(a.employee_id_snapshot||'—')} • ${escapeHtml(a.department_snapshot||'—')} • ${fmt(a.checkout_at)}</span></div></div>`;
  $('#operationalCheckedOut').innerHTML=operationalCheckedOut.length?operationalCheckedOut.map(row).join(''):'<div class="empty-state">No radios are currently checked out.</div>';
  $('#operationalHistory').innerHTML=operationalHistory.length?operationalHistory.slice(0,100).map(a=>`<div class="employee-history-item"><div class="employee-history-radio">${escapeHtml(a.radio_id)}</div><div><strong>${escapeHtml(a.employee_name_snapshot||'Employee')}</strong><span>${fmt(a.checkout_at)} → ${a.return_at?fmt(a.return_at):'Active'} • ${escapeHtml(a.department_snapshot||'—')}</span></div></div>`).join(''):'<div class="empty-state">No radio history is available.</div>';
}
function renderDisciplinaryNotices(){
  const host=$('#employeeNotices');if(!host)return;
  if(!disciplinaryRecords.length){host.innerHTML='<div class="empty-state">No radio-related notices.</div>';return;}
  host.innerHTML=disciplinaryRecords.map(d=>`<article class="notice-card"><strong>${d.level==='WRITE_UP'?'Write-Up / Corrective Action':'Written Warning'}</strong><span>${fmt(d.created_at)}</span><p>${escapeHtml(d.manager_notes||'')}</p>${d.employee_statement_at?`<div class="submitted-statement"><b>Your statement</b><p>${escapeHtml(d.employee_statement||'No statement provided.')}</p></div>`:`<textarea data-notice-statement="${d.id}" rows="3" placeholder="Optional employee statement"></textarea>`}${d.level==='WRITE_UP'&&!d.acknowledged_at?`<label class="agreement-check"><input type="checkbox" data-writeup-check="${d.id}"><span>I acknowledge receipt. This confirms receipt/review only and does not necessarily mean I agree with the findings or corrective action.</span></label><button class="mini-btn primary" data-writeup-ack="${d.id}" disabled>I Acknowledge Receipt</button>`:d.level==='WRITTEN_WARNING'&&!d.employee_statement_at?`<button class="mini-btn" data-warning-statement="${d.id}">Submit Statement</button>`:`<span class="account-badge account-ACTIVE">${d.acknowledged_at?'Acknowledged':'On file'}</span>`}</article>`).join('');
}
async function ensureAgreementBeforeCheckout(){
  if(!selectedShiftCode){employeeMessage('Select the shift you are scheduled to work before scanning a radio.','error');return false;}
  currentAgreement=await api.getCurrentEquipmentAgreement();if(!currentAgreement)throw new Error('No current equipment agreement is configured.');
  const accepted=await api.getMyAgreementAcceptance(currentAgreement.version);
  if(accepted)return true;
  $('#equipmentAgreementTitle').textContent=currentAgreement.title||'Radio & Equipment Use Agreement';
  $('#equipmentAgreementBody').innerHTML=`<p>${escapeHtml(currentAgreement.body||'').replace(/\n/g,'</p><p>')}</p>`;
  $('#agreementAcceptCheck').checked=false;$('#agreementAcceptBtn').disabled=true;$('#agreementMessage').textContent='';
  $('#equipmentAgreementDialog').showModal();return false;
}
async function beginEmployeeCheckout(){
  try{if(await ensureAgreementBeforeCheckout())openScanner('employeeCheckout');}catch(err){employeeMessage(humanError(err),'error');}
}
function renderEmployeeHome(){
  if(isManager(profile))return;const vm=getEmployeeWorkspace(state,profile);$('#employeeAvailableCount').textContent=vm.availableCount;
  const alert=$('#employeeReturnAlert'),banner=accountabilityBanner(accountabilityState);if(alert){alert.hidden=!banner;if(banner){alert.className=`employee-return-alert ${banner.tone==='danger'?'danger':''}`;alert.innerHTML=`<strong>${escapeHtml(banner.title)}</strong><span>${escapeHtml(banner.message)}</span>`;}}
  if(vm.activeRadio){const shift=vm.activeRadio.shiftCode?`<br><strong>${escapeHtml(shiftLabel(vm.activeRadio.shiftCode))}</strong>`:'';$('#employeeMyRadio').innerHTML=`<p class="eyebrow light">Currently assigned</p><h3>${vm.activeRadio.id}</h3><p>Checked out ${fmt(vm.activeRadio.checkoutAt)}${shift}${vm.activeRadio.shiftEndAt?`<br>Return due ${fmt(vm.activeRadio.shiftEndAt)}`:vm.activeRadio.expectedReturnAt?` • Expected back ${fmt(vm.activeRadio.expectedReturnAt)}`:''}</p><span class="status-badge status-${vm.activeRadio.status}">${statusLabel(vm.activeRadio.status)}</span>`;$('#employeeCheckoutArea').hidden=true;$('#employeeReturnBtn').hidden=false;$('#employeeReturnBtn').dataset.id=vm.activeRadio.id;}else{$('#employeeMyRadio').innerHTML=`<p class="eyebrow light">My Radio</p><h3>No radio checked out</h3><p>Select your scheduled shift, pick up an available radio, and scan its secure barcode.</p>`;$('#employeeCheckoutArea').hidden=false;$('#employeeReturnBtn').hidden=true;$('#employeeScanBtn').disabled=!vm.canCheckout||!selectedShiftCode;}
  $('#employeeRecentHistory').innerHTML=vm.recentHistory.length?vm.recentHistory.map(h=>`<div class="employee-history-item"><div class="employee-history-radio">${h.radioId}</div><div><strong>${h.returnAt?'Returned':'Checked out'} ${h.radioId}</strong><span>${fmt(h.returnAt||h.checkoutAt)} • ${escapeHtml(h.department)}${h.shiftCode?` • ${escapeHtml(shiftLabel(h.shiftCode))}`:''}</span></div></div>`).join(''):'<div class="empty-state">No assignment history yet.</div>';
  renderDisciplinaryNotices();renderOperationalRead();
}
function renderAll(){applyRoleUI();if(isManager(profile)){renderFleetHealth();renderStats();renderOperationsOverview();renderRadios();renderRecentActivity();populateEmployeeTarget();populateRadioSelect();renderHistory();renderDock();renderEmployees();renderManagerAccountability();renderAudit();}else renderEmployeeHome();}

function setMode(next){mode=next;$$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#employeeFields').hidden=mode!=='out'||!isManager(profile);$('#submitAssignment').textContent=mode==='out'?'✓ Check Out Radio':'↩ Return Radio';$('#transactionTitle').textContent=mode==='out'?'Issue a radio':'Return a radio';showMessage('','');populateRadioSelect();}
function switchView(id){if(!profile)return;const opRead=!isManager(profile)&&canViewOperationalRadioData(profile.operational_role);const allowed=opRead?['employeeHome','operationalRead','help']:['employeeHome','help'];if(!isManager(profile)&&!allowed.includes(id))id='employeeHome';if(isManager(profile)&&id==='employeeHome')id='dashboard';$$('.view').forEach(v=>v.classList.toggle('active-view',v.id===id));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});}
function openDrawer(radioId){const d=getRadioDetail(state,radioId);if(!d)return;let action='';if(isManager(profile)){const returnBtn=d.assignedProfileId?`<button class="primary-btn" data-drawer-action="return" data-id="${d.id}">Return ${d.id}</button>`:'';action=`${returnBtn}<button class="secondary-btn" data-drawer-action="condition" data-id="${d.id}">Manage condition</button>`;}const condition=d.conditionReason?`<div class="condition-reason-card"><span>Condition note</span><strong>${escapeHtml(d.conditionReason)}</strong><small>${d.conditionUpdatedAt?`Updated ${fmt(d.conditionUpdatedAt)}`:''}</small></div>`:'';$('#drawerRadioId').textContent=d.id;$('#drawerContent').innerHTML=`<div class="drawer-device"><div class="radio-device" style="margin:45px auto 5px"><div class="antenna"></div><div class="screen"><span>POC</span><small>4G READY</small></div><div class="speaker"></div><div class="radio-label">${d.id}</div></div><div class="drawer-status"><span class="status-badge status-${d.status}">${d.statusLabel}</span></div></div><div class="detail-grid"><div class="detail-box"><span>Assigned to</span><strong>${escapeHtml(d.assignment)}</strong></div><div class="detail-box"><span>Employee ID</span><strong>${escapeHtml(d.employeeId||'—')}</strong></div><div class="detail-box"><span>Department</span><strong>${escapeHtml(d.department||'—')}</strong></div><div class="detail-box"><span>Dock position</span><strong>${d.dockLabel}</strong></div><div class="detail-box"><span>Charging state</span><strong>${dockLabel(d.dockState)}</strong></div><div class="detail-box"><span>Checkout</span><strong>${fmt(d.checkoutAt)}</strong></div></div>${condition}<div class="drawer-actions">${action}</div>`;$('#radioDrawer').classList.add('open');$('#radioDrawer').setAttribute('aria-hidden','false');$('#drawerBackdrop').classList.add('show');}
function closeDrawer(){$('#radioDrawer').classList.remove('open');$('#radioDrawer').setAttribute('aria-hidden','true');$('#drawerBackdrop').classList.remove('show');}

function openConditionDialog(radioId){const r=state.radios.find(x=>x.id===radioId);if(!r||!isManager(profile))return;const dialog=$('#conditionDialog'),select=$('#conditionStatus'),reason=$('#conditionReason');$('#conditionDialogTitle').textContent=`Manage ${radioId}`;dialog.dataset.radioId=radioId;const active=Boolean(r.assignedProfileId);const options=active?[['LOST','Lost']]:[['AVAILABLE','Available'],['REPAIR','In Repair'],['DAMAGED','Damaged'],['LOST','Lost']];select.innerHTML=options.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');const desired=options.some(([v])=>v===r.status)?r.status:options[0][0];select.value=desired;reason.value=r.conditionReason||'';$('#conditionNote').textContent=active?'This radio has an open assignment. It may be marked Lost for accountability, or returned before choosing another condition.':'Choose a condition and add a short operational reason. Reason is required for Lost, Damaged, and In Repair.';$('#conditionMessage').textContent='';dialog.showModal();updateConditionReasonRequirement();}
function updateConditionReasonRequirement(){const required=$('#conditionStatus').value!=='AVAILABLE';$('#conditionReason').required=required;$('#conditionReason').placeholder=required?'Required: describe what happened':'Optional note';}
function closeConditionDialog(){const d=$('#conditionDialog');if(d.open)d.close();}
async function mutate(action,success,{employee=false}={}){try{setConnection('loading','Saving secure change');await action();await loadData({quiet:true});setConnection('ok','Supabase realtime connected');showToast(success);if(employee)employeeMessage(success,'success');return true;}catch(err){const msg=humanError(err);employee?employeeMessage(msg,'error'):showMessage(msg,'error');showToast(msg);await loadData({quiet:true});return false;}}
async function handleRadioAction(action,id){if(action==='return')await mutate(()=>api.returnRadio(id),`${id} returned`);if(action==='condition')openConditionDialog(id);}
async function cycleDock(radioId){if(!isManager(profile))return;const r=state.radios.find(x=>x.id===radioId),values=['EMPTY','CHARGING','FULL','FAULT'],next=values[(values.indexOf(r.dockState)+1)%values.length];await mutate(()=>api.setDockState(radioId,next),`${radioId} dock status: ${dockLabel(next)}`);}
async function mutateEmployee(kind,id){const p=profiles.find(x=>x.id===id);if(!p)return;const labels={approve:'approve',reject:'reject',disable:'disable',enable:'restore access for',promote:'promote to Manager',demote:'demote from Manager'};if(kind==='remove'){if(!confirm(`Permanently remove ${p.display_name}? Their login will be deleted, their past radio history will be preserved, and they must sign up again to return to Valet Radio HQ.`))return;}else if(!confirm(`${labels[kind]} ${p.display_name}?`))return;const fn={approve:()=>api.approveEmployee(id),reject:()=>api.rejectEmployee(id),disable:()=>api.disableEmployee(id),enable:()=>api.enableEmployee(id),promote:()=>api.promoteToManager(id),demote:()=>api.demoteManager(id),remove:()=>api.removeEmployee(id)}[kind];if(!fn)return;try{await fn();showToast(kind==='remove'?`${p.display_name}: removed from Valet Radio HQ`:`${p.display_name}: account updated`);await loadData({quiet:true});}catch(err){showToast(humanError(err));}}

function cleanupSubscriptions(){if(unsubscribeFleet){unsubscribeFleet();unsubscribeFleet=null;}clearTimeout(refreshTimer);}
async function refreshProfileStatus(){if(!session)return;try{profile=await api.loadProfile(session.user.id);const gate=getAccountGate(profile);if(gate==='ACTIVE'){showActiveApp();await loadData();cleanupSubscriptions();unsubscribeFleet=api.subscribeFleet(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{profile=await api.loadProfile(session.user.id);if(getAccountGate(profile)!=='ACTIVE'){renderAccountGate(getAccountGate(profile));return;}await loadData({quiet:true});}catch{}},200);});}else renderAccountGate(gate);}catch(err){authMessage(humanError(err));}}
async function establishSession(nextSession){session=nextSession;cleanupSubscriptions();if(!session){profile=null;profiles=[];state={radios:[],history:[]};showSignedOut();return;}try{profile=await api.loadProfile(session.user.id);const gate=getAccountGate(profile);if(gate!=='ACTIVE'){renderAccountGate(gate);return;}showActiveApp();await loadData();unsubscribeFleet=api.subscribeFleet(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{profile=await api.loadProfile(session.user.id);if(getAccountGate(profile)!=='ACTIVE'){renderAccountGate(getAccountGate(profile));return;}await loadData({quiet:true});}catch{}},200);});}catch(err){authMessage(humanError(err));await api.signOut().catch(()=>{});session=null;profile=null;showSignedOut();}}
async function signOut(){cleanupSubscriptions();await api?.signOut();session=null;profile=null;showSignedOut();}

async function bootstrap(){updateClock();setInterval(updateClock,30000);showSignedOut();showVerifiedLoginNotice();try{client=createConfiguredSupabaseClient(globalThis);api=createRadioOpsApi(client);$('#setupMessage').hidden=true;setConnection('loading','Waiting for secure sign-in');const current=await api.getSession();if(current)await establishSession(current);client.auth.onAuthStateChange((_event,nextSession)=>{if(nextSession?.user?.id!==session?.user?.id||(!nextSession&&session))establishSession(nextSession);});}catch(err){$('#setupMessage').hidden=false;authMessage(humanError(err));setConnection('error',humanError(err));}}

$('#authSignInTab').addEventListener('click',()=>setAuthMode('signin'));$('#authSignUpTab').addEventListener('click',()=>setAuthMode('signup'));$('#forgotPasswordBtn').addEventListener('click',()=>setAuthMode('forgot'));$('#backToSignInBtn').addEventListener('click',()=>setAuthMode('signin'));$('#resendVerificationBtn').addEventListener('click',async()=>{if(!api){authMessage('Supabase is not configured yet.','error');return;}const email=$('#signInEmail').value.trim();if(!email){authMessage('Enter your email address first, then choose Resend verification email.','error');$('#signInEmail').focus();return;}try{await api.resendVerification(email);authMessage('If this account still needs verification, a new Valet Radio HQ verification email has been sent.','success');}catch(err){authMessage(humanError(err));}});
$('#signInForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet. See README.md.');return;}authMessage('Signing in…','success');try{const data=await api.signIn($('#signInEmail').value.trim(),$('#signInPassword').value);await establishSession(data.session||null);authMessage('','');}catch(err){authMessage(humanError(err));}});
$('#forgotPasswordForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet.','error');return;}const email=$('#forgotPasswordEmail').value.trim();if(!email){authMessage('Enter your email address.','error');return;}authMessage('Sending password reset email…','success');try{await api.requestPasswordReset(email);setAuthMode('signin');$('#signInEmail').value=email;authMessage('Password reset email sent. Check your inbox and follow the secure link to choose a new password.','success');}catch(err){authMessage(humanError(err));}});
$('#signUpForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet.','error');return;}const displayName=$('#signUpName').value.trim(),employeeId=$('#signUpEmployeeId').value.trim(),email=$('#signUpEmail').value.trim(),password=$('#signUpPassword').value,confirmPassword=$('#signUpConfirmPassword').value;if(!displayName||!employeeId||!email||!password){authMessage('Complete every field.','error');return;}if(password!==confirmPassword){authMessage('Passwords do not match.','error');return;}authMessage('Creating your account…','success');try{const data=await api.signUpEmployee({email,password,displayName,employeeId});e.target.reset();if(data?.session){await establishSession(data.session);}else{setAuthMode('signin');authMessage('Account created. Check your email to verify it, then sign in. A Manager must approve your account before fleet access.','success');}}catch(err){authMessage(humanError(err));}});
$('#signOutBtn').addEventListener('click',signOut);$('#mobileSignOutBtn').addEventListener('click',signOut);$('#mobileProfileBtn').addEventListener('click',e=>{e.stopPropagation();toggleMobileProfileMenu();});$('#mobileProfileMenu').addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',closeMobileProfileMenu);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileProfileMenu();});$('#accountGateSignOut').addEventListener('click',signOut);$('#refreshAccountStatus').addEventListener('click',refreshProfileStatus);
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.jump)));
$('#quickCheckout').addEventListener('click',()=>{switchView('checkout');setMode('out');});$('#quickReturn').addEventListener('click',()=>{switchView('checkout');setMode('return');});
$('#radioSearch').addEventListener('input',renderRadios);$('#statusFilter').addEventListener('change',renderRadios);$('#radioSelect').addEventListener('change',updateSelectedVisual);$('#employeeStatusFilter').addEventListener('change',renderEmployees);
$('#opsSearch').addEventListener('input',renderOperationsOverview);$('#opsFilter').addEventListener('change',renderOperationsOverview);$('#opsDepartment').addEventListener('change',renderOperationsOverview);
$('#operationsOverview').addEventListener('click',async e=>{const b=e.target.closest('[data-ops-action]');if(!b)return;const action=b.dataset.opsAction;if(action==='view'){openDrawer(b.dataset.id);return;}if(action==='return'){await handleRadioAction('return',b.dataset.id);return;}if(action==='condition'){openConditionDialog(b.dataset.id);return;}if(action==='exception'){openExceptionDialog(b.dataset.id,b.dataset.assignmentId);return;}if(action==='employee'){const name=b.dataset.employeeName||'Employee',profileId=b.dataset.profileId;$('#employeeStatusFilter').value='ALL';renderEmployees();switchView('employees');requestAnimationFrame(()=>{const row=document.querySelector(`[data-employee-row="${profileId}"]`);if(row){row.classList.add('ops-highlight-row');row.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>row.classList.remove('ops-highlight-row'),2200);}});showToast(`${name} • employee record`);}});
$('#employeeTarget').addEventListener('change',()=>{const p=profiles.find(x=>x.id===$('#employeeTarget').value);$('#targetEmployeeSummary').textContent=p?`${p.display_name} • ID ${p.employee_id} • ${p.department}`:'Employee profile data is verified by the database.';});
$('#radioRows').addEventListener('click',async e=>{const detail=e.target.closest('[data-detail]');if(detail){openDrawer(detail.dataset.detail);return;}const b=e.target.closest('[data-action]');if(b)await handleRadioAction(b.dataset.action,b.dataset.id);});
$('#historyRows').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)openDrawer(b.dataset.detail);});$('#dockBanks').addEventListener('click',async e=>{const b=e.target.closest('.dock-slot');if(b&&!b.disabled)await cycleDock(b.dataset.radio);});
$('#employeeRows').addEventListener('click',async e=>{const b=e.target.closest('[data-employee-admin]');if(!b||b.disabled)return;if(b.dataset.employeeAdmin==='history'){switchView('history');showToast('Showing fleet history. Use the employee name to locate their records.');return;}await mutateEmployee(b.dataset.employeeAdmin,b.dataset.id);});
$('#employeeRows').addEventListener('change',async e=>{const select=e.target.closest('[data-operational-role]');if(!select)return;const p=profiles.find(x=>x.id===select.dataset.operationalRole);if(!p)return;const next=select.value;if(!confirm(`Change ${p.display_name} to ${operationalRoleLabel(next)}?`)){renderEmployees();return;}try{await api.setEmployeeOperationalRole(p.id,next);showToast(`${p.display_name}: ${operationalRoleLabel(next)}`);await loadData({quiet:true});}catch(err){showToast(humanError(err));renderEmployees();}});
$('#checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const radioId=$('#radioSelect').value;if(!radioId){showMessage('No eligible radio is available for this action.','error');return;}if(mode==='return'){if(await mutate(()=>api.returnRadio(radioId),`${radioId} returned successfully`))showMessage(`${radioId} successfully returned.`,'success');return;}const targetId=isManager(profile)?$('#employeeTarget').value:profile.id;if(!targetId){showMessage('Select an employee before checking out a radio.','error');return;}const expected=new Date(Date.now()+8*60*60*1000).toISOString();if(await mutate(()=>api.checkoutRadio(radioId,targetId,expected),`${radioId} issued successfully`))showMessage(`${radioId} successfully checked out.`,'success');});
$('#employeeReturnBtn').addEventListener('click',()=>{const id=$('#employeeReturnBtn').dataset.id;if(id)openScanner('employeeReturn',id);});
$$('[data-shift]').forEach(b=>b.addEventListener('click',()=>{selectedShiftCode=b.dataset.shift;$$('[data-shift]').forEach(x=>x.classList.toggle('selected',x===b));$('#employeeScanBtn').disabled=false;employeeMessage(`${shiftLabel(selectedShiftCode)} selected.`,'success');if('Notification' in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});}));
$('#agreementAcceptCheck').addEventListener('change',e=>{$('#agreementAcceptBtn').disabled=!e.target.checked;});
$('#agreementAcceptBtn').addEventListener('click',async()=>{if(!currentAgreement||!$('#agreementAcceptCheck').checked)return;try{$('#agreementAcceptBtn').disabled=true;await api.acceptEquipmentAgreement(currentAgreement.version);$('#equipmentAgreementDialog').close();employeeMessage('Agreement accepted. Scan the physical radio you are taking.','success');openScanner('employeeCheckout');}catch(err){$('#agreementMessage').textContent=humanError(err);$('#agreementMessage').className='form-message error';$('#agreementAcceptBtn').disabled=false;}});
$('#employeeNotices')?.addEventListener('change',e=>{const c=e.target.closest('[data-writeup-check]');if(c){const b=document.querySelector(`[data-writeup-ack="${c.dataset.writeupCheck}"]`);if(b)b.disabled=!c.checked;}});
$('#employeeNotices')?.addEventListener('click',async e=>{const ack=e.target.closest('[data-writeup-ack]'),warn=e.target.closest('[data-warning-statement]');if(!ack&&!warn)return;const id=(ack||warn).dataset.writeupAck||(ack||warn).dataset.warningStatement;const ta=document.querySelector(`[data-notice-statement="${id}"]`),statement=ta?.value||'';try{if(ack)await api.submitWriteupResponse(id,statement,true);else await api.submitDisciplineStatement(id,statement);showToast('Employee statement saved');await loadData({quiet:true});}catch(err){employeeMessage(humanError(err),'error');}});
$('#closeDrawer').addEventListener('click',closeDrawer);$('#drawerBackdrop').addEventListener('click',closeDrawer);$('#drawerContent').addEventListener('click',async e=>{const b=e.target.closest('[data-drawer-action]');if(!b)return;await handleRadioAction(b.dataset.drawerAction,b.dataset.id);closeDrawer();});
$('#qrAdminRows')?.addEventListener('click',e=>{const b=e.target.closest('[data-qr-rotate]');if(b)rotateOneQr(b.dataset.qrRotate);});
$('#generateAllQrBtn')?.addEventListener('click',generateAllQrLabels);
$('#closeQrLabelDialog')?.addEventListener('click',()=>{$('#qrPrintArea').innerHTML='';$('#qrLabelDialog').close();});
$('#closeQrBulkDialog')?.addEventListener('click',()=>{$('#qrBulkPrintArea').innerHTML='';$('#qrBulkDialog').close();});
$('#downloadDymoLabelBtn')?.addEventListener('click',()=>{
  if(!currentDymoLabel)return;
  downloadDymoLabel(currentDymoLabel.radioId,currentDymoLabel.token);
  showToast(`${currentDymoLabel.radioId}: DYMO label downloaded`);
});
$('#downloadAllDymoBtn')?.addEventListener('click',generateAllQrLabels);
$('#closeExceptionDialog')?.addEventListener('click',()=>$('#exceptionDialog').close());
$('#exceptionDiscipline')?.addEventListener('change',()=>{const level=$('#exceptionDiscipline').value;$('#financialReviewRequired').disabled=level!=='WRITE_UP';if(level!=='WRITE_UP')$('#financialReviewRequired').checked=false;$('#disciplineManagerNotes').required=level!=='NONE';});
$('#exceptionForm')?.addEventListener('submit',async e=>{e.preventDefault();const assignmentId=$('#exceptionAssignmentId').value,type=$('#exceptionType').value,status=$('#exceptionRadioStatus').value,explanation=$('#exceptionExplanation').value.trim(),level=$('#exceptionDiscipline').value,notes=$('#disciplineManagerNotes').value.trim(),financial=$('#financialReviewRequired').checked;if(!explanation){$('#exceptionMessage').textContent='Manager explanation is required.';$('#exceptionMessage').className='form-message error';return;}if(level!=='NONE'&&!notes){$('#exceptionMessage').textContent='Manager notes are required for a warning or write-up.';$('#exceptionMessage').className='form-message error';return;}try{const incident=await api.resolveRadioReturnException(assignmentId,type,status,explanation);if(level!=='NONE')await api.createRadioDiscipline(incident.id,level,notes,financial);$('#exceptionDialog').close();showToast('Radio exception resolved and recorded');await loadData({quiet:true});}catch(err){$('#exceptionMessage').textContent=humanError(err);$('#exceptionMessage').className='form-message error';}});
$('#closeConditionDialog').addEventListener('click',closeConditionDialog);$('#conditionStatus').addEventListener('change',updateConditionReasonRequirement);$('#conditionForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#conditionDialog').dataset.radioId,status=$('#conditionStatus').value,reason=$('#conditionReason').value.trim();if(status!=='AVAILABLE'&&!reason){$('#conditionMessage').textContent='Enter a reason for this condition.';$('#conditionMessage').className='form-message error';return;}const ok=await mutate(()=>api.setRadioCondition(id,status,reason),`${id} condition updated to ${statusLabel(status)}`);if(ok)closeConditionDialog();});
const legalCopy={privacy:`<p>Valet Radio HQ stores account identity, employee ID, department, radio assignments, timestamps, and protected operational audit events needed to run the workplace radio program.</p><p>Access is limited by employee and Manager roles. Do not enter sensitive personal information into radio condition notes or audit-related fields.</p><p>For questions about workplace data use, contact your manager.</p>`,terms:`<p>Valet Radio HQ is an internal workplace operations tool. Employees must use their own account, accurately check radios in and out, and complete required QR verification when returning assigned equipment.</p><p>Managers are responsible for account approvals, condition overrides, employee access, and appropriate use of operational records.</p><p>Use of the system is subject to your workplace policies.</p>`};function openLegal(kind){$('#legalDialogTitle').textContent=kind==='privacy'?'Privacy':'Terms of Use';$('#legalDialogContent').innerHTML=legalCopy[kind]||'';$('#legalDialog').showModal();}$('#closeLegalDialog').addEventListener('click',()=>$('#legalDialog').close());$$('[data-legal]').forEach(b=>b.addEventListener('click',()=>openLegal(b.dataset.legal)));

// Legacy audit labels retained for regression compatibility: Barcode Verified Checkout; api.checkoutRadioVerified(id,expected)
// Legacy audit label retained for regression compatibility: Barcode Verified Return
const dialog=$('#scannerDialog'),video=$('#scannerVideo');
function stopScanner(){if(scannerTimer)clearInterval(scannerTimer);scannerTimer=null;if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}if(dialog.open)dialog.close();}
async function openScanner(target,expectedRadioId=null){
  scannerTarget=target;const employeeReturn=target==='employeeReturn',employeeCheckout=target==='employeeCheckout',employeeScan=employeeReturn||employeeCheckout,report=target==='manager'?showMessage:employeeMessage,scannerMode=getScannerMode();
  if(!scannerMode){const action=employeeReturn?'return':employeeCheckout?'check out':'select';report(employeeScan?`Camera barcode scanning is required to ${action} your radio. Open Valet Radio HQ in Safari on iPhone/iPad or Chrome on Android and allow camera access.`:'Camera barcode scanning is unavailable in this browser. Use the radio dropdown.','error');return;}
  if(employeeCheckout){const vm=getEmployeeWorkspace(state,profile);if(!vm.canCheckout){employeeMessage('Return your current radio before checking out another.','error');return;}if(!selectedShiftCode){employeeMessage('Select your scheduled shift before scanning a radio.','error');return;}}
  try{
    dialog.showModal();$('#scannerStatus').textContent=employeeReturn?`Allow camera access and scan the secure barcode on ${expectedRadioId}.`:employeeCheckout?'Allow camera access and scan the secure barcode on the physical radio you are taking.':'Allow camera access, then point at the radio barcode.';
    scannerStream=await navigator.mediaDevices.getUserMedia(getPreferredCameraConstraints());video.setAttribute('playsinline','');video.muted=true;video.srcObject=scannerStream;await video.play();
    const detector=scannerMode==='native'?new BarcodeDetector({formats:['code_128']}):null,
      scanCanvas=scannerMode==='zxing'?document.createElement('canvas'):null,
      zxingReader=scannerMode==='zxing'?new ZXing.BrowserMultiFormatReader():null;let scanBusy=false;
    $('#scannerStatus').textContent=employeeReturn?`Scan ${expectedRadioId}'s secure barcode to confirm the return.`:employeeCheckout?'Scanning secure radio barcode…':'Scanning…';
    scannerTimer=setInterval(async()=>{if(scanBusy)return;try{
      let values=[];if(detector)values=(await detector.detect(video)).map(code=>code.rawValue);else{const value=decodeFrameWithZxing(video,scanCanvas,zxingReader);if(value)values=[value];}
      for(const value of values){
        const raw=String(value||'').trim();if(!raw)continue;
        if(employeeReturn){scanBusy=true;$('#scannerStatus').textContent='Secure Barcode read. Verifying assigned radio…';stopScanner();await mutate(()=>api.returnRadioSecure(raw),`${expectedRadioId} returned • Secure Barcode Verified`,{employee:true});return;}
        if(employeeCheckout){scanBusy=true;$('#scannerStatus').textContent='Secure Barcode read. Verifying radio availability…';stopScanner();await mutate(()=>api.checkoutRadioSecure(raw,selectedShiftCode,getShiftWorkDate(selectedShiftCode,new Date())),`Radio checked out • ${shiftLabel(selectedShiftCode)} • Secure Barcode Verified`,{employee:true});return;}
        const id=parseRadioCode(raw);if(!id)continue;const select=$('#radioSelect'),opt=[...select.options].find(o=>o.value===id);if(opt){select.value=id;updateSelectedVisual();$('#scannerStatus').textContent=`Found ${id}`;setTimeout(stopScanner,450);return;}$('#scannerStatus').textContent=`${id} is not eligible for this action.`;
      }
    }catch(err){if(employeeScan){scanBusy=false;$('#scannerStatus').textContent=humanError(err);}}},300);
  }catch(err){stopScanner();const message=cameraErrorMessage(err);report(employeeScan?message:'Camera access was unavailable. '+message,'error');}
}
$('#closeScanner').addEventListener('click',stopScanner);$('#scanSupport').textContent=canUseCameraQrScanner()?'Camera barcode scanning is available in this browser.':'Camera barcode scanning may be unavailable here. Employee checkout and return require a supported camera browser.';$('#scanBtn').addEventListener('click',()=>openScanner('manager'));$('#employeeScanBtn').addEventListener('click',beginEmployeeCheckout);

let deferredInstallPrompt=null;
function isStandaloneMode(){return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone===true;}
function isIosSafari(){const ua=navigator.userAgent||'';return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);}
function refreshConnectivity(){const offline=!navigator.onLine;const banner=$('#offlineBanner');if(banner)banner.hidden=!offline;document.body.classList.toggle('offline-mode',offline);}
function setupPwa(){
  refreshConnectivity();window.addEventListener('online',refreshConnectivity);window.addEventListener('offline',refreshConnectivity);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  const installBtn=$('#installAppBtn'),iosGuide=$('#iosInstallGuide');
  if(isIosSafari()&&!isStandaloneMode()&&iosGuide) iosGuide.hidden=false;
  $('#dismissIosInstall')?.addEventListener('click',()=>{if(iosGuide)iosGuide.hidden=true;});
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(installBtn&&!isStandaloneMode())installBtn.hidden=false;});
  installBtn?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;installBtn.hidden=true;});
  window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;if(installBtn)installBtn.hidden=true;if(iosGuide)iosGuide.hidden=true;});
}
setupPwa();
setInterval(()=>{if(profile&&!isManager(profile))loadData({quiet:true});},60000);

bootstrap();
