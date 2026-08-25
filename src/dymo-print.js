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
export function initializeDymo(framework,{timeoutMs=8000}={}){
  if(!framework?.init||!framework?.checkEnvironment) return Promise.reject(new Error('DYMO Label Framework did not load.'));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('DYMO Label Web Service initialization timed out.'));}},timeoutMs);
    const finish=()=>{
      if(settled)return;
      try{
        const env=framework.checkEnvironment();
        if(!env?.isBrowserSupported||!env?.isFrameworkInstalled||env?.isWebServicePresent===false){
          settled=true;clearTimeout(timer);
          reject(new Error(env?.errorDetails||'DYMO Label Web Service is not available.'));
          return;
        }
        settled=true;clearTimeout(timer);resolve(env);
      }catch(err){settled=true;clearTimeout(timer);reject(err);}
    };
    try{
      const result=framework.init(finish);
      if(result&&typeof result.then==='function') result.then(finish).catch(err=>{if(!settled){settled=true;clearTimeout(timer);reject(err);}});
    }catch(err){settled=true;clearTimeout(timer);reject(err);}
  });
}
export async function getDymoPrinter(framework,options){
  await initializeDymo(framework,options);
  if(!framework?.getPrinters) throw new Error('DYMO printer discovery is unavailable.');
  const printers=await Promise.resolve(framework.getPrinters());
  const printer=findLabelWriter(printers);
  if(!printer) throw new Error('No DYMO LabelWriter printer was detected.');
  return printer;
}
