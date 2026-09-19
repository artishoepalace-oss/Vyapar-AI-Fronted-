'use strict';
// Exercise the production navbar coordinator with measured DOM rectangle doubles.
// Pixel layout and animation rendering still need a real browser/device.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../frontend-source/android/scripts/app.js'),'utf8');
const source=app.slice(app.indexOf('  function installNavGlassInteraction(nav){'),app.indexOf('  function updateHeader(){',app.indexOf('  function installNavGlassInteraction(nav){')));
function fixture(resizeObserver=true){
  const observers=[],frames=[],events={},ids=['home','business','sales','stock','more'];
  let current='home',more=false,locked=false,builds=0,buttons=[],track,capsule;
  function classes(names=''){
    const set=new Set(names.split(/\s+/).filter(Boolean));
    return {contains:x=>set.has(x),add:x=>set.add(x),toggle(x,on){if(on)set.add(x);else set.delete(x);}};
  }
  function mount(html){
    builds++;capsule={style:{transition:'',transform:''},getBoundingClientRect:()=>({width:68,height:42})};
    track={left:22.5,width:355,getBoundingClientRect(){return {left:this.left,width:this.width};},querySelector:()=>buttons.find(b=>b.classList.contains('active'))};
    buttons=[...html.matchAll(/<button type="button" data-android-tab="(\w+)" data-index="\d" class="([^"]*)"/g)].map((m,index)=>({
      dataset:{androidTab:m[1]},classList:classes(m[2]),attributes:{},innerHTML:'',
      // Deliberately unequal widths and fractional coordinates: no index*width shortcut.
      rect:{left:track.left+[0,70.7,142.1,213.2,284.5][index],width:[70.7,71.4,71.1,71.3,70.5][index]},
      getBoundingClientRect(){return this.rect;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}
    }));
  }
  const nav={dataset:{},classList:classes('nav'),contains:b=>buttons.includes(b),
    set innerHTML(html){mount(html);},querySelectorAll:()=>buttons,
    querySelector(s){if(s==='#navTrack')return track;if(s==='#activeCapsule')return capsule;return buttons.find(b=>b.dataset.androidTab==='more');},
    addEventListener(type,fn){(events['nav:'+type]??=[]).push(fn);}
  };
  const env={console,navIcons:Object.fromEntries(ids.map(id=>[id,'<svg></svg>'])),navLockSvg:'<svg class="android-nav-lock"></svg>',moreSheetTrigger:null,
    document:{getElementById:id=>id==='nav'?nav:id==='androidMoreSheet'&&more?{}:null},
    visibleTab:()=>current,tabIsLocked:id=>locked&&['business','stock'].includes(id),
    requestAnimationFrame:fn=>frames.push(fn),addEventListener(type,fn){(events[type]??=[]).push(fn);}
  };
  if(resizeObserver)env.ResizeObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(t){this.target=t;}disconnect(){this.disconnected=true;}};
  env.window=env;vm.createContext(env);vm.runInContext(source,env);
  env.openMoreSheet=()=>{more=!more;env.renderNav();};
  env.setTab=id=>{if(env.tabIsLocked(id))return false;current=id;env.renderNav();return true;};
  env.renderNav();
  return {env,nav,events,observers,ids,get buttons(){return buttons;},get capsule(){return capsule;},get track(){return track;},get builds(){return builds;},
    setCurrent(id){current=id;env.renderNav();},setLocked(on){locked=on;env.renderNav();},setMore(on){more=on;env.renderNav();},
    click(id){const b=buttons.find(b=>b.dataset.androidTab===id);for(const fn of events['nav:click'])fn({target:{closest:()=>b},preventDefault(){}});},
    flush(){while(frames.length)frames.shift()();},x(){return parseFloat(capsule.style.transform.match(/translate3d\(([^p]+)px/)[1]);}
  };
}
function centered(f,id){
  const b=f.buttons.find(b=>b.dataset.androidTab===id);
  assert(Math.abs(f.x()+f.track.left+34-b.rect.left-b.rect.width/2)<1e-9,'Capsule center matches measured tab center');
  assert.deepEqual(f.buttons.filter(b=>b.classList.contains('active')).map(b=>b.dataset.androidTab),[id]);
}
test('All five destinations center a fixed capsule on measured fractional tab rectangles',()=>{
  const f=fixture();f.flush();centered(f,'home');
  for(const id of f.ids.slice(1)){f.click(id);centered(f,id);}
  assert.equal(f.builds,1,'Tab changes preserve capsule and DOM identity');
  assert.equal(f.observers.length,1,'Only one track observer');
  assert.equal(f.events['nav:click'].length,1,'Only one navigation owner');
});
test('More close and non-navbar destinations track the actual navigation state',()=>{
  const f=fixture();f.click('sales');f.click('more');centered(f,'more');
  assert.equal(f.buttons[4].attributes['aria-expanded'],'true');
  f.setMore(false);centered(f,'sales');
  f.setCurrent('settings');centered(f,'more');
  f.setCurrent('home');centered(f,'home');
});
test('Locked tabs retain the real active page and lock changes keep content wrappers',()=>{
  const f=fixture();f.setLocked(true);f.click('business');centered(f,'home');
  assert(f.buttons[1].classList.contains('is-locked'));
  assert.match(f.buttons[1].innerHTML,/class="nav-content"/);
  assert.match(f.buttons[1].innerHTML,/android-nav-lock/);
  f.setLocked(false);f.click('business');centered(f,'business');
  assert.doesNotMatch(f.buttons[1].innerHTML,/android-nav-lock/);assert.equal(f.builds,1);
});
test('ResizeObserver remeasures the active tab without a startup or resize transition',()=>{
  const f=fixture();f.flush();f.click('stock');f.track.left=8;f.track.width=280;
  f.buttons[3].rect={left:188.25,width:56};f.observers[0].fn();centered(f,'stock');
  assert.equal(f.capsule.style.transition,'');assert.equal(f.observers.length,1);
});
test('Older WebViews use resize and orientation fallback without ResizeObserver',()=>{
  const f=fixture(false);f.flush();f.click('sales');
  f.buttons[2].rect={left:160.125,width:64};f.events.resize[0]();centered(f,'sales');
  f.buttons[2].rect={left:200.5,width:71};f.events.orientationchange[0]();f.flush();centered(f,'sales');
  assert.equal(f.events.resize.length,1);assert.equal(f.observers.length,0);
});
