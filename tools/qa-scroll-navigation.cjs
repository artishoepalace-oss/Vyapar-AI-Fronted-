/* Replays navigation from scrolled pages and real touch gestures. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(page,out,progress=console.log){
 const idle=()=>page.waitForFunction(()=>!document.documentElement.classList.contains('vy-page-transitioning'),null,{timeout:2500});
 const go=async tab=>{await page.evaluate(t=>setTab(t,false),tab);await idle();};
 const original=await page.evaluate(()=>({classes:[...document.documentElement.classList].filter(c=>/^perf-tier-/.test(c)||c==='perf-low-ram'||c==='perf-lite'),autoTop:state.settings.autoScrollTop}));
 const results=[];
 const session=await page.context().newCDPSession(page);
 const gesture=async (x,y,dx,dy)=>{
  // Dispatch touch input through the browser, including hit testing and scroll
  // chaining. Synthetic scroll gestures can be ignored by headless Chromium.
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=10;i++){
   await page.waitForTimeout(18);
   await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y:y+dy*i/10}]});
  }
  await page.waitForTimeout(80);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(90);
 };
 async function trace(tab,expected){
  const data=await page.evaluate(async({tab,expected})=>{
   const frames=[],viewport=innerWidth;
   document.querySelector('#nav [data-android-tab="'+tab+'"]').click();
   const immediate=scrollY,started=performance.now();
   await new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>reject(new Error('Scrolled navigation did not finish')),2400);
    function tick(){
     frames.push({y:scrollY,x:scrollX,width:innerWidth});
     if(!document.documentElement.classList.contains('vy-page-transitioning')&&performance.now()-started>520){clearTimeout(deadline);return resolve();}
     requestAnimationFrame(tick);
    }
    tick();
   });
   return {tab,expected,immediate,frames,viewport,headerTop:document.querySelector('.top').getBoundingClientRect().top,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
  },{tab,expected});
  assert(Math.abs(data.immediate-expected)<1.5,'Destination scroll position is ready before its first frame: '+tab);
  assert(data.frames.every(f=>Math.abs(f.y-expected)<1.5),'No vertical scrolling competes with the horizontal slide: '+tab);
  assert(data.frames.every(f=>f.x===0),'Page never drifts horizontally: '+tab);
  assert(data.frames.every(f=>f.width===data.viewport),'Mobile viewport never expands during a slide: '+tab);
  assert(Math.abs(data.headerTop-8)<1,'Header remains pinned at a scrolled destination: '+tab);
  assert(data.scrollWidth<=data.width,'Settled destination fits the viewport');
  results.push({tab,expected,immediate:data.immediate,frames:data.frames.length,headerTop:data.headerTop});
 }
 try{
  for(const tier of ['modern','legacy']){
   progress('Checking scrolled navigation: '+tier);
   await page.evaluate(tier=>{
    const root=document.documentElement;
    root.classList.remove('perf-tier-modern','perf-tier-mid','perf-tier-legacy','perf-low-ram','perf-lite');
    root.classList.add('perf-tier-'+tier);if(tier==='legacy')root.classList.add('perf-low-ram');
    state.settings.autoScrollTop=false;
   },tier);
   await go('business');await page.evaluate(()=>vyaparMotion.scrollTo(0));
   await go('home');await page.evaluate(()=>vyaparMotion.scrollTo(600));await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>scrollY),600,'Fixture has a real scrolled Home page');
   await trace('business',0);
   await page.evaluate(()=>vyaparMotion.scrollTo(220));await page.waitForTimeout(50);
   await trace('home',600);
  }
  progress('Checking vertical and horizontal touch gestures');
  await gesture(180,450,0,-100);
  assert(await page.evaluate(()=>scrollY>620),'Ordinary vertical touch scrolling still works');
  await gesture(270,350,-190,0);
  assert.equal(await page.evaluate(()=>scrollX),0,'A sideways drag cannot move the page');
  const header=await page.locator('.top').boundingBox();assert(Math.abs(header.y-8)<1,'Sticky header survives manual scrolling');

  progress('Checking table sideways scroll stays inside its container');
  await go('business');
  await page.locator('#screen-business .p1-modebar [data-mode="activity"]').click();
  const table=page.locator('#screen-business .vx621-table-wrap:visible').first();
  await table.waitFor({state:'visible'});
  await table.evaluate(el=>{el.scrollLeft=0;vyaparMotion.scrollTo(scrollY+el.getBoundingClientRect().top-180);});
  await page.waitForTimeout(100);
  const box=await table.boundingBox();
  await gesture(box.x+box.width-30,box.y+Math.min(box.height/2,45),-150,0);
  assert(await table.evaluate(el=>el.scrollLeft>20),'Record table still scrolls sideways by touch');
  assert.equal(await page.evaluate(()=>scrollX),0,'Table scroll does not move the viewport');
  await page.locator('#screen-business .p1-modebar [data-mode="daily"]').click();

  progress('Checking popup background scroll lock');
  await go('home');await page.evaluate(()=>vyaparMotion.scrollTo(600));
  await page.locator('#nav [data-android-tab="more"]').click();
  await page.waitForFunction(()=>{const el=document.querySelector('#androidMoreSheet .android-sheet');return el&&getComputedStyle(el).transform==='none';});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'hidden');
  await gesture(180,100,0,-65);
  assert.equal(await page.evaluate(()=>scrollY),600,'More backdrop does not scroll the underlying page');
  assert(Math.abs((await page.locator('.top').boundingBox()).y-8)<1,'Opening More does not displace the header');
  await page.evaluate(()=>handleNativeBackPress());await page.waitForSelector('#androidMoreSheet',{state:'detached'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('vy-popup-open'));
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY),'auto');
  await gesture(180,450,0,-80);
  assert(await page.evaluate(()=>scrollY>620),'Closing More restores vertical touch scrolling');

  await page.evaluate(()=>{state.settings.autoScrollTop=true;});await trace('business',0);await trace('home',0);
  fs.writeFileSync(path.join(out,'scroll-navigation.json'),JSON.stringify(results,null,2));
 }finally{
  await session.detach();
  await page.evaluate(original=>{const root=document.documentElement;root.classList.remove('perf-tier-modern','perf-tier-mid','perf-tier-legacy','perf-low-ram','perf-lite');root.classList.add(...original.classes);state.settings.autoScrollTop=original.autoTop;vyaparMotion.scrollTo(0);},original);
 }
};
