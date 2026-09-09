'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../frontend-source/vendor/pdf-lib.min.js');
const source = fs.readFileSync(path.join(__dirname,'../frontend-source/android/scripts/invoice-pdf.js'),'utf8');
function exporter(extra={}) {
  const messages=[];
  const win={PDFLib:lib,premiumToast(message){messages.push(message);},...extra};
  new Function('window',source)(win);
  return {api:win.VyaparInvoicePDF,win,messages};
}
function model() {
  return {business:{name:'Sample Store',address:'Test address'},transaction:{type:'SALE',number:'INV-0042',date:'2026-09-09',partyName:'Test customer',currency:'INR',items:[{name:'Shoes',qty:2,rate:1000,tax:18,discount:5}],subtotal:2000,discount:10,tax:307.8,cgst:153.9,sgst:153.9,additionalCharges:50,total:2057.8,receivedPaid:500,balance:1557.8},settings:{showMRP:true,terms:'Sample terms'}};
}
async function pageTexts(bytes) {
  const pdf=await lib.PDFDocument.load(bytes);
  return pdf.getPages().map(page=>{
    const content=page.node.Contents();
    const streams=content instanceof lib.PDFArray?content.asArray():[content];
    const raw=streams.map(ref=>Buffer.from(lib.decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1')).join('\n');
    return Array.from(raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g),m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
  });
}

test('Invoice PDF preserves saved totals and correctly displays platform discount percentages',async()=>{
  const {api}=exporter(),data=model(),before=JSON.stringify(data);
  const output=await api.generate(data),text=(await pageTexts(output.bytes)).join('\n');
  assert.equal(output.name,'Invoice-INV-0042.pdf');
  assert.equal(output.pageCount,1);
  for(const amount of ['INR -300.00','INR 153.90','INR 50.00','INR 2057.80','INR 1557.80','18%'])assert(text.includes(amount),amount);
  assert.equal(JSON.stringify(data),before,'export must never mutate ledger data');
});

test('Legacy bills retain absolute discounts, GST rate and derived payment balance',async()=>{
  const {api}=exporter();
  const data={business:{name:'Legacy store'},transaction:{number:'OLD/../42',items:[{product:'Sandals',qty:2,price:100}],subtotal:200,discountAmount:20,gstPercent:5,tax:9,total:189,paid:50}};
  const out=await api.generate(data),text=(await pageTexts(out.bytes)).join('\n');
  assert.match(out.name,/^Invoice-OLD-..-42\.pdf$/);
  for(const expected of ['INR -20.00','INR 189.00','INR 139.00','5%','Sandals'])assert(text.includes(expected),expected);
});

test('Long invoices repeat headers, wrap long items and retain every item across pages',async()=>{
  const {api}=exporter(),data=model();
  data.transaction.items=Array.from({length:75},(_,i)=>({name:'ROW-'+String(i).padStart(3,'0')+' '+('long-item-name-'.repeat(i===8?80:3)),qty:1,rate:10,tax:18}));
  data.settings.originalDuplicate=true;
  const out=await api.generate(data),texts=await pageTexts(out.bytes),all=texts.join('\n');
  assert(out.pageCount>4);
  assert.equal((all.match(/ROW-/g)||[]).length,150,'each saved line appears in both copies');
  for(const [i,text] of texts.entries()){
    assert(text.includes('Sample Store'),'repeated business header');
    assert(text.includes('Page '+(i+1)+' of '+texts.length),'page numbering');
  }
  assert(all.includes('CUSTOMER COPY') && all.includes('OFFICE COPY'));
});

test('A5 landscape and 58/80 mm exports use the selected page dimensions',async()=>{
  const {api}=exporter();
  for(const [settings,thermal,width,height] of [[{paperSize:'A5',orientation:'landscape'},false,595.28,419.53],[{thermalWidth:'58'},true,164.41,650],[{thermalWidth:'80'},true,226.77,650]]){
    const out=await api.generate({...model(),settings,thermal});
    const pdf=await lib.PDFDocument.load(out.bytes),size=pdf.getPage(0).getSize();
    assert.equal(size.width,width);assert.equal(size.height,height);
  }
});

test('Native PDF download waits for actual save confirmation and coalesces repeat taps',async()=>{
  let done,started,callCount=0;
  const bridgeReady=new Promise(resolve=>started=resolve);
  const {api,win,messages}=exporter({AndroidDownloads:{saveBase64WithResult(name,mime,base64,id){
    callCount++;assert.equal(mime,'application/pdf');assert.equal(Buffer.from(base64,'base64').subarray(0,4).toString(),'%PDF');done=()=>win.onNativeDownloadResult(id,true,'Saved to Downloads/Vyapar AI/'+name);started();
  }}});
  const first=api.download(model()),second=api.download(model());assert.equal(first,second);
  await bridgeReady;assert.equal(callCount,1);assert.equal(messages.filter(m=>m.startsWith('Saved')).length,0);
  done();assert.equal(await first,true);assert.equal(messages.filter(m=>m.startsWith('Saved')).length,1);
});

test('Native denial never reports success and allows a retry',async()=>{
  let calls=0;
  const {api,win,messages}=exporter({AndroidDownloads:{saveBase64WithResult(name,mime,base64,id){calls++;queueMicrotask(()=>win.onNativeDownloadResult(id,false,'File was not saved. Permission denied.'));}}});
  assert.equal(await api.download(model()),false);assert.equal(await api.download(model()),false);
  assert.equal(calls,2);assert(messages.includes('File was not saved. Permission denied.'));assert(!messages.some(m=>m.startsWith('Saved')));
});
