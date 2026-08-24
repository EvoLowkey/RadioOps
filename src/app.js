import { createConfiguredSupabaseClient } from './supabase-client.js';
import { createRadioOpsApi } from './api.js';
import { isManager, getAccountGate } from './permissions.js';
import { parseRadioCode, canUseCameraQrScanner, getScannerMode, matchesAssignedRadio, getPreferredCameraConstraints, cameraErrorMessage, decodeFrameWithJsQr } from './scanner.js';
import {
  filterRadios, sortHistoryNewestFirst, getDockBank, getRecentActivity,
  getFleetHealth, getDockCounts, getRadioDetail, buildProductionState,
  summarizeEmployees, filterEmployeesByStatus, getEmployeeWorkspace
} from './view-models.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt=iso=>iso?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)):'—';
const statusLabel=s=>({AVAILABLE:'AVAILABLE',IN_USE:'IN USE',OVERDUE:'OVERDUE',REPAIR:'IN REPAIR'}[s]||s);
const dockLabel=s=>({EMPTY:'Empty',CHARGING:'Charging',FULL:'Full',FAULT:'Fault'}[s]||s);
const approvalLabel=s=>({PENDING:'Pending',ACTIVE:'Active',DISABLED:'Disabled',REJECTED:'Rejected'}[s]||s);

let client=null,api=null,session=null,profile=null,profiles=[],auditEvents=[];
let state={radios:[],history:[]},mode='out',scannerTarget='manager',scannerStream=null,scannerTimer=null,toastTimer=null,unsubscribeFleet=null,refreshTimer=null;

function updateClock(){if($('#systemTime'))$('#systemTime').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date());}
function showToast(text){const el=$('#toast');if(!el)return;el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}
function showMessage(text,type='success'){const el=$('#formMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function employeeMessage(text,type='success'){const el=$('#employeeActionMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
function authMessage(text,type='error'){const el=$('#authMessage');if(!el)return;el.textContent=text;el.className=`form-message ${type}`;}
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
  if(err?.code==='CONFIG_MISSING')return 'RadioOps needs its Supabase connection configured before sign-in.';
  if(/employee id.*already|duplicate|unique/i.test(msg))return 'That Employee ID is already registered. Contact a Manager.';
  return msg||'The operation could not be completed. Please try again.';
}

function setAuthMode(next){
  const signup=next==='signup';
  $('#signInForm').hidden=signup;$('#signUpForm').hidden=!signup;
  $('#authSignInTab').classList.toggle('active',!signup);$('#authSignUpTab').classList.toggle('active',signup);
  $('#authTitle').textContent=signup?'Create your employee account':'Sign in to RadioOps';
  $('#authCopy').textContent=signup?'Use any email address. Your account stays pending until a RadioOps Manager approves it.':'Use your workplace account to check radios in and out and keep the fleet synchronized across devices.';
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
    DISABLED:['!','Access disabled','Account access is disabled','Contact a workplace Manager to restore your RadioOps access.']
  }[kind]||['!','Account status','Access unavailable','Contact a workplace Manager.'];
  $('#authGate').hidden=true;$('.app-frame').hidden=true;$('#accountGate').hidden=false;
  $('#accountGateIcon').textContent=data[0];$('#accountGateEyebrow').textContent=data[1];$('#accountGateTitle').textContent=data[2];$('#accountGateMessage').textContent=data[3];
  $('#accountGateDetails').innerHTML=[['Name',profile?.display_name],['Employee ID',profile?.employee_id],['Department',profile?.department],['Email',profile?.email||session?.user?.email]].map(([k,v])=>`<div class="account-detail"><span>${k}</span><strong>${escapeHtml(v||'—')}</strong></div>`).join('');
}
function applyRoleUI(){
  if(!profile)return;const manager=isManager(profile);
  $$('.manager-only').forEach(el=>el.hidden=!manager);$$('.employee-only').forEach(el=>el.hidden=manager);
  $('#employeeFields').hidden=!manager||mode!=='out';
  const identityRole=`${manager?'Manager':'Employee'} • ${profile.department}`;const initials=profile.display_name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  $('#identityName').textContent=profile.display_name;$('#identityRole').textContent=identityRole;$('#mobileProfileName').textContent=profile.display_name;$('#mobileProfileRole').textContent=identityRole;
  $('#identityAvatar').textContent=initials;const mobileAvatar=document.querySelector('.mobile-profile-avatar');if(mobileAvatar)mobileAvatar.textContent=initials;
  if($('#employeeWorkspace'))$('#employeeWorkspace').hidden=true;
}

