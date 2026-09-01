/* Vyapar AI 6.7.2 — list-first Settings navigation. */
(() => {
  'use strict';

  const CONFIG = [
    { id:'account', icon:'◎', title:'Account & subscription', subtitle:'Profile, plan, cloud session and account actions', match: card => card.classList.contains('settings-account-section') },
    { id:'profile', icon:'▦', title:'Business profile', subtitle:'Shop name, location and yearly profit goal', match: card => /shop details|business profile/i.test(card.textContent||'') && !card.id },
    { id:'security', icon:'⌾', title:'Business & security', subtitle:'Company, staff, app lock and transaction settings', match: card => card.id==='vx622AdminSettings' || card.id==='vx622AppLockSection' },
    { id:'appearance', icon:'◐', title:'Appearance & performance', subtitle:'Theme, motion and device performance', match: card => /appearance|motion & performance|performance/i.test(card.textContent||'') && !/app update/i.test(card.textContent||'') },
    { id:'data', icon:'⇩', title:'Backup & data', subtitle:'Device backup, Google Drive and restore', match: card => card.classList.contains('data-safety-section') || /backup & data safety|data safety/i.test(card.textContent||'') },
    { id:'legal', icon:'?', title:'Legal & support', subtitle:'Privacy, terms, refunds and account deletion', match: card => /legal & support|privacy policy|refund policy/i.test(card.textContent||'') },
    { id:'update', icon:'↻', title:'App updates', subtitle:'Check for a newer Vyapar AI version', match: card => card.id==='fs607Settings' || /app update/i.test(card.textContent||'') }
  ];

  let activeId = '';
  let scheduled = false;
  let observer = null;

  function screen(){ return document.getElementById('screen-settings'); }
  function stack(){ return screen()?.querySelector('.settings-stack'); }

  function getOrCreateDirectory(scr){
    let dir=scr.querySelector(':scope > .vy672-settings-directory');
    if(dir) return dir;
    dir=document.createElement('div');
    dir.className='vy672-settings-directory';
    scr.prepend(dir);
    return dir;
  }

  function getOrCreateSubpage(scr){
    let page=scr.querySelector(':scope > .vy672-settings-subpage');
    if(page) return page;
    page=document.createElement('div');
    page.className='vy672-settings-subpage';
    page.innerHTML=`
      <div class="vy672-subpage-header">
        <button type="button" class="vy672-subpage-back" aria-label="Back to Settings">‹</button>
        <div class="vy672-subpage-title"><b>Settings</b><small></small></div>
      </div>
      <div class="vy672-subpage-body"></div>`;
    page.querySelector('.vy672-subpage-back').addEventListener('click',()=>openDirectory(true));
    scr.appendChild(page);
    return page;
  }

  function classifyCards(scr){
    const st=stack();
    const extras=[...scr.children].filter(node=>node.id==='fs607Settings');
    const activeCards=[...(scr.querySelector('.vy672-subpage-body')?.children||[])];
    const cards=[...(st ? st.children : []), ...extras, ...activeCards].filter(node=>
      node instanceof HTMLElement && node.id!=='appLegalFooter' && !node.classList.contains('vy672-settings-directory') && !node.classList.contains('vy672-settings-subpage')
    );
    const map=Object.fromEntries(CONFIG.map(c=>[c.id,[]]));
    cards.forEach(card=>{
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden=false;
      card.removeAttribute('aria-hidden');
      const cfg=CONFIG.find(c=>{ try{return c.match(card)}catch(_){return false} });
      if(cfg) map[cfg.id].push(card);
    });
    return map;
  }

  function renderDirectory(scr,map){
    const dir=getOrCreateDirectory(scr);
    const footer=document.getElementById('appLegalFooter');

    if(dir.dataset.vy672Built!=='1'){
      dir.dataset.vy672Built='1';
      dir.innerHTML=`
        <label class="vy672-settings-search-wrap"><span aria-hidden="true">⌕</span><input class="vy672-settings-search" type="search" placeholder="Search settings" aria-label="Search settings"></label>
        <section class="vy672-settings-group">
          <p class="vy672-settings-group-title">Your settings</p>
          ${CONFIG.slice(0,3).map(rowMarkup).join('')}
        </section>
        <section class="vy672-settings-group">
          <p class="vy672-settings-group-title">App preferences</p>
          ${CONFIG.slice(3,5).map(rowMarkup).join('')}
        </section>
        <section class="vy672-settings-group">
          <p class="vy672-settings-group-title">Support & about</p>
          ${CONFIG.slice(5).map(rowMarkup).join('')}
        </section>`;

      dir.querySelectorAll('.vy672-settings-row').forEach(btn=>{
        btn.addEventListener('click',()=>openSubpage(btn.dataset.settingsPage));
      });
      const search=dir.querySelector('.vy672-settings-search');
      if(search){
        search.addEventListener('input',()=>{
          const q=String(search.value||'').trim().toLowerCase();
          dir.querySelectorAll('.vy672-settings-row').forEach(row=>{
            row.hidden=Boolean(q && !String(row.textContent||'').toLowerCase().includes(q));
          });
          dir.querySelectorAll('.vy672-settings-group').forEach(group=>{
            const visible=[...group.querySelectorAll('.vy672-settings-row')].some(row=>!row.hidden);
            group.hidden=!visible;
          });
        });
      }
    }

    if(footer){
      const logo=footer.querySelector('img');
      const copyright=[...footer.querySelectorAll(':scope > span')].find(n=>!n.classList.contains('app-legal-links'));
      const links=footer.querySelector('.app-legal-links');
      const sig=footer.querySelector('.gupta-legacy-signature');
      const normalized=logo && /footer-logo\.png/.test(logo.getAttribute('src')||'') && copyright && links && sig && links.querySelector('a[href*="delete-account"]') && /A Gupta Legacy product/.test(sig.textContent||'');
      if(!normalized){
        footer.innerHTML =
          '<img class="vy659-footer-logo vy6601-footer-logo" src="footer-logo.png" alt="Vyapar AI">' +
          '<span>© 2026 Vyapar AI. All Rights Reserved.</span>' +
          '<span class="app-legal-links"><a href="delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a></span>' +
          '<strong class="gupta-legacy-signature">A Gupta Legacy product</strong>';
      }
      if(footer.parentNode!==dir) dir.appendChild(footer);
    }
  }

  function rowMarkup(cfg){
    return `<button type="button" class="vy672-settings-row" data-settings-page="${cfg.id}" aria-label="Open ${cfg.title}">
      <span class="vy672-settings-row-icon" aria-hidden="true">${cfg.icon}</span>
      <span class="vy672-settings-row-copy"><b>${cfg.title}</b><small>${cfg.subtitle}</small></span>
      <span class="vy672-settings-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  function openDirectory(scrollTop){
    const scr=screen(); if(!scr) return;
    activeId='';
    scr.classList.remove('vy672-subpage-open');
    const page=scr.querySelector('.vy672-settings-subpage');
    const body=page?.querySelector('.vy672-subpage-body');
    if(body){
      // Return cards to the hidden canonical stack so later app refreshes can still find them.
      const st=stack();
      if(st) [...body.children].forEach(node=>st.appendChild(node));
    }
    if(scrollTop){ try{window.scrollTo({top:0,behavior:'auto'})}catch(_){window.scrollTo(0,0)} }
  }

  function openSubpage(id, options){
    const scr=screen(); if(!scr) return;
    const shouldScroll = !options || options.scroll !== false;
    const cfg=CONFIG.find(x=>x.id===id); if(!cfg) return;
    const map=classifyCards(scr);
    const page=getOrCreateSubpage(scr);
    const body=page.querySelector('.vy672-subpage-body');
    const title=page.querySelector('.vy672-subpage-title b');
    const sub=page.querySelector('.vy672-subpage-title small');
    body.replaceChildren(...(map[id]||[]));
    title.textContent=cfg.title;
    sub.textContent=cfg.subtitle;
    activeId=id;
    scr.classList.add('vy672-subpage-open');
    if(shouldScroll){ try{window.scrollTo({top:0,behavior:'auto'})}catch(_){window.scrollTo(0,0)} }
  }

  function hideOldTabs(scr){
    scr.querySelectorAll(':scope > .p1-modebar[data-screen="settings"]').forEach(node=>node.remove());
  }

  function organize(){
    scheduled=false;
    if(observer) observer.disconnect();
    const scr=screen();
    const st=stack();
    if(!scr || !st){ if(observer) observer.observe(document.documentElement,{childList:true,subtree:true}); return; }
    scr.classList.add('vy672-settings-ready');
    hideOldTabs(scr);
    const map=classifyCards(scr);
    renderDirectory(scr,map);
    getOrCreateSubpage(scr);
    if(activeId) openSubpage(activeId,{scroll:false}); else openDirectory(false);
    if(observer) observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(organize);
  }

  const original=window.renderSettings;
  if(typeof original==='function' && !original.__vy672Settings){
    const wrapped=function(){
      // Avoid a blank frame: unhide canonical Settings content before the legacy renderer mutates it,
      // then rebuild the directory synchronously in the same task.
      const scr=screen();
      if(scr) scr.classList.remove('vy672-settings-ready');
      const result=original.apply(this,arguments);
      organize();
      setTimeout(schedule,0);
      setTimeout(schedule,120);
      return result;
    };
    wrapped.__vy672Settings=true;
    window.renderSettings=wrapped;
  }

  observer=new MutationObserver(records=>{
    if(records.some(r=>r.addedNodes && r.addedNodes.length)) schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && screen()?.classList.contains('vy672-subpage-open')) openDirectory(false);
  });

  const originalNativeBack=window.handleNativeBackPress;
  window.handleNativeBackPress=function(){
    if(screen()?.classList.contains('vy672-subpage-open')){
      openDirectory(true);
      return true;
    }
    return typeof originalNativeBack==='function' ? originalNativeBack.apply(this,arguments) : false;
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  window.vy672SettingsHome=()=>openDirectory(true);
  window.vy672OpenSettingsPage=openSubpage;
})();
