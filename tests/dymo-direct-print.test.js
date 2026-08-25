import test from 'node:test';
import assert from 'node:assert/strict';
import { findLabelWriter, printDymoXml } from '../src/dymo-print.js';

test('findLabelWriter prefers a LabelWriter 450',()=>{
 const printers=[{name:'DYMO Twin Turbo',printerType:'LabelWriterPrinter'},{name:'DYMO LabelWriter 450',printerType:'LabelWriterPrinter'}];
 assert.equal(findLabelWriter(printers).name,'DYMO LabelWriter 450');
});
test('findLabelWriter accepts another LabelWriter when 450 naming is absent',()=>{
 assert.equal(findLabelWriter([{name:'Office DYMO',printerType:'LabelWriterPrinter'}]).name,'Office DYMO');
});
test('printDymoXml uses framework label openXml and print',()=>{
 let printed='';
 const framework={label:{openXml(xml){return {print(name){printed=name;}}}}};
 const name=printDymoXml(framework,'<label/>',{name:'DYMO LabelWriter 450'});
 assert.equal(name,'DYMO LabelWriter 450'); assert.equal(printed,name);
});
test('printDymoXml rejects missing framework',()=>{
 assert.throws(()=>printDymoXml(null,'<label/>',{name:'x'}),/DYMO Label Web Service/i);
});
