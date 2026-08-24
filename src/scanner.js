export function parseRadioCode(value){
  const s=String(value??'').trim().toUpperCase();
  const m=/^WT-(\d{2})$/.exec(s);
  if(!m) return null;
  const n=Number(m[1]);
  return n>=1&&n<=40?`WT-${String(n).padStart(2,'0')}`:null;
}
export function canUseBarcodeDetector(){ return typeof BarcodeDetector!=='undefined'; }
export function matchesAssignedRadio(scannedValue, assignedRadioId){
  const scanned=parseRadioCode(scannedValue);
  const assigned=parseRadioCode(assignedRadioId);
  return Boolean(scanned&&assigned&&scanned===assigned);
}
export function getPreferredCameraConstraints(){
  return {video:{facingMode:{ideal:'environment'}},audio:false};
}
