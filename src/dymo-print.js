export function findLabelWriter(printers=[]){
  const list=Array.from(printers||[]).filter(p=>String(p.printerType||'').toLowerCase().includes('labelwriter')||/labelwriter/i.test(p.name||''));
  return list.find(p=>/labelwriter\s*450/i.test(p.name||''))||list[0]||null;
}
export function printDymoXml(framework,xml,printer){
  if(!framework?.label?.openXml) throw new Error('DYMO Label Web Service is not available.');
  if(!printer?.name) throw new Error('No DYMO LabelWriter printer was detected.');
  const label=framework.label.openXml(xml);
  if(!label?.print) throw new Error('DYMO label printing is unavailable.');
  label.print(printer.name);
  return printer.name;
}
export async function getDymoPrinter(framework){
  if(!framework?.getPrinters) throw new Error('DYMO Label Web Service is not available.');
  const printers=await Promise.resolve(framework.getPrinters());
  const printer=findLabelWriter(printers);
  if(!printer) throw new Error('No DYMO LabelWriter printer was detected.');
  return printer;
}
