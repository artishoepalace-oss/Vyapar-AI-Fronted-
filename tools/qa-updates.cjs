/* Local-browser QA only: all external requests are mocked, no real accounts used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/qa-updates');
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
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_PATH,args:['--no-sandbox']});
 const results=[];
 try{
 for(const width of [320,360,412]){
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
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('vy855BootGuard'),{timeout:15000});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{document.querySelectorAll('.shop-progress-overlay,.android-permission-overlay').forEach(el=>el.remove());window.setTab('home',false);});
  await page.waitForTimeout(350);
  const chrome=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
   const top=document.querySelector('.top'),nav=document.getElementById('nav');
   return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,top:rect(top),logo:rect(top.querySelector('.vy-logo-frame')),title:rect(top.querySelector('h1')),profile:rect(top.querySelector('#vy863ProfileChip')),avatar:rect(top.querySelector('.vy863-profile-avatar')),nav:rect(nav),buttons:[...nav.querySelectorAll('button')].map(el=>({rect:rect(el),icon:rect(el.querySelector('.android-nav-icon')),label:rect(el.querySelector('.android-nav-label'))}))};
  });
  assert(chrome.scrollWidth<=width,'No horizontal overflow');assert.equal(chrome.buttons.length,5);
  for(const el of [chrome.logo,chrome.title,chrome.profile,chrome.avatar])assert(Math.abs(el.cy-chrome.top.cy)<1.5,'Top bar vertical center');
  for(const b of chrome.buttons){assert(Math.abs(b.icon.cx-b.rect.cx)<1,'Icon centered');assert(Math.abs(b.label.cx-b.rect.cx)<1,'Label centered');assert(b.rect.y>=chrome.nav.y);assert(b.rect.y+b.rect.h<=chrome.nav.y+chrome.nav.h);}
  assert(Math.max(...chrome.buttons.map(b=>b.icon.cy))-Math.min(...chrome.buttons.map(b=>b.icon.cy))<1,'All active/inactive icons share the same baseline');
  await page.screenshot({path:path.join(out,'home-'+width+'.png')});
  await page.evaluate(()=>window.setTab('settings',false));await page.waitForTimeout(250);
  await page.evaluate(()=>window.vy675OpenSettingsPage('legal'));await page.waitForTimeout(350);
  const legal=await page.locator('.vy675-page-body .settings-link-grid .btn').evaluateAll(els=>els.map(el=>{
    const box=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();return {text:el.textContent,box:{y:box.y,h:box.height},delta:(text.y+text.height/2)-(box.y+box.height/2),display:getComputedStyle(el).display,align:getComputedStyle(el).alignItems};
  }));
  assert.equal(legal.length,4);for(const row of legal){assert(Math.abs(row.delta)<=2.5,'Legal text vertically centered: '+JSON.stringify(row));assert.equal(row.align,'center');}
  await page.screenshot({path:path.join(out,'legal-'+width+'.png')});
  await page.evaluate(()=>window.vy675OpenSettingsPage('update'));await page.waitForTimeout(350);
  assert.equal(await page.locator('.vy675-page-body .github-update-card').count(),1,'Settings updater exists once');
  await page.locator('.vy675-page-body [data-update-check]').click();
  await page.waitForFunction(()=>document.querySelector('#vyGitHubUpdate [data-update-latest]')?.textContent==='20.10.2004.00016.2026');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#vyGitHubUpdate').count(),1);assert.equal(checks,1);
  assert(await page.locator('#vyGitHubUpdate [data-update-download]').isVisible());
  await page.screenshot({path:path.join(out,'update-popup-'+width+'.png')});
  await page.evaluate(()=>window.handleNativeBackPress());await page.waitForTimeout(100);
  assert.equal(await page.locator('#vyGitHubUpdate').count(),0,'Android back dismisses popup');
  assert.equal(await page.locator('#screen-settings').getAttribute('data-vy675-page'),'update','Back preserves update settings');
  await page.screenshot({path:path.join(out,'update-settings-'+width+'.png')});
  assert.equal(await page.locator('.vy675-page-body [data-update-download]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(230, 233, 239)','Primary update action keeps its own style');
  assert.equal(await page.locator('.vy675-page-body [data-update-release]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','Release link stays borderless');
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({width,chrome,legal,checks,errors});await context.close();
 }
 console.log(JSON.stringify(results.map(r=>({width:r.width,topCenter:r.chrome.top.cy,navItems:r.chrome.buttons.length,legalCenterErrors:r.legal.map(l=>l.delta),updateChecks:r.checks,errors:r.errors})),null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
