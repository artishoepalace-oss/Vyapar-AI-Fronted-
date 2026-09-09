'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const dbDouble=require('./indexeddb-double.cjs');
const dir=path.join(__dirname,'../frontend-source/android/scripts');
const src=name=>fs.readFileSync(path.join(dir,name),'utf8');
function environment(extra={}){
  const memory=new Map(),events=[];
  const env={console,setTimeout,clearTimeout,queueMicrotask,TextDecoder,TextEncoder,Uint8Array,crypto:webcrypto,Date,Blob,URL,
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    CustomEvent:class{constructor(type,data){this.type=type;this.detail=data?.detail;}},dispatchEvent:event=>events.push(event),...extra};
  env.window=env;vm.createContext(env);return{env,memory,events,load:name=>vm.runInContext(src(name),env)};
}
const data=n=>({profile:{businessName:'Test shop'},settings:{theme:'dark'},sales:Array.from({length:n},(_,i)=>({id:'sale-'+i,date:'2026-02-14',product:'Item '+i,qty:1,sellingPrice:25,purchasePrice:10})),stocks:[],monthly:[],daily:[]});
test('Durable migration and reopen retain 100,001 records without localStorage record duplication',async()=>{
  const fake=dbDouble(),first=environment({indexedDB:fake.indexedDB});first.load('data-store.js');
  const state=data(100001);first.memory.set('vyapar_ai_prod_v1',JSON.stringify(state));
  await first.env.VyaparStorage.attach(()=>state,()=>assert.fail('No database exists yet'));
  assert.equal(first.env.VyaparStorage.getStatus().records,100001);
  const shell=JSON.parse(first.memory.get('vyapar_ai_prod_v1'));assert.equal(shell.__indexedDB,true);assert.equal(shell.sales,undefined);
  let recovered;const second=environment({indexedDB:fake.indexedDB,localStorage:first.env.localStorage});second.load('data-store.js');
  await second.env.VyaparStorage.attach(()=>recovered,v=>{recovered=v;});
  assert.equal(recovered.sales.length,100001);assert.equal(recovered.sales[100000].id,'sale-100000');assert.equal(second.env.VyaparStorage.bootReady,true);
});
test('Aborted restore leaves the committed snapshot and live state intact; retry commits and removes stale chunks',async()=>{
  const fake=dbDouble(),f=environment({indexedDB:fake.indexedDB});f.load('data-store.js');let live=data(2001);
  await f.env.VyaparStorage.attach(()=>live,()=>{});
  fake.failWrite=true;let applied=false;
  await assert.rejects(f.env.VyaparStorage.replace(data(3),()=>{applied=true;}),/Quota/);
  assert.equal(applied,false);assert.equal(live.sales.length,2001);assert.equal(fake.stores.get('meta').get('head').arrays.sales,2001);
  await f.env.VyaparStorage.replace(data(3),()=>{live=data(3);});
  await f.env.VyaparStorage.save(live); // rotates to the formerly larger slot
  assert.equal(fake.stores.get('meta').get('head').arrays.sales,3);
  assert.equal([...fake.stores.get('records').keys()].filter(k=>k.includes('/sales/')).length,2);
  assert.equal(f.env.VyaparStorage.getStatus().error,'');
});
test('IndexedDB clone failure rejects the save instead of acknowledging it',async()=>{
  const fake=dbDouble(),f=environment({indexedDB:fake.indexedDB});f.load('data-store.js');let live=data(1);await f.env.VyaparStorage.attach(()=>live,()=>{});
  await assert.rejects(f.env.VyaparStorage.save({...live,unsupported:()=>{}}));
  assert.equal(fake.stores.get('meta').get('head').arrays.sales,1);
});
test('Inaccessible primary storage holds startup; transient boot saves cannot overwrite it',async()=>{
  const fake=dbDouble();fake.unavailable=true;let blocked='';
  const f=environment({indexedDB:fake.indexedDB,VyaparWorkspace:{storageBlocked:message=>{blocked=message;}}});
  f.memory.set('vyapar_storage_backend_v1','indexeddb');f.load('data-store.js');f.env.VyaparStorage.save(data(0));
  await f.env.VyaparStorage.attach(()=>data(0),()=>assert.fail());
  assert.equal(f.env.VyaparStorage.bootReady,false);assert.match(blocked,/Storage unavailable/);assert.equal(fake.stores.size,0);
});
test('Legacy storage is kept when migration fails; subsequent save can retry',async()=>{
  const fake=dbDouble(),f=environment({indexedDB:fake.indexedDB});const live=data(12),legacy=JSON.stringify(live);f.memory.set('vyapar_ai_prod_v1',legacy);
  fake.failWrite=true;f.load('data-store.js');await f.env.VyaparStorage.attach(()=>live,()=>{});
  assert.equal(f.memory.get('vyapar_ai_prod_v1'),legacy);assert.equal(f.env.VyaparStorage.bootReady,true);
  await f.env.VyaparStorage.save(live);assert.equal(f.env.VyaparStorage.getStatus().mode,'indexeddb');
});
test('FileReader supports Android-style files without Blob.text and decodes UTF-8 and UTF-16 backups',async()=>{
  class Reader{readAsArrayBuffer(file){queueMicrotask(()=>{this.result=file.bytes;this.onload();});}}
  const f=environment({FileReader:Reader});f.load('file-io.js');
  const text=JSON.stringify(data(1));
  for(const bytes of [Buffer.from('\uFEFF'+text,'utf8'),Buffer.from('\uFEFF'+text,'utf16le')]){
    const file={size:bytes.length,bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    const parsed=f.env.VyaparFiles.parse(await f.env.VyaparFiles.readText(file));assert.equal(f.env.VyaparFiles.backupData(parsed).sales[0].id,'sale-0');
  }
  await assert.rejects(f.env.VyaparFiles.readText({size:65*1024*1024}),/64 MB/);
});
test('Unrelated JSON, invalid rows, prototype keys and malformed encryption cannot become a backup',async()=>{
  const f=environment();f.load('file-io.js');const io=f.env.VyaparFiles;
  for(const x of [{hello:'world'},[],{profile:{},sales:[null]},{data:[{profit:2}]}])assert.throws(()=>io.backupData(x));
  assert.throws(()=>io.parse('{"__proto__":{"bad":true}}'));
  await assert.rejects(io.decrypt({v:1,s:[1],i:[],d:[]},'secret'),/Invalid encrypted/);
  assert.equal(io.backupData({format:'vyapar-ai-backup',state:data(2)}).sales.length,2);
});
test('All-year aggregation agrees with the original finance engine, including returns, overrides and negative profit',()=>{
  const f=environment({document:{getElementById:()=>null,querySelectorAll:()=>[],documentElement:{}},MutationObserver:class{observe(){}},setTimeout:()=>0});
  f.env.state={sales:[{date:'2026-01-01',qty:2,sellingPrice:40,purchasePrice:20},{date:'2026-02-01',qty:1,sellingPrice:5,purchasePrice:10}],daily:[{date:'2026-01-01',sale:100,profit:60},{date:'2026-01-01',sale:110,profit:65}],monthly:[{month:'2026-01',profit:10},{month:'2026-01',profit:12},{month:'2025-04',profit:80}],transactions611:[{type:'SALE',date:'2026-01-01',items:[{qty:2,rate:30,purchaseRate:12}]},{type:'SALE_RETURN',date:'2026-01-02',items:[{qty:1,rate:30,purchaseRate:12}]},{type:'SALE',businessId:'OTHER',date:'2026-01-03',total:999},{type:'SALE',status:'cancelled',date:'2026-01-05',total:999}],expenses:[{date:'2026-02-03',amount:30},{date:'2024-01-01',amount:15}]};
  f.load('audit-stage2-6601.js');const old=f.env.VyaparFinance6601;
  f.load('profit-history.js');const result=f.env.VyaparProfit.build(f.env.state);
  for(const year of ['2024','2025','2026']){const expected=old.year(year);for(const key of ['revenue','profit','expenses','net'])assert.equal(result[year][key],expected[key],year+' '+key);}
  assert.equal(result['2026'].months['2026-02'].net,-35);assert.equal(result['2026'].months['2026-01'].profit,30);
  assert.equal(f.memory.size,0,'Finance reads must not write storage');
});
test('Dashboard stays bounded across 100 years and represents losses below zero',()=>{
  const node={innerHTML:'',classList:{contains:()=>false}};
  const f=environment({document:{getElementById:id=>id==='screen-analytics'?node:null}});f.env.state=data(0);
  f.env.state.monthly=Array.from({length:1200},(_,i)=>({month:(1927+Math.floor(i/12))+'-'+String(i%12+1).padStart(2,'0'),profit:i%3?-100:300}));
  f.load('profit-history.js');f.load('insights-workspace.js');f.env.VyaparInsights.render(true);
  assert.equal((node.innerHTML.match(/<svg/g)||[]).length,1);assert.equal((node.innerHTML.match(/<rect /g)||[]).length,12);
  assert.match(node.innerHTML,/chart-loss/);assert(node.innerHTML.length<22000);
  f.env.VyaparInsights.selectView('history');assert.equal((node.innerHTML.match(/onclick="VyaparInsights.selectYear/g)||[]).length,8);
  f.env.VyaparInsights.selectView('compare');assert.equal((node.innerHTML.match(/<svg/g)||[]).length,1);assert.equal((node.innerHTML.match(/<rect /g)||[]).length,24);
});
test('Record paging retains 100,001 records and never returns more than 40 rows',()=>{
  const f=environment();f.env.state=data(100001);f.env.renderSales=()=>{};f.load('record-pages.js');
  assert.equal(f.env.VyaparRecords.get('sales').rows.length,40);assert.equal(f.env.VyaparRecords.get('sales').rows[0].id,'sale-100000');
  f.env.VyaparRecords.page('sales',1);assert.equal(f.env.VyaparRecords.get('sales').rows[0].id,'sale-99960');
});
