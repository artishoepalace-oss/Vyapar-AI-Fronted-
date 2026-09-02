'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const pairs=[
  ['web/assets/scripts/audit-fixes-658.js','web/assets/scripts/audit-stage2-6601.js','web/assets/scripts/sales-theme-660.js'],
  ['android-app/app/src/main/assets/assets/scripts/audit-fixes-658.js','android-app/app/src/main/assets/assets/scripts/audit-stage2-6601.js','android-app/app/src/main/assets/assets/scripts/sales-theme-660.js']
];
for(const [legacyRel,stageRel,updateRel] of pairs){
  const legacy=fs.readFileSync(path.join(ROOT,legacyRel),'utf8');
  const stage=fs.readFileSync(path.join(ROOT,stageRel),'utf8');
  const update=fs.readFileSync(path.join(ROOT,updateRel),'utf8');
  assert.ok(!legacy.includes("wrap.className='vy658-year-filter'"), legacyRel+' must not inject the legacy Year selector');
  assert.ok(stage.includes("existing.slice(1).forEach(x=>x.remove())"), stageRel+' must dedupe canonical Year selectors');
  assert.ok(update.includes("popup.id='vy670UpdatePrompt'"), updateRel+' must render the in-app update modal');
  const active=update.slice(update.indexOf('window.fs607CheckUpdate=async function(manual)'));
  assert.ok(!active.includes('confirm('), updateRel+' active update checker must not use browser/WebView confirm');
  assert.ok(active.includes('__vy670UpdateCheckPromise'), updateRel+' must dedupe concurrent update checks');
}
console.log('✓ phase 3.1 duplicate UI hotfix checks passed');
