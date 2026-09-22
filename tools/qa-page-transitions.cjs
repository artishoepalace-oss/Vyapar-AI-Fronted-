/* Runs inside the mocked-account navigation browser gate. Measures rendered pixels,
 * not just declared keyframes, so legacy !important CSS cannot silently disable motion. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(page,out,width){
 const idle=()=>page.waitForFunction(()=>!document.documentElement.classList.contains('vy-page-transitioning'),null,{timeout:2500});
 const go=async tab=>{await page.evaluate(t=>setTab(t,false),tab);await idle();};
 const tabs=['home','business','sales','stock'],results=[];
 await page.evaluate(()=>{document.documentElement.classList.remove('perf-lite');state.settings.autoScrollTop=true;});
 async function sample(to,more=false){
  return page.evaluate(async ({to,more})=>{
   const previous=document.querySelector('.screen:not(.hide)'),incoming=document.getElementById('screen-'+to);
   const x=node=>{const transform=getComputedStyle(node).transform;return transform==='none'?0:new DOMMatrixReadOnly(transform).m41;};
   const nav=document.getElementById('nav'),header=document.querySelector('.top');
   const navRect=nav.getBoundingClientRect(),headerRect=header.getBoundingClientRect();
   const frames=[],start=performance.now();
   if(more)document.querySelector('#androidMoreSheet [data-tab="'+to+'"]').click();
   else document.querySelector('#nav [data-android-tab="'+to+'"]').click();
   let started=false,overlap=false;
   await new Promise((resolve,reject)=>{
    function tick(){
     const active=document.documentElement.classList.contains('vy-page-transitioning');
     if(active){
      started=true;overlap=overlap||!!document.getElementById('androidMoreSheet');
      const nr=nav.getBoundingClientRect(),hr=header.getBoundingClientRect();
      frames.push({t:performance.now()-start,inX:x(incoming),outX:x(previous),screens:document.querySelectorAll('.screen:not(.hide)').length,
       navMove:Math.abs(nr.x-navRect.x)+Math.abs(nr.y-navRect.y),headerMove:Math.abs(hr.x-headerRect.x)+Math.abs(hr.y-headerRect.y),
       scrollWidth:document.documentElement.scrollWidth});
     }
     if(started&&!active)return resolve();
     if(performance.now()-start>2200)return reject(new Error('Page slide never completed: '+to));
     requestAnimationFrame(tick);
    }
    tick();
   });
   return {frames,overlap,destination:document.querySelector('.screen:not(.hide)').id,elapsed:performance.now()-start,travel:innerWidth};
  },{to,more});
 }
 function check(data,sign,label){
  assert(data.frames.length>=8,'Visible animation frames: '+label);
  assert(new Set(data.frames.map(f=>Math.round(f.inX))).size>=8,'Page actually slides: '+label);
  assert(data.frames[0].inX*sign>data.travel*.65,'Destination starts at the correct edge: '+label);
  let previous=data.travel+2;
  for(const f of data.frames){
   const distance=f.inX*sign;
   assert(distance>=-1&&distance<=previous+1,'No reversal or overshoot: '+label);previous=distance;
   assert(Math.abs((f.inX-f.outX)-data.travel*sign)<2,'Both screens slide together: '+label);
   assert.equal(f.screens,1,'One logical destination during slide');
   assert(f.navMove<1&&f.headerMove<1,'Bars remain stable: '+label);
   assert(f.scrollWidth<=width,'No horizontal overflow: '+label);
  }
  assert(!data.overlap,'More closes before the page slide starts');
  assert(data.elapsed>=380,'Smooth page transition has time to render: '+label);
  results.push({label,frames:data.frames.length,positions:new Set(data.frames.map(f=>Math.round(f.inX))).size,elapsed:Math.round(data.elapsed)});
 }
 for(const from of tabs)for(const to of tabs){
  if(from===to)continue;await go(from);
  const data=await sample(to);check(data,tabs.indexOf(to)>tabs.indexOf(from)?1:-1,from+' → '+to);
  assert.equal(data.destination,'screen-'+to);
 }
 // Every More destination opens right-to-left, even from a later-ranked page.
 for(const to of ['analytics','upload','calculator','subscription','settings']){
  await go(to==='settings'?'calculator':'settings');
  await page.locator('#nav [data-android-tab="more"]').click();
  await page.waitForFunction(()=>{const p=document.querySelector('#androidMoreSheet .android-sheet');return p&&getComputedStyle(p).transform==='none';});
  const data=await sample(to,true);check(data,1,'More → '+to);assert.equal(data.destination,'screen-'+to);
 }
 await go('home');
 const rapid=await page.evaluate(async()=>{
  const click=tab=>document.querySelector('#nav [data-android-tab="'+tab+'"]').click();
  click('business');await new Promise(r=>setTimeout(r,100));
  const node=document.getElementById('screen-business'),before=node.getBoundingClientRect().x;
  click('stock');click('sales');
  return {before,after:node.getBoundingClientRect().x,current:document.querySelector('.screen:not(.hide)').id};
 });
 assert(Math.abs(rapid.before-rapid.after)<1,'Rapid taps do not snap the visible page');
 assert.equal(rapid.current,'screen-business');await idle();
 assert.equal(await page.locator('.screen:not(.hide)').getAttribute('id'),'screen-sales','Latest tap wins');
 await go('stock');
 await page.evaluate(()=>{document.querySelector('#nav [data-android-tab="sales"]').click();handleNativeBackPress();});await idle();
 assert.equal(await page.locator('.screen:not(.hide)').getAttribute('id'),'screen-home','Back during a slide ends on Home');
 await page.evaluate(()=>{document.querySelector('#nav [data-android-tab="business"]').click();document.querySelector('#nav [data-android-tab="more"]').click();});
 await idle();await page.waitForSelector('#androidMoreSheet');
 await page.waitForTimeout(100);
 const interruption=await page.evaluate(()=>{
  const node=document.querySelector('#androidMoreSheet .android-sheet'),before=node.getBoundingClientRect().y;
  handleNativeBackPress();handleNativeBackPress();return {before,after:node.getBoundingClientRect().y};
 });
 assert(Math.abs(interruption.before-interruption.after)<2,'More dismissal keeps the visible frame');
 await page.waitForSelector('#androidMoreSheet',{state:'detached'});
 await page.locator('#nav [data-android-tab="more"]').click();await page.waitForTimeout(700);
 await page.screenshot({path:path.join(out,'smooth-more-'+width+'.png')});
 await page.evaluate(()=>handleNativeBackPress());await page.waitForSelector('#androidMoreSheet',{state:'detached'});
 await page.evaluate(()=>document.querySelector('#nav [data-android-tab="stock"]').click());await page.waitForTimeout(100);
 await page.setViewportSize({width:width+24,height:760});await idle();
 await page.setViewportSize({width,height:760});
 assert.equal(await page.locator('.vy-page-incoming,.vy-page-outgoing').count(),0,'Resize cleans up page layers');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#nav [data-android-tab="home"]').click();
 assert.equal(await page.locator('.vy-page-incoming,.vy-page-outgoing').count(),0,'Reduced motion has no slide');
 await page.locator('#nav [data-android-tab="more"]').click();
 await page.locator('#androidMoreSheet [data-tab="calculator"]').click();
 assert.equal(await page.locator('#androidMoreSheet').count(),0);assert.equal(await page.locator('.screen:not(.hide)').getAttribute('id'),'screen-calculator');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await go('home');
 if(width===360){
  for(const tab of ['business','home']){
   await page.evaluate(t=>document.querySelector('#nav [data-android-tab="'+t+'"]').click(),tab);
   await page.waitForTimeout(140);
   await page.screenshot({path:path.join(out,'page-slide-to-'+tab+'.png')});await idle();
  }
 }
 assert.equal(await page.locator('.vy-page-incoming,.vy-page-outgoing').count(),0);
 fs.writeFileSync(path.join(out,'page-motion-'+width+'.json'),JSON.stringify(results,null,2));
 console.log('PASS page slides '+width+' ('+results.length+' directions/destinations)');
};
