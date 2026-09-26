'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('physics baseline targets Android 8.0+ with synchronized release identity',()=>{
  const version=JSON.parse(read('version.json'));
  const gradle=read('android-app/app/build.gradle');
  assert.match(version.versionName,/^20\.10\.2004\.\d{5}\.2026$/);
  assert(Number.isInteger(version.versionCode) && version.versionCode>=2010200457);
  assert.match(gradle,/minSdk\s+26/);
  assert.equal(version.versionCode,Number((gradle.match(/versionCode\s+(\d+)/)||[])[1]));
  assert.equal(version.versionName,(gradle.match(/versionName\s+"([^"]+)"/)||[])[1]);
});

test('shared motion owner exposes adaptive spring physics and keeps native fling scrolling',()=>{
  const js=read('frontend-source/android/scripts/motion-20102004.js');
  const css=read('frontend-source/android/styles/motion-20102004.css');
  assert.match(js,/adaptive-damped-spring/);
  assert.match(js,/native-webview-fling/);
  assert.match(js,/minAndroidApi:26/);
  assert.match(js,/touchmove/);
  assert.match(js,/velocity>\.52/);
  assert.match(js,/vy-physics-motion/);
  assert.match(css,/--vy-motion-spring:/);
  assert.match(css,/touch-action:pan-y pinch-zoom/);
  assert.match(css,/overscroll-behavior-y:contain/);
  assert.doesNotMatch(js,/setInterval\(/);
});

test('navigation and workspace selectors use damped transform springs only',()=>{
  const nav=read('frontend-source/android/styles/capsule-navigation.css');
  const middle=read('frontend-source/android/styles/middle-bar-2026.css');
  assert.match(nav,/transition:transform 420ms cubic-bezier\(\.18,\.90,\.24,1\.12\)/);
  assert.match(middle,/transition:transform 260ms cubic-bezier\(\.18,\.90,\.24,1\.10\)/);
  assert.doesNotMatch(nav,/transition:[^;]*(?:left|width)/);
  assert.doesNotMatch(middle,/transition:[^;]*,width/);
});
