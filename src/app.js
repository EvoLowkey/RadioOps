import { createConfiguredSupabaseClient } from './supabase-client.js';
import { createRadioOpsApi } from './api.js';
import { isManager } from './permissions.js';
import { parseRadioCode, canUseBarcodeDetector } from './scanner.js';
import {
  filterRadios, sortHistoryNewestFirst, getDockBank, getRecentActivity,
  getFleetHealth, getDockCounts, getRadioDetail, buildProductionState
} from './view-models.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const fmt=iso=>iso?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)):'—';
const statusLabel=s=>({AVAILABLE:'AVAILABLE',IN_USE:'IN USE',OVERDUE:'OVERDUE',REPAIR:'IN REPAIR'}[s]||s);
const dockLabel=s=>({EMPTY:'Empty',CHARGING:'Charging',FULL:'Full',FAULT:'Fault'}[s]||s);

let client=null, api=null, session=null, profile=null, profiles=[], auditEvents=[];
let state={radios:[],history:[]}, mode='out', scannerStream=null, scannerTimer=null, toastTimer=null, unsubscribeFleet=null, refreshTimer=null;

function updateClock(){ $('#systemTime').textContent=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date()); }
function showToast(text){ const el=$('#toast'); el.textContent=text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2500); }
function showMessage(text,type='success'){ const el=$('#formMessage'); el.textContent=text; el.className=`form-message ${type}`; }
function authMessage(text,type='error'){ const el=$('#authMessage'); el.textContent=text; el.className=`form-message ${type}`; }
function setConnection(kind,text){
  const banner=$('#connectionBanner');
  $('#systemStatusTitle').textContent=kind==='ok'?'System Online':kind==='loading'?'Syncing':'Connection Issue';
  $('#systemStatusText').textContent=text;
  document.querySelector('.status-orb')?.classList.toggle('offline',kind==='error');
  banner.hidden=kind!=='error'; banner.textContent=kind==='error'?text:'';
}
function humanError(err){
  if(err?.code==='AUTH_ERROR') return 'Your session has expired. Please sign in again.';
  if(err?.code==='PERMISSION_DENIED') return 'You do not have permission to perform that action.';
  if(err?.code==='RADIO_UNAVAILABLE') return 'That radio was just taken by another user. The fleet has been refreshed.';
  if(err?.code==='CONFIG_MISSING') return 'RadioOps needs its Supabase connection configured before sign-in.';
  return err?.message || 'The operation could not be completed. Please try again.';
}

function setSignedInUI(signedIn){
  $('#authGate').hidden=signedIn;
  $('.app-frame').classList.toggle('app-locked',!signedIn);
  if(!signedIn){ $('#identityName').textContent='Signed out'; $('#identityRole').textContent='—'; }
}
function applyRoleUI(){
  const manager=isManager(profile);
  $$('.manager-only').forEach(el=>el.hidden=!manager);
  $('#employeeFields').hidden=!manager || mode!=='out';
  $('#identityName').textContent=profile.display_name;
  $('#identityRole').textContent=`${profile.role==='MANAGER'?'Manager':'Employee'} • ${profile.department}`;
  $('#identityAvatar').textContent=profile.display_name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  $('#employeeWorkspace').hidden=manager;
}

function mapProfiles(){ return new Map(profiles.map(p=>[p.id,p])); }
async function loadData({quiet=false}={}){
  if(!api||!profile) return;
  if(!quiet) setConnection('loading','Refreshing secure cloud data');
  try{
    const manager=isManager(profile);
    const [radios,assignments,profileRows,auditRows]=await Promise.all([
      api.listRadios(), api.listAssignments(manager?null:profile.id),
      manager?api.listProfiles():Promise.resolve([profile]),
      manager?api.listAuditEvents():Promise.resolve([])
    ]);
    profiles=profileRows; auditEvents=auditRows;
    state=buildProductionState({radios,assignments,profiles,profile,now:new Date()});
    renderAll();
    setConnection('ok','Supabase realtime connected');
  }catch(err){ setConnection('error',humanError(err)); if(!quiet) showToast(humanError(err)); }
}

