const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const android = path.join(root, 'android-app/app/src/main/assets');
const androidSource = path.join(root, 'frontend-source/android');

function read(base, name) {
  return fs.readFileSync(path.join(base, name), 'utf8');
}

for (const base of [web]) {
  const index = read(base, 'index.html');
  const css = read(base, 'assets/styles/professional-ui-682.css');

  assert(index.includes('class="vy-professional-ui"'), 'professional UI root class must load before first paint');
  assert(css.includes('--pro-bg: #07172a'), 'dark navy design tokens must be present');
  assert(css.includes('html.vy-professional-ui.theme-light'), 'light mode must have an explicit professional palette');
  assert(css.includes('#screen-home .home-overview::after'), 'home hero graphic must be present');
  assert(css.includes('.nav button.active[data-android-tab]'), 'navigation must have one unified active state');
  assert(css.includes('border-radius: 26px !important'), 'startup logo must use a professional rounded frame');
  assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion support must remain available');
}

const androidIndex = read(android, 'index.html');
const androidCss = read(androidSource, 'styles/professional-ui-682.css');
const androidBundle = read(android, 'assets/styles/vyapar-ui.css');
assert(androidIndex.includes('class="vy-professional-ui"'), 'Android professional UI root class must load before first paint');
assert(androidIndex.includes('vyapar-ui.css?v=20260903-optimized2'), 'Android combined UI stylesheet must be cache-busted');
assert(androidBundle.includes('STYLE SOURCE: professional-ui-682.css'), 'professional UI must be present in the Android bundle');
assert(androidBundle.indexOf('STYLE SOURCE: professional-ui-682.css') < androidBundle.indexOf('STYLE SOURCE: performance-final-850.css'), 'performance safeguards must be the final Android visual layer');
assert(androidCss.includes('--pro-bg: #07172a'), 'Android dark navy design tokens must be present');
assert(androidCss.includes('html.vy-professional-ui.theme-light'), 'Android light mode must have an explicit professional palette');

assert.strictEqual(
  read(web, 'assets/styles/professional-ui-682.css'),
  read(androidSource, 'styles/professional-ui-682.css'),
  'web and Android professional UI styles must stay identical'
);

console.log('✓ Professional UI and graphics polish checks passed');
