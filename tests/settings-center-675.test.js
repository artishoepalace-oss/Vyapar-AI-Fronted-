const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const android = path.join(root, 'android-app/app/src/main/assets');
const expectedVersion = '6.8.0.2026';

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
assert.strictEqual(rootVersion.versionName, expectedVersion, 'root release version must match');
assert.strictEqual(webVersion.versionName, expectedVersion, 'web release version must match');
assert(gradle.includes(`versionName "${expectedVersion}"`), 'Android release version must match');
assert(gradle.includes('versionCode 6802026'), 'Android release code must match');

console.log('✓ Settings Center + complete UI 6.8.0 checks passed');
