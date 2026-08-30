/* Web-only runtime polish. Native Android is intentionally untouched. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('web-ui')) return;

  const root=document.documentElement;
  const WEB_DISPLAY_VERSION='6.5.4';
  try{
    const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    const slow=!!(c&&(c.saveData||/^(slow-2g|2g)$/.test(c.effectiveType||'')));
    const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const weak=(navigator.deviceMemory&&navigator.deviceMemory<=2)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);
    if(slow||reduced||weak) root.classList.add('web-effects-lite');
  }catch(_){ }

  function nearestScope(node){
    return node && (node.closest('.card,.p611-card,.adv-card,.vx621-stock-records,.vx621-table-wrap') || node.parentElement);
  }

  function markExistingMenus(){
    document.querySelectorAll('.vx622-menu-trigger').forEach(trigger=>{
      const scope=nearestScope(trigger);
      if(!scope) return;
      scope.classList.add('web-bulk-scope');
      const expanded=trigger.getAttribute('aria-expanded')==='true';
      scope.classList.toggle('web-bulk-active',expanded);
      trigger.classList.toggle('web-menu-open',expanded);
    });
  }

  function convertLooseBulkBars(){
    /* Core platform-622-ui-cleanup converts every .vx621-bulk-actions row.
       A second web converter caused nested/competing menu state, so web now defers to core. */
  }

  function syncWebDisplayVersion(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,textarea,input')) return;
      let text=node.nodeValue||'';
      const before=text;
      text=text.replace(/Business Workspace\s+(?:v)?\d+\.\d+\.\d+/gi,'Business Workspace');
      text=text.replace(/(App\s+Version\s*[:·-]?\s*)(?:v)?\d+\.\d+\.\d+/gi,'$1'+WEB_DISPLAY_VERSION);
      text=text.replace(/(Version\s*[:·-]\s*)(?:v)?\d+\.\d+\.\d+/gi,'$1'+WEB_DISPLAY_VERSION);
      if(text!==before) node.nodeValue=text;
    });
    document.querySelectorAll('[data-app-version],[data-version]').forEach(el=>{
      if(/\d+\.\d+\.\d+/.test(el.textContent||'')) el.textContent=WEB_DISPLAY_VERSION;
    });
  }

  function syncScopes(){
    convertLooseBulkBars();
    markExistingMenus();
    syncWebDisplayVersion();
    document.querySelectorAll('input.vx621-legacy-check,input.vx621-stock-check,input.vx621-recent-check,input.vx621-data-check,input.vx621-platform-tx-check,input.vx621-generic-check').forEach(input=>{
      const scope=nearestScope(input);
      if(scope) scope.classList.add('web-bulk-scope');
    });
  }

  document.addEventListener('click',function(e){
    const trigger=e.target.closest('.vx622-menu-trigger');
    if(trigger){
      /* Core 6.2.2 menus already own their click/open/selection state. Do not intercept them
         in capture phase; only mirror aria-expanded into web styling after the core handler runs. */
      if(trigger.closest('.vx622-bulk-menu')){
        requestAnimationFrame(markExistingMenus);
        return;
      }
      const scope=nearestScope(trigger);
      if(!scope) return;
      const isOpen=scope.classList.contains('web-bulk-active');
      document.querySelectorAll('.web-bulk-scope.web-bulk-active').forEach(s=>{
        if(s!==scope){
          s.classList.remove('web-bulk-active');
          s.querySelectorAll('.vx622-menu-trigger').forEach(t=>{t.setAttribute('aria-expanded','false');t.classList.remove('web-menu-open');});
        }
      });
      const next=!isOpen;
      scope.classList.toggle('web-bulk-active',next);
      trigger.setAttribute('aria-expanded',next?'true':'false');
      trigger.classList.toggle('web-menu-open',next);
      e.stopPropagation();
      return;
    }
    if(!e.target.closest('.vx622-menu-panel,.web-bulk-panel')){
      document.querySelectorAll('.web-bulk-scope.web-bulk-active').forEach(scope=>{
        scope.classList.remove('web-bulk-active');
        scope.querySelectorAll('.vx622-menu-trigger').forEach(t=>{t.setAttribute('aria-expanded','false');t.classList.remove('web-menu-open');});
      });
    }
  },true);

  const observer=new MutationObserver(()=>requestAnimationFrame(syncScopes));
  observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',syncScopes,{once:true}); else syncScopes();
  setTimeout(syncScopes,300);
  setTimeout(syncScopes,1200);
})();
