'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'frontend-source/android/scripts/github-updates.js'),'utf8');
const installed='20.10.2004.00015.2026',newer='20.10.2004.00016.2026';
const repo='artishoepalace-oss/Vyapar-AI-Fronted-';
function release(version=newer,assets=true){return {tag_name:'v'+version,draft:false,prerelease:false,body:'Release notes',assets:assets?[{state:'uploaded',name:'VyaparAI-'+version+'.apk',size:4200000,browser_download_url:'https://github.com/'+repo+'/releases/download/v'+version+'/VyaparAI-'+version+'.apk'}]:[]};}
function fixture({reply=()=>Promise.resolve({ok:true,json:async()=>release()}),native=false}={}){
  const nodes=[],events={},timers=new Map(),values=new Map();let timerId=0,calls=0,downloads=0,installs=0,requestId=0;
  function matches(el,selector){if(selector.startsWith('#'))return el.id===selector.slice(1);if(selector.startsWith('.'))return String(el.className||'').split(' ').includes(selector.slice(1));if(selector.startsWith('['))return el.attrs.has(selector.slice(1,-1));return false;}
  class Element {
    constructor(tag='div'){this.tag=tag;this.attrs=new Map();this.children=[];this.hidden=false;this.disabled=false;this.isConnected=false;this.listeners={};this.className='';this.id='';this.textContent='';nodes.push(this);}
    set innerHTML(html){this.children=[];for(const match of html.matchAll(/<(button|section|p|strong|small|progress|details|summary|div)[^>]*>/g)){
      const el=new Element(match[1]);for(const a of match[0].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){el.attrs.set(a[1],a[2]||'');if(a[1]==='id')el.id=a[2];if(a[1]==='class')el.className=a[2];if(a[1]==='hidden')el.hidden=true;}el.parent=this;this.children.push(el);
    }}
    querySelectorAll(selector){return this.children.filter(el=>matches(el,selector));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
    appendChild(el){el.parent=this;this.children.push(el);el.isConnected=true;el.children.forEach(x=>x.isConnected=true);return el;}
    replaceChildren(){this.children.forEach(el=>el.isConnected=false);this.children=[];}
    remove(){this.isConnected=false;this.children.forEach(el=>el.isConnected=false);if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);}
    get firstElementChild(){return this.children[0];}getClientRects(){return this.hidden?[]:[{}];}
    focus(){document.activeElement=this;}addEventListener(k,fn){this.listeners[k]=fn;}hasAttribute(k){return this.attrs.has(k);}removeAttribute(k){this.attrs.delete(k);}closest(){return this;}
  }
  const body=new Element(),settings=new Element(),card=new Element();settings.id='screen-settings';card.id='fs607Settings';body.appendChild(settings);settings.appendChild(card);
  const document={readyState:'loading',body,activeElement:null,querySelector:s=>s.startsWith('meta')?{content:installed}:nodes.find(el=>el.isConnected&&matches(el,s))||null,querySelectorAll:s=>nodes.filter(el=>el.isConnected&&matches(el,s)),getElementById:id=>nodes.find(el=>el.isConnected&&el.id===id)||null,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>events[name]=fn};
  const env={document,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},MutationObserver:class{observe(){}},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(...args)=>{calls++;return reply(...args);},AbortController,Date,console,open:(...args)=>env.opened=args};
  if(native)env.AndroidApp={getVersionName:()=>installed,checkGitHubUpdate:id=>{calls++;requestId=id;},downloadGitHubUpdate:()=>downloads++,installGitHubUpdate:()=>installs++,getGitHubUpdateState:()=>'{"status":"idle"}'};
  env.window=env;vm.runInNewContext(script,env);events.DOMContentLoaded();
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  return {env,document,card,nodes,values,timers,events,flush,get calls(){return calls},get downloads(){return downloads},get installs(){return installs},get requestId(){return requestId},click:selector=>events.click({target:document.querySelector(selector)})};
}
test('Numeric versions handle multi-part Android names, leading zeroes, equality and downgrades',()=>{
  const {env}=fixture();const compare=env.VyaparUpdates.compare;
  assert.equal(compare(newer,installed),1);assert.equal(compare(installed,newer),-1);assert.equal(compare('v1.02.0','1.2'),0);assert.equal(compare('20.10.2004.00009.2026',installed),-1);assert.throws(()=>compare('latest',installed));
});
test('Only a published stable release and repository-owned APK can be selected',()=>{
  const {env}=fixture();const normalize=env.VyaparUpdates.normalize;
  assert.equal(normalize(release()).version,newer);assert.equal(normalize(release(newer,false)).apkUrl,'');
  assert.throws(()=>normalize({...release(),draft:true}));assert.throws(()=>normalize({...release(),prerelease:true}));
  const untrusted=release();untrusted.assets[0].browser_download_url='https://attacker.example/a.apk';assert.equal(normalize(untrusted).apkUrl,'');
  const zip=release();zip.assets[0].name='source.zip';assert.equal(normalize(zip).apkUrl,'');
});
test('Automatic and manual checks coalesce; one popup and Settings share real metadata',async()=>{
  let finish;const f=fixture({reply:()=>new Promise(resolve=>finish=resolve)});
  const a=f.env.VyaparUpdates.check(false),b=f.env.VyaparUpdates.check(true);assert.equal(a,b);assert.equal(f.calls,1);
  finish({ok:true,json:async()=>release()});await a;
  assert.equal(f.document.querySelectorAll('#vyGitHubUpdate').length,1);assert.equal(f.document.querySelector('[data-update-latest]').textContent,newer);
  assert.match(f.document.querySelector('[data-update-status]').textContent,/available/);assert(!f.document.querySelector('[data-update-download]').hidden);
  assert.equal(f.card.children.filter(el=>el.className==='github-update-card').length,1);
  f.env.handleNativeBackPress();assert.equal(f.document.getElementById('vyGitHubUpdate'),null);
});
test('Up to date, downgrade, missing APK and errors never offer a new download',async()=>{
  for(const data of [release(installed),release('1.0.0'),release(newer,false)]){
    const f=fixture({reply:()=>Promise.resolve({ok:true,json:async()=>data})});await f.env.VyaparUpdates.check(true);
    assert(f.document.querySelector('[data-update-download]').hidden);
  }
  const f=fixture({reply:()=>Promise.resolve({ok:false,status:403})});await f.env.VyaparUpdates.check(true);
  assert.match(f.document.querySelector('[data-update-status]').textContent,/rate limit/);assert(!f.document.querySelector('[data-update-check]').disabled);
});
test('Timeout releases single-flight guard, exposes retry and ignores stale native responses',async()=>{
  const f=fixture({native:true});const first=f.env.VyaparUpdates.check(true);const oldId=f.requestId;
  [...f.timers.values()].find(t=>t.ms===20000).fn();await first;
  assert.match(f.document.querySelector('[data-update-status]').textContent,/timed out/);
  const next=f.env.VyaparUpdates.check(true);const newId=f.requestId;
  f.env.onGitHubUpdateCheck({requestId:oldId,release:release()});await f.flush();assert(f.document.querySelector('[data-update-check]').disabled);
  f.env.onGitHubUpdateCheck({requestId:newId,release:release()});await next;assert(!f.document.querySelector('[data-update-check]').disabled);
});
test('Native download double-taps coalesce; progress, permission and cancelled installer support retry',async()=>{
  const f=fixture({native:true});const p=f.env.VyaparUpdates.check(true);f.env.onGitHubUpdateCheck({requestId:f.requestId,release:release()});await p;
  f.env.VyaparUpdates.install();f.env.VyaparUpdates.install();assert.equal(f.downloads,1);
  f.env.onGitHubUpdateProgress({status:'downloading',bytes:1024,total:2048,message:'50%'});assert(f.document.querySelector('[data-update-download]').disabled);assert.equal(f.document.querySelector('[data-update-progress]').value,1024);
  f.env.onGitHubUpdateProgress({status:'permission',message:'Enable install permission'});f.env.VyaparUpdates.install();assert.equal(f.installs,1);
  f.env.onGitHubUpdateProgress({status:'installer',message:'Confirm install'});f.env.VyaparUpdates.install();assert.equal(f.installs,2);assert.equal(f.downloads,1);
  f.env.onGitHubUpdateProgress({status:'error',message:'Download incomplete'});f.env.VyaparUpdates.install();assert.equal(f.downloads,2);
});
test('Browser download uses release APK; checking never begins installation',async()=>{
  const f=fixture();await f.env.VyaparUpdates.check(true);assert.equal(f.env.opened,undefined);f.env.VyaparUpdates.install();assert.match(f.env.opened[0],/\.apk$/);assert.equal(f.env.opened[2],'noopener');
});
test('Native source guards package, version, signing certificate, checksum, consent and provider scope',()=>{
  const java=fs.readFileSync(path.join(root,'android-app/app/src/main/java/com/vyaparai/app/GitHubUpdater.java'),'utf8');
  for(const check of ['GET_SIGNATURES','candidate.packageName','next<=current','candidate.signatures','expectedVersion.equals(info.versionName)','MessageDigest.getInstance("SHA-256")','total!=expected','canRequestPackageInstalls','ACTION_MANAGE_UNKNOWN_APP_SOURCES','FLAG_GRANT_READ_URI_PERMISSION'])assert(java.includes(check),check);
  const manifest=fs.readFileSync(path.join(root,'android-app/app/src/main/AndroidManifest.xml'),'utf8');assert(manifest.includes('REQUEST_INSTALL_PACKAGES'));assert.match(manifest,/android:exported="false" android:grantUriPermissions="true"/);
  const provider=fs.readFileSync(path.join(root,'android-app/app/src/main/java/com/vyaparai/app/UpdateApkProvider.java'),'utf8');assert(provider.includes('"/latest.apk".equals(uri.getPath())'));assert(provider.includes('MODE_READ_ONLY'));
  for(const name of ['app.js','audit-fixes-658.js','sales-theme-660.js'])assert(!fs.readFileSync(path.join(root,'frontend-source/android/scripts',name),'utf8').includes('window.fs607CheckUpdate='));
});
test('Screenshot fixes are scoped separately and delivered in both synchronized bundles',()=>{
  const css=fs.readFileSync(path.join(root,'frontend-source/android/styles/alignment-updates.css'),'utf8');
  assert(css.includes('.settings-link-grid .btn'));assert(css.includes('align-items:center!important;justify-content:flex-start!important'));assert(css.includes('#nav.nav > button'));assert(css.includes('.top #vy863ProfileChip .vy863-profile-avatar'));
  assert(!css.includes('.screen .card {display:flex'));
});
