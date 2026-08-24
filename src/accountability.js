export function localDateString(date=new Date()){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
export function operationalRoleLabel(role){
  return ({VALET_ASSOCIATE:'Valet Associate',GSC_CAPTAIN:'GSC Captain',CASHIER:'Cashier'})[String(role||'VALET_ASSOCIATE').toUpperCase()]||'Valet Associate';
}
export function accountabilityBanner(record){
  const status=record?.computed_return_status||record?.return_status;
  if(status==='RETURN_DUE_30')return {tone:'warning',title:'Radio Return Reminder',message:'Your shift ends in 30 minutes. Please plan to return and scan your assigned radio before clocking out and receiving tips.'};
  if(status==='RETURN_DUE_15'||status==='RETURN_DUE_SOON')return {tone:'warning',title:'Radio Return Required',message:'Your shift ends in 15 minutes. Please return and scan your assigned radio before clocking out and receiving tips.'};
  if(status==='UNRETURNED_AFTER_SHIFT')return {tone:'danger',title:'Radio Return Required — Tip Release Pending',message:'Your shift has ended and your assigned radio is still checked out. Return and scan the exact radio now.'};
  return null;
}
export function shouldNotifyAccountability(record,lastNotifiedStatus){
  const status=record?.computed_return_status||record?.return_status;
  return ['RETURN_DUE_30','RETURN_DUE_15','RETURN_DUE_SOON','UNRETURNED_AFTER_SHIFT'].includes(status)&&status!==lastNotifiedStatus;
}
