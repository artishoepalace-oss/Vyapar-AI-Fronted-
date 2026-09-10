'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const webIndex=read('web','index.html'),androidIndex=read('android-app','app','src','main','assets','index.html'),finalCss=read('frontend-source','android','styles','flat-black-ios-861.css'),bundle=read('android-app','app','src','main','assets','assets','styles','vyapar-ui.css');
assert(webIndex.includes('vy-professional-ui'));assert(androidIndex.includes('vy-professional-ui'));assert(webIndex.includes('vy861-flat-black'));assert(androidIndex.includes('vy861-flat-black'));
assert(androidIndex.includes('vyapar-ui.css?v=2010200409-workspace1'),'Android UI bundle must use current cache key');
for(const marker of ['STYLE SOURCE: professional-ui-682.css','STYLE SOURCE: flat-black-ios-861.css','STYLE SOURCE: surface-hierarchy-20102004.css','STYLE SOURCE: motion-20102004.css'])assert(bundle.includes(marker),`missing ${marker}`);
assert(bundle.indexOf('STYLE SOURCE: flat-black-ios-861.css')<bundle.indexOf('STYLE SOURCE: surface-hierarchy-20102004.css'));assert(bundle.indexOf('STYLE SOURCE: surface-hierarchy-20102004.css')<bundle.indexOf('STYLE SOURCE: motion-20102004.css'));
assert(finalCss.includes('--vy861-bg:#000000'));assert(finalCss.includes('@media(prefers-reduced-motion:reduce)'));console.log('✓ Professional layout preserved under current surface + motion authority');
