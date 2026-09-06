/* Vyapar AI 8.6.3 — Graphite/Maroon presentation coordinator.
   Replaces the top-bar theme control with a profile shortcut and applies cosmetic
   plan-aware styling without changing entitlement, authentication or accounting logic. */
(function(){
  'use strict';

  const root=document.documentElement;
  let queued=false;

  function readJson(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key)||'');return value&&typeof value==='object'?value:fallback}catch(_){return fallback}
  }

  function stateRef(){
    try{if(typeof window.S==='function'){const s=window.S();if(s)return s}}catch(_){ }
    try{if(window.state&&typeof window.state==='object')return window.state}catch(_){ }
    return readJson('vyapar_ai_prod_v1',{});
  }

  function accountRef(){
    const cached=readJson('vyapar_ai_account_cache_v1',{});
    const state=stateRef();
    return Object.assign({},cached,state&&state.account||{},state&&state.user||{});
  }

  function planName(){
    const visible=document.querySelector('#productionAccountCard .production-plan,#planBadge');
    const visibleText=String(visible&&visible.textContent||'').trim();
    if(visibleText&&!/^free plan$/i.test(visibleText))return visibleText;
    const s=stateRef();
    const a=accountRef();
    const candidates=[
      s&&s.plan,s&&s.subscription&&s.subscription.plan,s&&s.subscription&&s.subscription.tier,
      a&&a.plan,a&&a.subscription&&a.subscription.plan,a&&a.subscription&&a.subscription.tier,
      visibleText
    ];
    return String(candidates.find(Boolean)||'Free').trim();
  }

  function normalizedPlan(){
    const value=planName().toLowerCase();
    if(value.includes('business'))return 'business';
    if(value.includes('pro'))return 'pro';
    return 'free';
  }

  function displayName(){
    const account=accountRef();
    const s=stateRef();
    const direct=[
      account&&account.name,account&&account.displayName,account&&account.fullName,
      account&&account.user&&account.user.name,
      s&&s.profile&&s.profile.ownerName,s&&s.profile&&s.profile.name
    ].find(v=>String(v||'').trim());
    if(direct)return String(direct).trim();
    const email=String(account&&account.email||account&&account.user&&account.user.email||'').trim();
    if(email)return email.split('@')[0].replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    return 'Profile';
  }

  function profileImage(){
    const img=document.querySelector('#productionAccountCard .production-avatar img,#productionAccountCard img.production-avatar');
    if(img&&img.getAttribute('src'))return img.getAttribute('src');
    const account=accountRef();
    return String(account&&(
      account.photoURL||account.photoUrl||account.picture||account.avatar||
      account.user&&account.user.picture||account.user&&account.user.photoURL
    )||'').trim();
  }

  function initial(){
    const name=displayName();
    const parts=name.split(/\s+/).filter(Boolean);
    return (((parts[0]&&parts[0][0])||'P')+((parts.length>1&&parts[parts.length-1][0])||'')).slice(0,2).toUpperCase();
  }

  function openProfile(){
    try{if(typeof window.setTab==='function')window.setTab('settings',false)}catch(_){ }
    const openAccount=()=>{
      const row=document.querySelector('#screen-settings [data-vy675-page="account"]');
      if(row){row.click();return true}
      return false;
    };
    requestAnimationFrame(()=>{
      if(openAccount())return;
      setTimeout(openAccount,120);
    });
  }

  function buildProfileChip(){
    const actions=document.querySelector('.top .top-actions');
    if(!actions)return;
    const old=document.getElementById('themeToggle');
    if(old)old.remove();
    const badge=document.getElementById('planBadge');
    if(badge)badge.hidden=true;

    let chip=document.getElementById('vy863ProfileChip');
    if(!chip){
      chip=document.createElement('button');
      chip.id='vy863ProfileChip';
      chip.type='button';
      chip.className='vy863-profile-chip';
      chip.setAttribute('aria-label','Open account and plan');
      actions.appendChild(chip);
    }
    if(chip.dataset.vy863Bound!=='1'){
      chip.dataset.vy863Bound='1';
      chip.addEventListener('click',openProfile);
    }

    const image=profileImage();
    const name=displayName();
    const plan=planName().replace(/\s+Plan$/i,'');
    const signature=[image,initial(),name,plan].join('|');
    if(chip.dataset.vy863Signature!==signature){
      chip.dataset.vy863Signature=signature;
      chip.innerHTML='<span class="vy863-profile-avatar">'+(image?'<img src="'+image.replace(/"/g,'&quot;')+'" alt="">':initial())+'</span><i class="vy863-plan-dot" aria-hidden="true"></i>';
      chip.title=name+' · '+plan;
    }
  }

  function applyPlan(){
    const plan=normalizedPlan();
    if(root.dataset.vy863Plan!==plan)root.dataset.vy863Plan=plan;
    const card=document.getElementById('productionAccountCard');
    if(card&&card.dataset.vy863Plan!==plan)card.dataset.vy863Plan=plan;
    const host=document.getElementById('productionAccountCardHost');
    if(host&&host.dataset.vy863Plan!==plan)host.dataset.vy863Plan=plan;
    document.querySelectorAll('#screen-settings .settings-account-section').forEach(node=>{
      if(node.dataset.vy863Plan!==plan)node.dataset.vy863Plan=plan;
    });
  }

  function removeBlueInlineStyles(){
    if(root.classList.contains('theme-light'))return;
    document.querySelectorAll('#screen-home,#screen-business,#screen-sales,#screen-stock,#screen-settings').forEach(screen=>{
      screen.querySelectorAll('[style]').forEach(node=>{
        const style=node.getAttribute('style')||'';
        if(/background(?:-color)?\s*:\s*(?:#(?:0a84ff|0071e3|2563eb|1d4ed8|0b3b68|0d3b66|123c66)|rgb\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235)[^)]*\))/i.test(style)){
          node.style.removeProperty('background');
          node.style.removeProperty('background-color');
          node.style.removeProperty('background-image');
        }
        if(/border(?:-color)?\s*:\s*(?:#(?:0a84ff|0071e3|2563eb|1d4ed8)|rgba?\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235)[^)]*\))/i.test(style)){
          node.style.removeProperty('border');
          node.style.removeProperty('border-color');
        }
      });
    });
  }

  function updateSettingsAppearanceCopy(){
    document.querySelectorAll('#screen-settings .vy675-settings-row').forEach(row=>{
      const text=(row.textContent||'').toLowerCase();
      if(!text.includes('appearance & performance'))return;
      const sub=row.querySelector('small');
      if(sub&&sub.textContent!=='Theme, motion and device performance')sub.textContent='Theme, motion and device performance';
    });
  }

  function normalize(){
    buildProfileChip();
    applyPlan();
    removeBlueInlineStyles();
    updateSettingsAppearanceCopy();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }

  const observer=new MutationObserver(schedule);
  function init(){
    normalize();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.addEventListener('load',schedule,{once:true});
})();
