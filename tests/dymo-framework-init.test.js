import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeDymo, getDymoPrinter } from '../src/dymo-print.js';

test('initializeDymo waits for callback init then validates web service',async()=>{
 const calls=[];
 const fw={
   init(cb){calls.push('init'); setTimeout(cb,5);},
   checkEnvironment(){calls.push('check');return {isBrowserSupported:true,isFrameworkInstalled:true,isWebServicePresent:true,errorDetails:''};}
 };
 const env=await initializeDymo(fw,{timeoutMs:100});
 assert.equal(env.isWebServicePresent,true);
 assert.deepEqual(calls,['init','check']);
});

test('initializeDymo reports environment error details',async()=>{
 const fw={init(cb){cb();},checkEnvironment(){return {isBrowserSupported:true,isFrameworkInstalled:true,isWebServicePresent:false,errorDetails:'service missing'};}};
 await assert.rejects(()=>initializeDymo(fw,{timeoutMs:100}),/service missing/i);
});

test('getDymoPrinter initializes before querying printers',async()=>{
 const calls=[];
 const fw={
  init(cb){calls.push('init');cb();},
  checkEnvironment(){calls.push('check');return {isBrowserSupported:true,isFrameworkInstalled:true,isWebServicePresent:true,errorDetails:''};},
  getPrinters(){calls.push('printers');return [{name:'DYMO LabelWriter 450',printerType:'LabelWriterPrinter'}];}
 };
 const printer=await getDymoPrinter(fw,{timeoutMs:100});
 assert.equal(printer.name,'DYMO LabelWriter 450');
 assert.deepEqual(calls,['init','check','printers']);
});
