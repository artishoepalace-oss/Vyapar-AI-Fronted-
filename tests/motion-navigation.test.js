'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=require('./runtime-source.cjs');
const root=path.resolve(__dirname,'..');
function fixture(platform='android',reduce=false){
  const frames=new Map(),timers=new Map(),nodes=new Map(),listeners={};let sequence=0;
  function element(id){
    const values=new Map(),priorities=new Map(),classes=new Set(),events={};
    const el={id,hidden:false,isConnected:true,offsetWidth:360,dataset:{},value:'unsaved draft',children:[],
      style:{setProperty(p,v,q=''){values.set(p,v);priorities.set(p,q)},getPropertyValue:p=>values.get(p)||'',getPropertyPriority:p=>priorities.get(p)||'',removeProperty(p){values.delete(p);priorities.delete(p)}},
      classList:{add(...a){a.forEach(x=>classes.add(x))},remove(...a){a.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,yes){if(yes===undefined)yes=!classes.has(x);if(yes)classes.add(x);else classes.delete(x);return yes;}},
      setAttribute(){},removeAttribute(){},getClientRects:()=>[{}],getBoundingClientRect:()=>({top:80,left:0,width:360,height:900}),
      addEventListener(type,fn){(events[type]||=[]).push(fn)},removeEventListener(type,fn){events[type]=(events[type]||[]).filter(x=>x!==fn)},
      querySelector:()=>el.card||null,querySelectorAll:()=>[],contains:node=>node===el||node===el.card,
      remove(){el.isConnected=false;nodes.delete(id)},focus(){env.document.activeElement=el},dispatch(type,event){(events[type]||[]).slice().forEach(fn=>fn({target:el,...event}))}
    };nodes.set(id,el);return el;
  }
  const html=element('html'),body=element('body');
  const tabs=['home','business','sales','stock','analytics','upload','calculator','subscription','settings'];
  const screens=tabs.map(tab=>{const el=element('screen-'+tab);if(tab!=='home')el.classList.add('hide');return el;});
  const env={console,Map,WeakMap,Set,Math,Number,Object,Array,Boolean,JSON,state:{settings:{autoScrollTop:false}},currentTab:'home',allowed:true,innerWidth:360,innerHeight:800,scrollY:0,
    document:{documentElement:html,body,scrollingElement:html,activeElement:body,readyState:'loading',getElementById:id=>nodes.get(id)||null,querySelectorAll:selector=>selector==='.screen'?screens:[],addEventListener(type,fn){(listeners[type]||=[]).push(fn)},removeEventListener(){}},
    matchMedia:()=>({matches:reduce}),getComputedStyle:node=>({transform:node.style.getPropertyValue('transform')||'none',display:'block',visibility:'visible'}),
    requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    scrollTo(x,y){assert.equal(html.style.getPropertyValue('scroll-behavior'),'auto');env.scrollY=y;html.scrollTop=y;},requiredPlanForTab:tab=>tab==='business'||tab==='stock'?'business':null,requirePlan:()=>env.allowed,drawAnalyticsCharts(){},showTabLoader(){throw new Error('Tab loader must not interrupt navigation');},MutationObserver:class{observe(){}}
  };env.window=env;vm.createContext(env);
  vm.runInContext(read(path.join(root,platform==='android'?'frontend-source/android/scripts/motion-20102004.js':'web/assets/scripts/motion-20102004.js'),'utf8'),env);
  const app=read(path.join(root,platform==='android'?'frontend-source/android/scripts/app.js':'web/assets/scripts/app.js'),'utf8');
  vm.runInContext(app.slice(app.indexOf('function setTab(tab,'),app.indexOf('\nfunction renderNav(){',app.indexOf('function setTab(tab,'))),env);
  return {env,element,nodes,screens,html,frames,timers,flushFrames(){const list=[...frames.values()];frames.clear();list.forEach(fn=>fn());},finish(){for(let i=0;i<5&&frames.size;i++)this.flushFrames();const list=[...timers.values()];timers.clear();list.forEach(fn=>fn());for(let i=0;i<3&&frames.size;i++)this.flushFrames();}};
}
for(const platform of ['android','web']){
 test(platform+': compositor handoff retains outgoing pixels and preserves draft/scroll',()=>{
  const f=fixture(platform);f.env.scrollY=410;f.html.style.setProperty('scroll-behavior','smooth','important');
  assert.equal(f.env.setTab('sales',true),true);assert.equal(f.env.scrollY,0);
  const sales=f.nodes.get('screen-sales'),home=f.nodes.get('screen-home');
  assert.match(sales.style.getPropertyValue('transform'),/translate3d\(43px/);assert(home.classList.contains('hide'));assert(home.classList.contains('vy-page-outgoing'));assert.equal(home.style.getPropertyValue('display'),'block');
  assert.equal(sales.value,'unsaved draft');assert.equal(f.screens.filter(s=>!s.classList.contains('hide')).length,1);assert.equal(f.html.style.getPropertyValue('scroll-behavior'),'smooth');
  f.finish();assert(!home.classList.contains('vy-page-outgoing'));assert.equal(home.style.getPropertyValue('display'),'');
  f.env.scrollY=780;assert.equal(f.env.setTab('home'),true);assert.equal(f.env.scrollY,410);assert.match(f.nodes.get('screen-home').style.getPropertyValue('transform'),/translate3d\(-43px/);f.finish();
 });
 test(platform+': rapid taps settle obsolete handoffs and leave one logical screen',()=>{
  const f=fixture(platform);for(const tab of ['sales','stock','business','home','settings','calculator','sales'])f.env.setTab(tab);f.finish();
  assert.equal(f.env.currentTab,'sales');assert.equal(f.screens.filter(s=>!s.classList.contains('hide')).length,1);for(const node of f.screens){assert.equal(node.style.getPropertyValue('transform'),'');assert(!node.classList.contains('vy-page-outgoing'));}
  f.env.scrollY=700;f.env.setTab('home');f.env.state.settings.autoScrollTop=true;f.env.setTab('sales');assert.equal(f.env.scrollY,0);
 });
}
for(const platform of ['android','web']){
 test(platform+': blocked, unknown and same-page navigation never starts a transition',()=>{
  const f=fixture(platform);f.env.allowed=false;f.env.scrollY=240;
  assert.equal(f.env.setTab('business'),false);assert.equal(f.env.currentTab,'home');assert.equal(f.env.scrollY,240);assert.equal(f.frames.size,0);
  assert.equal(f.env.setTab('missing'),false);assert.equal(f.env.setTab('home'),true);assert.equal(f.env.scrollY,240);
 });
}
test('Interrupted micro transitions restore original inline properties and priorities',()=>{
 const f=fixture();const node=f.nodes.get('screen-home');node.style.setProperty('transform','scale(1)','important');node.style.setProperty('opacity','.8');
 f.env.vyaparMotion.enter(node,1);f.env.vyaparMotion.enter(node,-1);f.finish();assert.equal(node.style.getPropertyValue('transform'),'scale(1)');assert.equal(node.style.getPropertyPriority('transform'),'important');assert.equal(node.style.getPropertyValue('opacity'),'.8');assert.equal(node.style.getPropertyValue('will-change'),'');
});
test('Fast popup close never replays entrance motion or leaves a stale timer',()=>{
 const f=fixture();const overlay=f.element('fast-popup');overlay.card=f.element('fast-card');let resolved=0;f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;overlay.remove();});assert.equal(f.frames.size,2);f.env.vyaparMotion.cancelOverlay(overlay);f.finish();assert.equal(resolved,1);
});
test('Lite motion stays fast and reduced-motion settles immediately',()=>{
 const f=fixture();f.html.classList.add('perf-lite');const node=f.nodes.get('screen-home');f.env.vyaparMotion.enter(node,1);f.flushFrames();assert.match(node.style.getPropertyValue('transition'),/148ms/);f.finish();
 const reduced=fixture('android',true);reduced.env.setTab('sales');assert.equal(reduced.frames.size,0);assert.equal(reduced.nodes.get('screen-sales').style.getPropertyValue('transform'),'');
});
test('Popup close remains single-owner and resolver executes once',()=>{
 const f=fixture();const overlay=f.element('test-popup');overlay.card=f.element('test-card');let resolved=0;f.env.vyaparMotion.openOverlay(overlay);f.flushFrames();f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;overlay.remove();});f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;});assert.equal(resolved,0);f.finish();assert.equal(resolved,1);assert(!overlay.isConnected);
});
test('Release identity and bundled motion order are synchronized',()=>{
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'version.json'))).versionName,'20.10.2004.00008.2026');
 for(const base of ['web','android-app/app/src/main/assets']){
  const html=fs.readFileSync(path.join(root,base,'index.html'),'utf8');assert(html.includes('vyapar-ui.css?v=2010200408-workspace1'));assert(!html.includes('motion-20102004.css'));assert(!html.includes('surface-hierarchy-20102004.css'));
  const styles=fs.readFileSync(path.join(root,base,'assets/styles/vyapar-ui.css'),'utf8');assert(styles.indexOf('STYLE SOURCE: surface-hierarchy-20102004.css')<styles.indexOf('STYLE SOURCE: motion-20102004.css'));
  const scripts=fs.readFileSync(path.join(root,base,'assets/scripts/vyapar-app.js'),'utf8');assert(scripts.indexOf('SCRIPT SOURCE: motion-20102004.js')<scripts.indexOf('SCRIPT SOURCE: auth.js'));
 }
});
