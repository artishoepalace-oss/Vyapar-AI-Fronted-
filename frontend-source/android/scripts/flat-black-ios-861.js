/* Vyapar AI 8.6.1.2026 — final flat black/white presentation coordinator. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy861-flat-black');
  const OLD_CLASSES=[
    'vy859-liquid-v2','vy858-unified','vy857-ios27','vy855-liquid-lens','vy855-stable-ios',
    'vy860-hig-ios','vy854-apple-unified','vy853-apple-liquid','vy852-apple-liquid'
  ];
  OLD_CLASSES.forEach(name=>root.classList.remove(name));

  function isLight(){
    return false;
  }

  function cleanupOptics(){
    document.querySelectorAll(
      '.android-nav-glass-indicator,.vy852-theme-bloom,.vy853-theme-reveal,.vy854-theme-wipe,.vy855-theme-curtain,.theme-ripple,.vx657-theme-crossfade,.vy856-liquid-lens,.vy856-liquid-orb,[class*="liquid-lens"],[class*="glass-lens"],[class*="liquid-orb"]'
    ).forEach(node=>node.remove());
    if(document.body){
      ['vy859-modal-open','more-sheet-open'].forEach(name=>{
        if(document.body.classList.contains(name))document.body.classList.remove(name);
      });
    }
  }

  function applyThemeMeta(){
    const light=isLight();
    root.style.colorScheme=light?'light':'dark';
    root.style.backgroundColor=light?'#f5f5f7':'#000000';
    if(document.body)document.body.style.backgroundColor=light?'#f5f5f7':'#000000';
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',light?'#f5f5f7':'#000000');
    const button=document.getElementById('themeToggle');
    if(button){
      button.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');
      button.setAttribute('title',light?'Dark mode':'Light mode');
      if(button.textContent!=='Theme')button.textContent='Theme';
    }
  }

  function persistTheme(target){
    target='dark';
    const light=false;
    root.classList.toggle('theme-light',light);
    if(document.body)document.body.classList.toggle('theme-light',light);
    try{
      if(window.state){
        window.state.settings=window.state.settings&&typeof window.state.settings==='object'?window.state.settings:{};
        window.state.settings.theme=target;
        if(window.VyaparStorage)window.VyaparStorage.save(window.state).catch(()=>{});else localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(window.state));
      }else{
        const saved=JSON.parse(localStorage.getItem('vyapar_ai_prod_v1')||'{}');
        saved.settings=saved.settings&&typeof saved.settings==='object'?saved.settings:{};
        saved.settings.theme=target;
        localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(saved));
      }
    }catch(_){ }
    try{if(typeof window.applyTheme==='function')window.applyTheme();}catch(_){ }
    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light);
    }catch(_){ }
    cleanupOptics();
    applyThemeMeta();
  }

  window.toggleTheme=function(){
    persistTheme(isLight()?'dark':'light');
    const button=document.getElementById('themeToggle');
    if(button&&typeof button.animate==='function'){
      try{button.animate([{transform:'scale(1)'},{transform:'scale(.90)'},{transform:'scale(1)'}],{duration:150,easing:'ease-out'});}catch(_){ }
    }
    return false;
  };
  window.setTheme=function(theme){persistTheme(theme==='light'?'light':'dark');return false;};

  function decorateNav(){
    const nav=document.getElementById('nav');
    if(!nav)return;
    nav.querySelectorAll('button').forEach(button=>{
      const tab=button.dataset.androidTab||button.dataset.tab||'';
      if(tab&&!button.dataset.androidTab)button.dataset.androidTab=tab;
      if(tab&&!button.dataset.tab&&tab!=='more')button.dataset.tab=tab;
      button.setAttribute('aria-pressed',button.classList.contains('active')?'true':'false');
    });
    nav.querySelectorAll('.android-nav-glass-indicator').forEach(node=>node.remove());
  }

  const popupOverlaySelector=[
    '.glass-dialog-overlay','.subscription-overlay','.shop-progress-overlay','.vx643-modal-overlay',
    '.production-overlay','.android-permission-overlay','.android-sheet-overlay',
    '#vyaparDeleteConfirm','#vyaparAccountDeleteConfirm','.account-delete-overlay',
    '.upgrade-plan-popup','.upgrade-plan-reference-popup'
  ].join(',');

  function visibleOverlays(){
    return Array.from(document.querySelectorAll(popupOverlaySelector)).filter(node=>{
      if(!node.isConnected)return false;
      const style=getComputedStyle(node);
      return style.display!=='none'&&style.visibility!=='hidden';
    });
  }

  function syncModalState(){
    const overlays=visibleOverlays();
    if(document.body)document.body.classList.toggle('vy861-modal-open',overlays.length>0);
    overlays.forEach(overlay=>{if(!overlay.classList.contains('vy861-universal-popup'))overlay.classList.add('vy861-universal-popup')});
    // Duplicate ids are a real source of double-action popups. Keep newest live instance.
    const seen=new Map();
    overlays.forEach(node=>{
      if(!node.id)return;
      if(seen.has(node.id))seen.get(node.id).remove();
      seen.set(node.id,node);
    });
  }

  function closeTopPopup(){
    const overlays=visibleOverlays();
    const top=overlays[overlays.length-1];
    if(!top)return false;
    const close=top.querySelector('.android-sheet-close,.shop-sheet-close,.production-close,[data-cancel],#closePlanSuccessPopup,#closeCancelPopup,#closeUpgradePopup,#accountDeleteCancel,[aria-label^="Close" i],[aria-label="Close" i]');
    if(close){close.click();return true;}
    if(top.id==='vyaparGlassDialog'&&typeof window.closeGlassDialog==='function'){window.closeGlassDialog(false);return true;}
    return false;
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(closeTopPopup()){event.preventDefault();event.stopPropagation();}
  },true);

  // More must have exactly one live sheet. Existing app.js owns navigation semantics.
  const previousOpenMore=typeof window.openMoreSheet==='function'?window.openMoreSheet:null;
  if(previousOpenMore&&!previousOpenMore.__vy861Wrapped){
    const wrapped=function(){
      document.querySelectorAll('#androidMoreSheet').forEach(node=>node.remove());
      if(document.body)document.body.classList.remove('android-sheet-open');
      const result=previousOpenMore.apply(this,arguments);
      requestAnimationFrame(()=>{decorateNav();syncModalState();cleanupOptics();});
      return result;
    };
    wrapped.__vy861Wrapped=true;
    window.openMoreSheet=wrapped;
  }

  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy861Wrapped){
    const wrapped=function(tab,withLoader){
      const result=previousSetTab.call(this,tab,false);
      requestAnimationFrame(()=>{decorateNav();syncModalState();cleanupOptics();});
      return result;
    };
    wrapped.__vy861Wrapped=true;
    window.setTab=wrapped;
  }

  function fixAuthGate(){
    const gate=document.getElementById('vyaparOtpGate');
    if(!gate)return;
    gate.classList.toggle('auth-dark',!isLight());
    // Never allow stale loading state after a failed/returned login attempt.
    const message=gate.querySelector('#auth-message');
    if(gate.classList.contains('auth-loading')&&message&&/unable|failed|error|cancel/i.test(message.textContent||'')){
      gate.classList.remove('auth-loading');
    }
  }

  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      cleanupOptics();
      decorateNav();
      syncModalState();
      fixAuthGate();
      applyThemeMeta();
    });
  });

  function init(){
    cleanupOptics();
    decorateNav();
    syncModalState();
    fixAuthGate();
    applyThemeMeta();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
