/* Vyapar AI 8.5.4.2026 — unified iOS shell, theme handoff and navigation stability.
   Keeps business/auth/accounting logic authoritative; this file only coordinates presentation. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy854-unified-ios');

  const reducedMotion=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const localTabs=new Set(['home','business','sales','stock','settings','subscription','calculator','upload','analytics']);
  const rankMap={home:0,business:1,sales:2,stock:3,upload:4,analytics:4,calculator:4,subscription:4,settings:4};
  let pageTimer=0;
  let themeBusy=false;

  function visibleTab(){
    const screen=Array.from(document.querySelectorAll('.screen')).find(node=>!node.classList.contains('hide'));
    return screen?screen.id.replace(/^screen-/,''):'home';
  }

  function rank(tab){
    return Object.prototype.hasOwnProperty.call(rankMap,tab)?rankMap[tab]:4;
  }

  function clearOldPageMotion(){
    document.querySelectorAll('.screen').forEach(screen=>{
      screen.classList.remove(
        'vy-telegram-page-from-left','vy-telegram-page-from-right',
        'vy853-page-enter-forward','vy853-page-enter-backward',
        'vy854-page-enter-forward','vy854-page-enter-backward'
      );
    });
  }

  function animatePage(previousTab,nextTab){
    if(reducedMotion()||!nextTab||previousTab===nextTab)return;
    const screen=document.getElementById('screen-'+nextTab);
    if(!screen||screen.classList.contains('hide'))return;
    clearTimeout(pageTimer);
    clearOldPageMotion();
    const cls=rank(nextTab)<rank(previousTab)?'vy854-page-enter-backward':'vy854-page-enter-forward';
    screen.classList.add(cls);
    pageTimer=setTimeout(()=>screen.classList.remove(cls),280);
  }

  /* Wrap the final legacy navigation chain, but do not replace its data/scroll/settings behavior. */
  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy854Wrapped){
    const wrapped=function(tab,withLoader){
      const previousTab=visibleTab();
      const local=localTabs.has(tab);
      if(local&&previousTab!==tab)root.classList.add('vy854-local-switch');
      const result=previousSetTab.call(this,tab,local?false:withLoader);
      const nextTab=visibleTab();
      if(result!==false&&previousTab!==nextTab)animatePage(previousTab,nextTab);
      clearTimeout(window.__vy854SwitchTimer);
      window.__vy854SwitchTimer=setTimeout(()=>root.classList.remove('vy854-local-switch'),300);
      requestAnimationFrame(syncChrome);
      return result;
    };
    wrapped.__vy854Wrapped=true;
    window.setTab=wrapped;
  }

  /* Settings is one part of Vyapar AI: normalize the chrome title and animate internal pages. */
  function syncChrome(){
    const title=document.querySelector('.brand h1');
    if(title&&/app settings/i.test(title.textContent||''))title.textContent='Settings';
    const progress=document.getElementById('openShopProgress');
    if(progress&&/view progress/i.test(progress.textContent||''))progress.textContent='Your Shop Journey';
  }

  function animateSettingsState(){
    const settings=document.getElementById('screen-settings');
    if(!settings)return;
    const home=settings.querySelector('.vy675-settings-home');
    const page=settings.querySelector('.vy675-settings-page');
    if(page&&!page.hidden&&!page.classList.contains('vy854-settings-in')){
      page.classList.remove('vy854-settings-in');
      void page.offsetWidth;
