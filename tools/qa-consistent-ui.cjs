/* Local-browser QA only: all external requests are mocked, no real accounts used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/qa-consistent-ui');
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
  const settle=()=>page.waitForTimeout(500);
  const searchShapes=[],tabShapes=[];
  async function shot(name){await page.screenshot({path:path.join(out,name+'-'+width+'.png')});}
  const shape=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {height:r.height,bg:s.backgroundColor,radius:s.borderRadius,padding:s.padding,border:s.borderTopWidth,font:s.fontSize};};
  await page.evaluate(()=>{state.stocks=[{id:'qs',item:'Shoes',qty:5,buy:100}];state.monthly=[2024,2025,2026].map(y=>({id:'q'+y,month:y+'-01',profit:2000}));VyaparRecords.invalidate();render();setTab('home',false);});await settle();
  const quick=await page.locator('.android-quick-action').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,border:s.border,radius:s.borderRadius,padding:s.padding};}));
  assert(quick.length===4);quick.forEach(s=>assert.deepEqual(s,quick[0],'Home shortcuts have identical surfaces'));
  assert.equal(await page.locator('.android-quick-action-copy').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  await page.locator('.android-quick-actions').scrollIntoViewIfNeeded();await shot('home-shortcuts');
  await page.locator('.android-quick-action[data-action="bill"]').click();await settle();assert(await page.locator('#vyFormSheet').isVisible(),'Bill route preserved');await page.evaluate(()=>handleNativeBackPress());await settle();
  for(const tab of ['business','sales','stock','analytics']){
    await page.evaluate(t=>setTab(t,false),tab);await settle();
    const bar=page.locator('#screen-'+tab+' .p1-modebar,#screen-'+tab+' .workspace-tabs').first();
    tabShapes.push(await bar.evaluate(shape));
    const btns=await bar.locator('button').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return {selected:el.getAttribute('aria-selected'),bg:s.backgroundColor,border:s.borderTopWidth,height:el.getBoundingClientRect().height,padding:s.padding,font:s.fontSize};}));
    assert(btns.every(x=>x.border==='0px' && x.height===44));
    assert.notEqual(btns.find(x=>x.selected==='true').bg,btns.find(x=>x.selected!=='true').bg,'Selected tab is distinct');
    if(tab==='business'){
      const field=page.locator('#businessToolSearch');searchShapes.push(await field.evaluate(shape));
      await field.click({position:{x:5,y:24}});assert.equal(await page.evaluate(()=>document.activeElement.id),'businessToolSearch');
      await field.fill('GST');await settle();assert((await page.locator('#businessToolResults .vx621-feature-card:visible').count())>0);await field.fill('');await settle();
      await page.locator('.business-tool-search').scrollIntoViewIfNeeded();await shot('business-controls');
    }
    if(tab==='sales'){
      await bar.locator('[data-mode="monthly"]').click();await settle();
      const field=page.locator('#recordSearch-monthly');searchShapes.push(await field.evaluate(shape));
      const boxes=await page.locator('#monthly-profit-records .record-controls').evaluate(el=>{const a=el.querySelector('input').getBoundingClientRect(),b=el.querySelector('select').getBoundingClientRect();return {a:{y:a.y,right:a.right},b:{y:b.y,left:b.left,width:b.width}};});
      assert(Math.abs(boxes.a.y-boxes.b.y)<1 && boxes.b.left>boxes.a.right,'Monthly search and year sit alongside');assert(boxes.b.width<=110);
      await page.locator('#monthly-profit-records').scrollIntoViewIfNeeded();await shot('monthly-toolbar');
      await field.fill('2025');await settle();assert((await page.locator('#monthly-profit-records .workspace-pager').innerText()).includes('1 records'),'Monthly search unchanged');
      await page.locator('#recordSearch-monthly').fill('');await settle();
      await page.locator('#monthly-profit-records .vx622-menu-trigger').click();await settle();assert(await page.locator('#monthly-profit-records .vx622-menu-panel').isVisible(),'Bulk menu accessible');await page.evaluate(()=>document.body.click());
      await bar.locator('[data-mode="billing"]').click();await settle();await page.locator('.vx621-sales-tools').scrollIntoViewIfNeeded();await shot('sales-depth');
      const shades=await page.locator('.vx621-sales-tools').evaluate(el=>[el,el.querySelector('.vx621-feature-card'),el.querySelector('.vx621-action')].map(n=>getComputedStyle(n).backgroundColor));assert.equal(new Set(shades).size,3,'Section, card and action have distinct depth');
      assert.equal(await page.locator('.vx621-sales-tools .vx621-empty').isVisible(),false,'No outdated inline-form placeholder');
      await page.locator('.vx621-sales-tools button').filter({hasText:'New Sale'}).click();await settle();assert.equal(await page.locator('#vyFormSheet #pType').inputValue(),'SALE');await page.evaluate(()=>handleNativeBackPress());await settle();
    }
    if(tab==='stock'){
      await bar.locator('[data-mode="manage"]').click();await settle();searchShapes.push(await page.locator('#recordSearch-stocks').evaluate(shape));
    }
  }
  tabShapes.forEach(s=>assert.deepEqual(s,tabShapes[0],'Shared tab geometry across all workspaces'));
  await page.evaluate(()=>setTab('settings',false));await settle();
  searchShapes.push(await page.locator('#settingsSearch').evaluate(shape));
  const field=page.locator('#settingsSearch'),box=await field.boundingBox();
  for(const point of [{x:5,y:24},{x:box.width-5,y:24}]){
    await field.evaluate(el=>el.blur());await field.click({position:point});assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsSearch','Whole Settings search pill responds');
  }
  assert.equal(await field.evaluate(el=>getComputedStyle(el).outlineWidth),'0px','No rectangular input focus box');
  await field.fill('backup');await settle();assert.equal(await page.locator('.vy675-settings-row:visible').count(),1,'Settings search stays scoped');
  await page.locator('.vy675-settings-search button').click();await settle();assert.equal(await field.inputValue(),'');await field.evaluate(el=>el.blur());
  for(const s of searchShapes){assert.equal(s.height,48);assert.equal(s.font,'14px');assert.equal(s.radius,'14px');assert.equal(s.bg,'rgba(0, 0, 0, 0)');}
  assert.equal(await page.locator('.vy675-settings-row').nth(1).evaluate(el=>getComputedStyle(el,'::after').height),'1px');
  await shot('settings-search-rows');
  await page.locator('#nav [data-android-tab="more"]').click();await settle();
  assert.equal(await page.locator('.android-sheet-item').first().evaluate(el=>getComputedStyle(el,'::after').height),'1px');await shot('more-dividers');
  await page.evaluate(()=>handleNativeBackPress());await settle();
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({width,result:'PASS',errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
