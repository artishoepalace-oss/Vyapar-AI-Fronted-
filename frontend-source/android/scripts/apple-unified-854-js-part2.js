      page.classList.add('vy854-settings-in');
      setTimeout(()=>page.classList.remove('vy854-settings-in'),310);
    }
    if(home&&!home.hidden&&home.dataset.vy854WasHidden==='1'){
      home.classList.remove('vy854-settings-back');
      void home.offsetWidth;
      home.classList.add('vy854-settings-back');
      setTimeout(()=>home.classList.remove('vy854-settings-back'),310);
    }
    if(home)home.dataset.vy854WasHidden=home.hidden?'1':'0';
  }

  const settingsObserver=new MutationObserver(records=>{
    if(records.some(record=>record.type==='attributes'&&record.attributeName==='hidden'))animateSettingsState();
  });
  function bindSettingsObserver(){
    const settings=document.getElementById('screen-settings');
    if(!settings||settings.dataset.vy854Observed==='1')return;
    settings.dataset.vy854Observed='1';
    settingsObserver.observe(settings,{subtree:true,attributes:true,attributeFilter:['hidden']});
    animateSettingsState();
  }

  /* Theme commit copied from the canonical app functions so old decorative wrappers are bypassed. */
  function currentLight(){
    try{return typeof window.activeTheme==='function'?window.activeTheme()==='light':root.classList.contains('theme-light');}
    catch(_){return root.classList.contains('theme-light');}
  }

  function commitTheme(target){
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
  }

  function themeOrigin(event){
    const button=document.getElementById('themeToggle');
    const rect=button?button.getBoundingClientRect():null;
    return {
      x:event&&Number.isFinite(event.clientX)&&event.clientX>0?event.clientX:(rect?rect.left+rect.width/2:window.innerWidth-34),
      y:event&&Number.isFinite(event.clientY)&&event.clientY>0?event.clientY:(rect?rect.top+rect.height/2:42)
    };
  }

  function popThemeButton(){
    const button=document.getElementById('themeToggle');
    if(!button||reducedMotion())return;
    button.classList.remove('vy854-theme-pop');
    void button.offsetWidth;
    button.classList.add('vy854-theme-pop');
    setTimeout(()=>button.classList.remove('vy854-theme-pop'),520);
  }

  function runTheme(target,event){
    if(themeBusy)return false;
    themeBusy=true;
    document.querySelectorAll('.vy854-theme-wipe,.vy853-theme-reveal,.vy852-theme-bloom,.theme-ripple,.vx657-theme-crossfade').forEach(node=>node.remove());
    popThemeButton();

    if(reducedMotion()||!window.CSS||!CSS.supports||!CSS.supports('clip-path','circle(1px at 1px 1px)')){
      commitTheme(target);
      themeBusy=false;
      return false;
    }

    const origin=themeOrigin(event);
    const wipe=document.createElement('div');
    wipe.className='vy854-theme-wipe '+(target==='light'?'to-light':'to-dark');
    wipe.style.setProperty('--vy854-theme-x',origin.x+'px');
    wipe.style.setProperty('--vy854-theme-y',origin.y+'px');
    document.body.appendChild(wipe);
    requestAnimationFrame(()=>wipe.classList.add('run'));

    const commitDelay=250;
    setTimeout(()=>commitTheme(target),commitDelay);
    clearTimeout(window.__vy854ThemeTimer);
