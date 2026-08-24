const STORAGE_KEY = 'walkieTrackerStateV1';
const VALID_DOCK = new Set(['EMPTY','CHARGING','FULL','FAULT']);

export function createInitialState(){
  return { radios: Array.from({length:40},(_,i)=>({
    id:`WT-${String(i+1).padStart(2,'0')}`,
    status:'AVAILABLE', employeeName:null, employeeId:null, department:null,
    checkoutAt:null, expectedReturnAt:null, returnedAt:null,
    dockSlot:i+1, dockState:'FULL'
  })), history:[] };
}
function findRadio(state,id){
  const radio=state.radios.find(r=>r.id===id);
  if(!radio) throw new Error('Radio not found');
  return radio;
}
export function checkoutRadio(state,payload){
  const {radioId,employeeName,employeeId,department}=payload;
  if(!radioId||!employeeName?.trim()||!employeeId?.trim()||!department?.trim()) throw new Error('Employee name, ID, department, and radio are required');
  const radio=findRadio(state,radioId);
  if(radio.status!=='AVAILABLE') throw new Error(`Radio ${radioId} is not available`);
  const checkoutAt=payload.checkoutAt || new Date().toISOString();
  radio.status='IN_USE'; radio.employeeName=employeeName.trim(); radio.employeeId=employeeId.trim(); radio.department=department.trim();
  radio.checkoutAt=checkoutAt; radio.expectedReturnAt=payload.expectedReturnAt||null; radio.returnedAt=null; radio.dockState='EMPTY';
  state.history.push({id:`${radioId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,radioId,employeeName:radio.employeeName,employeeId:radio.employeeId,department:radio.department,checkoutAt,returnAt:null});
  return radio;
}
export function returnRadio(state,radioId,returnedAt=new Date().toISOString()){
  const radio=findRadio(state,radioId);
  if(!['IN_USE','OVERDUE'].includes(radio.status)) throw new Error(`Radio ${radioId} is not checked out`);
  const open=[...state.history].reverse().find(h=>h.radioId===radioId && h.returnAt===null);
  if(open) open.returnAt=returnedAt;
  radio.status='AVAILABLE'; radio.employeeName=null; radio.employeeId=null; radio.department=null; radio.returnedAt=returnedAt; radio.checkoutAt=null; radio.expectedReturnAt=null; radio.dockState='CHARGING';
  return radio;
}
export function setRadioRepair(state,radioId,repair=true){
  const radio=findRadio(state,radioId);
  if(repair && ['IN_USE','OVERDUE'].includes(radio.status)) throw new Error('Return radio before marking repair');
  radio.status=repair?'REPAIR':'AVAILABLE';
  if(repair) radio.dockState='FAULT';
  return radio;
}
export function setDockState(state,radioId,dockState){
  if(!VALID_DOCK.has(dockState)) throw new Error('Invalid dock state');
  const radio=findRadio(state,radioId); radio.dockState=dockState; return radio;
}
export function refreshOverdue(state,now=new Date()){
  for(const r of state.radios){
    if(r.status==='IN_USE' && r.expectedReturnAt && new Date(r.expectedReturnAt)<now) r.status='OVERDUE';
  }
  return state;
}
export function getDashboardCounts(state){
  return {
    total:state.radios.length,
    available:state.radios.filter(r=>r.status==='AVAILABLE').length,
    checkedOut:state.radios.filter(r=>r.status==='IN_USE').length,
    overdue:state.radios.filter(r=>r.status==='OVERDUE').length,
    repair:state.radios.filter(r=>r.status==='REPAIR').length,
  };
}
export function saveState(state){ if(typeof localStorage!=='undefined') localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
export function loadState(){
  if(typeof localStorage==='undefined') return createInitialState();
  try { const raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):createInitialState(); } catch { return createInitialState(); }
}
export function resetState(){ const s=createInitialState(); saveState(s); return s; }
