'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('presentation observers do not watch transition style churn',()=>{
  const graphite=read('frontend-source/android/scripts/graphite-maroon-863.js');
  const premium=read('frontend-source/android/scripts/premium-tier-864.js');
  assert.match(graphite,/attributeFilter:\['class'\]/);
  assert.match(premium,/attributeFilter:\['class','src'\]/);
  assert.doesNotMatch(graphite,/attributeFilter:\[[^\]]*'style'/);
  assert.doesNotMatch(premium,/attributeFilter:\[[^\]]*'style'/);
});
