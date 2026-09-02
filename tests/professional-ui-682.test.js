const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const android = path.join(root, 'android-app/app/src/main/assets');

function read(base, name) {
  return fs.readFileSync(path.join(base, name), 'utf8');
}

for (const base of [web, android]) {
  const index = read(base, 'index.html');
  const css = read(base, 'professional-ui-682.css');

  assert(index.includes('class="vy-professional-ui"'), 'professional UI root class must load before first paint');
  assert(index.includes('professional-ui-682.css?v=20260902-professional1'), 'professional UI stylesheet must be cache-busted');
  assert(index.indexOf('professional-ui-682.css') > index.indexOf('complete-ui-680.css'), 'professional polish must be the final CSS layer');
  assert(css.includes('--pro-bg: #07172a'), 'dark navy design tokens must be present');
  assert(css.includes('html.vy-professional-ui.theme-light'), 'light mode must have an explicit professional palette');
  assert(css.includes('#screen-home .home-overview::after'), 'home hero graphic must be present');
  assert(css.includes('.nav button.active[data-android-tab]'), 'navigation must have one unified active state');
  assert(css.includes('border-radius: 26px !important'), 'startup logo must use a professional rounded frame');
  assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion support must remain available');
}

assert.strictEqual(
  read(web, 'professional-ui-682.css'),
  read(android, 'professional-ui-682.css'),
  'web and Android professional UI styles must stay identical'
);

console.log('✓ Professional UI and graphics polish checks passed');
