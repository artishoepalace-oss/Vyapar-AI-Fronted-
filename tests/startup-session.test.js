// Run actual shipped startup/auth code with an isolated DOM and fake clock.
// No browser, network, credentials, or application data is used.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'frontend-source/android/scripts',name),'utf8');
const TOKEN='vyapar_ai_auth_token_v1',ACCOUNT='vyapar_ai_account_cache_v1';
function fixture({token='test-token',cache=true,reply,abort=true}={}){
  let now=0,nextTimer=0,mutations=0;
  const timers=new Map(),nodes=new Map(),observers=[];
  const notify=()=>{mutations++;observers.forEach(o=>{if(o.active)o.pending=true})};
  class Element{
    constructor(id=''){this.id=id;this.attrs={};this.dataset={};this.children=[];this.listeners={};this.value='';this.connected=true;this._text='';this._classes=new Set();
      this.style={values:new Map(),setProperty:(k,v)=>this.style.values.set(k,v),removeProperty:k=>this.style.values.delete(k),getPropertyValue:k=>this.style.values.get(k)||''};
      this.classList={contains:k=>this._classes.has(k),add:(...keys)=>{keys.forEach(k=>this._classes.add(k));notify()},remove:(...keys)=>{keys.forEach(k=>this._classes.delete(k));notify()},toggle:(k,force)=>{const wanted=force===undefined?!this._classes.has(k):force;if(wanted!==this._classes.has(k)){wanted?this._classes.add(k):this._classes.delete(k);notify()}return wanted}};
      if(id)nodes.set(id,this);
    }
    set textContent(v){this._text=v;notify()}get textContent(){return this._text}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.parentNode=this;const cls=match[0].match(/class="([^"]+)"/);if(cls)cls[1].split(/\s+/).forEach(c=>node._classes.add(c));this.children.push(node)}notify()}
    setAttribute(k,v){this.attrs[k]=String(v);notify()}getAttribute(k){return this.attrs[k]??null}removeAttribute(k){delete this.attrs[k];notify()}
    prepend(node){node.parentNode=this;this.children.unshift(node);nodes.set(node.id,node);notify()}appendChild(node){node.parentNode=this;this.children.push(node);nodes.set(node.id,node);notify();return node}
    remove(){this.connected=false;nodes.delete(this.id);if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);notify()}
    get isConnected(){return this.connected}
    querySelector(selector){if(selector.startsWith('#'))return nodes.get(selector.slice(1))||null;return null}querySelectorAll(){return []}
    addEventListener(name,cb){(this.listeners[name]??=[]).push(cb)}dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e)}
    getBoundingClientRect(){return {width:360,height:700}}focus(){}scrollIntoView(){}
    closest(){return null}
  }
  const html=new Element('root'),body=new Element('body'),home=new Element('screen-home');home.children.push(new Element());
  const document={documentElement:html,body,readyState:'loading',listeners:{},createElement:()=>new Element(),getElementById:id=>nodes.get(id)||null,querySelector:s=>s==='.screen:not(.hide)'?home:null,querySelectorAll:()=>[],addEventListener(name,cb){(this.listeners[name]??=[]).push(cb)}};
  body.appendChild(new Element('vy855BootGuard'));body.appendChild(new Element('appLoader'));
  const values=new Map();if(token)values.set(TOKEN,token);if(cache)values.set(ACCOUNT,JSON.stringify({user:{email:'test@example.test',name:'Cached user'},subscription:{plan:'free'}}));
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
  const calls=[];
  const setTimeout=(fn,ms=0)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id};
  const clearTimeout=id=>timers.delete(id);
  class Observer{constructor(cb){this.cb=cb;observers.push(this)}observe(){this.active=true}disconnect(){this.active=false}}
  const env={document,localStorage:storage,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},MutationObserver:Observer,innerHeight:700,innerWidth:360,requestAnimationFrame:fn=>setTimeout(fn,16),setTimeout,clearTimeout,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},fetch:(url,init)=>{calls.push(String(url));return reply?reply(String(url),init,{setTimeout,now:()=>now}):Promise.resolve(response(200))},Request,Headers,console:{warn(){},log(){}},location:{href:'file:///android_asset/index.html',reload(){},replace(){}},getComputedStyle:el=>({visibility:el.style.getPropertyValue('visibility')||'visible',display:'block',opacity:'1'}),addEventListener(name,cb){(this.listeners[name]??=[]).push(cb)},dispatchEvent(e){for(const cb of this.listeners[e.type]||[])cb(e)},listeners:{},scrollTo(){},Date:class extends Date{static now(){return now}}};
  if(abort)env.AbortController=AbortController;env.window=env;
  const context=vm.createContext(env);
  vm.runInContext(read('android-session-flow-647.js'),context);
  vm.runInContext(read('auth.js'),context);
  const ready=()=>{document.readyState='interactive';for(const cb of document.listeners.DOMContentLoaded||[])cb()};
  const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();for(const o of observers){if(o.active&&o.pending){o.pending=false;o.cb()}}};
  async function tick(ms){const end=now+ms;await flush();let limit=0;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++limit>10000)throw Error('Timer/observer loop');now=next[1].at;timers.delete(next[0]);next[1].fn();await flush()}now=end;await flush()}
  return {nodes,values,html,env,context,ready,tick,calls,run:name=>vm.runInContext(read(name),context),get mutations(){return mutations}};
}
function response(status=200,data={user:{email:'test@example.test',name:'Verified user'},subscription:{plan:'free'}}){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data),json:async()=>data}}
function pending(){return new Promise(()=>{})}
const cases=[];
async function check(name,fn){await fn();cases.push(name);console.log('✓ '+name)}
(async()=>{
await check('Guest: one splash to login after DOM readiness',async()=>{const f=fixture({token:'',cache:false});assert(f.nodes.has('vy855BootGuard'));await f.tick(800);assert(f.nodes.has('vy855BootGuard'),'must not release before app parses');f.ready();await f.tick(40);assert(!f.nodes.has('vy855BootGuard'));assert(f.nodes.has('vyaparOtpGate'));assert.equal(f.calls.length,0);assert.equal(f.html.getAttribute('data-vyapar-session'),'login')});
await check('Valid session: form stays hidden; direct splash to Home',async()=>{const f=fixture({reply:(_,__,{setTimeout})=>new Promise(r=>setTimeout(()=>r(response()),700))});f.ready();await f.tick(650);assert(f.nodes.has('vy855BootGuard'));assert.equal(f.nodes.get('vyaparOtpGate').style.getPropertyValue('visibility'),'hidden');await f.tick(100);assert(!f.nodes.has('vy855BootGuard'));assert(!f.nodes.has('vyaparOtpGate'));assert.equal(f.html.getAttribute('data-vyapar-session'),'authenticated');assert.equal(f.calls.length,1)});
await check('Slow cached session: bounded wait, no intermediate login',async()=>{const f=fixture({reply:pending});f.ready();await f.tick(5900);assert(f.nodes.has('vy855BootGuard'));assert.equal(f.nodes.get('vyaparOtpGate').style.getPropertyValue('visibility'),'hidden');await f.tick(150);assert(!f.nodes.has('vy855BootGuard'));assert(!f.nodes.has('vyaparOtpGate'));assert.equal(f.html.getAttribute('data-vyapar-session'),'cached');assert(f.values.has(TOKEN))});
await check('Slow uncached session: login with error, preserves stored token for retry',async()=>{const f=fixture({cache:false,reply:pending});f.ready();await f.tick(6050);assert(!f.nodes.has('vy855BootGuard'));assert(f.nodes.has('vyaparOtpGate'));assert.equal(f.nodes.get('vyaparOtpGate').style.getPropertyValue('visibility'),'');assert.match(f.nodes.get('auth-message').textContent,/temporarily unavailable/);assert(f.values.has(TOKEN))});
await check('401/403 never fall back to cached account',async()=>{for(const status of [401,403]){const f=fixture({reply:()=>Promise.resolve(response(status,{success:false,message:'Rejected'}))});f.ready();await f.tick(50);assert(!f.values.has(TOKEN));assert(!f.values.has(ACCOUNT));assert.equal(f.html.getAttribute('data-vyapar-session'),'login');assert.match(f.nodes.get('auth-message').textContent,/expired/)} });
await check('Expired access refreshes once and verifies new token before Home',async()=>{let me=0;const f=fixture({reply:url=>Promise.resolve(url.endsWith('/refresh')?response(200,{token:'new-token'}):response(++me===1?401:200))});f.ready();await f.tick(50);assert.equal(f.calls.length,3);assert.equal(f.values.get(TOKEN),'new-token');assert.equal(f.html.getAttribute('data-vyapar-session'),'authenticated');assert(!f.nodes.has('vyaparOtpGate'))});
await check('Hung refresh rejects expired session; late refresh cannot restore tokens',async()=>{const f=fixture({reply:(url,_,{setTimeout})=>url.endsWith('/refresh')?new Promise(r=>setTimeout(()=>r(response(200,{token:'late-token'})),7500)):Promise.resolve(response(401))});f.ready();await f.tick(6100);assert(!f.values.has(TOKEN));assert.equal(f.html.getAttribute('data-vyapar-session'),'login');await f.tick(1600);assert(!f.values.has(TOKEN));assert(f.nodes.has('vyaparOtpGate'))});
await check('Late /me cannot overwrite cache or reopen Home after timeout',async()=>{const f=fixture({cache:false,reply:(_,__,{setTimeout})=>new Promise(r=>setTimeout(()=>r(response()),7500))});f.ready();await f.tick(8000);assert.equal(f.html.getAttribute('data-vyapar-session'),'login');assert(!f.values.has(ACCOUNT));assert(f.nodes.has('vyaparOtpGate'))});
await check('Timeout works in older WebViews without AbortController',async()=>{const f=fixture({abort:false,reply:pending});f.ready();await f.tick(6050);assert.equal(f.html.getAttribute('data-vyapar-session'),'cached');assert(!f.nodes.has('vy855BootGuard'))});
await check('Response-body hang is also bounded',async()=>{const f=fixture({reply:()=>Promise.resolve({ok:true,status:200,text:pending})});f.ready();await f.tick(6050);assert.equal(f.html.getAttribute('data-vyapar-session'),'cached')});
await check('Legacy security helpers cannot disable or relabel modern Password tab',async()=>{const f=fixture({token:'',cache:false});const pass=f.nodes.get('tab-login-pass');pass.textContent='Password';f.run('security-ui-643.js');f.run('ui-stability-862.js');f.ready();await f.tick(100);assert(!pass.disabled);assert.equal(pass.textContent,'Password');assert(!pass.classList.contains('vx643-password-locked'))});
await check('Native cover receives readiness only after the destination is ready',async()=>{const f=fixture({reply:pending});let notifications=0;f.env.AndroidApp={onStartupFrameReady:()=>notifications++};f.ready();await f.tick(5900);assert.equal(notifications,0);await f.tick(200);assert.equal(notifications,1);assert(!f.nodes.has('vy855BootGuard'))});
await check('Native and HTML startup use the same 112px artwork and frame callback',async()=>{const java=fs.readFileSync(path.join(root,'android-app/app/src/main/java/com/vyaparai/app/MainActivity.java'),'utf8');assert.match(java,/postVisualStateCallback/);assert.match(java,/public void onStartupFrameReady/);assert.match(java,/startupLogo.setImageResource\(R.drawable.startup_logo\)/);assert.match(java,/Math.round\(112 \*/);const logo=fs.readFileSync(path.join(root,'web/assets/images/logo.png'));const nativeLogo=fs.readFileSync(path.join(root,'android-app/app/src/main/res/drawable-nodpi/startup_logo.png'));assert(logo.equals(nativeLogo));for(const platform of ['web','android-app/app/src/main/assets']){const html=fs.readFileSync(path.join(root,platform,'index.html'),'utf8');assert.match(html,/html\.vy861-flat-black body #vy855BootGuard img/);assert.match(html,/width:112px!important;height:112px!important/)} });
await check('Both entry points load auth once and never use forced boot dismissal',async()=>{for(const platform of ['web','android-app/app/src/main/assets']){const html=fs.readFileSync(path.join(root,platform,'index.html'),'utf8');assert.equal((html.match(/id="vy855BootGuard"/g)||[]).length,1);assert.doesNotMatch(html,/<script src="assets\/scripts\/auth.js/);assert.match(html,/<script async src="https:\/\/checkout.razorpay.com/);assert.doesNotMatch(html,/guard.classList.add\('is-ready'\)/)}});
await check('Durable data hydration holds the splash after authentication until records are ready',async()=>{const f=fixture();let notified=0;f.env.AndroidApp={onStartupFrameReady:()=>notified++};f.env.VyaparStorage={bootReady:false};f.ready();await f.tick(500);assert.equal(notified,0);assert(f.nodes.has('vy855BootGuard'));f.env.VyaparStorage.bootReady=true;f.env.dispatchEvent(new f.env.CustomEvent('vyapar:storage-ready'));await f.tick(100);assert.equal(notified,1);assert(!f.nodes.has('vy855BootGuard'));});
console.log(`Startup regression suite passed (${cases.length} groups).`);
})().catch(error=>{console.error(error);process.exitCode=1});
