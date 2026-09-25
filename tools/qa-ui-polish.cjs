/* Browser regression checks. Account/network responses are mocked; records are disposable. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT_DIR||path.join(root,'docs/qa-ui-polish');
const version=require('../version.json').versionName;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=require('node:http').createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(root,'web','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(path.join(root,'web')+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(8771,'127.0.0.1',resolve));
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM_PATH,args:['--no-sandbox']});
  for(const width of (process.env.QA_WIDTHS||'320,360,412').split(',').map(Number)){
   const context=await browser.newContext({viewport:{width,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   await context.addInitScript(()=>{
    localStorage.setItem('vyapar_ai_auth_token_v1','qa-only-token');
    localStorage.setItem('vyapar_ai_account_cache_v1',JSON.stringify({user:{id:'qa',email:'qa@example.test',name:'QA Shop'},subscription:{plan:'business',status:'active'}}));
    localStorage.setItem('vyapar_github_check_v1',String(Date.now()));
   });
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('http://127.0.0.1:8771/'))return route.continue();
    if(url.includes('api.github.com'))return route.fulfill({json:{tag_name:'v'+version,draft:false,prerelease:false,assets:[]}});
    if(url.includes('/auth/me'))return route.fulfill({json:{success:true,user:{id:'qa',email:'qa@example.test',name:'QA Shop'},subscription:{plan:'business',status:'active',active:true}}});
    if(url.includes('checkout.razorpay.com'))return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{success:true}});
   });
   const page=await context.newPage(),errors=[];let stage='boot';
   await page.clock.setFixedTime(new Date('2026-09-21T12:00:00Z'));
   page.on('pageerror',error=>errors.push(error.message));
   const settle=async()=>{
    await page.waitForTimeout(420);
    await page.waitForFunction(()=>{
     const more=document.querySelector('#androidMoreSheet .android-sheet');
     return !document.documentElement.classList.contains('vy-page-transitioning')&&
      ![...document.querySelectorAll('.vy-unified-overlay')].some(el=>el.__vyClosing)&&
      (!more||getComputedStyle(more).transform==='none');
    },null,{timeout:2500});
   };
   async function shot(name){
    stage=name;
    const overflow=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(overflow.scroll<=overflow.w,'No horizontal page overflow: '+name+JSON.stringify(overflow));
    if(width===360)await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});
   }
   async function go(tab){stage=tab;await page.evaluate(t=>setTab(t,false),tab);await settle();assert(await page.locator('#screen-'+tab).isVisible());}
   async function mode(tab,value){stage=tab+'-'+value;await page.locator('#screen-'+tab+' .p1-modebar [data-mode="'+value+'"]').click();await settle();await shot(stage);}
   async function verifyMiddleFit(tab){
    const info=await page.locator('#screen-'+tab+' .p1-modebar').first().evaluate(bar=>{
     const track=bar.getBoundingClientRect(),previous=bar.previousElementSibling?.getBoundingClientRect(),buttons=[...bar.children].filter(node=>node.tagName==='BUTTON');
     const selected=buttons.find(node=>node.getAttribute('aria-selected')==='true')||buttons[0];
     const active=selected.getBoundingClientRect();
     return {top:getComputedStyle(bar).top,ready:bar.classList.contains('vy-middle-ready'),gap:previous?track.top-previous.bottom:null,
      left:track.left,width:track.width,right:track.right,activeLeft:active.left,activeRight:active.right,
      buttonHeights:buttons.map(node=>node.getBoundingClientRect().height),buttonWidths:buttons.map(node=>node.getBoundingClientRect().width)};
    });
    assert(Math.abs(Number.parseFloat(info.top)||0)<1,tab+' bar must not inherit the previous sticky top offset: '+info.top);
    assert(info.ready,tab+' middle capsule measured');
    assert(info.gap!==null && info.gap>=-1 && info.gap<=36,tab+' summary-to-bar spacing: '+JSON.stringify(info));
    assert(info.left>=-1 && info.right<=width+1,tab+' bar stays inside viewport');
    assert(info.buttonHeights.every(height=>Math.abs(height-44)<1),tab+' buttons retain 44px touch targets');
    assert(info.buttonWidths.every(buttonWidth=>buttonWidth>0),tab+' tabs fit available width');
    assert(info.activeLeft>=info.left+2 && info.activeRight<=info.right-2,tab+' active capsule clears both edges');
   }
   async function sheet(){
    await settle();assert.equal(await page.locator('#vyFormSheet').count(),1,'Exactly one form');
    const g=await page.evaluate(()=>{const p=document.querySelector('#vyFormSheet .vy-unified-panel').getBoundingClientRect(),n=document.getElementById('nav').getBoundingClientRect();return {x:p.x,w:p.width,bottom:p.bottom,navTop:n.top,viewport:innerWidth};});
    assert(Math.abs(g.x)<1&&Math.abs(g.w-g.viewport)<1,'Sheet spans full screen width');
    assert(g.bottom<=g.navTop-4,'Sheet clears the visible navbar: '+JSON.stringify(g));
   }
   try{
    await page.goto('http://127.0.0.1:8771/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.getElementById('vy855BootGuard'),null,{timeout:15000});await settle();
    await page.evaluate(()=>{document.querySelectorAll('.shop-progress-overlay,.android-permission-overlay').forEach(el=>el.remove());document.documentElement.classList.add('native-android');state.profile.businessName='QA Shoe Shop';state.monthly=[{id:'m1',month:'2026-01',profit:1200},{id:'m2',month:'2026-09',profit:6700},{id:'m3',month:'2025-09',profit:5000}];state.daily=[{id:'d1',date:'2026-09-15',sale:1000,profit:200}];state.stocks=[];VyaparRecords.invalidate();VyaparInsights.invalidate();render();});
    await go('home');
    assert.equal(await page.locator('.home-metric-head').filter({hasText:'Yearly profit'}).count(),0);
    assert(await page.locator('.home-metric-head').filter({hasText:'This month'}).isVisible());await shot('home');
    await go('business');await verifyMiddleFit('business');
    const radius=await page.evaluate(()=>{
      const size=selector=>{const el=document.querySelector(selector);return el?parseFloat(getComputedStyle(el).borderTopLeftRadius)||0:-1;};
      return {header:size('.app > .top'),nav:size('#nav.nav'),middle:size('#screen-business .p1-modebar'),
        kpi:size('#screen-business .vx621-kpi'),search:size('#screen-business .business-tool-search-field')};
    });
    assert(radius.header>=40&&radius.nav>=40&&radius.middle>=40&&radius.kpi>=23&&radius.search>=40,
      'Global rounded shapes are applied to actual business UI: '+JSON.stringify(radius));
    const due=await page.locator('.vx621-kpi').last().boundingBox(),kpi=await page.locator('.vx621-kpi').first().boundingBox();
    assert(due.width>kpi.width*1.8,'Customer Due spans the summary');
    const surface=await page.locator('#screen-business .p1-modebar').evaluate(bar=>{
      const track=getComputedStyle(bar),thumb=getComputedStyle(bar,'::before');
      return {bg:track.backgroundColor,blur:track.backdropFilter,gradient:track.backgroundImage,
        thumb:thumb.backgroundColor,thumbGradient:thumb.backgroundImage,shadow:thumb.boxShadow};
    });
    assert.deepEqual(surface,{bg:'rgb(16, 17, 19)',blur:'none',gradient:'none',thumb:'rgb(53, 55, 60)',thumbGradient:'none',shadow:'none'},'Middle bar has an opaque black track and solid grey selection');
    await mode('business','daily');
    for(const [target,sign] of [['accounts',1],['daily',-1]]){
      const poses=await page.evaluate(target=>{
        document.querySelector('#screen-business [data-mode="'+target+'"]').click();
        return [...document.querySelectorAll('#screen-business .p1-mode-section:not([hidden])')]
          .flatMap(node=>node.getAnimations().map(a=>a.effect.getKeyframes()[0].transform));
      },target);
      assert(poses.length>0,'Business content actually animates');
      assert(poses.every(p=>sign<0?p.includes('translate3d(-'):!p.includes('translate3d(-')),'Business animation follows tab direction');
      await settle();
    }
    await page.evaluate(()=>{for(const target of ['documents','accounts','activity'])document.querySelector('#screen-business [data-mode="'+target+'"]').click();});
    await settle();
    assert.equal(await page.locator('#screen-business [data-mode="activity"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#screen-business .p1-mode-section')].reduce((n,node)=>n+node.getAnimations().length,0)),0,'Rapid switching clears old animations');
    for(const value of ['daily','accounts','documents','activity'])await mode('business',value);
    await page.locator('#businessToolSearch').fill('GST');await settle();assert(await page.locator('#businessToolResults .vx621-feature-card:visible').count()>0);await page.locator('#businessToolSearch').fill('');
    await go('stock');await verifyMiddleFit('stock');await mode('stock','manage');
    assert.equal(await page.locator('#recordSearch-stocks').count(),0,'Empty stock has no unused search');
    assert.equal(await page.getByRole('button',{name:'Add Stock Item',exact:true}).count(),1,'One stock entry action');
    await page.locator('[data-form-field="stockItem"] > button').click();await sheet();
    await page.locator('#stockItem').fill('School shoes');await page.locator('#stockQty').fill('12');await page.locator('#stockMin').fill('3');
    await page.locator('#vyFormSheet button').filter({hasText:'Save Stock'}).click();await settle();
    const toast=await page.locator('.glass-toast.show').boundingBox(),toastNav=await page.locator('#nav').boundingBox();assert(toast&&toast.y+toast.height<toastNav.y,'Save feedback clears the navbar');
    assert.equal(await page.evaluate(()=>state.stocks[0].qty),12);assert.equal(await page.locator('#vyFormSheet').count(),0);
    for(const value of ['tools','records'])await mode('stock',value);
    const stockMenuTrigger=page.locator('#screen-stock .vx622-menu-trigger').first();
    assert(await stockMenuTrigger.isVisible(),'Stock records expose the circular three-dot menu');
    await stockMenuTrigger.click();await settle();
    const stockMenu=page.locator('#screen-stock .vx622-menu-panel').first();
    assert(await stockMenu.isVisible(),'Three-dot menu opens');
    assert.equal(await page.locator('.vx622-selection-done').count(),0,'No three-dot section creates a Done button');
    const threeDotGeometry=await stockMenuTrigger.evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,r:parseFloat(getComputedStyle(el).borderTopLeftRadius),expanded:el.getAttribute('aria-expanded')}));
    assert(threeDotGeometry.w>=42&&threeDotGeometry.h>=42&&threeDotGeometry.r>=20&&threeDotGeometry.expanded==='true','Three-dot trigger is circular and expanded: '+JSON.stringify(threeDotGeometry));
    assert.equal(await stockMenu.getAttribute('role'),'menu');
    assert((await stockMenu.getByRole('menuitem',{name:/^Select all$/i}).count())===1,'Select all action exists');
    assert((await stockMenu.getByRole('menuitem',{name:/^Deselect all$/i}).count())===1,'Deselect all action exists');
    if(width===360){
      // Advance the installed browser clock; wall time can outrun it under load.
      await page.clock.runFor(10100);
      assert(!(await stockMenu.isVisible()),'Untouched menu closes after ten seconds');
      await stockMenuTrigger.click();await settle();
    }
    await stockMenu.getByRole('menuitem',{name:/^Select all$/i}).click();await page.waitForTimeout(80);
    if(width===360){
      await page.clock.runFor(10100);
      assert(await stockMenu.isVisible(),'Option interaction cancels auto-close');
    }

    assert(await stockMenu.isVisible(),'Select all keeps menu open');
    assert.equal(await stockMenuTrigger.getAttribute('aria-expanded'),'true');
    await stockMenu.getByRole('menuitem',{name:/^Deselect all$/i}).click();await page.waitForTimeout(80);
    assert(await stockMenu.isVisible(),'Deselect all keeps menu open');
    await stockMenuTrigger.click();await settle();
    assert.equal(await stockMenuTrigger.getAttribute('aria-expanded'),'false');
    await go('sales');await verifyMiddleFit('sales');await mode('sales','today');
    await page.locator('[data-form-field="sproduct"] > button').click();await sheet();
    await page.locator('#sproduct').fill('QA sale');await page.locator('#sdate').fill('2026-09-20');await page.locator('#sqty').fill('2');await page.locator('#sbuy').fill('200');await page.locator('#ssell').fill('300');
    await page.locator('#vyFormSheet button').filter({hasText:'Save Sale',exact:true}).click();await settle();
    assert.equal(await page.evaluate(()=>state.sales.find(s=>s.product==='QA sale').qty),2);
    await page.locator('[data-form-field="dsale"] > button').click();await sheet();
    await page.locator('#ddate').fill('2026-09-20');await page.locator('#dsale').fill('900');await page.locator('#dprofit').fill('300');
    await page.locator('#vyFormSheet button').filter({hasText:'Save Daily Entry'}).click();await settle();
    await mode('sales','monthly');await page.locator('[data-form-field="mprofit"] > button').click();await sheet();
    await page.locator('#mmonth').fill('2026-09');await page.locator('#mprofit').fill('7000');await page.locator('#vyFormSheet button').filter({hasText:'Save Monthly Profit'}).click();await settle();
    assert.equal(await page.evaluate(()=>state.monthly.filter(x=>x.month==='2026-09').length),1,'Updating a manual month does not duplicate it');
    const month=await page.evaluate(()=>VyaparProfit.build(state)['2026'].months['2026-09']);
    assert.equal(month.profit,7500,'Daily entry overrides item sale on the same date; manual month remains additive');
    await page.evaluate(()=>{state.products.push({id:'qa-billed',name:'QA billed shoe',purchasePrice:200,sellingPrice:400});VyaparPlatform611.createTransaction({type:'PURCHASE',party:'QA supplier',date:'2026-09-19',items:[{itemId:'qa-billed',name:'QA billed shoe',qty:5,rate:200,purchaseRate:200}]});});
    await mode('sales','billing');await page.locator('.vx621-sales-tools button').filter({hasText:'New Sale',exact:true}).click();await sheet();
    await page.locator('#pType').dispatchEvent('click');await settle();assert.equal(await page.locator('#vy6601Select').count(),1);await page.evaluate(()=>handleNativeBackPress());await settle();assert.equal(await page.locator('#vyFormSheet').count(),1,'Nested Back keeps parent form');await page.locator('#pParty').fill('QA customer');await page.locator('#pItem').fill('QA billed shoe');await page.locator('#pRate').fill('400');
    await page.getByRole('button',{name:'Save Transaction',exact:true}).click();await settle();
    const transaction=await page.evaluate(()=>state.transactions611.find(t=>t.partyName==='QA customer'));assert(transaction,'Billing saves a transaction for stocked goods');assert.equal(transaction.total,400);
    await page.evaluate(()=>handleNativeBackPress());await settle();
    await go('business');await mode('business','activity');
    const displayed=await page.locator('.vx621-recent table').evaluate(table=>{const headings=[...table.querySelectorAll('thead th')].map(h=>h.textContent.trim()),row=table.querySelector('tbody tr');return Object.fromEntries([...row.children].map((cell,i)=>[headings[i],cell.textContent.trim()]));});
    assert.equal(displayed.Total,'₹400');assert.equal(displayed.Party,'QA customer');assert.equal(displayed['No.'],transaction.number);
    await go('sales');await mode('sales','history');
    await go('analytics');
    assert((await page.locator('.insight-balance').innerText()).includes('recorded so far vs full 2025'));
    for(const view of ['overview','compare','history','plan']){await page.evaluate(v=>VyaparInsights.selectView(v),view);await settle();await shot('insights-'+view);}
    await page.locator('#insightGoal').fill('300000');await page.locator('#insightInvestment').fill('100000');await page.locator('#insightGrowth').fill('10');await page.getByRole('button',{name:'Save plan',exact:true}).click();await settle();assert.equal(await page.evaluate(()=>state.profile.yearlyGoal),300000);
    await go('upload');await shot('upload-import');
    await page.locator('#uploadFile').setInputFiles({name:'profit.csv',mimeType:'text/csv',buffer:Buffer.from('year,month,profit\n2026,8,6000')});await settle();
    assert(await page.getByRole('button',{name:'Remove file',exact:true}).isVisible());
    await page.locator('#uploadReview').click();await settle();assert((await page.locator('#uploadPreview').innerText()).includes('Import 1 rows'));
    await page.getByRole('button',{name:'Remove file',exact:true}).click();await settle();assert.equal(await page.locator('#uploadPreview').innerText(),'');assert.equal(await page.locator('#uploadFile').evaluate(el=>el.files.length),0);
    await page.getByRole('tab',{name:'Scan label',exact:true}).click();await settle();
    const scan=page.locator('[aria-label="Label type"]');
    for(const value of ['Carton','Manual qty','Box']){await scan.getByRole('button',{name:value,exact:true}).click();const colors=await scan.locator('button').evaluateAll(list=>list.map(el=>({selected:el.getAttribute('aria-pressed'),bg:getComputedStyle(el).backgroundColor})));assert.notEqual(colors.find(x=>x.selected==='true').bg,colors.find(x=>x.selected==='false').bg);}
    await shot('upload-scan');
    await go('calculator');await page.locator('[data-calc-view="standard"]').click();
    await page.evaluate(()=>{calcClear('normalCalc','normalResult');['5','0','-','7','5'].forEach(k=>calcPress('normalCalc',k));calcNormal();});
    assert.equal(await page.locator('#normalCalc').inputValue(),'-25');await shot('calculator');
    const equals=await page.locator('.calc-key.equal').boundingBox(),key=await page.locator('.calc-key').first().boundingBox();assert(equals.width>key.width*1.8,'Equals spans two keys');
    await page.locator('[data-calc-view="business"]').click();await page.locator('#bcBuy').fill('600');await page.locator('#bcSell').fill('800');await page.getByRole('button',{name:'Calculate',exact:true}).click();assert((await page.locator('#businessCalcResult').innerText()).includes('Profit: ₹200'));
    await page.locator('[data-calc-view="standard"]').click();assert.equal(await page.locator('#normalCalc').inputValue(),'-25');
    await page.evaluate(()=>calcFunc('sqrt'));assert((await page.locator('#normalResult').innerText()).includes('Invalid result'));await page.locator('[data-calc-view="business"]').click();assert.equal(await page.locator('#bcSell').inputValue(),'800');await shot('calculator-business');
    await go('subscription');assert((await page.locator('.subscription-intro').innerText()).includes('Your Business plan is active'));assert(!(await page.locator('.subscription-status').innerText()).includes('unlocks only'));assert.equal(await page.locator('.subscription-business-card.active-plan').count(),1);await shot('plans');
    await go('settings');const section=await page.locator('[data-vy675-page="security"]').evaluate(el=>el.closest('[data-vy675-group]').querySelector('h3').textContent);assert.equal(section,'Your account');await shot('settings');
    await page.locator('#nav [data-android-tab="more"]').click();await settle();
    const more=await page.locator('#androidMoreSheet .android-sheet').boundingBox(),nav=await page.locator('#nav').boundingBox();assert(more.y+more.height<=nav.y-4,'More ends above navbar');await shot('more');await page.evaluate(()=>handleNativeBackPress());await settle();
    await page.evaluate(()=>{for(const t of ['home','sales','stock','business','sales'])setTab(t,false);});await settle();assert.equal(await page.locator('.screen:not(.hide)').count(),1);assert.equal(await page.locator('.vy-page-incoming,.vy-page-outgoing').count(),0);
    await page.evaluate(async()=>{await VyaparStorage.save(state);});
    assert.equal(errors.length,0,errors.join('\n'));results.push({width,result:'PASS',errors});console.log('PASS',width);await context.close();
   }catch(error){await page.screenshot({path:path.join(out,'failure-'+width+'-'+stage+'.png'),fullPage:true});console.error({width,stage,errors});throw error;}
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
