'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'android-app/app/src/main/assets');
const source = path.join(root, 'frontend-source/android');
const read = file => fs.readFileSync(file, 'utf8');

const index = read(path.join(assets, 'index.html'));
const scriptBundle = read(path.join(assets, 'assets/scripts/vyapar-app.js'));
const styleBundle = read(path.join(assets, 'assets/styles/vyapar-ui.css'));
const mainActivity = read(path.join(root, 'android-app/app/src/main/java/com/vyaparai/app/MainActivity.java'));

assert.deepEqual(
  fs.readdirSync(path.join(assets, 'assets/scripts')).filter(name => name.endsWith('.js')).sort(),
  ['vyapar-app.js'],
  'Android runtime must keep one local JavaScript bundle'
);
assert.deepEqual(
  fs.readdirSync(path.join(assets, 'assets/styles')).filter(name => name.endsWith('.css')).sort(),
  ['vyapar-core.css', 'vyapar-ui.css'],
  'Android runtime must keep two local style bundles'
);

assert.match(index, /<script async src="https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js">/);
assert.match(scriptBundle, /window\.vyaparWaitForRazorpay=function/);
assert.match(scriptBundle, /document\.addEventListener\('visibilitychange'/);
assert.match(scriptBundle, /window\.addEventListener\('pagehide'/);

assert(styleBundle.includes('STYLE SOURCE: performance-final-850.css'));
assert(styleBundle.indexOf('STYLE SOURCE: performance-final-850.css') > styleBundle.indexOf('STYLE SOURCE: professional-ui-682.css'));
assert.match(styleBundle, /html\.android-ui\.perf-scrolling button/);
assert.match(styleBundle, /contain:paint/);

const settings = read(path.join(source, 'scripts/settings-center-675.js'));
const production = read(path.join(source, 'scripts/production-ui-670p1.js'));
const workflow = read(path.join(source, 'scripts/workflow-ui-670p2.js'));
assert.match(settings, /observer\?\.observe\(scr/);
assert.match(production, /document\.querySelector\('main'\) \|\| document\.body/);
assert.match(workflow, /document\.querySelector\('main'\) \|\| document\.body/);

assert.match(mainActivity, /view\.postOnAnimation/);
assert.match(mainActivity, /webView\.onResume\(\)/);
assert.match(mainActivity, /webView\.onPause\(\)/);
assert.match(mainActivity, /webView\.removeCallbacks\(nativeResumeNotifier\)/);

console.log('✓ Android 8.5 startup, scroll, observer and lifecycle optimization checks passed');
