'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend-source/android/scripts/app.js'),'utf8');
const code=source.slice(source.indexOf('  function maybeShowPermissionSheet(){'),source.indexOf("  window.addEventListener('vyapar:session-ready'"));
function fixture(){
  const nodes=new Map(),store=new Map(),keys=new Map(),timers=[];let requested=0,gate=false,boot=false;
  const previous={isConnected:true,focus(){document.activeElement=this;}};
  const document={activeElement:previous,documentElement:{classList:{contains:()=>boot}},
    getElementById:id=>id==='vyaparOtpGate'?(gate?{}:null):nodes.get(id),
    addEventListener:(type,fn)=>keys.set(type,fn),removeEventListener:type=>keys.delete(type),
    body:{appendChild(node){nodes.set(node.id,node);}},
    createElement(){const buttons=['permissionLater','permissionContinue'].map(id=>({id,focus(){document.activeElement=this;}}));return {querySelector:selector=>buttons.find(b=>'#'+b.id===selector),querySelectorAll:()=>buttons,addEventListener(){},remove(){nodes.delete(this.id);}};}};
  const win={AndroidApp:{requestRecommendedPermissions(){requested++;}}};
  vm.runInNewContext(code+'window.showIntro=maybeShowPermissionSheet;',{window:win,document,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},setTimeout:fn=>timers.push(fn)});
  return {win,document,nodes,store,keys,timers,previous,get requested(){return requested;},gate(v){gate=v;},boot(v){boot=v;},sheet(){return nodes.get('androidPermissionSheet');}};
}
test('Permission intro waits for authenticated destination and boot completion',()=>{
  const f=fixture();f.gate(true);f.win.showIntro();assert.equal(f.nodes.size,0);
  f.gate(false);f.boot(true);f.win.showIntro();assert.equal(f.nodes.size,0);
  f.boot(false);f.timers.shift()();assert(f.sheet());assert.equal(f.requested,0);
});
test('Not now dismisses the short intro once without requesting native permissions',()=>{
  const f=fixture();f.win.showIntro();f.sheet().querySelector('#permissionLater').onclick();f.win.showIntro();
  assert.equal(f.nodes.size,0);assert.equal(f.requested,0);assert.equal(f.document.activeElement,f.previous);assert.equal(f.keys.size,0);
});
test('Continue requests permission once; browser sessions never show the native intro',()=>{
  const f=fixture();f.win.showIntro();f.sheet().querySelector('#permissionContinue').onclick();f.win.showIntro();assert.equal(f.requested,1);assert.equal(f.nodes.size,0);
  const browser=fixture();delete browser.win.AndroidApp;browser.win.showIntro();assert.equal(browser.nodes.size,0);
});
