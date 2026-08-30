/* Vyapar AI 6.5.3 — web-only runtime hardening. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('web-ui')) return;

  function cleanWorkspaceVersion(root){
    const scope=root&&root.nodeType===1?root:document.body;
    if(!scope) return;
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      if(!node.parentElement||node.parentElement.closest('script,style,textarea')) return;
      node.nodeValue=(node.nodeValue||'').replace(/Business Workspace\s+(?:v)?\d+\.\d+\.\d+/gi,'Business Workspace');
    });
  }

  function normalizeBulkLabels(root){
    (root||document).querySelectorAll('.vx622-menu-item,.vx621-bulk-actions button').forEach(button=>{
      const text=(button.textContent||'').trim();
      if(/^select all$/i.test(text)) button.textContent='Select All';
      else if(/^clear(?: selected)?$/i.test(text)) button.textContent='Clear Selected';
    });
  }

  function closeStaleMenus(){
    document.querySelectorAll('.vx622-bulk-menu').forEach(menu=>{
      const trigger=menu.querySelector(':scope > .vx622-menu-trigger');
      const open=menu.classList.contains('is-open');
      if(trigger) trigger.setAttribute('aria-expanded',open?'true':'false');
      const card=menu.closest('.vx622-menu-card');
      if(card&&!open&&document.activeElement!==card) card.classList.remove('vx622-selection-open');
    });
  }

  let queued=false;
  function sync(){
    queued=false;
    cleanWorkspaceVersion(document.body);
    normalizeBulkLabels(document);
    closeStaleMenus();
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(sync)}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('pageshow',schedule);
  schedule();
})();
