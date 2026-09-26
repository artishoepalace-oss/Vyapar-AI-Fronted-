'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('00058 release identity and Android 8 minimum are synchronized',()=>{
  const version=JSON.parse(read('version.json'));
  const gradle=read('android-app/app/build.gradle');
  assert.equal(version.versionName,'20.10.2004.00058.2026');
  assert.equal(version.versionCode,2010200458);
  assert.match(gradle,/minSdk\s+26/);
  assert.match(gradle,/versionCode\s+2010200458/);
  assert.match(gradle,/versionName\s+"20\.10\.2004\.00058\.2026"/);
});

test('00058 physical UI owns spring panels, safe radii and static chrome reflections',()=>{
  const motion=read('frontend-source/android/scripts/motion-20102004.js');
  const nav=read('frontend-source/android/styles/capsule-navigation.css');
  const radius=read('frontend-source/android/styles/global-radius-final-00045.css');
  const menu=read('frontend-source/android/styles/three-dot-menu-00046.css');
  assert.match(motion,/springProgressFrames/);
  assert.match(motion,/springPanelIn/);
  assert.match(motion,/adaptive-damped-spring/);
  assert.match(nav,/radial-gradient\(120% 38%/);
  assert.match(nav,/radial-gradient\(115% 42%/);
  assert.match(radius,/--vy45-panel:24px/);
  assert.match(radius,/--vy45-card:18px/);
  assert.match(radius,/--vy45-panel-pad:18px/);
  assert.match(menu,/width:224px!important/);
  assert.match(menu,/border-radius:18px!important/);
  assert.match(menu,/#androidMoreSheet > \.android-sheet/);
  assert.match(menu,/#vyGitHubUpdate > \.github-update-dialog/);
  assert.match(menu,/vy-pointer-input/);
});

test('Settings routes own canonical page labels instead of stale internal headings',()=>{
  const settings=read('frontend-source/android/scripts/settings-center-675.js');
  for(const label of ['Account & plan','Account password','Business profile','Business controls','Motion & performance','Navigation','Backup & restore','App updates','Help & legal'])assert(settings.includes(label),label);
  assert.match(settings,/synchronizeCardHeading\(id,item,cards\)/);
  assert.match(settings,/card\.dataset\.vy675Owner=id/);
  assert.doesNotMatch(settings,/function themeName\(\) \{ return 'Dark'; \}/);
});

test('Android bridge securely shares generated invoice PDFs through read-only provider',()=>{
  const activity=read('android-app/app/src/main/java/com/vyaparai/app/MainActivity.java');
  const provider=read('android-app/app/src/main/java/com/vyaparai/app/UpdateApkProvider.java');
  const manifest=read('android-app/app/src/main/AndroidManifest.xml');
  const invoice=read('frontend-source/android/scripts/invoice-pdf.js');
  assert.match(activity,/public void shareBase64\(/);
  assert.match(activity,/Intent\.ACTION_SEND/);
  assert.match(activity,/Intent\.EXTRA_STREAM/);
  assert.match(activity,/FLAG_GRANT_READ_URI_PERMISSION/);
  assert.match(activity,/com\.whatsapp/);
  assert.match(activity,/com\.whatsapp\.w4b/);
  assert.match(provider,/"share"\.equals\(segments\.get\(0\)\)/);
  assert.match(provider,/application\/pdf/);
  assert.match(provider,/getCanonicalFile\(\)/);
  assert.match(manifest,/com\.whatsapp/);
  assert.match(invoice,/shareBase64/);
  assert.match(invoice,/whatsappOnly/);
});
