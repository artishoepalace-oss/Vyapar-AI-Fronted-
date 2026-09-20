/* Runs inside the mocked-account browser suite; never contacts production data. */
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,out,width){
  await page.evaluate(()=>setTab('settings',false));
  for(const id of ['account','profile','business','security','appearance','navigation','data']){
    await page.evaluate(id=>vy675OpenSettingsPage(id),id);
    await page.waitForTimeout(100);
    const surfaces=await page.locator('#screen-settings .vy675-page-body').evaluate(el=>[...el.querySelectorAll('.card,.settings-section,.production-account-card,.production-account-grid > div,.vx622-settings-list,.vx622-lock-status,.notice,.vy675-option-row')].filter(el=>el.getBoundingClientRect().height>0).map(el=>{let surface=el;while(surface.parentElement&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;return {name:el.id||el.className,color:getComputedStyle(surface).backgroundColor,image:getComputedStyle(el).backgroundImage};}));
    assert(surfaces.length>0,'Settings page has cards: '+id);
    for(const s of surfaces){assert.equal(s.color,'rgb(0, 0, 0)',id+' '+s.name);assert.equal(s.image,'none',id+' gradients removed');}
  }
  await page.screenshot({path:path.join(out,'settings-black-'+width+'.png')});
  await page.evaluate(()=>{
    state.stocks=[{id:'qa-a',item:'QA shoes A',qty:2,min:1},{id:'qa-b',item:'QA shoes B',qty:3,min:1},{id:'qa-c',item:'QA shoes C',qty:4,min:1}];
    state.daily=[{id:'qa-unrelated',date:'2026-09-20',revenue:100,cost:40}];
    VyaparRecords.invalidate();setTab('stock',false);renderStock();vx622ConvertBulkRows(document);
  });
  await page.locator('#screen-stock .p1-modebar [data-mode="records"]').click();
  const card=page.locator('.vx621-stock-records'),trigger=card.locator('.vx622-menu-trigger'),checks=card.locator('.vx621-stock-check');
  assert.equal(await checks.count(),3);
  assert.equal(await checks.first().isVisible(),false,'Normal list hides selection columns');
  await trigger.click();
  assert.equal(await checks.first().isVisible(),true,'Three dots reveal left checkboxes');
  assert.equal(await card.locator('[data-bulk-destructive]').isDisabled(),true,'Empty selection cannot delete');
  await card.locator('input[value="qa-a"]').check();
  assert.equal(await card.locator('.vx622-selection-count').innerText(),'1 selected');
  assert.equal(await card.locator('thead input[type="checkbox"]').evaluate(el=>el.indeterminate),true);
  await card.locator('h2').click();
  assert.equal(await checks.first().isVisible(),true,'Outside click preserves manual selection');
  await trigger.click();
  await card.getByRole('button',{name:'Delete Selected',exact:true}).click();
  await page.locator('#vyaparGlassDialog [data-glass-cancel]').click();
  assert.deepEqual(await page.evaluate(()=>state.stocks.map(x=>x.id)),['qa-a','qa-b','qa-c'],'Cancel preserves all records');
  await trigger.click();await card.getByRole('button',{name:'Delete Selected',exact:true}).click();
  await page.locator('#vyaparGlassDialog [data-glass-ok]').click();
  await page.waitForFunction(()=>state.stocks.length===2);
  assert.deepEqual(await page.evaluate(()=>state.stocks.map(x=>x.id)),['qa-b','qa-c'],'Only manually selected row deleted');
  await page.evaluate(()=>{renderStock();vx622ConvertBulkRows(document);});
  await trigger.click();await card.getByRole('button',{name:'Select All',exact:true}).click();
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),2,'Select All selects remaining shown records');
  assert.equal(await card.locator('.vx622-selection-count').innerText(),'2 selected');
  await page.screenshot({path:path.join(out,'record-selection-'+width+'.png')});
  await trigger.click();await card.getByRole('button',{name:'Clear Selected',exact:true}).click();
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),0);
  await trigger.click();await card.getByRole('button',{name:'Select All',exact:true}).click();
  await card.locator('.vx622-selection-done').click();
  assert.equal(await checks.first().isVisible(),false,'Done hides and clears selection');
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),0);
  await trigger.click();await card.getByRole('button',{name:'Select All',exact:true}).click();
  await trigger.click();await card.getByRole('button',{name:'Delete Selected',exact:true}).click();
  await page.locator('#vyaparGlassDialog [data-glass-ok]').click();
  await page.waitForFunction(()=>state.stocks.length===0);
  assert.deepEqual(await page.evaluate(()=>state.daily.map(x=>x.id)),['qa-unrelated'],'Other modules remain untouched');
  await page.evaluate(()=>{renderStock();vx622ConvertBulkRows(document);});
  await trigger.click();assert.equal(await card.locator('[data-bulk-destructive]').isDisabled(),true,'Empty list disables deletion');
  await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  await require('./qa-bulk-selection-regressions.cjs')(page,out,width);
  await page.evaluate(()=>setTab('home',false));
  console.log('Settings black + manual/select-all/cancel/confirm/delete/Done passed at '+width+'px');
};
