/* Vyapar AI 6.7.3.2026 — default-OFF Auto Scroll to Top + per-section scroll memory. */
(() => {
  'use strict';

  const positions = Object.create(null);

  function appState(){
    try { if (typeof S === 'function') return S(); } catch (_) {}
    try { if (typeof state !== 'undefined') return state; } catch (_) {}
    return null;
  }

  function autoTopEnabled(){
    const s = appState();
    return Boolean(s && s.settings && s.settings.autoScrollTop === true);
  }

  function y(){
    const root=document.scrollingElement||document.documentElement;
    return Math.max(0,Number(window.scrollY||root.scrollTop||document.body.scrollTop||0));
  }

  function persist(flag){
    const s=appState();
    if(!s) return;
    s.settings=(s.settings&&typeof s.settings==='object')?s.settings:{};
    s.settings.autoScrollTop=Boolean(flag);
    try { if(typeof save==='function'){ save(); return; } } catch(_) {}
    try { localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(s)); } catch(_) {}
  }

  function updateStatus(root,enabled){
    const status=root && root.querySelector('#vx673ScrollStatus');
    if(!status) return;
    status.classList.toggle('is-on',enabled);
    status.classList.toggle('is-off',!enabled);
    status.innerHTML=`<b>${enabled?'Auto Scroll to Top is on':'Auto Scroll to Top is off'}</b><small>${enabled?'Pages move to the top after navigation.':'Each section remembers its position instead of jumping to the top.'}</small>`;
  }

  function addPreference(){
    const host=document.getElementById('vx622AppLockSection');
    if(!host || host.querySelector('.vx673-scroll-pref')) return;
    const enabled=autoTopEnabled();
    const block=document.createElement('div');
    block.className='vx673-scroll-pref';
    block.innerHTML=`
      <div class="settings-section-heading vx622-lock-heading">
        <div>
          <span class="settings-kicker">NAVIGATION</span>
          <h2>Auto Scroll to Top</h2>
          <p class="muted">Move a page to the top when switching sections.</p>
        </div>
        <label class="vx622-switch" aria-label="Auto Scroll to Top on or off">
          <input id="vx673ScrollToggle" type="checkbox" ${enabled?'checked':''}>
          <span></span>
        </label>
      </div>
      <div id="vx673ScrollStatus" class="vx622-lock-status ${enabled?'is-on':'is-off'}"></div>`;
    host.appendChild(block);
    updateStatus(block,enabled);
    block.querySelector('#vx673ScrollToggle')?.addEventListener('change',event=>{
      const value=Boolean(event.target.checked);
      persist(value);
      updateStatus(block,value);
      try { if(typeof toast==='function') toast(value?'Auto Scroll to Top enabled.':'Auto Scroll to Top disabled.'); } catch(_) {}
    });
  }

  function installNavigationWrapper(){
    const current=window.setTab;
    if(typeof current!=='function' || current.__vy673ScrollMemory) return;
    const wrapped=function(tab,withLoader){
      let previous='';
      try { previous=(typeof currentTab==='string'?currentTab:''); } catch(_) {}
      const previousY=y();
      const autoTop=autoTopEnabled();
      if(!autoTop && previous) positions[previous]=previousY;

      const result=current.call(this,tab,withLoader);
      requestAnimationFrame(()=>{
        if(result===false) return;
        if(autoTop){
          window.scrollTo(0,0);
          return;
        }
        const target=Object.prototype.hasOwnProperty.call(positions,tab)
          ? positions[tab]
          : (tab===previous?previousY:0);
        window.scrollTo(0,Math.max(0,target));
      });
      return result;
    };
    wrapped.__vy673ScrollMemory=true;
    window.setTab=wrapped;
  }

  function hookSettings(){
    const current=window.renderSettings;
    if(typeof current==='function' && !current.__vy673ScrollPreference){
      const wrapped=function(){
        const result=current.apply(this,arguments);
        addPreference();
        setTimeout(addPreference,0);
        return result;
      };
      wrapped.__vy673ScrollPreference=true;
      window.renderSettings=wrapped;
    }
  }

  function refresh(){ installNavigationWrapper(); hookSettings(); addPreference(); }
  refresh();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refresh,{once:true});
  const observer=new MutationObserver(()=>requestAnimationFrame(addPreference));
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
