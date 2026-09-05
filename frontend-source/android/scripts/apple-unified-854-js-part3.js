    window.__vy854ThemeTimer=setTimeout(()=>{
      if(wipe.parentNode)wipe.remove();
      themeBusy=false;
      syncChrome();
    },610);
    return false;
  }

  window.toggleTheme=function(event){
    return runTheme(currentLight()?'dark':'light',event);
  };
  window.setTheme=function(theme){
    const target=theme==='light'?'light':'dark';
    if((target==='light')===currentLight())return false;
    return runTheme(target,null);
  };

  /* Auth handoff: hide duplicate app/tab/startup loaders after the auth gate disappears. */
  let hadAuthGate=false;
  function syncAuthHandoff(){
    const gate=document.getElementById('vyaparOtpGate');
    if(gate){
      hadAuthGate=true;
      root.classList.remove('vy854-auth-handoff');
      const tabLoader=document.getElementById('tabLoader');
      if(tabLoader)tabLoader.classList.remove('show');
      return;
    }
    if(hadAuthGate){
      hadAuthGate=false;
      root.classList.add('vy854-auth-handoff');
      document.querySelectorAll('#tabLoader,#appLoader,#vy647StartupSplash').forEach(node=>{
        try{node.classList.remove('show');node.style.visibility='hidden';}catch(_){}
      });
      setTimeout(()=>root.classList.remove('vy854-auth-handoff'),1100);
    }
  }

  /* Journey close receives the same spring exit instead of disappearing instantly. */
  document.addEventListener('click',event=>{
    const overlay=event.target&&event.target.closest?event.target.closest('#shopProgressSheet.shop-progress-overlay'):null;
    if(!overlay)return;
    const close=event.target.closest&&event.target.closest('#closeShopProgress,.shop-sheet-close');
    const backdrop=event.target===overlay;
    if(!close&&!backdrop)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(overlay.classList.contains('vy854-journey-closing'))return;
    overlay.classList.add('vy854-journey-closing');
    setTimeout(()=>{
      overlay.remove();
      document.body.classList.remove('shop-progress-open');
    },220);
  },true);

  let mutationQueued=false;
  const globalObserver=new MutationObserver(()=>{
    if(mutationQueued)return;
    mutationQueued=true;
    requestAnimationFrame(()=>{
      mutationQueued=false;
      syncChrome();
      bindSettingsObserver();
      syncAuthHandoff();
    });
  });

  function initialise(){
    syncChrome();
    bindSettingsObserver();
    syncAuthHandoff();
    clearOldPageMotion();
    if(document.body)globalObserver.observe(document.body,{childList:true,subtree:true,attributes:false});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
  else initialise();

  window.addEventListener('pageshow',()=>requestAnimationFrame(syncChrome),{passive:true});
})();
