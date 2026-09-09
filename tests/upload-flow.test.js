'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const crypto=require('node:crypto').webcrypto;
const sourceDir=path.join(__dirname,'../frontend-source/android/scripts');
const source=name=>fs.readFileSync(path.join(sourceDir,name),'utf8');
function fixture(){
  const nodes=new Map(),storage=new Map(),alerts=[];let rejectSave=false,commits=0;
  const element=()=>({innerHTML:'',textContent:'',value:'',style:{setProperty(){}},classList:{contains(){return false;},add(){},remove(){},toggle(){}},querySelector(){return null;},querySelectorAll(){return [];},focus(){},appendChild(){},setAttribute(){},remove(){}});
  for(const id of ['uploadFile','uploadType','uploadStatus','uploadPreview','uploadReview','uploadFileName','uploadFileSize'])nodes.set(id,element());nodes.get('uploadType').value='auto';
  const document={getElementById:id=>nodes.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:element,documentElement:element(),body:element(),addEventListener(){}};
  const env={document,navigator:{onLine:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},console,crypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,FileReader:class{},setTimeout,clearTimeout,requestAnimationFrame:()=>0,addEventListener(){},matchMedia:()=>({matches:false}),alert:m=>alerts.push(String(m)),confirm:()=>true,prompt:()=>'',fetch:async()=>({ok:false,json:async()=>({})})};
  env.window=env;vm.createContext(env);vm.runInContext(source('file-io.js'),env);vm.runInContext(source('upload-workspace.js'),env);
  const app=source('app.js'),end=app.indexOf('\nrender();\n');assert(end>0);
  vm.runInContext(app.slice(0,end)+'\nrender=function(){};showGlassToast=function(){};',env);
  env.state=env.normalizeState({profile:{businessName:'Shop'},sales:[],stocks:[],monthly:[{id:'month',month:'2026-01',profit:5}],daily:[]});
  env.VyaparInsights={invalidate(){}};env.VyaparWorkspace={setBusy(){},busyMessage(){}};
  env.showGlassDialog=async()=>true;
  env.VyaparStorage={async replace(value,apply){if(rejectSave)throw Error('Quota full');commits++;apply();},save:async()=>{}};
  return{env,nodes,alerts,fail(value){rejectSave=value;},get commits(){return commits;},file(value,name='records.json'){nodes.get('uploadFile').files=[{name,size:value.length,text:async()=>value}];}};
}
test('Review does not mutate records; confirmed import updates the latest month and saves valid sales',async()=>{
  const f=fixture();f.file(JSON.stringify([{year:2026,month:1,profit:42},{type:'sale',date:'2026-01-02',product:'Shoe',qty:1,purchasePrice:20,sellingPrice:50}]));
  await f.env.VyaparUpload.review();assert.equal(f.env.state.sales.length,0);assert.equal(f.env.state.monthly[0].profit,5);assert.match(f.nodes.get('uploadPreview').innerHTML,/Import 2 rows/);
  await f.env.VyaparUpload.confirmImport();assert.equal(f.env.state.monthly[0].profit,42);assert.equal(f.env.state.sales.length,1);assert.equal(f.commits,1);assert.match(f.nodes.get('uploadStatus').textContent,/2 records saved/);
});
test('Failed import keeps both original rows and original monthly amounts; user can retry',async()=>{
  const f=fixture();const original=f.env.state;f.file(JSON.stringify([{year:2026,month:1,profit:90},{type:'stock',product:'Blue shoe',qty:6}]));
  await f.env.VyaparUpload.review();f.fail(true);await f.env.VyaparUpload.confirmImport();
  assert.equal(f.env.state,original);assert.equal(original.monthly[0].profit,5);assert.equal(original.stocks.length,0);assert.match(f.nodes.get('uploadStatus').textContent,/not saved/);
  f.fail(false);await f.env.VyaparUpload.confirmImport();assert.equal(f.env.state.stocks.length,1);assert.equal(f.env.state.monthly[0].profit,90);
});
test('Repeated import requires confirmation and cancellation leaves records unchanged',async()=>{
  const f=fixture(),text=JSON.stringify([{type:'stock',product:'Black shoe',qty:3}]);f.file(text);await f.env.VyaparUpload.review();await f.env.VyaparUpload.confirmImport();
  f.file(text);await f.env.VyaparUpload.review();f.env.showGlassDialog=async()=>false;await f.env.VyaparUpload.confirmImport();assert.equal(f.env.state.stocks.length,1);assert.equal(f.commits,1);
});
test('A full backup opens the restore action; rejected replacement leaves current account and data unchanged',async()=>{
  const f=fixture();const original=f.env.state;f.file(JSON.stringify({profile:{businessName:'Backup shop'},sales:[],stocks:[],monthly:[],daily:[]}));
  await f.env.VyaparUpload.review();assert.match(f.nodes.get('uploadPreview').innerHTML,/Restore this backup/);assert.equal(f.env.state,original);
  f.fail(true);await f.env.VyaparUpload.confirmImport();assert.equal(f.env.state,original);assert.equal(f.commits,0);
});
test('Large JSON collections avoid argument-count limits and preserve all rows in preview parsing',()=>{
  const f=fixture();const rows=Array.from({length:130001},()=>({date:'2026-01-01',product:'Shoe',qty:1,sellingPrice:50,purchasePrice:20}));
  assert.equal(f.env.VyaparUpload.rowsFrom({sales:rows}).length,130001);
});
test('Undoing a product import preserves unrelated sales, settings and the authenticated account',async()=>{
  const f=fixture(),app=source('app.js'),start=app.indexOf('  window.advRollbackImport=async function(){'),end=app.indexOf('\n  };',start)+6;
  vm.runInContext(app.slice(start,end),f.env);f.env.advToast=()=>{};
  f.env.state.sales=[{id:'keep-sale',date:'2026-01-01',qty:1,sellingPrice:30,purchasePrice:10}];
  f.env.state.subscription={plan:'business',verified:true,token:'keep-account'};f.env.state.plan='business';
  f.env.state.products=[{id:'old',name:'Old'},{id:'new',name:'New'}];
  f.env.state.imports=[{scope:'products',before:{products:[{id:'old',name:'Old'}]}}];
  await f.env.advRollbackImport();
  assert.equal(f.env.state.products.length,1);assert.equal(f.env.state.sales[0].id,'keep-sale');assert.equal(f.env.state.subscription.token,'keep-account');assert.equal(f.env.state.monthly[0].profit,5);assert.equal(f.env.state.imports.length,0);
});
