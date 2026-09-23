'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('frontend-source/android/styles/middle-bar-2026.css');
const js=read('frontend-source/android/scripts/middle-bar-2026.js');
const build=read('tools/build-frontend-bundles.mjs');
test('middle bar is bundled into both Android and web without changing bottom navbar',()=>{
  assert.match(build,/'middle-bar-2026.css'/);assert.match(build,/'middle-bar-2026.js'/);
  assert.match(css,/\.p1-modebar/);assert.match(css,/\.workspace-tabs/);
  assert.doesNotMatch(css,/#nav\b/);
});
test('middle capsule reads existing aria state and follows measured coordinates',()=>{
  assert.match(js,/getAttribute\('aria-selected'\)/);
  assert.match(js,/getAttribute\('aria-pressed'\)/);
  assert.match(js,/getBoundingClientRect\(\)/);
  assert.match(js,/MutationObserver/);assert.match(js,/ResizeObserver/);
  assert.doesNotMatch(js,/\b(?:setTab|setMode|saveMode|localStorage|sessionStorage)\s*\(/);
});
test('middle capsule provides 44px buttons and reduced-motion fallback',()=>{
  assert.match(css,/height:44px!important/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/translate3d\(var\(--vy-middle-x/);
});
