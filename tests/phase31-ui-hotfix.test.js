'use strict';
const readRuntimeSource = require('./runtime-source.cjs');
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const pairs=[
  ['web/assets/scripts/audit-fixes-658.js','web/assets/scripts/audit-stage2-6601.js','web/assets/scripts/github-updates.js'],
  ['frontend-source/android/scripts/audit-fixes-658.js','frontend-source/android/scripts/audit-stage2-6601.js','frontend-source/android/scripts/github-updates.js']
];
for(const [legacyRel,stageRel,updateRel] of pairs){
  const legacy=readRuntimeSource(path.join(ROOT,legacyRel),'utf8');
  const stage=readRuntimeSource(path.join(ROOT,stageRel),'utf8');
  const update=readRuntimeSource(path.join(ROOT,updateRel),'utf8');
  assert.ok(!legacy.includes("wrap.className='vy658-year-filter'"), legacyRel+' must not inject the legacy Year selector');
  assert.ok(stage.includes("existing.slice(1).forEach(x=>x.remove())"), stageRel+' must dedupe canonical Year selectors');
  assert.ok(update.includes("modal.id='vyGitHubUpdate'"), updateRel+' must render the in-app update modal');
  const active=update;
  assert.ok(!active.includes('confirm('), updateRel+' active update checker must not use browser/WebView confirm');
  assert.ok(active.includes('if(pending)return pending;'), updateRel+' must dedupe concurrent update checks');
}
console.log('✓ phase 3.1 duplicate UI hotfix checks passed');
