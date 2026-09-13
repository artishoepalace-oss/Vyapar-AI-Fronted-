/* Local-browser QA only: all external requests are mocked, no real accounts used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/qa-form-sheets');
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
  const edges=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
    const nav=document.getElementById('nav');
    return {nav:rect(nav),top:rect(document.querySelector('.top')),card:rect(document.querySelector('#screen-home .home-overview')),buttons:[...nav.querySelectorAll('button')].map(el=>({box:rect(el),icon:rect(el.querySelector('.android-nav-icon')),label:rect(el.querySelector('.android-nav-label'))}))};
  });
  for(const r of [edges.top,edges.card]){assert(Math.abs(r.left-edges.nav.left)<1,'Shared left edge '+JSON.stringify(edges));assert(Math.abs(r.right-edges.nav.right)<1,'Shared right edge '+JSON.stringify(edges));}
  for(const b of edges.buttons){assert(b.box.left>=edges.nav.left && b.box.right<=edges.nav.right,'Nav item inside rounded container');assert(Math.abs((b.icon.left+b.icon.right)-(b.box.left+b.box.right))<2,'Icon centered');assert(Math.abs((b.label.left+b.label.right)-(b.box.left+b.box.right))<2,'Label centered');}
  await page.screenshot({path:path.join(out,'shell-'+width+'.png')});
  async function settled(){await page.waitForTimeout(650);}
  async function checkSheet(label){
    await settled();
    const shape=await page.locator('.vy-form-sheet,.shop-progress-sheet').evaluate(el=>{
      const b=el.getBoundingClientRect(),o=el.parentElement.getBoundingClientRect(),n=document.getElementById('nav').getBoundingClientRect();
      return {bottom:b.bottom,top:b.top,left:b.left,right:b.right,height:b.height,vh:innerHeight,ow:o.width,navTop:n.top,navLeft:n.left,navRight:n.right,radius:getComputedStyle(el).borderBottomLeftRadius,nav:getComputedStyle(document.getElementById('nav')).visibility};
    });
    assert(Math.abs(shape.navTop-shape.bottom-8)<2,label+': sheet sits 8px above navbar '+JSON.stringify(shape));
    assert(Math.abs(shape.left-shape.navLeft)<1 && Math.abs(shape.right-shape.navRight)<1,label+': popup and navbar side edges match');
    assert.equal(shape.radius,'26px',label+': bottom corners rounded');
    assert(shape.top>=10,label+': top clearance');assert(shape.left>=-1 && shape.right<=width+1,label+': no overflow');
    assert.equal(shape.nav,'visible',label+': navbar stays visible');
    await page.screenshot({path:path.join(out,label+'-'+width+'.png')});
    await page.evaluate(()=>window.handleNativeBackPress());await settled();
    assert.equal(await page.locator('#vyFormSheet,#shopProgressSheet').count(),0,label+': back closes');
  }
  await page.evaluate(()=>window.openShopProgress());
  await page.waitForTimeout(45);
  const moving=await page.locator('.shop-progress-sheet').evaluate(el=>getComputedStyle(el).transform);
  assert.notEqual(moving,'none','Home sheet animates upward');
  assert(Number(moving.split(',')[5]?.replace(')',''))>0,'Home sheet begins below final position');
  await checkSheet('home-progress');
  await page.locator('#nav [data-android-tab="more"]').click();await settled();
  const more=await page.locator('#androidMoreSheet .android-sheet').boundingBox();
  const navBox=await page.locator('#nav').boundingBox();
  assert(Math.abs(more.x-navBox.x)<1 && Math.abs(more.width-navBox.width)<1,'More menu matches navbar side edges');
  assert(Math.abs(navBox.y-more.y-more.height-8)<2,'More menu sits above navbar');
  await page.screenshot({path:path.join(out,'more-'+width+'.png')});
  await page.evaluate(()=>window.handleNativeBackPress());await settled();
  await page.evaluate(()=>window.setTab('sales',false));await settled();
  assert.equal(await page.locator('#sproduct').isVisible(),false,'Manual form starts collapsed');
  await page.locator('[data-form-field="sproduct"] > button').click();
  await page.locator('#sproduct').fill('Draft shoe');await checkSheet('item-sale');
  await page.locator('[data-form-field="sproduct"] > button').click();await settled();
  assert.equal(await page.locator('#sproduct').inputValue(),'Draft shoe','Draft retained after close');
  await page.locator('#sbuy').fill('100');await page.locator('#ssell').fill('150');
  await page.locator('#vyFormSheet button[onclick="addSale()"] ').click();await settled();
  assert.equal(await page.locator('#vyFormSheet').count(),0,'Successful save closes form');
  assert(await page.evaluate(()=>state.sales.some(s=>s.product==='Draft shoe')),'Save uses original data logic');
  for(const id of ['dsale','mprofit']){await page.evaluate(id=>window.VyaparFormSheets.openField(id),id);await checkSheet(id);}
  await page.evaluate(()=>window.setTab('stock',false));await settled();
  await page.locator('[data-form-field="stockItem"] > button').click();await checkSheet('stock-entry');
  for(const [context,module] of [['business','transactions'],['sales','transactions'],['stock','inventory620']]){
    await page.evaluate(([c,m])=>window.vx621OpenPlatform(c,m,'business',c==='sales'?'SALE_RETURN':'SALE'),[context,module]);
    await settled();
    if(context==='sales')assert.equal(await page.locator('#pType').inputValue(),'SALE_RETURN','Return preset retained');
    await checkSheet(context+'-platform');
    assert.equal(await page.locator('#businessModuleArea').count(),1,'One active module host');
    assert.equal(await page.locator('#businessModuleArea').isVisible(),false,'Closed module stays out of page flow');
  }
  await page.evaluate(()=>{window.setTab('business',false);window.advRenderModule('customers');});await checkSheet('customers');
  await page.evaluate(()=>window.fs607OpenPOS());await checkSheet('pos');
  if(width===360){
    for(const m of ['cashbank','finance620','tax620','currency620','businesses','staff620','inventory','documents620','print620','messages620','ledger','reports620']){
      await page.evaluate(m=>window.vx621OpenPlatform('business',m,'business'),m);await checkSheet(m);
    }
  }
  if(width===360){
    await page.evaluate(()=>window.setTab('sales',false));await settled();
    await page.evaluate(()=>window.VyaparFormSheets.openField('dsale'));await settled();
    await page.locator('#dsale').fill('200');await page.locator('#dprofit').fill('40');
    await page.locator('#vyFormSheet button[onclick="addDaily()"] ').click();await settled();
    assert.equal(await page.locator('#vyFormSheet').count(),0,'Daily save closes');
    assert(await page.evaluate(()=>state.daily.some(r=>Number(r.sale)===200 && Number(r.profit)===40)),'Daily persisted');
    await page.evaluate(()=>window.VyaparFormSheets.openField('mprofit'));await settled();
    await page.locator('#mprofit').fill('400');
    await page.locator('#vyFormSheet button[onclick="addMonthly()"] ').click();await settled();
    assert.equal(await page.locator('#vyFormSheet').count(),0,'Monthly save closes');
    assert(await page.evaluate(()=>state.monthly.some(r=>Number(r.profit)===400)),'Monthly persisted');
    await page.evaluate(()=>window.setTab('stock',false));await settled();
    await page.locator('[data-form-field="stockItem"] > button').click();await settled();
    await page.locator('#stockItem').fill('QA stock');await page.locator('#stockQty').fill('12');
    await page.locator('#vyFormSheet button[onclick="addStock()"] ').click();await settled();
    assert.equal(await page.locator('#vyFormSheet').count(),0,'Stock save closes');
    assert(await page.evaluate(()=>state.stocks.some(r=>r.item==='QA stock' && Number(r.qty)===12)),'Stock persisted');
  }
  await page.evaluate(()=>window.setTab('sales',false));await settled();
  await page.evaluate(()=>window.editSale(state.sales.find(s=>s.product==='Draft shoe').id));await settled();
  assert.equal(await page.locator('#vyFormSheet #sproduct').inputValue(),'Draft shoe','Edit opens prefilled popup');
  await page.setViewportSize({width,height:420});await settled();
  assert((await page.locator('.vy-form-sheet').boundingBox()).height<=410,'Fits short/keyboard viewport');
  await page.evaluate(()=>window.handleNativeBackPress());await settled();
  assert.equal(errors.length,0,errors.join('\n'));
  results.push({width,result:'PASS',errors});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
