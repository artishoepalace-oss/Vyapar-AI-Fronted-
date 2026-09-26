/* Runs inside the mocked-account browser suite; never contacts production data. */
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,out,width){
  await page.evaluate(()=>setTab('settings',false));
  for(const id of ['account','profile','business','security','appearance','navigation','data']){
    await page.evaluate(id=>vy675OpenSettingsPage(id),id);
    await page.waitForTimeout(100);
    const surfaces=await page.locator('#screen-settings .vy675-page-body').evaluate(el=>[...el.querySelectorAll('.card,.settings-section,.production-account-card,.production-account-grid > div,.vx622-settings-list,.vx622-lock-status,.notice,.vy675-option-row')].filter(el=>el.getBoundingClientRect().height>0).map(el=>{let surface=el;while(surface.parentElement&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;return {name:el.id||el.className,color:getComputedStyle(surface).backgroundColor,image:getComputedStyle(el).backgroundImage};}));
    assert(surfaces.length>0,'Settings page has cards: '+id);
    for(const s of surfaces){assert.equal(s.color,'rgb(26, 26, 26)',id+' '+s.name);assert.equal(s.image,'none',id+' gradients removed');}
  }
  // Physical-device Settings regression: content must clear rounded edges and navy controls must not return.
  for(const id of ['profile','security','appearance','data']){
    await page.evaluate(id=>vy675OpenSettingsPage(id),id);
    await page.waitForTimeout(120);
    const top=page.locator('#screen-settings .vy675-page-body > .card, #screen-settings .vy675-page-body > .settings-section').first();
    const box=await top.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {paddingLeft:parseFloat(s.paddingLeft),left:r.left,right:r.right,viewport:innerWidth,bg:s.backgroundColor};});
    assert(box.paddingLeft>=14,id+' keeps a safe inner gutter: '+JSON.stringify(box));
    assert(box.left>=0&&box.right<=box.viewport,id+' card fits viewport');
    assert.equal(box.bg,'rgb(26, 26, 26)',id+' uses shared card surface');
  }
  await page.evaluate(()=>vy675OpenSettingsPage('profile'));
  await page.waitForTimeout(100);
  const profileControls=await page.locator('#screen-settings .vy675-page-body input:not([type="checkbox"]):not([type="radio"]), #screen-settings .vy675-page-body select').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height>0).map(n=>getComputedStyle(n).backgroundColor));
  assert(profileControls.length>=2,'Business profile controls rendered');
  profileControls.forEach(color=>assert.equal(color,'rgb(36, 36, 36)','Business profile control is neutral graphite'));
  await page.evaluate(()=>vy675OpenSettingsPage('security'));
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#vx622AppLockSection .vx622-lock-heading:visible, #vx622AppLockSection .vx643-security-copy:visible').count(),0,'Password card does not repeat page heading');
  await page.evaluate(()=>vy675OpenSettingsPage('appearance'));
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#screen-settings .vy675-page-body > .settings-section > .settings-section-heading:visible, #screen-settings .vy675-page-body > .card > .settings-section-heading:visible').count(),0,'Motion card does not repeat page heading');

  await page.screenshot({path:path.join(out,'settings-palette-'+width+'.png')});
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
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','Outside click closes the three-dot popup');
  assert.equal(await checks.first().isVisible(),false,'Closing the popup hides the checkbox column automatically');
  await trigger.click();
  const deleteSelected=card.getByRole('menuitem',{name:/^Delete selected(?: \(\d+\))?$/i});
  const selectAll=card.getByRole('menuitem',{name:/^Select all$/i});
  const deselectAll=card.getByRole('menuitem',{name:/^Deselect all$/i});
  await deleteSelected.click();
  await page.locator('#vyaparGlassDialog [data-glass-cancel]').click();
  assert.deepEqual(await page.evaluate(()=>state.stocks.map(x=>x.id)),['qa-a','qa-b','qa-c'],'Cancel preserves all records');
  assert.equal(await trigger.getAttribute('aria-expanded'),'true','Menu stays open after touching an action');
  await deleteSelected.click();
  await page.locator('#vyaparGlassDialog [data-glass-ok]').click();
  await page.waitForFunction(()=>state.stocks.length===2);
  assert.deepEqual(await page.evaluate(()=>state.stocks.map(x=>x.id)),['qa-b','qa-c'],'Only manually selected row deleted');
  await page.evaluate(()=>{renderStock();vx622ConvertBulkRows(document);});
  await trigger.click();await selectAll.click();
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),2,'Select all selects remaining shown records');
  assert.equal(await card.locator('.vx622-selection-count').innerText(),'2 selected');
  assert.equal(await trigger.getAttribute('aria-expanded'),'true','Select all keeps menu open');
  await page.screenshot({path:path.join(out,'record-selection-'+width+'.png')});
  await deselectAll.click();
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),0);
  assert.equal(await trigger.getAttribute('aria-expanded'),'true','Deselect all keeps menu open');
  await selectAll.click();
  await deselectAll.click();
  await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','The trigger closes the selection menu');
  assert.equal(await page.locator('.vx622-selection-done').count(),0,'Done is removed from all rendered menus');
  assert.equal(await card.locator('.vx621-stock-check:checked').count(),0);
  await trigger.click();await selectAll.click();
  await deleteSelected.click();
  await page.locator('#vyaparGlassDialog [data-glass-ok]').click();
  await page.waitForFunction(()=>state.stocks.length===0);
  assert.deepEqual(await page.evaluate(()=>state.daily.map(x=>x.id)),['qa-unrelated'],'Other modules remain untouched');
  await page.evaluate(()=>{renderStock();vx622ConvertBulkRows(document);});
  await trigger.click();assert.equal(await card.locator('[data-bulk-destructive]').isDisabled(),true,'Empty list disables deletion');
  await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  await require('./qa-bulk-selection-regressions.cjs')(page,out,width);
  await page.evaluate(()=>setTab('home',false));
  console.log('Settings black + manual/select-all/cancel/confirm/delete/deselect passed at '+width+'px');
};
