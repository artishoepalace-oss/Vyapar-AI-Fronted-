/* Local-browser QA only: all external requests are mocked, no real accounts used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT_DIR || path.join(root,'docs/qa-capsule-navigation');
const version=require('../version.json').versionName;
const remote='20.10.2004.00016.2026';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=require('node:http').createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'web','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(path.join(root,'web')+path.sep)){res.writeHead(403).end();return;}
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_PATH,args:['--no-sandbox']}).catch(error=>{server.close();throw error;});
 const results=[];
 try{
 for(const width of [320,360,383,412,768]){
  console.log('Checking navigation at '+width+'px');
  const context=await browser.newContext({viewport:{width,height:760},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
    localStorage.setItem('vyapar_ai_auth_token_v1','qa-only-token');
    localStorage.setItem('vyapar_ai_account_cache_v1',JSON.stringify({user:{id:'qa',email:'qa@example.test',name:'Anuj Gupta'},subscription:{plan:'business',status:'active'}}));
    localStorage.setItem('vyapar_github_check_v1',String(Date.now()));
  });
  let checks=0;
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith('http://127.0.0.1:8765/'))return route.continue();
   if(url.includes('api.github.com')){checks++;return route.fulfill({json:{tag_name:'v'+remote,draft:false,prerelease:false,body:'App updates and alignment improvements.',assets:[{state:'uploaded',name:'VyaparAI-'+remote+'.apk',size:4400000,browser_download_url:'https://github.com/artishoepalace-oss/Vyapar-AI-Fronted-/releases/download/v'+remote+'/VyaparAI-'+remote+'.apk'}]}});}
   if(url.includes('/auth/me'))return route.fulfill({json:{success:true,user:{id:'qa',email:'qa@example.test',name:'Anuj Gupta'},subscription:{plan:'business',status:'active',active:true}}});
   if(url.includes('checkout.razorpay.com'))return route.fulfill({body:'',contentType:'application/javascript'});
   return route.fulfill({json:{success:true}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('vy855BootGuard'),null,{timeout:15000}).catch(async error=>{console.error('Startup errors:',errors);await page.screenshot({path:path.join(out,'boot-failure-'+width+'.png')});throw error;});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{document.querySelectorAll('.shop-progress-overlay,.android-permission-overlay').forEach(el=>el.remove());window.setTab('home',false);});
  await page.waitForTimeout(350);
  const settle=async()=>{await page.waitForTimeout(450);await page.waitForFunction(()=>!document.documentElement.classList.contains('vy-page-transitioning'),null,{timeout:2500});};
  const near=(actual,expected)=>assert(Math.abs(actual-expected)<0.02,'Subpixel geometry: '+actual+' expected '+expected);
  async function geometry(expected){
    // More closes first, then the 390ms capsule transition starts. Wait for
    // the observed end position instead of measuring mid-animation at 450ms.
    await page.waitForFunction(expected=>{
      const nav=document.getElementById('nav'),active=nav?.querySelector('button.active'),cap=document.getElementById('activeCapsule');
      if(!active || active.dataset.androidTab!==expected || !cap)return false;
      const a=active.getBoundingClientRect(),c=cap.getBoundingClientRect();
      return Math.abs(a.x+a.width/2-c.x-c.width/2)<0.1;
    },expected,{timeout:1500}).catch(async error=>{
      await page.screenshot({path:path.join(out,'failure-'+width+'-'+expected+'.png')});
      throw error;
    });
    const g=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
      const nav=document.getElementById('nav'),cap=document.getElementById('activeCapsule'),top=document.querySelector('.top'),logo=top.querySelector('.vy-logo-frame'),avatar=top.querySelector('#vy863ProfileChip');
      return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,nav:rect(nav),cap:rect(cap),
       top:rect(top),logo:rect(logo),avatar:rect(avatar),logoRadius:getComputedStyle(logo).borderRadius,avatarRadius:getComputedStyle(avatar).borderRadius,topRim:getComputedStyle(top).boxShadow,selectedIcon:getComputedStyle(nav.querySelector('button.active .android-nav-icon svg')).color,iconGlow:getComputedStyle(nav.querySelector('button.active .android-nav-icon')).filter,
       iconFills:[...nav.querySelectorAll('button.active .android-nav-icon svg :is(path,circle,rect,polygon)')].map(shape=>getComputedStyle(shape).fill),
       active:nav.querySelector('button.active')?.dataset.androidTab,
       before:getComputedStyle(nav,'::before').display,color:getComputedStyle(nav).backgroundColor,
       transition:getComputedStyle(cap).transitionDuration,topColor:getComputedStyle(document.querySelector('.top')).backgroundColor,rim:getComputedStyle(nav).boxShadow,selectedColor:getComputedStyle(nav.querySelector('button.active .android-nav-label')).color,selectedGlow:getComputedStyle(nav.querySelector('button.active .android-nav-label')).textShadow,
       buttons:[...nav.querySelectorAll('button')].map(el=>({id:el.dataset.androidTab,box:rect(el),icon:rect(el.querySelector('.android-nav-icon')),label:rect(el.querySelector('.android-nav-label'))}))};
    });
    assert.equal(g.active,expected);assert.equal(g.buttons.length,5);near(g.nav.h,50);
    near(g.nav.w,Math.min(367,g.viewport-16));near(g.cap.w,68);near(g.cap.h,42);
    assert.equal(g.before,'none');assert.equal(g.color,'rgb(17, 18, 20)');assert(g.scrollWidth<=g.viewport,'No page overflow');
    assert.equal(g.color,g.topColor,'Header and navbar share the same black');assert.equal(g.selectedColor,'rgb(128, 1, 31)');assert.notEqual(g.selectedGlow,'none');assert(g.rim.includes('inset'),'Glossy rim is inset and preserves geometry');
    assert.equal(g.selectedIcon,'rgb(128, 1, 31)','Selected icon matches label');assert.notEqual(g.iconGlow,'none');
    assert(g.iconFills.length>0,'Active destination has a real SVG icon');
    g.iconFills.forEach(fill=>assert.equal(fill,'rgb(128, 1, 31)','Actual SVG shapes render burgundy'));
    assert.equal(g.topRim,g.rim,'Both bars have the same glossy rim');
    assert(Math.abs(g.top.x-g.nav.x)<0.1,'Top and bottom left edges align '+JSON.stringify(g));
    assert(Math.abs(g.top.w-g.nav.w)<0.1,'Both bar widths match');
    near(g.logo.w,44);near(g.logo.h,44);near(g.avatar.w,44);near(g.avatar.h,44);
    assert.equal(g.logoRadius,'50%');assert.equal(g.avatarRadius,'50%');
    for(const item of [g.logo,g.avatar]){assert(Math.abs(item.cy-g.top.cy)<0.1,'Logo/avatar vertically centered');assert(item.x>=g.top.x && item.x+item.w<=g.top.x+g.top.w,'Logo/avatar fits header');}
    const active=g.buttons.find(b=>b.id===expected);
    assert(Math.abs(g.cap.cx-active.box.cx)<0.1,'Capsule follows exact tab center');
    near(g.cap.y-g.nav.y,4);assert(g.cap.x-g.nav.x>=5.99);assert(g.nav.x+g.nav.w-g.cap.x-g.cap.w>=5.99);
    for(const b of g.buttons){
      near(b.box.h,50);near(b.icon.w,21);near(b.icon.h,20);near(b.label.h,10);
      assert(Math.abs(b.icon.cx-b.box.cx)<0.1);assert(Math.abs(b.label.cx-b.box.cx)<0.1);
      assert(Math.abs(b.icon.cy-g.buttons[0].icon.cy)<0.1);assert(Math.abs(b.label.cy-g.buttons[0].label.cy)<0.1);
    }
    return g;
  }
  await page.screenshot({path:path.join(out,'initial-'+width+'.png')});
  const positions=[];
  for(const tab of ['home','business','sales','stock','more']){
    await page.locator('#nav [data-android-tab="'+tab+'"]').click();await settle();
    const g=await geometry(tab);positions.push({tab,x:g.cap.x-g.nav.x,width:g.cap.w,height:g.cap.h});
    if(tab!=='more')assert(await page.locator('#screen-'+tab).isVisible(),'Destination opens '+tab);
    else assert.equal(await page.locator('#androidMoreSheet').count(),1);
    if(width===383)await page.locator('#nav').screenshot({path:path.join(out,tab+'-367x50.png')});
  }
  await page.evaluate(()=>handleNativeBackPress());await settle();await geometry('stock');
  assert.equal(await page.locator('#androidMoreSheet').count(),0,'Back dismisses More and restores capsule');
  await page.evaluate(()=>setTab('settings',false));await settle();await geometry('more');
  await page.evaluate(()=>{for(const tab of ['home','sales','business','stock','sales'])document.querySelector('#nav [data-android-tab="'+tab+'"]').click();});
  await settle();await geometry('sales');
  assert.equal(await page.locator('.screen:not(.hide)').count(),1,'Rapid taps leave one screen');
  await page.setViewportSize({width:width+40,height:760});await settle();await geometry('sales');
  await page.setViewportSize({width,height:760});await settle();await geometry('sales');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#nav [data-android-tab="home"]').click();await page.waitForTimeout(50);
  assert.equal((await geometry('home')).transition,'0s','Reduced motion honored');
  await page.emulateMedia({reducedMotion:'no-preference'});
  if([320,360,412].includes(width))await require('./qa-page-transitions.cjs')(page,out,width);
  await page.screenshot({path:path.join(out,'home-'+width+'.png')});
  if([320,412].includes(width))await require('./qa-settings-selection.cjs')(page,out,width);
  assert.equal(errors.length,0,errors.join('\n'));results.push({width,positions,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
