const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const android = path.join(root, 'android-app/app/src/main/assets');
const expectedVersion = '6.8.2.2026';

function read(base, name) {
  return fs.readFileSync(path.join(base, name), 'utf8');
}

for (const base of [web, android]) {
  const index = read(base, 'index.html');
  const script = read(base, 'settings-center-675.js');
  const style = read(base, 'settings-center-675.css');

  assert(index.includes('settings-center-675.css'), 'new Settings stylesheet must be loaded');
  assert(index.includes('settings-center-675.js'), 'new Settings script must be loaded');
  assert(index.includes(`content="${expectedVersion}"`), 'UI version metadata must match the release');
  assert(!index.includes('settings-directory-672'), 'old Settings directory must not be loaded');
  assert(!fs.existsSync(path.join(base, 'settings-directory-672.js')), 'old Settings script must be removed');
  assert(!fs.existsSync(path.join(base, 'settings-directory-672.css')), 'old Settings stylesheet must be removed');

  for (const label of [
    'Account & plan',
    'Business profile',
    'Business controls',
    'Privacy & security',
    'Appearance & performance',
    'Navigation',
    'Backup & restore',
    'App updates',
    'Help & legal'
  ]) {
    assert(script.includes(label), `missing Settings destination: ${label}`);
  }

  assert(script.includes('Search settings'), 'Settings search must be available');
  assert(script.includes('Auto Scroll to Top'), 'navigation preference must remain available');
  assert(script.includes('handleNativeBackPress'), 'Android back navigation must be handled');
  assert(script.includes('© 2026 Vyapar AI. All Rights Reserved.'), 'copyright footer must be present');
  assert(style.includes('white-space: normal'), 'row descriptions must remain readable instead of being clipped');
  assert(style.includes('html.theme-light'), 'light mode styling must be present');
  assert(style.includes('.danger'), 'destructive actions must keep explicit styling');
  assert(script.includes('stack.hidden = true'), 'legacy Settings repository must be hidden at the DOM level');

  const finalStyle = read(base, 'complete-ui-680.css');
  assert(finalStyle.includes('.settings-stack:not(.vy675-settings-repository)'), 'final UI layer must not display the legacy Settings repository');
  assert(finalStyle.includes('settings-stack.vy675-settings-repository[hidden]'), 'hidden Settings repository needs an authoritative final override');
  assert(finalStyle.includes('data-vy675-page="account"'), 'Settings destinations must keep color-coded accents');
  assert(finalStyle.includes('width: 108px !important'), 'WebView loading logo must match the native 108dp logo scale');
  assert(finalStyle.includes('flatter Settings pages + higher-saturation app identity'), 'flat and vibrant UI layer must be present');
  assert(finalStyle.includes('.nav button.active[data-android-tab="business"]'), 'every primary nav destination needs its own active color');
  assert(finalStyle.includes('production-actions {'), 'Account actions must use the compact layout');
  assert(finalStyle.includes('padding: 2px 0 16px !important'), 'Settings sub-page outer cards must be flattened');
}

assert.strictEqual(
  read(web, 'settings-center-675.js'),
  read(android, 'settings-center-675.js'),
  'web and Android Settings logic must stay identical'
);
assert.strictEqual(
  read(web, 'settings-center-675.css'),
  read(android, 'settings-center-675.css'),
  'web and Android Settings styles must stay identical'
);

const rootVersion = JSON.parse(read(root, 'version.json'));
const webVersion = JSON.parse(read(web, 'version.json'));
const gradle = read(path.join(root, 'android-app/app'), 'build.gradle');
const mainActivity = read(path.join(root, 'android-app/app/src/main/java/com/vyaparai/app'), 'MainActivity.java');
assert.strictEqual(rootVersion.versionName, expectedVersion, 'root release version must match');
assert.strictEqual(webVersion.versionName, expectedVersion, 'web release version must match');
assert(gradle.includes(`versionName "${expectedVersion}"`), 'Android release version must match');
assert(gradle.includes('versionCode 6822026'), 'Android release code must match');
assert(mainActivity.includes('Color.rgb(6, 23, 45)'), 'first WebView frame must match the dark launch surface');

console.log(`✓ Settings Center + complete UI ${expectedVersion} checks passed`);
