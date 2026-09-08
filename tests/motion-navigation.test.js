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
      setAttribute(){},removeAttribute(){},getClientRects:()=>[{}],
      addEventListener(type,fn){(events[type]||=[]).push(fn)},removeEventListener(type,fn){events[type]=(events[type]||[]).filter(x=>x!==fn)},
      querySelector:()=>el.card||null,querySelectorAll:()=>[],contains:node=>node===el||node===el.card,
      remove(){el.isConnected=false;nodes.delete(id)},focus(){env.document.activeElement=el},
      dispatch(type,event){(events[type]||[]).slice().forEach(fn=>fn({target:el,...event}))}
    };nodes.set(id,el);return el;
  }
  const html=element('html'),body=element('body');
  const tabs=['home','business','sales','stock','analytics','upload','calculator','subscription','settings'];
  const screens=tabs.map(tab=>{const el=element('screen-'+tab);if(tab!=='home')el.classList.add('hide');return el;});
  const env={console,Map,WeakMap,Set,Math,Number,Object,Array,Boolean,JSON,
    state:{settings:{autoScrollTop:false}},currentTab:'home',allowed:true,innerWidth:360,scrollY:0,
    document:{documentElement:html,body,scrollingElement:html,activeElement:body,readyState:'loading',
      getElementById:id=>nodes.get(id)||null,querySelectorAll:selector=>selector==='.screen'?screens:[],
      addEventListener(type,fn){(listeners[type]||=[]).push(fn)},removeEventListener(){}},
    matchMedia:()=>({matches:reduce}),getComputedStyle:node=>({transform:node.style.getPropertyValue('transform')||'none',display:'block',visibility:'visible'}),
    requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    scrollTo(x,y){assert.equal(html.style.getPropertyValue('scroll-behavior'),'auto');env.scrollY=y;html.scrollTop=y;},
    requiredPlanForTab:tab=>tab==='business'||tab==='stock'?'business':null,requirePlan:()=>env.allowed,
    drawAnalyticsCharts(){},showTabLoader(){throw new Error('Tab loader must not interrupt navigation');},
    MutationObserver:class{observe(){}}
  };env.window=env;
  vm.createContext(env);
  const source=platform==='android'?read(path.join(root,'frontend-source/android/scripts/motion-20102004.js'),'utf8'):read(path.join(root,'web/assets/scripts/motion-20102004.js'),'utf8');
  vm.runInContext(source,env);
  const app=read(path.join(root,platform==='android'?'frontend-source/android/scripts/app.js':'web/assets/scripts/app.js'),'utf8');
  vm.runInContext(app.slice(app.indexOf('function setTab(tab,'),app.indexOf('\nfunction renderNav(){',app.indexOf('function setTab(tab,'))),env);
  return {env,element,nodes,screens,html,frames,timers,flushFrames(){const list=[...frames.values()];frames.clear();list.forEach(fn=>fn());},finish(){this.flushFrames();const list=[...timers.values()];timers.clear();list.forEach(fn=>fn());}};
}
for(const platform of ['android','web']){
 test(platform+': page transitions retain draft state and restore scroll before the animation frame',()=>{
  const f=fixture(platform);f.env.scrollY=410;f.html.style.setProperty('scroll-behavior','smooth','important');
  assert.equal(f.env.setTab('sales',true),true);assert.equal(f.env.scrollY,0);
  const sales=f.nodes.get('screen-sales');assert.match(sales.style.getPropertyValue('transform'),/translate3d\(58px/);
  assert.equal(sales.value,'unsaved draft');assert.equal(f.screens.filter(s=>!s.classList.contains('hide')).length,1);
  assert.equal(f.html.style.getPropertyValue('scroll-behavior'),'smooth');f.finish();
  f.env.scrollY=780;assert.equal(f.env.setTab('home'),true);assert.equal(f.env.scrollY,410);
  assert.match(f.nodes.get('screen-home').style.getPropertyValue('transform'),/translate3d\(-58px/);f.finish();
  f.env.setTab('sales');assert.equal(f.env.scrollY,780);f.finish();assert.equal(sales.style.getPropertyValue('transform'),'');
 });
 test(platform+': blocked/unknown/same-page navigation cannot hide the current screen or animate scroll',()=>{
  const f=fixture(platform);f.env.allowed=false;f.env.scrollY=240;
  assert.equal(f.env.setTab('business'),false);assert.equal(f.env.currentTab,'home');assert.equal(f.env.scrollY,240);assert.equal(f.frames.size,0);
  assert.equal(f.env.setTab('missing'),false);assert.equal(f.env.setTab('home'),true);assert.equal(f.env.scrollY,240);
 });
 test(platform+': rapid page taps cancel obsolete frames and auto-top remains optional',()=>{
  const f=fixture(platform);
  for(const tab of ['sales','stock','business','home','settings','calculator','sales'])f.env.setTab(tab);
  f.finish();assert.equal(f.env.currentTab,'sales');assert.equal(f.screens.filter(s=>!s.classList.contains('hide')).length,1);
  for(const node of f.screens)assert.equal(node.style.getPropertyValue('transform'),'');
  f.env.scrollY=700;f.env.setTab('home');f.env.state.settings.autoScrollTop=true;f.env.setTab('sales');assert.equal(f.env.scrollY,0);
 });
}
test('Default motion runs on legacy/Lite devices; system reduced-motion settles immediately',()=>{
 const f=fixture();f.html.classList.add('perf-lite');const node=f.nodes.get('screen-home');f.env.vyaparMotion.enter(node,1);f.flushFrames();assert.match(node.style.getPropertyValue('transition'),/232ms/);f.finish();
 const reduced=fixture('android',true);reduced.env.setTab('sales');assert.equal(reduced.frames.size,0);assert.equal(reduced.nodes.get('screen-sales').style.getPropertyValue('transform'),'');
});
test('Interrupted transitions restore original inline properties and priorities',()=>{
 const f=fixture();const node=f.nodes.get('screen-home');node.style.setProperty('transform','scale(1)','important');node.style.setProperty('opacity','.8');
 f.env.vyaparMotion.enter(node,1);f.env.vyaparMotion.enter(node,-1);f.finish();
 assert.equal(node.style.getPropertyValue('transform'),'scale(1)');assert.equal(node.style.getPropertyPriority('transform'),'important');assert.equal(node.style.getPropertyValue('opacity'),'.8');assert.equal(node.style.getPropertyValue('will-change'),'');
});
test('Popup close is animated, backdrop absorbs taps, resolver runs exactly once',()=>{
 const f=fixture();const overlay=f.element('test-popup');overlay.card=f.element('test-card');let resolved=0;
 f.env.vyaparMotion.openOverlay(overlay);f.flushFrames();f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;overlay.remove();});
 f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;});assert.equal(resolved,0);assert(overlay.isConnected);assert.equal(overlay.style.getPropertyValue('pointer-events'),'auto');
 let blocked=false;overlay.dispatch('click',{preventDefault(){},stopImmediatePropagation(){blocked=true;}});assert(blocked);
 f.finish();assert.equal(resolved,1);assert(!overlay.isConnected);assert.equal(overlay.card.style.getPropertyValue('transform'),'');
});
test('Replacing a closing dialog settles the prior result without a stale timer',()=>{
 const f=fixture();const overlay=f.element('test-popup');overlay.card=f.element('test-card');let resolved=0;
 f.env.vyaparMotion.openOverlay(overlay);f.env.vyaparMotion.closeOverlay(overlay,()=>{resolved++;overlay.remove();});f.env.vyaparMotion.cancelOverlay(overlay);f.finish();assert.equal(resolved,1);
});
test('Release identity, motion load order, synchronized rounded logo and last CSS are preserved',()=>{
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'version.json'))).versionName,'20.10.2004.00002.2026');
 for(const base of ['web','android-app/app/src/main/assets']){
  const html=fs.readFileSync(path.join(root,base,'index.html'),'utf8');assert(html.indexOf('motion-20102004.css')>html.indexOf('surface-hierarchy-20102004.css'));
  const bundle=fs.readFileSync(path.join(root,base,'assets/scripts/vyapar-app.js'),'utf8');assert(bundle.indexOf('SCRIPT SOURCE: motion-20102004.js')<bundle.indexOf('SCRIPT SOURCE: auth.js'));
  const logo=fs.readFileSync(path.join(root,base,'assets/images/logo.png'));assert(logo.equals(fs.readFileSync(path.join(root,'android-app/app/src/main/res/drawable/ic_launcher.png'))));
 }
});
