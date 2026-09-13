/* Local-browser QA only: all external requests are mocked, no real accounts used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/qa-refined-ui');
const version=require('../version.json').versionName;
const remote='20.10.2004.00023.2026';
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
 for(const width of (process.env.QA_WIDTHS||'320,360,412').split(',').map(Number)){
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
  const settle=()=>page.waitForTimeout(450);
  await page.evaluate(()=>{
    document.documentElement.classList.add('native-android');
    state.monthly=[2023,2024,2025,2026].map((y,i)=>({id:'qa'+y,month:y+'-01',profit:97200+i*30000}));
    VyaparInsights.invalidate();renderHome();
  });await settle();
  assert.equal(await page.locator('.home-text-button').count(),0,'Removed All tools source button');
  for(const el of await page.locator('.home-metric-icon').all()){
    const center=await el.evaluate(el=>{const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return {dx:Math.abs(r.x+r.width/2-t.x-t.width/2),dy:Math.abs(r.y+r.height/2-t.y-t.height/2),display:getComputedStyle(el).display};});
    assert(center.dx<1 && center.dy<3,'Metric glyph centered '+JSON.stringify(center));
  }
  await page.evaluate(()=>setTab('business',false));await settle();
  assert.equal(await page.locator('.vx621-hero').count(),0,'Business intro removed');
  assert(await page.locator('.vx621-kpis').isVisible(),'Business figures retained');
  await page.evaluate(()=>setTab('analytics',false));await settle();
  await page.locator('summary').filter({hasText:'Performance details'}).click();
  assert.equal(await page.locator('.insight-performance th').first().evaluate(el=>getComputedStyle(el).textAlign),'left');
  assert.equal(await page.locator('.insight-performance td').first().evaluate(el=>getComputedStyle(el).textAlign),'right');
  await page.evaluate(()=>VyaparInsights.selectView('history'));await settle();
  assert.equal(await page.locator('.insight-history > button').count(),4);
  assert.equal(await page.locator('#screen-analytics .workspace-pager').isVisible(),false,'No empty pagination');
  for(const row of await page.locator('.insight-history > button').all()){
    const r=await row.evaluate(el=>{const n=el.querySelector('strong').getBoundingClientRect(),a=el.lastElementChild.getBoundingClientRect();return {dy:Math.abs(n.y+n.height/2-a.y-a.height/2),right:a.right,width:innerWidth};});
    assert(r.dy<2 && r.right<r.width,'History amount and arrow align');
  }
  await page.screenshot({path:path.join(out,'history-'+width+'.png')});
  await page.locator('.insight-history > button').last().click();await settle();
  assert.equal(await page.locator('select[aria-label="Profit year"]').inputValue(),'2023','History opens correct year');
  await page.locator('select[aria-label="Profit year"]').dispatchEvent('click');await settle();
  async function geometry(selector){const r=await page.locator(selector).boundingBox();assert(Math.abs(r.y+r.height-760)<1,'Popup attaches at bottom '+JSON.stringify(r));assert(Math.abs(r.x-12)<1 && Math.abs(r.width-(width-24))<1,'Popup side inset');}
  await geometry('.vy6601-select-sheet');
  assert.equal(await page.locator('#vy6601Select .vy6601-select-head').innerText(),'Profit year');
  assert.equal(await page.locator('#vy6601Select').getByRole('button',{name:'×',exact:true}).count(),0);
  await page.screenshot({path:path.join(out,'chooser-'+width+'.png')});
  await page.locator('#vy6601Select .vy6601-select-options button').filter({hasText:'2025'}).click();await settle();
  assert.equal(await page.locator('select[aria-label="Profit year"]').inputValue(),'2025','Chooser dispatches actual change');
  await page.evaluate(()=>vx621OpenPlatform('business','transactions','business','SALE'));await settle();
  await page.locator('#pType').dispatchEvent('click');await settle();await geometry('.vy6601-select-sheet');
  const hit=await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight-30)?.closest('#vy6601Select')?.id);
  assert.equal(hit,'vy6601Select','Nested chooser above form');
  await page.evaluate(()=>handleNativeBackPress());await settle();
  assert.equal(await page.locator('#vy6601Select').count(),0);assert.equal(await page.locator('#vyFormSheet').count(),1,'Back closes only nested chooser');
  await page.locator('#vyFormSheet [data-sheet-dismiss]').click();await settle();
  assert.equal(await page.locator('#vyFormSheet').count(),0,'Handle tap closes form');
  await page.locator('#nav [data-android-tab="more"]').click();await settle();await geometry('.android-sheet');
  assert.equal(await page.locator('#androidMoreSheet .android-sheet-close').count(),0);
  await page.locator('#androidMoreSheet [data-sheet-dismiss]').evaluate(el=>{
    el.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:el,clientX:100,clientY:100})],bubbles:true}));
    el.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:el,clientX:102,clientY:155})],bubbles:true,cancelable:true}));
  });await settle();assert.equal(await page.locator('#androidMoreSheet').count(),0,'Handle swipe dismisses');
  await page.evaluate(()=>setTab('settings',false));await settle();
  assert.equal(await page.locator('.vy675-settings-intro').count(),0);
  await page.locator('[data-vy675-page="security"]').click();await settle();
  assert.equal(await page.locator('.vy675-page-header h2').innerText(),'Account password');
  assert.equal(await page.locator('#vx622AppLockSection h2').innerText(),'Account password');
  await page.evaluate(()=>vy675OpenSettingsPage('update'));await settle();
  await page.locator('#fs607Settings [data-update-check]').click();await settle();
  assert.equal(await page.locator('#vyGitHubUpdate').count(),0,'Settings check stays in Settings');
  assert.equal(await page.locator('#fs607Settings [data-update-latest]').innerText(),remote);
  await page.locator('#fs607Settings summary').click();
  assert((await page.locator('#fs607Settings [data-update-notes]').innerText()).includes('alignment'));
  await page.screenshot({path:path.join(out,'update-settings-'+width+'.png')});
  await page.evaluate(()=>setTab('home',false));await settle();
  await page.evaluate(()=>VyaparUpdates.check(true));await settle();await geometry('.github-update-dialog');
  assert.equal(await page.locator('#vyGitHubUpdate details,#vyGitHubUpdate .update-versions,#vyGitHubUpdate [data-update-release]').count(),0,'Minimal update prompt');
  assert.equal(await page.locator('#vyGitHubUpdate [data-update-download]').isVisible(),true);
  await page.screenshot({path:path.join(out,'update-prompt-'+width+'.png')});
  await page.locator('#vyGitHubUpdate [data-sheet-dismiss]').click();await settle();
  assert.equal(await page.locator('#vyGitHubUpdate').count(),0);
  await page.evaluate(()=>{window.qaConfirm=null;showGlassDialog({title:'Delete record?',message:'This is a QA confirmation.',confirm:true}).then(v=>window.qaConfirm=v);});await settle();
  await geometry('.glass-dialog-card');
  assert.equal(await page.locator('.glass-dialog-card [data-sheet-dismiss]').count(),0,'No handle added to confirmation');
  await page.locator('[data-glass-cancel]').click();await settle();assert.equal(await page.evaluate(()=>window.qaConfirm),false);
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({width,result:'PASS',errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
