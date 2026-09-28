'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('00064 release identity stays synchronized',()=>{
  const version=JSON.parse(read('version.json'));
  const gradle=read('android-app/app/build.gradle');
  assert.equal(version.versionName,'20.10.2004.00064.2026');
  assert.equal(version.versionCode,2010200464);
  assert.match(gradle,/versionCode\s+2010200464/);
  assert.match(gradle,/versionName\s+"20\.10\.2004\.00064\.2026"/);
  assert.match(gradle,/minSdk\s+26/);
});

test('00064 restores the v00062 navbar contract and prevents master overrides',()=>{
  const nav=read('frontend-source/android/styles/capsule-navigation.css');
  const master=read('frontend-source/android/styles/master-system-00063.css');
  assert.match(nav,/--vy-chrome-rim:inset 0 1px 0 rgba\(255,255,255,\.34\)/);
  assert.match(nav,/background:linear-gradient\(180deg,#d8d5d8 0%,#c5c1c5 42%,#aaa6aa 100%\)/);
  assert.match(nav,/transition:transform 420ms cubic-bezier\(\.18,\.90,\.24,1\.12\)/);
  assert.match(nav,/#nav\.nav\.bottom-nav::after[\s\S]*display:block!important/);
  assert.match(nav,/font-weight:650!important/);
  assert.match(master,/v20\.10\.2004\.00062 navbar\/top-bar geometry/);
  assert.doesNotMatch(master,/body #nav\.nav\.bottom-nav\s*\{/);
  assert.doesNotMatch(master,/body \.app > \.top\s*\{/);
});

test('00064 uses one semantic design vocabulary for content surfaces',()=>{
  const css=read('frontend-source/android/styles/master-system-00063.css');
  for(const token of [
    '--surface-background','--surface-primary','--surface-secondary','--surface-elevated',
    '--text-primary','--text-secondary','--separator','--interactive-active',
    '--space-1','--space-4','--radius-control','--radius-card','--radius-sheet',
    '--text-caption','--text-body','--text-metric','--text-money',
    '--motion-micro','--motion-snappy','--motion-fluid','--motion-heavy','--motion-document'
  ]) assert.ok(css.includes(token),token);
  assert.match(css,/data-ui-role="metric"/);
  assert.match(css,/data-ui-role="document"/);
  assert.match(css,/--vy63-touch:44px/);
});

test('00064 exposes semantic physics without replacing native WebView scrolling',()=>{
  const js=read('frontend-source/android/scripts/motion-20102004.js');
  const css=read('frontend-source/android/styles/motion-20102004.css');
  assert.match(js,/adaptive-damped-spring/);
  assert.match(js,/native-webview-fling/);
  assert.match(js,/micro:\{settleMs:120,mass:\.45,stiffness:520,damping:44/);
  assert.match(js,/navigation:\{className:'snappy',mass:\.75,stiffness:360,damping:32\}/);
  assert.match(js,/document:\{className:'document',mass:1\.55,stiffness:300,damping:44\}/);
  assert.match(css,/data-motion-class="document"/);
  assert.doesNotMatch(css,/transition\s*:\s*all\b/i);
  assert.match(css,/\.card\[role="button"\]/);
});

test('00064 business engine centralizes tax, document state and idempotency hooks',()=>{
  const app=read('frontend-source/android/scripts/app.js');
  assert.match(app,/window\.VyaparTaxEngine=/);
  assert.match(app,/taxInclusive/);
  assert.match(app,/hsn:/);
  assert.match(app,/sac:/);
  assert.match(app,/function deriveDocumentState/);
  assert.match(app,/PARTIALLY_PAID/);
  assert.match(app,/PARTIALLY_REFUNDED/);
  assert.match(app,/clientMutationId/);
  assert.match(app,/idempotencyKey/);
  assert.match(app,/Return quantity exceeds remaining quantity/);
});
