'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('frontend-source/android/scripts/app.js');
const css=read('frontend-source/android/styles/three-dot-menu-00046.css');
const build=read('tools/build-frontend-bundles.mjs');

test('three-dot menu uses SVG circles and semantic menu roles',()=>{
  assert.match(app,/vx622-three-dot-icon/);
  assert.match(app,/<circle cx="12" cy="5" r="1\.8"\/>/);
  assert.match(app,/<circle cx="12" cy="12" r="1\.8"\/>/);
  assert.match(app,/<circle cx="12" cy="19" r="1\.8"\/>/);
  assert.match(app,/setAttribute\('aria-haspopup','menu'\)/);
  assert.match(app,/panel\.setAttribute\('role','menu'\)/);
  assert.match(app,/button\.setAttribute\('role','menuitem'\)/);
});

test('select, deselect and destructive actions have icon tiles and divider',()=>{
  assert.match(app,/bulkMenuItemMarkup\('select','Select all'\)/);
  assert.match(app,/bulkMenuItemMarkup\('clear','Deselect all'\)/);
  assert.match(app,/vx622-menu-divider/);
  assert.match(app,/data\.bulkKind|dataset\.bulkKind/);
  assert.match(css,/\.vx622-option-icon/);
  assert.match(css,/\.vx622-menu-divider/);
  assert.match(css,/--vx46-danger:#f17489/);
});

test('menu idles out after ten seconds but interaction disables that idle close',()=>{
  assert.match(app,/BULK_MENU_AUTO_CLOSE_MS=10000/);
  assert.match(app,/bulkMenuInteracted=new WeakSet/);
  assert.match(app,/bulkMenuTouched\(row\)/);
  assert.match(app,/armBulkMenuTimer\(row\)/);
  assert.doesNotMatch(app,/if\(!event\.target\.closest\('\.vx622-menu-item'\)\)return;\s*closeBulkMenus\(\)/);
});

test('popup matches supplied geometry and is the last shared UI style',()=>{
  assert.match(css,/width:245px!important/);
  assert.match(css,/max-width:calc\(100vw - 55px\)!important/);
  assert.match(css,/border-radius:18px!important/);
  assert.match(css,/0 12px 35px rgba\(0,0,0,\.48\)/);
  assert.match(css,/min-height:48px!important/);
  assert.match(css,/width:30px!important/);
  assert.match(css,/animation:vx46MenuOpen 180ms ease-out/);
  const ui=build.slice(build.indexOf('const uiStyles'),build.indexOf('const scripts'));
  const styles=[...ui.matchAll(/'([^']+\.css)'/g)].map(m=>m[1]);
  assert.equal(styles.at(-1),'three-dot-menu-00046.css');
});

test('00052 close behavior hides selection columns and final theme uses four neutral levels',()=>{
  assert.match(app,/setBulkSelectionMode\(menu,false\)/);
  assert.match(app,/setBulkSelectionMode\(row,false\)/);
  assert.match(app,/resetSelection=false/);
  assert.match(css,/--vy52-bg:#000000/);
  assert.match(css,/--vy52-chrome:#121212/);
  assert.match(css,/--vy52-card:#1A1A1A/);
  assert.match(css,/--vy52-control:#242424/);
  assert.match(css,/--vy52-active:#A50035/);
  assert.match(css,/visibility:hidden!important/);
  assert.match(css,/transform:translate3d\(8px,-8px,0\) scale\(\.90\)/);
});

