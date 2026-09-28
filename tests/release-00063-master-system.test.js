'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('00063 release identity stays synchronized',()=>{
  const version=JSON.parse(read('version.json'));
  const gradle=read('android-app/app/build.gradle');
  assert.equal(version.versionName,'20.10.2004.00063.2026');
  assert.equal(version.versionCode,2010200463);
  assert.match(gradle,/versionCode\s+2010200463/);
  assert.match(gradle,/versionName\s+"20\.10\.2004\.00063\.2026"/);
  assert.match(gradle,/minSdk\s+26/);
});

test('00063 final contract is last and removes decorative chrome glitter',()=>{
  const builder=read('tools/build-frontend-bundles.mjs');
  const css=read('frontend-source/android/styles/master-system-00063.css');
  const ui=builder.slice(builder.indexOf('const uiStyles'),builder.indexOf('const scripts'));
  const styles=[...ui.matchAll(/'([^']+\.css)'/g)].map(m=>m[1]);
  assert.equal(styles.at(-1),'master-system-00063.css');
  assert.match(css,/--vy63-chrome:#121212/);
  assert.match(css,/background-image:none!important/);
  assert.match(css,/#nav\.nav\.bottom-nav::after/);
  assert.match(css,/display:none!important/);
  assert.match(css,/box-shadow:none!important/);
  assert.match(css,/\.active-capsule/);
  assert.match(css,/background:#c8c6c8!important/);
});

test('00063 enforces shared alignment and touch geometry',()=>{
  const css=read('frontend-source/android/styles/master-system-00063.css');
  assert.match(css,/--vy63-touch:44px/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css,/width:367px!important/);
  assert.match(css,/height:50px!important/);
  assert.match(css,/width:68px!important/);
  assert.match(css,/height:42px!important/);
  assert.match(css,/margin-left:50%!important/);
  assert.match(css,/transform:translateX\(-50%\)!important/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/max-width:100%/);
});

test('00063 page motion is directional but restrained and low-jank',()=>{
  const js=read('frontend-source/android/scripts/motion-20102004.js');
  const css=read('frontend-source/android/styles/motion-20102004.css');
  assert.match(js,/const time=duration\(280\)/);
  assert.match(js,/Math\.min\(20,Math\.max\(12,Math\.round\(width\*\.045\)\)\)/);
  assert.match(js,/Math\.min\(16,Math\.max\(12,Math\.round\(\(window\.innerWidth\|\|360\)\*\.04\)\)\)/);
  assert.match(js,/Math\.min\(1\.018,x\)/);
  assert.doesNotMatch(js,/const travel=Math\.max\(width,window\.innerWidth\|\|width\)/);
  assert.match(css,/--vy-motion-page:280ms/);
  assert.match(css,/scale\(\.988\)/);
});

test('00063 keeps native scrolling and one motion owner',()=>{
  const js=read('frontend-source/android/scripts/motion-20102004.js');
  const css=read('frontend-source/android/styles/motion-20102004.css');
  assert.match(js,/adaptive-damped-spring/);
  assert.match(js,/native-webview-fling/);
  assert.match(js,/if\(window\.vyaparMotion\) return/);
  assert.match(css,/overscroll-behavior-y:contain/);
});
