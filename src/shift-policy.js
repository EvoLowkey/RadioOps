export const SHIFT_DEFINITIONS=Object.freeze({
  AM:{label:'AM Shift',start:'06:55',end:'15:00'},
  PM:{label:'PM Shift',start:'15:00',end:'23:00'},
  OVERNIGHT:{label:'Overnight Shift',start:'23:00',end:'07:00',crossesMidnight:true}
});

function addDays(dateStr,days){
  const d=new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
function zoneParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function zonedDate(dateStr,timeStr,timeZone){
  const [y,m,d]=dateStr.split('-').map(Number),[hh,mm]=timeStr.split(':').map(Number);
  let guess=Date.UTC(y,m-1,d,hh,mm,0);
  for(let i=0;i<2;i++){
    const p=zoneParts(new Date(guess),timeZone);
    const asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
    guess += Date.UTC(y,m-1,d,hh,mm,0)-asUtc;
  }
  return new Date(guess);
}
export function resolveShiftWindow(shiftCode,selectedDate,timeZone='America/Chicago'){
  const def=SHIFT_DEFINITIONS[shiftCode]; if(!def) throw new Error('Invalid shift');
  const endDate=def.crossesMidnight?addDays(selectedDate,1):selectedDate;
  const startsAt=zonedDate(selectedDate,def.start,timeZone),endsAt=zonedDate(endDate,def.end,timeZone);
  return {code:shiftCode,label:def.label,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),reminderAt:new Date(endsAt.getTime()-15*60*1000).toISOString()};
}
export function getReturnReminderState(now,shiftWindow){
  const t=new Date(now).getTime(),end=new Date(shiftWindow.endsAt).getTime(),reminder=new Date(shiftWindow.reminderAt).getTime();
  if(t>=end)return 'shift_ended'; if(t>=reminder)return 'fifteen_minutes'; return 'none';
}

export function getShiftWorkDate(shiftCode,now=new Date()){
  const d=new Date(now);
  if(Number.isNaN(d.getTime())) throw new Error('Invalid date');
  if(shiftCode==='OVERNIGHT' && d.getHours()<7) d.setDate(d.getDate()-1);
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
