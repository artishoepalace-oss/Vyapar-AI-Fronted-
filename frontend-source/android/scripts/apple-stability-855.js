/* Vyapar AI 8.5.5.2026 — authoritative Android presentation coordinator.
   Runs last so older 8.5.2–8.5.4 animation wrappers cannot leak visual glitches. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy855-stable-ios');

  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const localTabs=new Set(['home','business','sales','stock','settings','subscription','calculator','upload','analytics']);
  const ranks={home:0,business:1,sales:2,stock:3,upload:4,analytics:4,calculator:4,subscription:4,settings:4};
  let pageTimer=0;
  let themeBusy=false;
  let hadAuth=false;
  let moreSuppressedUntil=0;

  function visibleTab(){
    const screen=Array.from(document.querySelectorAll('.screen')).find(node=>!node.classList.contains('hide'));
    return screen?screen.id.replace(/^screen-/,''):'home';
  }
  function rank(tab){return Object.prototype.hasOwnProperty.call(ranks,tab)?ranks[tab]:4}

  function cleanOldVisuals(){
    document.querySelectorAll('.vy852-theme-bloom,.vy853-theme-reveal,.vy854-theme-wipe,.theme-ripple,.vx657-theme-crossfade').forEach(node=>node.remove());
    const nav=document.getElementById('nav')||document.querySelector('.nav');
    if(nav){
      nav.classList.remove('android-nav-shine');
      nav.style.filter='none';
      nav.style.mixBlendMode='normal';
    }
  }

  function clearMotion(){
    document.querySelectorAll('.screen').forEach(screen=>{
      screen.classList.remove(
        'vy-telegram-page-from-left','vy-telegram-page-from-right',
        'vy853-page-enter-forward','vy853-page-enter-backward',
        'vy854-page-enter-forward','vy854-page-enter-backward',
        'vy855-enter-forward','vy855-enter-backward'
      );
    });
  }

  function animatePage(from,to){
    if(reduced()||!to||from===to)return;
    const screen=document.getElementById('screen-'+to);
    if(!screen||screen.classList.contains('hide'))return;
    clearTimeout(pageTimer);
    clearMotion();
    const cls=rank(to)<rank(from)?'vy855-enter-backward':'vy855-enter-forward';
    requestAnimationFrame(()=>{
      screen.classList.add(cls);
      pageTimer=setTimeout(()=>screen.classList.remove(cls),220);
    });
  }

  function syncLens(){
    const nav=document.getElementById('nav')||document.querySelector('.nav');
    if(!nav)return;
    const lens=nav.querySelector('.android-nav-glass-indicator');
    const active=nav.querySelector('button.active[data-android-tab]')||nav.querySelector('button[data-android-tab="home"]');
    if(!lens||!active)return;
    lens.style.width=active.offsetWidth+'px';
    lens.style.setProperty('--vy853-nav-x',active.offsetLeft+'px');
    lens.style.transform='translate3d('+active.offsetLeft+'px,0,0)';
  }

  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy855Wrapped){
    const wrapped=function(tab,withLoader){
      const from=visibleTab();
      const local=localTabs.has(tab);
      if(local)root.classList.add('vy855-switching');
      const tabLoader=document.getElementById('tabLoader');
      if(tabLoader)tabLoader.classList.remove('show');

      const result=previousSetTab.call(this,tab,local?false:withLoader);
      const to=visibleTab();
      if(result!==false&&from!==to)animatePage(from,to);

      const stale=document.getElementById('androidMoreSheet');
      if(stale)stale.remove();
      document.body.classList.remove('android-sheet-open','more-sheet-open');
      cleanOldVisuals();
      requestAnimationFrame(syncLens);
      clearTimeout(window.__vy855SwitchTimer);
      window.__vy855SwitchTimer=setTimeout(()=>root.classList.remove('vy855-switching'),230);
      return result;
    };
    wrapped.__vy855Wrapped=true;
    window.setTab=wrapped;
  }

  function canonicalLight(){
    return root.classList.contains('theme-light')||(document.body&&document.body.classList.contains('theme-light'));
  }
  function persistTheme(target){
    try{
      const s=window.state;
      if(s){
        s.settings=s.settings&&typeof s.settings==='object'?s.settings:{};
        s.settings.theme=target;
      }
    }catch(_){}
    try{if(typeof window.applyTheme==='function')window.applyTheme();}catch(_){}
    try{if(typeof window.applyGlassControl==='function')window.applyGlassControl();}catch(_){}
    try{
      if(typeof window.persistThemeWithoutRender==='function')window.persistThemeWithoutRender();
      else if(window.state)localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(window.state));
    }catch(_){}
    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(target==='light');
    }catch(_){}
  }

  function themeCurtain(target){
    const node=document.createElement('div');
    node.className='vy855-theme-curtain '+(target==='light'?'to-light':'to-dark');
    document.body.appendChild(node);
    return node;
  }

  function runTheme(target){
    if(themeBusy)return false;
    themeBusy=true;
    cleanOldVisuals();

    const button=document.getElementById('themeToggle');
    if(button&&!reduced()&&typeof button.animate==='function'){
      button.animate(
        [{transform:'scale(1)'},{transform:'scale(.90)'},{transform:'scale(1.04)'},{transform:'scale(1)'}],
        {duration:330,easing:'cubic-bezier(.16,1,.3,1)'}
      );
    }

    if(reduced()){
      persistTheme(target);
      cleanOldVisuals();
      syncLens();
      themeBusy=false;
      return false;
    }

    const curtain=themeCurtain(target);
    requestAnimationFrame(()=>{
      curtain.classList.add('show');
      setTimeout(()=>{
        persistTheme(target);
        cleanOldVisuals();
        syncLens();
        requestAnimationFrame(()=>{
          curtain.classList.add('leave');
          curtain.classList.remove('show');
          setTimeout(()=>{
            curtain.remove();
            themeBusy=false;
          },160);
        });
      },115);
    });
    return false;
  }

  window.toggleTheme=function(){return runTheme(canonicalLight()?'dark':'light')};
  window.setTheme=function(theme){
    const target=theme==='light'?'light':'dark';
    if((target==='light')===canonicalLight())return false;
    return runTheme(target);
  };

  function finishMore(tab){
    const live=document.getElementById('androidMoreSheet');
    if(live)live.remove();
    document.body.classList.remove('android-sheet-open','more-sheet-open');
    document.querySelectorAll('.nav [aria-expanded="true"]').forEach(btn=>btn.setAttribute('aria-expanded','false'));
    if(tab&&typeof window.setTab==='function')window.setTab(tab,false);
  }

  document.addEventListener('click',event=>{
    const item=event.target&&event.target.closest?event.target.closest('#androidMoreSheet .android-sheet-item[data-tab]'):null;
    if(item){
      event.preventDefault();
      event.stopImmediatePropagation();
      const tab=item.getAttribute('data-tab');
      const overlay=item.closest('#androidMoreSheet');
      moreSuppressedUntil=Date.now()+500;
      if(overlay)overlay.classList.add('vy855-sheet-leaving');
      setTimeout(()=>finishMore(tab),reduced()?0:155);
      return;
    }

    const overlay=event.target&&event.target.closest?event.target.closest('#androidMoreSheet'):null;
    if(!overlay)return;
    const close=event.target.closest&&event.target.closest('.android-sheet-close');
    if(close||event.target===overlay){
      event.preventDefault();
      event.stopImmediatePropagation();
      overlay.classList.add('vy855-sheet-leaving');
      moreSuppressedUntil=Date.now()+300;
      setTimeout(()=>finishMore(''),reduced()?0:155);
    }
  },true);

  document.addEventListener('click',event=>{
    if(Date.now()>=moreSuppressedUntil)return;
    const candidate=event.target&&event.target.closest?event.target.closest('.nav button'):null;
    if(!candidate)return;
    const label=(candidate.textContent||'').trim().toLowerCase();
    if(label==='more'||String(candidate.getAttribute('aria-label')||'').toLowerCase().includes('more')){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  function authWatchdog(){
    const gate=document.getElementById('vyaparOtpGate');
    if(gate){
      hadAuth=true;
      root.classList.add('vy855-auth-ready');
      const splash=document.getElementById('vy647StartupSplash');
      const loader=document.getElementById('appLoader');
      if(splash){splash.style.opacity='0';setTimeout(()=>splash.remove(),180)}
      if(loader){loader.style.opacity='0';setTimeout(()=>loader.remove(),180)}
      return;
    }
    if(hadAuth){
      hadAuth=false;
      root.classList.add('vy855-auth-ready');
      document.querySelectorAll('#appLoader,#vy647StartupSplash,#tabLoader').forEach(node=>node.remove());
    }
  }

  setTimeout(()=>{
    const splash=document.getElementById('vy647StartupSplash');
    if(splash){splash.style.opacity='0';setTimeout(()=>splash.remove(),180)}
    const loader=document.getElementById('appLoader');
    if(loader){loader.style.opacity='0';setTimeout(()=>loader.remove(),180)}
    root.classList.add('vy855-auth-ready');
  },1500);

  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      cleanOldVisuals();
      authWatchdog();
      syncLens();
      const sheets=document.querySelectorAll('#androidMoreSheet');
      if(sheets.length>1)Array.from(sheets).slice(0,-1).forEach(node=>node.remove());
    });
  });

  function init(){
    cleanOldVisuals();
    clearMotion();
    authWatchdog();
    syncLens();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',()=>requestAnimationFrame(syncLens),{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(syncLens,100),{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
