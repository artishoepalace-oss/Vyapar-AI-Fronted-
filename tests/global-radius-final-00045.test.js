'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const css=read('frontend-source/android/styles/global-radius-final-00045.css');
const builder=read('tools/build-frontend-bundles.mjs');
const core=read('frontend-source/android/styles/global-radius-2026.css');
test('v00045 radius layer stays after prior global radius and before later component-specific overrides',()=>{
  const ui=builder.slice(builder.indexOf('const uiStyles'),builder.indexOf('const scripts'));
  const list=[...ui.matchAll(/'([^']+\.css)'/g)].map(m=>m[1]);
  assert.equal(list.filter(p=>p==='global-radius-final-00045.css').length,1);
  assert.ok(ui.indexOf("'global-radius-final-00045.css'")>ui.indexOf("'global-radius-2026.css'"));
  const later=list.slice(list.indexOf('global-radius-final-00045.css')+1);
  assert.ok(later.every(name=>name==='middle-bar-2026.css'||/^three-dot-menu-\d+\.css$/.test(name)),'Only scoped component overrides may follow the radius contract');
});
test('full-pill chrome, inner tabs, cards, searches and sheet hosts are present',()=>{
  ['#nav.nav.bottom-nav','.app > .top','.vy-middle-ready::before','.p1-modebar',
   '.workspace-tabs','.vx621-kpis','.vx621-kpi','.vx621-feature-card',
   '.vx621-stock-records','.vy675-page-body','.vy-invoice-workspace',
   '.vy-search-control','.record-search','.vy-invoice-search','.vy-stock-search',
   '.android-sheet','#vyFormSheet','#vyaparOtpGate','.glass-dialog-card',
   '.vx622-menu-trigger','#monthly-profit-records'].forEach(q=>assert.ok(css.includes(q),q));
  assert.match(css,/--vy45-pill:999px/);
  assert.match(css,/--vy45-panel:26px/);
  assert.match(css,/--vy45-card:24px/);
  assert.match(css,/border-radius:50%!important/);
  assert.match(css,/width:44px!important/);
  assert.match(css,/height:44px!important/);
});
test('presentation patch does not change financial data, tab geometry or scroll behavior',()=>{
  assert.doesNotMatch(css,/grid-column\s*:/);
  assert.doesNotMatch(css,/grid-template-columns\s*:/);
  assert.doesNotMatch(css,/(?:overflow|position|z-index|transform|transition|animation|pointer-events)\s*:/);
  assert.match(core,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
test('all nine root app screens and off-screen dialogs use shared corners',()=>{
 ['#screen-home','#screen-business','#screen-sales','#screen-stock','#screen-analytics',
  '#screen-upload','#screen-calculator','#screen-settings','#screen-subscription'].forEach(id=>assert.ok(css.includes(id),id));
 assert.match(css,/#androidPermissionSheet/);
 assert.match(css,/#androidMoreSheet/);
 assert.match(css,/#vyGitHubUpdate/);
 assert.match(css,/\.github-update-dialog/);
});
