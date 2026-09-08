/* Vyapar AI 8.6.5 — cosmetic tier + premium motion coordinator.
   Presentation only: does not grant plans, change entitlements, auth or accounting logic. */
(function(){
  'use strict';
  const root=document.documentElement;
  const LOGO='assets/images/logo.png';
  let queued=false;

  function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'');return v&&typeof v==='object'?v:fallback}catch(_){return fallback}}
  function stateRef(){
    try{if(typeof window.S==='function'){const s=window.S();if(s)return s}}catch(_){ }
    try{if(window.state&&typeof window.state==='object')return window.state}catch(_){ }
    return readJson('vyapar_ai_prod_v1',{});
  }
  function accountRef(){
    const cached=readJson('vyapar_ai_account_cache_v1',{});
    const s=stateRef();
    return Object.assign({},cached,s&&s.account||{},s&&s.user||{});
  }
  function planText(){
    const visible=document.querySelector('#productionAccountCard .production-plan,#planBadge');
    const visibleText=String(visible&&visible.textContent||'').trim();
    const s=stateRef(),a=accountRef();
    const candidates=[
      s&&s.subscription&&s.subscription.plan,s&&s.subscription&&s.subscription.tier,s&&s.plan,
      a&&a.subscription&&a.subscription.plan,a&&a.subscription&&a.subscription.tier,a&&a.plan,
      visibleText
    ];
    return String(candidates.find(v=>String(v||'').trim())||'Free').trim();
  }
  function plan(){
    const value=planText().toLowerCase();
    if(value.includes('business'))return 'business';
    if(value.includes('pro'))return 'pro';
    return 'free';
  }
  function applyPlan(){
    const p=plan();
    if(root.dataset.vy864Plan!==p)root.dataset.vy864Plan=p;
    document.querySelectorAll('#productionAccountCard,.settings-account-section,#productionAccountCardHost').forEach(n=>{if(n.dataset.vy864Plan!==p)n.dataset.vy864Plan=p;});
  }

  function normalizeLogos(scope){
    (scope||document).querySelectorAll?.('img').forEach(img=>{
      const src=String(img.getAttribute('src')||'');
      if(/(?:^|\/)logo\.png(?:\?|$)|footer-logo\.png(?:\?|$)/i.test(src)){
        if(src!==LOGO)img.setAttribute('src',LOGO);
      }
    });
    const icon=document.querySelector('link[rel="icon"]');
    if(icon&&icon.getAttribute('href')!==LOGO){icon.setAttribute('href',LOGO);icon.setAttribute('type','image/png')}
  }

  const blue=/(?:#(?:0a84ff|0071e3|2563eb|1d4ed8|0b3b68|0d3b66|123c66|2563e[bf]|3b82f6|2196f3)|rgba?\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235|59\s*,\s*130\s*,\s*246|33\s*,\s*150\s*,\s*243)[^)]*\))/i;
  function sanitizeInline(scope){
    (scope||document).querySelectorAll?.('[style]').forEach(node=>{
      const style=node.style;
      for(let i=style.length-1;i>=0;i--){
        const prop=style[i];
        const value=style.getPropertyValue(prop)||'';
        if(!blue.test(value))continue;
        if(prop.startsWith('--'))style.setProperty(prop,'var(--vy864-tier-accent)');
        else style.removeProperty(prop);
      }
    });
  }

  function normalizeDangerLabels(){
    document.querySelectorAll('button,.btn').forEach(btn=>{
      const text=String(btn.textContent||'').trim().toLowerCase();
      if(/delete account|cancel at cycle end|manage cancellation|delete selected|delete record/.test(text) && !btn.classList.contains('danger'))btn.classList.add('danger');
    });
  }

  function fixNav(){
    const nav=document.getElementById('nav');
    if(!nav)return;
    if(document.body && nav.parentElement!==document.body)document.body.appendChild(nav);
    ['left','right','top','bottom','width','min-width','max-width','height','transform','translate','margin','margin-left','margin-right'].forEach(prop=>nav.style.removeProperty(prop));
    nav.scrollLeft=0;
  }

  function updateProfileChip(){
    const chip=document.getElementById('vy863ProfileChip');
    if(!chip)return;
    const currentPlan=plan();
    if(chip.dataset.vy864Plan!==currentPlan)chip.dataset.vy864Plan=currentPlan;
    if(chip.getAttribute('aria-label')!=='Open profile and plan')chip.setAttribute('aria-label','Open profile and plan');
  }

  function normalize(){
    applyPlan();
    normalizeLogos(document);
    sanitizeInline(document);
    normalizeDangerLabels();
    fixNav();
    updateProfileChip();
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }
  function init(){
    normalize();
    if(document.body){
      new MutationObserver(records=>{
        records.forEach(r=>r.addedNodes&&r.addedNodes.forEach(node=>{
          if(node.nodeType===1){normalizeLogos(node);sanitizeInline(node)}
        }));
        schedule();
      }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','src']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('load',schedule,{once:true});
})();
