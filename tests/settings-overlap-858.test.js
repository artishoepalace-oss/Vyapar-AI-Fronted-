const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hotfix = fs.readFileSync(path.join(root, 'frontend-source/android/styles/settings-overlap-858.css'), 'utf8');
const buildTool = fs.readFileSync(path.join(root, 'tools/build-frontend-bundles.mjs'), 'utf8');
const index = fs.readFileSync(path.join(root, 'android-app/app/src/main/assets/index.html'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'android-app/app/build.gradle'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

assert(hotfix.includes('position:relative!important;'), 'Settings page header must stay in normal document flow');
assert(hotfix.includes('top:auto!important;'), 'Settings page header must not reuse the fixed top-bar offset');
assert(hotfix.includes('#screen-settings .vy675-page-body'), 'Settings body separation rule must exist');
assert(hotfix.includes('clear:both!important;'), 'Settings page body must clear the header plane');
assert(hotfix.includes('.vy854-settings-in:not(.vy856-settings-in)'), 'legacy Settings transition restart must be neutralized');
assert(buildTool.includes("'settings-overlap-858.css'"), 'Settings hotfix must be bundled after the unified 8.5.8 layer');

assert.strictEqual(version.versionName, '8.5.8.2026');
assert.strictEqual(Number(version.versionCode), 8582026);
assert(gradle.includes('versionCode 8582026'));
assert(gradle.includes('versionName "8.5.8.2026"'));
assert(index.includes('content="8.5.8.2026"'));
assert(index.includes('vyapar-ui.css?v=20260906-settings858'));
assert(index.includes('vyapar-app.js?v=20260906-settings858'));

console.log('✓ Settings overlap regression checks passed for 8.5.8.2026');
