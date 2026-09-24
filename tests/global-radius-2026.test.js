'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=read('frontend-source/android/styles/global-radius-2026.css');
const build=read('tools/build-frontend-bundles.mjs');
const middle=read('frontend-source/android/styles/middle-bar-2026.css');
const navbar=read('frontend-source/android/styles/capsule-navigation.css');

test('One final shared stylesheet applies to Android and web, after other styling',()=>{
  const marker="'global-radius-2026.css'";
  assert.equal(build.split(marker).length,2);
  assert.ok(build.indexOf("'invoice-workspace-2026.css'")<build.indexOf(marker));
  assert.match(css,/--vy44-shell-radius:999px/);
  assert.match(css,/--vy44-panel-radius:26px/);
  assert.match(css,/--vy44-inner-radius:24px/);
});

test('Header, navbar and animated middle bar use fully rounded ends without reimplementing tab motion',()=>{
  assert.match(css,/\.app > \.top/);
  assert.match(css,/#nav\.nav\.bottom-nav/);
  assert.match(css,/\.vy-middle-ready::before/);
  assert.match(css,/border-radius:var\(--vy44-shell-radius\)!important/);
  assert.doesNotMatch(css,/setTab|setMode|localStorage|animation-duration/);
  assert.match(middle,/translate3d\(var\(--vy-middle-x/);
  assert.match(navbar,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('Every principal screen has scoped card rounding and search fields retain focus',()=>{
  for(const id of ['#screen-home','#screen-business','#screen-sales','#screen-stock',
    '#screen-analytics','#screen-upload','#screen-calculator','#screen-settings','#screen-subscription'])
    assert.ok(css.includes(id),id+' missing');
  assert.match(css,/\.vx621-kpis/);
  assert.match(css,/\.vx621-feature-card/);
  assert.match(css,/\.vy-search-control/);
  assert.match(css,/:focus-within/);
  assert.match(css,/@media\(max-width:380px\)/);
  assert.doesNotMatch(css,/overflow:hidden!important/,'Do not clip three-dot popup menus');
});

test('Three dot controls are 44 by 44 circles including monthly records',()=>{
  assert.match(css,/\.vx622-menu-trigger/);
  assert.match(css,/width:44px!important/);
  assert.match(css,/height:44px!important/);
  assert.match(css,/border-radius:50%!important/);
  assert.match(css,/#monthly-profit-records/);
  assert.match(css,/:focus-visible/);
});