function renderFleetHealth(){
  if(!state.radios.length){$('#fleetHealth').innerHTML='<div class="empty-state">Loading fleet…</div>';return;}
  const h=getFleetHealth(state);
  $('#fleetHealth').innerHTML=`<div class="health-head"><strong>Fleet Health</strong><span>${h.utilization}% deployed</span></div><div class="health-meter"><span style="width:${Math.max(4,100-h.attention/state.radios.length*100)}%"></span></div><div class="health-grid"><div><strong>${h.ready}</strong><span>Ready</span></div><div><strong>${h.active}</strong><span>Active</span></div><div><strong>${h.attention}</strong><span>Needs attention</span></div></div>`;
}
function renderStats(){
  const c={total:state.radios.length,available:state.radios.filter(r=>r.status==='AVAILABLE').length,checkedOut:state.radios.filter(r=>r.status==='IN_USE').length,overdue:state.radios.filter(r=>r.status==='OVERDUE').length,repair:state.radios.filter(r=>r.status==='REPAIR').length};
  const items=[['total','▦','TOTAL RADIOS',c.total],['available','✓','AVAILABLE',c.available],['checked','⇄','CHECKED OUT',c.checkedOut],['overdue','!','OVERDUE',c.overdue],['repair','⌁','IN REPAIR',c.repair]];
  $('#statGrid').innerHTML=items.map(([klass,icon,label,value])=>`<div class="stat-card ${klass}"><div class="stat-icon">${icon}</div><div><span class="label">${label}</span><span class="value">${value}</span></div></div>`).join('');
}
function radioAction(r){
  const manager=isManager(profile), own=r.assignedProfileId===profile?.id;
  if(manager){
    if(r.status==='AVAILABLE') return `<button class="table-action" data-action="repair" data-id="${r.id}">Repair</button>`;
    if(r.status==='REPAIR') return `<button class="table-action" data-action="ready" data-id="${r.id}">Mark Ready</button>`;
    return `<button class="table-action" data-action="return" data-id="${r.id}">Return</button>`;
  }
  if(own&&['IN_USE','OVERDUE'].includes(r.status)) return `<button class="table-action" data-action="return" data-id="${r.id}">Return Mine</button>`;
  return '';
}
function renderRadios(){
  const rows=filterRadios(state.radios,$('#radioSearch').value,$('#statusFilter').value);
  $('#radioRows').innerHTML=rows.map(r=>`<tr><td><button class="radio-link" data-detail="${r.id}">${r.id}</button></td><td><div class="employee-cell"><strong>${escapeHtml(r.employeeName||'Unassigned')}</strong><span>${escapeHtml(r.employeeId?`ID ${r.employeeId}`:(r.assignedProfileId?'Protected assignment':'No employee'))}</span></div></td><td>${escapeHtml(r.department||'—')}</td><td>${fmt(r.checkoutAt)}</td><td><span class="dock-badge dock-${r.dockState}">${dockLabel(r.dockState)}</span></td><td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td><td>${radioAction(r)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No radios match this filter.</td></tr>';
}
function renderRecentActivity(){
  const rows=getRecentActivity(state.history,5);
  $('#recentActivity').innerHTML=rows.length?rows.map(h=>`<div class="activity-item"><div class="activity-icon">${h.radioId.replace('WT-','')}</div><div class="activity-copy"><strong>${h.radioId} • ${escapeHtml(h.employeeName)}</strong><span>${escapeHtml(h.department)} • ${h.returnAt?'Returned':'Checked out'}</span></div><span class="activity-time">${fmt(h.returnAt||h.checkoutAt)}</span></div>`).join(''):'<div class="empty-state">No radio activity yet.</div>';
}
function populateEmployeeTarget(){
  const select=$('#employeeTarget'); if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Select employee</option>'+profiles.filter(p=>p.is_active).map(p=>`<option value="${p.id}">${escapeHtml(p.display_name)} • ${escapeHtml(p.employee_id)} • ${escapeHtml(p.department)}</option>`).join('');
  if(profiles.some(p=>p.id===current))select.value=current;
}
function eligibleRadios(){
  if(mode==='out') return state.radios.filter(r=>r.status==='AVAILABLE');
  return state.radios.filter(r=>['IN_USE','OVERDUE'].includes(r.status) && (isManager(profile)||r.assignedProfileId===profile.id));
}
function populateRadioSelect(){
  const list=eligibleRadios(), select=$('#radioSelect'), current=select.value;
  select.innerHTML=list.map(r=>`<option value="${r.id}">${r.id}${r.employeeName?` — ${escapeHtml(r.employeeName)}`:''}</option>`).join('');
  if(list.some(r=>r.id===current))select.value=current;
  updateSelectedVisual();
}
function updateSelectedVisual(){const id=$('#radioSelect').value||'—';$('#qrSelectedLabel').textContent=id;$('#heroRadioId').textContent=id;}
function renderHistory(){
  const rows=sortHistoryNewestFirst(state.history);
  $('#historyRows').innerHTML=rows.map(h=>`<tr><td><button class="radio-link" data-detail="${h.radioId}">${h.radioId}</button></td><td>${escapeHtml(h.employeeName)}</td><td>${escapeHtml(h.employeeId)}</td><td>${escapeHtml(h.department)}</td><td>${fmt(h.checkoutAt)}</td><td>${fmt(h.returnAt)}</td><td><span class="history-state">${h.returnAt?'Closed':'Active'}</span></td></tr>`).join('')||'<tr><td colspan="7" class="empty-state">No assignment history is available.</td></tr>';
}
function renderDock(){
  const totals=getDockCounts(state.radios);
  $('#dockSummary').innerHTML=Object.entries(totals).map(([k,v])=>`<div class="summary-chip"><span class="dock-badge dock-${k}">${dockLabel(k)}</span><strong>${v}</strong><span>radios</span></div>`).join('');
  const manager=isManager(profile);
  $('#dockBanks').innerHTML=['A','B'].map(bank=>{const radios=state.radios.filter(r=>getDockBank(r.dockSlot)===bank);const range=bank==='A'?'Slots 01–20':'Slots 21–40';return `<div class="dock-bank"><div class="dock-bank-head"><div><h3>Charging Bank ${bank}</h3><p>${range} • ${manager?'tap a slot to cycle state':'manager-controlled status'}</p></div><span class="bank-pill">20 positions</span></div><div class="slot-grid">${radios.map(r=>`<button class="dock-slot" data-radio="${r.id}" ${manager?'':'disabled'} title="${r.id}: ${r.dockState}"><span class="slot-number">SLOT ${String(r.dockSlot).padStart(2,'0')}</span><div class="slot-radio">${r.id}</div><span class="slot-light ${r.dockState}"></span><span class="slot-state">${dockLabel(r.dockState)}</span></button>`).join('')}</div></div>`;}).join('');
}
function renderEmployeeWorkspace(){
  if(isManager(profile))return;
  const active=state.radios.find(r=>r.assignedProfileId===profile.id&&['IN_USE','OVERDUE'].includes(r.status));
  const available=state.radios.filter(r=>r.status==='AVAILABLE').length;
  $('#employeeWorkspace').innerHTML=`<div class="employee-welcome"><div><p class="eyebrow">My radio</p><h2>${active?`${active.id} is assigned to you`:'You do not have a radio checked out'}</h2><p>${active?`Checked out ${fmt(active.checkoutAt)} • ${statusLabel(active.status)}`:`${available} radios are currently available.`}</p></div><button class="${active?'secondary-btn':'primary-btn'}" data-employee-action="${active?'return':'checkout'}" data-id="${active?.id||''}">${active?'Return '+active.id:'Check out a radio'}</button></div>`;
}
function renderAudit(){
  if(!isManager(profile)){ $('#auditRows').innerHTML=''; return; }
  const pm=mapProfiles();
  $('#auditRows').innerHTML=auditEvents.slice(0,250).map(e=>`<tr><td>${fmt(e.created_at)}</td><td><span class="history-state">${escapeHtml(e.event_type.replaceAll('_',' '))}</span></td><td>${escapeHtml(e.radio_id||'—')}</td><td>${escapeHtml(pm.get(e.actor_profile_id)?.display_name||e.actor_profile_id||'System')}</td><td><code class="audit-meta">${escapeHtml(JSON.stringify(e.metadata||{}))}</code></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">No audit events yet.</td></tr>';
}
function renderAll(){applyRoleUI();renderEmployeeWorkspace();renderFleetHealth();renderStats();renderRadios();renderRecentActivity();populateEmployeeTarget();populateRadioSelect();renderHistory();renderDock();renderAudit();}

function setMode(next){mode=next;$$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#employeeFields').hidden=mode!=='out'||!isManager(profile);$('#submitAssignment').textContent=mode==='out'?'✓ Check Out Radio':'↩ Return Radio';$('#transactionTitle').textContent=mode==='out'?'Issue a radio':'Return a radio';showMessage('','');populateRadioSelect();}
function switchView(id){if(id==='audit'&&!isManager(profile))return;$$('.view').forEach(v=>v.classList.toggle('active-view',v.id===id));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'});}
function openDrawer(radioId){
  const d=getRadioDetail(state,radioId);if(!d)return; const manager=isManager(profile),own=d.assignedProfileId===profile.id;
  let action=''; if(manager){action=['IN_USE','OVERDUE'].includes(d.status)?`<button class="primary-btn" data-drawer-action="return" data-id="${d.id}">Return ${d.id}</button>`:d.status==='AVAILABLE'?`<button class="secondary-btn" data-drawer-action="repair" data-id="${d.id}">Mark for repair</button>`:`<button class="secondary-btn" data-drawer-action="ready" data-id="${d.id}">Mark ready</button>`;} else if(own&&['IN_USE','OVERDUE'].includes(d.status)){action=`<button class="primary-btn" data-drawer-action="return" data-id="${d.id}">Return my ${d.id}</button>`;}
  $('#drawerRadioId').textContent=d.id; $('#drawerContent').innerHTML=`<div class="drawer-device"><div class="radio-device" style="margin:45px auto 5px"><div class="antenna"></div><div class="screen"><span>POC</span><small>4G READY</small></div><div class="speaker"></div><div class="radio-label">${d.id}</div></div><div class="drawer-status"><span class="status-badge status-${d.status}">${d.statusLabel}</span></div></div><div class="detail-grid"><div class="detail-box"><span>Assigned to</span><strong>${escapeHtml(d.assignment)}</strong></div><div class="detail-box"><span>Employee ID</span><strong>${escapeHtml(d.employeeId||'Protected')}</strong></div><div class="detail-box"><span>Department</span><strong>${escapeHtml(d.department||'—')}</strong></div><div class="detail-box"><span>Dock position</span><strong>${d.dockLabel}</strong></div><div class="detail-box"><span>Charging state</span><strong>${dockLabel(d.dockState)}</strong></div><div class="detail-box"><span>Checkout</span><strong>${fmt(d.checkoutAt)}</strong></div></div><div class="drawer-actions">${action}</div>`;
  $('#radioDrawer').classList.add('open');$('#radioDrawer').setAttribute('aria-hidden','false');$('#drawerBackdrop').classList.add('show');
}
function closeDrawer(){$('#radioDrawer').classList.remove('open');$('#radioDrawer').setAttribute('aria-hidden','true');$('#drawerBackdrop').classList.remove('show');}

async function mutate(action,success){
  try{setConnection('loading','Saving secure change');await action();await loadData({quiet:true});setConnection('ok','Supabase realtime connected');showToast(success);return true;}
  catch(err){const msg=humanError(err);showMessage(msg,'error');showToast(msg);await loadData({quiet:true});return false;}
}
async function handleRadioAction(action,id){
  if(action==='return')await mutate(()=>api.returnRadio(id),`${id} returned`);
  if(action==='repair')await mutate(()=>api.setRepairState(id,true),`${id} moved to repair`);
  if(action==='ready')await mutate(()=>api.setRepairState(id,false),`${id} restored to service`);
}
async function cycleDock(radioId){if(!isManager(profile))return;const r=state.radios.find(x=>x.id===radioId);const values=['EMPTY','CHARGING','FULL','FAULT'];const next=values[(values.indexOf(r.dockState)+1)%values.length];await mutate(()=>api.setDockState(radioId,next),`${radioId} dock status: ${dockLabel(next)}`);}

async function establishSession(nextSession){
  session=nextSession;
  if(!session){profile=null;profiles=[];state={radios:[],history:[]};setSignedInUI(false);return;}
  try{
    profile=await api.loadProfile(session.user.id);
    if(!profile?.is_active)throw new Error('Your RadioOps profile is inactive. Contact a manager.');
    setSignedInUI(true);applyRoleUI();await loadData();
    if(unsubscribeFleet)unsubscribeFleet();
    unsubscribeFleet=api.subscribeFleet(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadData({quiet:true}),200);});
  }catch(err){authMessage(humanError(err));await api.signOut().catch(()=>{});session=null;profile=null;setSignedInUI(false);}
}

async function bootstrap(){
  updateClock();setInterval(updateClock,30000);setSignedInUI(false);
  try{client=createConfiguredSupabaseClient(globalThis);api=createRadioOpsApi(client);$('#setupMessage').hidden=true;setConnection('loading','Waiting for secure sign-in');
    const current=await api.getSession();if(current)await establishSession(current);
    client.auth.onAuthStateChange((_event,nextSession)=>{if(nextSession?.user?.id!==session?.user?.id||(!nextSession&&session))establishSession(nextSession);});
  }catch(err){$('#setupMessage').hidden=false;authMessage(humanError(err));setConnection('error',humanError(err));}
}

$('#signInForm').addEventListener('submit',async e=>{e.preventDefault();if(!api){authMessage('Supabase is not configured yet. See README.md.');return;}authMessage('Signing in…','success');try{const data=await api.signIn($('#signInEmail').value.trim(),$('#signInPassword').value);if(session?.user?.id!==data.session?.user?.id)await establishSession(data.session||null);authMessage('','');}catch(err){authMessage(humanError(err));}});
$('#signOutBtn').addEventListener('click',async()=>{if(unsubscribeFleet){unsubscribeFleet();unsubscribeFleet=null;}await api?.signOut();setSignedInUI(false);});
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.jump)));
$('#quickCheckout').addEventListener('click',()=>{switchView('checkout');setMode('out');});
$('#quickReturn').addEventListener('click',()=>{switchView('checkout');setMode('return');});
$('#radioSearch').addEventListener('input',renderRadios);$('#statusFilter').addEventListener('change',renderRadios);$('#radioSelect').addEventListener('change',updateSelectedVisual);
$('#employeeTarget').addEventListener('change',()=>{const p=profiles.find(x=>x.id===$('#employeeTarget').value);$('#targetEmployeeSummary').textContent=p?`${p.display_name} • ID ${p.employee_id} • ${p.department}`:'Employee profile data is verified by the database.';});
$('#radioRows').addEventListener('click',async e=>{const detail=e.target.closest('[data-detail]');if(detail){openDrawer(detail.dataset.detail);return;}const b=e.target.closest('[data-action]');if(b)await handleRadioAction(b.dataset.action,b.dataset.id);});
$('#historyRows').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)openDrawer(b.dataset.detail);});
$('#dockBanks').addEventListener('click',async e=>{const b=e.target.closest('.dock-slot');if(b&&!b.disabled)await cycleDock(b.dataset.radio);});
$('#employeeWorkspace').addEventListener('click',e=>{const b=e.target.closest('[data-employee-action]');if(!b)return;if(b.dataset.employeeAction==='checkout'){switchView('checkout');setMode('out');}else handleRadioAction('return',b.dataset.id);});
$('#checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const radioId=$('#radioSelect').value;if(!radioId){showMessage('No eligible radio is available for this action.','error');return;}if(mode==='return'){if(await mutate(()=>api.returnRadio(radioId),`${radioId} returned successfully`))showMessage(`${radioId} successfully returned.`,'success');return;}const targetId=isManager(profile)?$('#employeeTarget').value:profile.id;if(!targetId){showMessage('Select an employee before checking out a radio.','error');return;}const expected=new Date(Date.now()+8*60*60*1000).toISOString();if(await mutate(()=>api.checkoutRadio(radioId,targetId,expected),`${radioId} issued successfully`)){showMessage(`${radioId} successfully checked out.`,'success');}});
$('#closeDrawer').addEventListener('click',closeDrawer);$('#drawerBackdrop').addEventListener('click',closeDrawer);
$('#drawerContent').addEventListener('click',async e=>{const b=e.target.closest('[data-drawer-action]');if(!b)return;await handleRadioAction(b.dataset.drawerAction,b.dataset.id);closeDrawer();});

const dialog=$('#scannerDialog'),video=$('#scannerVideo');
function stopScanner(){if(scannerTimer)clearInterval(scannerTimer);scannerTimer=null;if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}if(dialog.open)dialog.close();}
$('#closeScanner').addEventListener('click',stopScanner);
$('#scanSupport').textContent=canUseBarcodeDetector()?'Camera QR scanning is supported in this browser.':'Camera QR scanning may not be supported here; manual selection is available.';
$('#scanBtn').addEventListener('click',async()=>{if(!canUseBarcodeDetector()||!navigator.mediaDevices?.getUserMedia){showMessage('Camera scanning is not supported in this browser. Use the radio dropdown.','error');return;}try{dialog.showModal();scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});video.srcObject=scannerStream;await video.play();const detector=new BarcodeDetector({formats:['qr_code']});$('#scannerStatus').textContent='Scanning…';scannerTimer=setInterval(async()=>{try{const codes=await detector.detect(video);for(const code of codes){const id=parseRadioCode(code.rawValue);if(!id)continue;const opt=[...$('#radioSelect').options].find(o=>o.value===id);if(opt){$('#radioSelect').value=id;updateSelectedVisual();$('#scannerStatus').textContent=`Found ${id}`;setTimeout(stopScanner,450);return;}$('#scannerStatus').textContent=`${id} is not eligible for this action.`;}}catch{}},400);}catch{stopScanner();showMessage('Camera access was unavailable. Use the radio dropdown instead.','error');}});

bootstrap();
