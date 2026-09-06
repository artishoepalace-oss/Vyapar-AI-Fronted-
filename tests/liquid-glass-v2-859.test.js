'use strict';
const fs=require('fs');
const assert=require('assert');
const builder=fs.readFileSync('tools/build-frontend-bundles.mjs','utf8');
const css=fs.readFileSync('frontend-source/android/styles/flat-black-ios-861.css','utf8');
const js=fs.readFileSync('frontend-source/android/scripts/flat-black-ios-861.js','utf8');
const bundle=fs.readFileSync('android-app/app/src/main/assets/assets/styles/vyapar-ui.css','utf8');

for(const old of ['apple-liquid-852.css','apple-liquid-853.css','liquid-lens-motion-856.css','liquid-lens-legacy-856.css','ios27-convex-857.css','ios-liquid-unified-858.css','liquid-glass-v2-859.css','ios-hig-blur-860.css']){
  assert(!builder.includes(`'${old}'`),`${old} must not be active in production bundle`);
}
for(const old of ['apple-motion-852.js','apple-motion-853.js','liquid-lens-motion-856.js','ios27-convex-857.js','ios-liquid-unified-858.js','liquid-glass-v2-859.js','ios-hig-blur-860.js']){
  assert(!builder.includes(`'${old}'`),`${old} must not execute in production bundle`);
}
assert(builder.includes("'flat-black-ios-861.css'"),'flat black style layer must be bundled');
assert(builder.includes("'flat-black-ios-861.js'"),'flat black coordinator must be bundled');
assert(bundle.includes('STYLE SOURCE: flat-black-ios-861.css'),'final flat style must exist in runtime bundle');
assert(css.includes('background:#000!important'),'dark root must be true black');
assert(css.includes('backdrop-filter:blur(34px)'),'top bar must keep dense blur');
assert(css.includes('backdrop-filter:blur(36px)'),'bottom nav must keep dense blur');
assert(css.includes('UNIVERSAL POPUP / SHEET SYSTEM'),'popups must share one system');
assert(js.includes("root.classList.add('vy861-flat-black')"),'final coordinator class must be installed');
console.log('✓ 8.6.1 flat-black / no-liquid runtime checks passed');