function mapProfiles(){return new Map(profiles.map(p=>[p.id,p]));}
async function loadData({quiet=false}={}){
  if(!api||!profile||getAccountGate(profile)!=='ACTIVE')return;
  if(!quiet)setConnection('loading','Refreshing secure cloud data');
  try{
    const manager=isManager(profile);
    const [radios,assignments,profileRows,auditRows]=await Promise.all([
      api.listRadios(),api.listAssignments(manager?null:profile.id),manager?api.listProfiles():Promise.resolve([profile]),manager?api.listAuditEvents():Promise.resolve([])
    ]);
    profiles=profileRows;auditEvents=auditRows;state=buildProductionState({radios,assignments,profiles,profile,now:new Date()});
    renderAll();setConnection('ok','Supabase realtime connected');
  }catch(err){setConnection('error',humanError(err));if(!quiet)showToast(humanError(err));}
}

function renderFleetHealth(){if(!isManager(profile))return;if(!state.radios.length){$('#fleetHealth').innerHTML='<div class="empty-state">Loading fleet…</div>';return;}const h=getFleetHealth(state);$('#fleetHealth').innerHTML=`<div class="health-head"><strong>Fleet Health</strong><span>${h.utilization}% deployed</span></div><div class="health-meter"><span style="width:${Math.max(4,100-h.attention/state.radios.length*100)}%"></span></div><div class="health-grid"><div><strong>${h.ready}</strong><span>Ready</span></div><div><strong>${h.active}</strong><span>Active</span></div><div><strong>${h.attention}</strong><span>Needs attention</span></div></div>`;}
function renderStats(){if(!isManager(profile))return;const c={total:state.radios.length,available:state.radios.filter(r=>r.status==='AVAILABLE').length,checkedOut:state.radios.filter(r=>r.status==='IN_USE').length,overdue:state.radios.filter(r=>r.status==='OVERDUE').length,repair:state.radios.filter(r=>r.status==='REPAIR').length};const items=[['total','▦','TOTAL RADIOS',c.total],['available','✓','AVAILABLE',c.available],['checked','⇄','CHECKED OUT',c.checkedOut],['overdue','!','OVERDUE',c.overdue],['repair','⌁','IN REPAIR',c.repair]];$('#statGrid').innerHTML=items.map(([k,i,l,v])=>`<div class="stat-card ${k}"><div class="stat-icon">${i}</div><div><span class="label">${l}</span><span class="value">${v}</span></div></div>`).join('');}
function radioAction(r){if(!isManager(profile))return '';if(r.status==='AVAILABLE')return `<button class="table-action" data-action="repair" data-id="${r.id}">Repair</button>`;if(r.status==='REPAIR')return `<button class="table-action" data-action="ready" data-id="${r.id}">Mark Ready</button>`;return `<button class="table-action" data-action="return" data-id="${r.id}">Return</button>`;}
function renderRadios(){if(!isManager(profile))return;const rows=filterRadios(state.radios,$('#radioSearch').value,$('#statusFilter').value);$('#radioRows').innerHTML=rows.map(r=>`<tr><td><button class="radio-link" data-detail="${r.id}">${r.id}</button></td><td><div class="employee-cell"><strong>${escapeHtml(r.employeeName||'Unassigned')}</strong><span>${escapeHtml(r.employeeId?`ID ${r.employeeId}`:(r.assignedProfileId?'Assigned employee':'No employee'))}</span></div></td><td>${escapeHtml(r.department||'—')}</td><td>${fmt(r.checkoutAt)}</td><td><span class="dock-badge dock-${r.dockState}">${dockLabel(r.dockState)}</span></td><td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td><td>${radioAction(r)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No radios match this filter.</td></tr>';}
function renderRecentActivity(){if(!isManager(profile))return;const rows=getRecentActivity(state.history,5);$('#recentActivity').innerHTML=rows.length?rows.map(h=>`<div class="activity-item"><div class="activity-icon">${h.radioId.replace('WT-','')}</div><div class="activity-copy"><strong>${h.radioId} • ${escapeHtml(h.employeeName)}</strong><span>${escapeHtml(h.department)} • ${h.returnAt?'Returned':'Checked out'}</span></div><span class="activity-time">${fmt(h.returnAt||h.checkoutAt)}</span></div>`).join(''):'<div class="empty-state">No radio activity yet.</div>';}
function populateEmployeeTarget(){if(!isManager(profile))return;const select=$('#employeeTarget'),current=select.value;select.innerHTML='<option value="">Select employee</option>'+profiles.filter(p=>p.is_active&&((p.approval_status||'ACTIVE')==='ACTIVE')).map(p=>`<option value="${p.id}">${escapeHtml(p.display_name)} • ${escapeHtml(p.employee_id)} • ${escapeHtml(p.department)}</option>`).join('');if(profiles.some(p=>p.id===current))select.value=current;}
function eligibleRadios(){if(mode==='out')return state.radios.filter(r=>r.status==='AVAILABLE');return state.radios.filter(r=>['IN_USE','OVERDUE'].includes(r.status)&&(isManager(profile)||r.assignedProfileId===profile.id));}
function populateRadioSelect(){const list=eligibleRadios(),select=$('#radioSelect'),current=select.value;select.innerHTML=list.map(r=>`<option value="${r.id}">${r.id}${r.employeeName?` — ${escapeHtml(r.employeeName)}`:''}</option>`).join('');if(list.some(r=>r.id===current))select.value=current;updateSelectedVisual();}
function updateSelectedVisual(){const id=$('#radioSelect').value||'—';$('#qrSelectedLabel').textContent=id;$('#heroRadioId').textContent=id;}
function renderHistory(){if(!isManager(profile))return;const rows=sortHistoryNewestFirst(state.history);$('#historyRows').innerHTML=rows.map(h=>`<tr><td><button class="radio-link" data-detail="${h.radioId}">${h.radioId}</button></td><td>${escapeHtml(h.employeeName)}</td><td>${escapeHtml(h.employeeId)}</td><td>${escapeHtml(h.department)}</td><td>${fmt(h.checkoutAt)}</td><td>${fmt(h.returnAt)}</td><td><span class="history-state">${h.returnAt?'Closed':'Active'}</span></td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No assignment history is available.</td></tr>';}
function renderDock(){if(!isManager(profile))return;const totals=getDockCounts(state.radios);$('#dockSummary').innerHTML=Object.entries(totals).map(([k,v])=>`<div class="summary-chip"><span class="dock-badge dock-${k}">${dockLabel(k)}</span><strong>${v}</strong><span>radios</span></div>`).join('');$('#dockBanks').innerHTML=['A','B'].map(bank=>{const radios=state.radios.filter(r=>getDockBank(r.dockSlot)===bank);const range=bank==='A'?'Slots 01–20':'Slots 21–40';return `<div class="dock-bank"><div class="dock-bank-head"><div><h3>Charging Bank ${bank}</h3><p>${range} • tap a slot to cycle state</p></div><span class="bank-pill">20 positions</span></div><div class="slot-grid">${radios.map(r=>`<button class="dock-slot" data-radio="${r.id}" title="${r.id}: ${r.dockState}"><span class="slot-number">SLOT ${String(r.dockSlot).padStart(2,'0')}</span><div class="slot-radio">${r.id}</div><span class="slot-light ${r.dockState}"></span><span class="slot-state">${dockLabel(r.dockState)}</span></button>`).join('')}</div></div>`;}).join('');}
function renderAudit(){if(!isManager(profile))return;const pm=mapProfiles();$('#auditRows').innerHTML=auditEvents.slice(0,250).map(e=>`<tr><td>${fmt(e.created_at)}</td><td><span class="history-state">${escapeHtml(e.event_type.replaceAll('_',' '))}</span></td><td>${escapeHtml(e.radio_id||'—')}</td><td>${escapeHtml(pm.get(e.actor_profile_id)?.display_name||e.actor_profile_id||'System')}</td><td><code class="audit-meta">${escapeHtml(JSON.stringify(e.metadata||{}))}</code></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">No audit events yet.</td></tr>';}

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
    }else if(status==='PENDING')actions=`<button class="mini-btn primary" data-employee-admin="approve" data-id="${p.id}">Approve</button><button class="mini-btn danger" data-employee-admin="reject" data-id="${p.id}">Reject</button>`;
    else if(status==='ACTIVE')actions=`<button class="mini-btn" data-employee-admin="history" data-id="${p.id}">View History</button><button class="mini-btn primary" data-employee-admin="promote" data-id="${p.id}">Promote to Manager</button><button class="mini-btn danger" data-employee-admin="disable" data-id="${p.id}" ${radio?'disabled title="Return assigned radio first"':''}>Disable</button>`;
    else actions=`<button class="mini-btn primary" data-employee-admin="enable" data-id="${p.id}">Restore Access</button>`;
    const roleText=p.role==='MANAGER'?' • Manager':'';return `<tr><td><div class="employee-name-cell"><strong>${escapeHtml(p.display_name)}</strong><span>${escapeHtml(p.email||'No email')}${roleText}</span></div></td><td>${escapeHtml(p.employee_id)}</td><td>${escapeHtml(p.department)}</td><td>${escapeHtml(p.email||'—')}</td><td><span class="account-badge account-${status}">${approvalLabel(status)}</span></td><td>${radio?`<strong>${radio.id}</strong><br><small>${fmt(radio.checkoutAt)}</small>`:'—'}</td><td>${fmt(p.created_at)}</td><td><div class="employee-actions">${actions}</div></td></tr>`;}).join('')||'<tr><td colspan="8" class="empty-state">No people match this filter.</td></tr>';
}
function renderEmployeeHome(){
  if(isManager(profile))return;const vm=getEmployeeWorkspace(state,profile);$('#employeeAvailableCount').textContent=vm.availableCount;
  if(vm.activeRadio){$('#employeeMyRadio').innerHTML=`<p class="eyebrow light">Currently assigned</p><h3>${vm.activeRadio.id}</h3><p>Checked out ${fmt(vm.activeRadio.checkoutAt)}${vm.activeRadio.expectedReturnAt?` • Expected back ${fmt(vm.activeRadio.expectedReturnAt)}`:''}</p><span class="status-badge status-${vm.activeRadio.status}">${statusLabel(vm.activeRadio.status)}</span>`;$('#employeeCheckoutArea').hidden=true;$('#employeeReturnBtn').hidden=false;$('#employeeReturnBtn').dataset.id=vm.activeRadio.id;}else{$('#employeeMyRadio').innerHTML=`<p class="eyebrow light">My Radio</p><h3>No radio checked out</h3><p>Select an available radio below or scan its QR code.</p>`;$('#employeeCheckoutArea').hidden=false;$('#employeeReturnBtn').hidden=true;const select=$('#employeeRadioSelect'),current=select.value;select.innerHTML=vm.availableRadios.map(r=>`<option value="${r.id}">${r.id}</option>`).join('');if(vm.availableRadios.some(r=>r.id===current))select.value=current;$('#employeeCheckoutBtn').disabled=!vm.canCheckout;}
  $('#employeeRecentHistory').innerHTML=vm.recentHistory.length?vm.recentHistory.map(h=>`<div class="employee-history-item"><div class="employee-history-radio">${h.radioId}</div><div><strong>${h.returnAt?'Returned':'Checked out'} ${h.radioId}</strong><span>${fmt(h.returnAt||h.checkoutAt)} • ${escapeHtml(h.department)}</span></div></div>`).join(''):'<div class="empty-state">No assignment history yet.</div>';
}
function renderAll(){applyRoleUI();if(isManager(profile)){renderFleetHealth();renderStats();renderRadios();renderRecentActivity();populateEmployeeTarget();populateRadioSelect();renderHistory();renderDock();renderEmployees();renderAudit();}else renderEmployeeHome();}

function setMode(next){mode=next;$$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#employeeFields').hidden=mode!=='out'||!isManager(profile);$('#submitAssignment').textContent=mode==='out'?'✓ Check Out Radio':'↩ Return Radio';$('#transactionTitle').textContent=mode==='out'?'Issue a radio':'Return a radio';showMessage('','');populateRadioSelect();}
function switchView(id){if(!profile)return;if(!isManager(profile)&&id!=='employeeHome')id='employeeHome';if(isManager(profile)&&id==='employeeHome')id='dashboard';$$('.view').forEach(v=>v.classList.toggle('active-view',v.id===id));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});}
function openDrawer(radioId){const d=getRadioDetail(state,radioId);if(!d)return;let action='';if(isManager(profile)){action=['IN_USE','OVERDUE'].includes(d.status)?`<button class="primary-btn" data-drawer-action="return" data-id="${d.id}">Return ${d.id}</button>`:d.status==='AVAILABLE'?`<button class="secondary-btn" data-drawer-action="repair" data-id="${d.id}">Mark for repair</button>`:`<button class="secondary-btn" data-drawer-action="ready" data-id="${d.id}">Mark ready</button>`;}$('#drawerRadioId').textContent=d.id;$('#drawerContent').innerHTML=`<div class="drawer-device"><div class="radio-device" style="margin:45px auto 5px"><div class="antenna"></div><div class="screen"><span>POC</span><small>4G READY</small></div><div class="speaker"></div><div class="radio-label">${d.id}</div></div><div class="drawer-status"><span class="status-badge status-${d.status}">${d.statusLabel}</span></div></div><div class="detail-grid"><div class="detail-box"><span>Assigned to</span><strong>${escapeHtml(d.assignment)}</strong></div><div class="detail-box"><span>Employee ID</span><strong>${escapeHtml(d.employeeId||'—')}</strong></div><div class="detail-box"><span>Department</span><strong>${escapeHtml(d.department||'—')}</strong></div><div class="detail-box"><span>Dock position</span><strong>${d.dockLabel}</strong></div><div class="detail-box"><span>Charging state</span><strong>${dockLabel(d.dockState)}</strong></div><div class="detail-box"><span>Checkout</span><strong>${fmt(d.checkoutAt)}</strong></div></div><div class="drawer-actions">${action}</div>`;$('#radioDrawer').classList.add('open');$('#radioDrawer').setAttribute('aria-hidden','false');$('#drawerBackdrop').classList.add('show');}
function closeDrawer(){$('#radioDrawer').classList.remove('open');$('#radioDrawer').setAttribute('aria-hidden','true');$('#drawerBackdrop').classList.remove('show');}

async function mutate(action,success,{employee=false}={}){try{setConnection('loading','Saving secure change');await action();await loadData({quiet:true});setConnection('ok','Supabase realtime connected');showToast(success);if(employee)employeeMessage(success,'success');return true;}catch(err){const msg=humanError(err);employee?employeeMessage(msg,'error'):showMessage(msg,'error');showToast(msg);await loadData({quiet:true});return false;}}
async function handleRadioAction(action,id){if(action==='return')await mutate(()=>api.returnRadio(id),`${id} returned`);if(action==='repair')await mutate(()=>api.setRepairState(id,true),`${id} moved to repair`);if(action==='ready')await mutate(()=>api.setRepairState(id,false),`${id} restored to service`);}
async function cycleDock(radioId){if(!isManager(profile))return;const r=state.radios.find(x=>x.id===radioId),values=['EMPTY','CHARGING','FULL','FAULT'],next=values[(values.indexOf(r.dockState)+1)%values.length];await mutate(()=>api.setDockState(radioId,next),`${radioId} dock status: ${dockLabel(next)}`);}
async function mutateEmployee(kind,id){const p=profiles.find(x=>x.id===id);if(!p)return;const labels={approve:'approve',reject:'reject',disable:'disable',enable:'restore access for',promote:'promote to Manager',demote:'demote from Manager'};if(!confirm(`${labels[kind]} ${p.display_name}?`))return;const fn={approve:()=>api.approveEmployee(id),reject:()=>api.rejectEmployee(id),disable:()=>api.disableEmployee(id),enable:()=>api.enableEmployee(id),promote:()=>api.promoteToManager(id),demote:()=>api.demoteManager(id)}[kind];if(!fn)return;try{await fn();showToast(`${p.display_name}: account updated`);await loadData({quiet:true});}catch(err){showToast(humanError(err));}}

function cleanupSubscriptions(){if(unsubscribeFleet){unsubscribeFleet();unsubscribeFleet=null;}clearTimeout(refreshTimer);}
async function refreshProfileStatus(){if(!session)return;try{profile=await api.loadProfile(session.user.id);const gate=getAccountGate(profile);if(gate==='ACTIVE'){showActiveApp();await loadData();cleanupSubscriptions();unsubscribeFleet=api.subscribeFleet(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{profile=await api.loadProfile(session.user.id);if(getAccountGate(profile)!=='ACTIVE'){renderAccountGate(getAccountGate(profile));return;}await loadData({quiet:true});}catch{}},200);});}else renderAccountGate(gate);}catch(err){authMessage(humanError(err));}}
async function establishSession(nextSession){session=nextSession;cleanupSubscriptions();if(!session){profile=null;profiles=[];state={radios:[],history:[]};showSignedOut();return;}try{profile=await api.loadProfile(session.user.id);const gate=getAccountGate(profile);if(gate!=='ACTIVE'){renderAccountGate(gate);return;}showActiveApp();await loadData();unsubscribeFleet=api.subscribeFleet(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{profile=await api.loadProfile(session.user.id);if(getAccountGate(profile)!=='ACTIVE'){renderAccountGate(getAccountGate(profile));return;}await loadData({quiet:true});}catch{}},200);});}catch(err){authMessage(humanError(err));await api.signOut().catch(()=>{});session=null;profile=null;showSignedOut();}}
async function signOut(){cleanupSubscriptions();await api?.signOut();session=null;profile=null;showSignedOut();}

async function bootstrap(){updateClock();setInterval(updateClock,30000);showSignedOut();try{client=createConfiguredSupabaseClient(globalThis);api=createRadioOpsApi(client);$('#setupMessage').hidden=true;setConnection('loading','Waiting for secure sign-in');const current=await api.getSession();if(current)await establishSession(current);client.auth.onAuthStateChange((_event,nextSession)=>{if(nextSession?.user?.id!==session?.user?.id||(!nextSession&&session))establishSession(nextSession);});}catch(err){$('#setupMessage').hidden=false;authMessage(humanError(err));setConnection('error',humanError(err));}}

$('#authSignInTab').addEventListener('click',()=>setAuthMode('signin'));$('#authSignUpTab').addEventListener('click',()=>setAuthMode('signup'));
$('#signInForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet. See README.md.');return;}authMessage('Signing in…','success');try{const data=await api.signIn($('#signInEmail').value.trim(),$('#signInPassword').value);await establishSession(data.session||null);authMessage('','');}catch(err){authMessage(humanError(err));}});
$('#signUpForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet.','error');return;}const displayName=$('#signUpName').value.trim(),employeeId=$('#signUpEmployeeId').value.trim(),email=$('#signUpEmail').value.trim(),password=$('#signUpPassword').value,confirmPassword=$('#signUpConfirmPassword').value;if(!displayName||!employeeId||!email||!password){authMessage('Complete every field.','error');return;}if(password!==confirmPassword){authMessage('Passwords do not match.','error');return;}authMessage('Creating your account…','success');try{const data=await api.signUpEmployee({email,password,displayName,employeeId});e.target.reset();if(data?.session){await establishSession(data.session);}else{setAuthMode('signin');authMessage('Account created. Check your email to verify it, then sign in. A Manager must approve your account before fleet access.','success');}}catch(err){authMessage(humanError(err));}});
$('#signOutBtn').addEventListener('click',signOut);$('#mobileSignOutBtn').addEventListener('click',signOut);$('#mobileProfileBtn').addEventListener('click',e=>{e.stopPropagation();toggleMobileProfileMenu();});$('#mobileProfileMenu').addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',closeMobileProfileMenu);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileProfileMenu();});$('#accountGateSignOut').addEventListener('click',signOut);$('#refreshAccountStatus').addEventListener('click',refreshProfileStatus);
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.jump)));
$('#quickCheckout').addEventListener('click',()=>{switchView('checkout');setMode('out');});$('#quickReturn').addEventListener('click',()=>{switchView('checkout');setMode('return');});
$('#radioSearch').addEventListener('input',renderRadios);$('#statusFilter').addEventListener('change',renderRadios);$('#radioSelect').addEventListener('change',updateSelectedVisual);$('#employeeStatusFilter').addEventListener('change',renderEmployees);
$('#employeeTarget').addEventListener('change',()=>{const p=profiles.find(x=>x.id===$('#employeeTarget').value);$('#targetEmployeeSummary').textContent=p?`${p.display_name} • ID ${p.employee_id} • ${p.department}`:'Employee profile data is verified by the database.';});
$('#radioRows').addEventListener('click',async e=>{const detail=e.target.closest('[data-detail]');if(detail){openDrawer(detail.dataset.detail);return;}const b=e.target.closest('[data-action]');if(b)await handleRadioAction(b.dataset.action,b.dataset.id);});
$('#historyRows').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)openDrawer(b.dataset.detail);});$('#dockBanks').addEventListener('click',async e=>{const b=e.target.closest('.dock-slot');if(b&&!b.disabled)await cycleDock(b.dataset.radio);});
$('#employeeRows').addEventListener('click',async e=>{const b=e.target.closest('[data-employee-admin]');if(!b||b.disabled)return;if(b.dataset.employeeAdmin==='history'){switchView('history');showToast('Showing fleet history. Use the employee name to locate their records.');return;}await mutateEmployee(b.dataset.employeeAdmin,b.dataset.id);});
$('#checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const radioId=$('#radioSelect').value;if(!radioId){showMessage('No eligible radio is available for this action.','error');return;}if(mode==='return'){if(await mutate(()=>api.returnRadio(radioId),`${radioId} returned successfully`))showMessage(`${radioId} successfully returned.`,'success');return;}const targetId=isManager(profile)?$('#employeeTarget').value:profile.id;if(!targetId){showMessage('Select an employee before checking out a radio.','error');return;}const expected=new Date(Date.now()+8*60*60*1000).toISOString();if(await mutate(()=>api.checkoutRadio(radioId,targetId,expected),`${radioId} issued successfully`))showMessage(`${radioId} successfully checked out.`,'success');});
$('#employeeCheckoutBtn').addEventListener('click',async()=>{const vm=getEmployeeWorkspace(state,profile);if(!vm.canCheckout){employeeMessage('Return your current radio before checking out another.','error');return;}const radioId=$('#employeeRadioSelect').value;if(!radioId){employeeMessage('No radio is available right now.','error');return;}const expected=new Date(Date.now()+8*60*60*1000).toISOString();await mutate(()=>api.checkoutRadio(radioId,profile.id,expected),`${radioId} checked out to you`,{employee:true});});
$('#employeeReturnBtn').addEventListener('click',()=>{const id=$('#employeeReturnBtn').dataset.id;if(id)openScanner('employeeReturn',id);});
$('#closeDrawer').addEventListener('click',closeDrawer);$('#drawerBackdrop').addEventListener('click',closeDrawer);$('#drawerContent').addEventListener('click',async e=>{const b=e.target.closest('[data-drawer-action]');if(!b)return;await handleRadioAction(b.dataset.drawerAction,b.dataset.id);closeDrawer();});

const dialog=$('#scannerDialog'),video=$('#scannerVideo');
function stopScanner(){if(scannerTimer)clearInterval(scannerTimer);scannerTimer=null;if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}if(dialog.open)dialog.close();}
async function openScanner(target,expectedRadioId=null){scannerTarget=target;const employeeReturn=target==='employeeReturn';const report=target==='manager'?showMessage:employeeMessage;const mode=getScannerMode();if(!mode){report(employeeReturn?'Camera QR scanning is required to return your radio. Open RadioOps in Safari on iPhone/iPad or Chrome on Android and allow camera access.':'Camera QR scanning is unavailable in this browser. Use the radio dropdown.','error');return;}try{dialog.showModal();$('#scannerStatus').textContent=employeeReturn?`Allow camera access and scan the QR code on ${expectedRadioId}.`:'Allow camera access, then point at the radio QR code.';scannerStream=await navigator.mediaDevices.getUserMedia(getPreferredCameraConstraints());video.setAttribute('playsinline','');video.muted=true;video.srcObject=scannerStream;await video.play();const detector=mode==='native'?new BarcodeDetector({formats:['qr_code']}):null;const scanCanvas=mode==='jsqr'?document.createElement('canvas'):null;let scanBusy=false;$('#scannerStatus').textContent=employeeReturn?`Scan the QR code on ${expectedRadioId} to verify the return.`:'Scanning…';scannerTimer=setInterval(async()=>{if(scanBusy)return;try{let values=[];if(detector){values=(await detector.detect(video)).map(code=>code.rawValue);}else{const value=decodeFrameWithJsQr(video,scanCanvas);if(value)values=[value];}for(const value of values){const id=parseRadioCode(value);if(!id)continue;if(employeeReturn){if(!matchesAssignedRadio(id,expectedRadioId)){ $('#scannerStatus').textContent=`Wrong radio scanned. You are assigned ${expectedRadioId}.`; employeeMessage(`Wrong radio scanned. You are assigned ${expectedRadioId}.`,'error'); continue;}scanBusy=true;$('#scannerStatus').textContent=`${id} verified. Completing return…`;stopScanner();await mutate(()=>api.returnRadioVerified(id),`${id} returned • QR Verified Return`,{employee:true});return;}const select=scannerTarget==='employee'?$('#employeeRadioSelect'):$('#radioSelect');const opt=[...select.options].find(o=>o.value===id);if(opt){select.value=id;if(scannerTarget==='manager')updateSelectedVisual();$('#scannerStatus').textContent=`Found ${id}`;setTimeout(stopScanner,450);return;}$('#scannerStatus').textContent=`${id} is not eligible for this action.`;}}catch{}},300);}catch(err){stopScanner();const message=cameraErrorMessage(err);report(employeeReturn?message:'Camera access was unavailable. '+message,'error');}}
$('#closeScanner').addEventListener('click',stopScanner);$('#scanSupport').textContent=canUseCameraQrScanner()?'Camera QR scanning is available in this browser.':'Camera QR scanning may be unavailable here; manual selection is available for non-return actions.';$('#scanBtn').addEventListener('click',()=>openScanner('manager'));$('#employeeScanBtn').addEventListener('click',()=>openScanner('employee'));

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

bootstrap();
