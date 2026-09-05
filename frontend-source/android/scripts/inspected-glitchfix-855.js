/* Vyapar AI 8.5.5 inspected glitch fix — presentation only.
   Removes full-screen theme flashes, holds first paint until real UI exists,
   and primes Settings before navigation so old Android WebViews never show an
   empty intermediate frame. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy855-inspected-fix');

  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let themeBusy=false;

  function removeThemeArtifacts(){
    document.querySelectorAll(
      '.vy855-theme-curtain,.vy854-theme-wipe,.vy853-theme-reveal,.vy852-theme-bloom,.theme-ripple,.vx657-theme-crossfade'
    ).forEach(node=>node.remove());
  }

  function currentLight(){
    return root.classList.contains('theme-light')||Boolean(document.body&&document.body.classList.contains('theme-light'));
  }

  function saveTheme(target){
    const light=target==='light';
    const body=document.body;

    root.classList.toggle('theme-light',light);
    if(body)body.classList.toggle('theme-light',light);
    root.style.backgroundColor=light?'#eff6fb':'#06172d';
    if(body)body.style.backgroundColor=light?'#eff6fb':'#06172d';

    try{
      const appState=window.state;
      if(appState){
        appState.settings=appState.settings&&typeof appState.settings==='object'?appState.settings:{};
        appState.settings.theme=target;
      }
    }catch(_){}

    try{if(typeof window.applyTheme==='function')window.applyTheme();}catch(_){}
    try{if(typeof window.applyGlassControl==='function')window.applyGlassControl();}catch(_){}
    try{
      if(typeof window.persistThemeWithoutRender==='function')window.persistThemeWithoutRender();
      else if(window.state)localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(window.state));
    }catch(_){}

    try{
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content',light?'#eff6fb':'#06172d');
    }catch(_){}

    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light);
    }catch(_){}
  }

  function runTheme(target){
    const normalized=target==='light'?'light':'dark';
    if(themeBusy)return false;
    if((normalized==='light')===currentLight()){
      removeThemeArtifacts();
      return false;
    }

    themeBusy=true;
    removeThemeArtifacts();
    root.classList.add('vy855-theme-atomic');

    const button=document.getElementById('themeToggle');
    if(button&&!reduced()&&typeof button.animate==='function'){
      try{
        button.animate(
          [{transform:'scale(1)'},{transform:'scale(.93)'},{transform:'scale(1)'}],
          {duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}
        );
      }catch(_){}
    }

    /* Commit the theme immediately. No opaque curtain, no blank handoff. */
    saveTheme(normalized);
    removeThemeArtifacts();

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      root.classList.remove('vy855-theme-atomic');
      removeThemeArtifacts();
      themeBusy=false;
    }));
    return false;
  }

  window.toggleTheme=function(){return runTheme(currentLight()?'dark':'light')};
  window.setTheme=function(theme){return runTheme(theme==='light'?'light':'dark')};

  /* Settings shell is deterministic and local. Build it before setTab hides the
     previous screen, then let the existing business/navigation logic continue. */
  function primeSettings(){
    try{
      const screen=document.getElementById('screen-settings');
      if(!screen)return;
      const ready=screen.querySelector('.vy675-settings-shell,.vy675-settings-home,.vy675-settings-page');
      if(!ready&&typeof window.renderSettings==='function')window.renderSettings();
    }catch(_){}
  }

  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy855InspectedWrapped){
    const wrapped=function(tab,withLoader){
      if(tab==='settings')primeSettings();
      const result=previousSetTab.call(this,tab,withLoader);
      if(tab==='settings'){
        const settle=()=>{
          primeSettings();
          const screen=document.getElementById('screen-settings');
          if(screen&&!screen.classList.contains('hide')){
            screen.style.opacity='1';
            screen.style.visibility='visible';
          }
        };
        settle();
        requestAnimationFrame(settle);
      }
      return result;
    };
    wrapped.__vy855InspectedWrapped=true;
    window.setTab=wrapped;
  }

  /* Continuous first paint: keep the WebView on a theme-matched surface until
     either the auth gate or a populated app screen has actually laid out. */
  function isPainted(node){
    if(!node)return false;
    const style=getComputedStyle(node);
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    const rect=node.getBoundingClientRect();
    return rect.width>40&&rect.height>60;
  }

  function realUiVisible(){
    const auth=document.getElementById('vyaparOtpGate');
    if(isPainted(auth))return true;
    const password=document.getElementById('vy647PasswordGate');
    if(isPainted(password))return true;
    const visible=Array.from(document.querySelectorAll('.screen')).find(screen=>!screen.classList.contains('hide')&&screen.children.length>0);
    return isPainted(visible);
  }

  let bootDone=false;
  function finishBoot(force){
    if(bootDone)return;
    const guard=document.getElementById('vy855BootGuard');
    if(!guard){root.classList.remove('vy855-booting');bootDone=true;return}
    if(!force&&!realUiVisible())return;
    bootDone=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      guard.classList.add('is-ready');
      root.classList.remove('vy855-booting');
      setTimeout(()=>guard.remove(),140);
    }));
  }

  let bootObserver=null;
  function initBootGuard(){
    finishBoot(false);
    if(bootDone)return;
    bootObserver=new MutationObserver(()=>finishBoot(false));
    bootObserver.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
    setTimeout(()=>{
      if(bootObserver)bootObserver.disconnect();
      finishBoot(true);
    },2400);
  }

  removeThemeArtifacts();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initBootGuard,{once:true});
  else initBootGuard();
})();
