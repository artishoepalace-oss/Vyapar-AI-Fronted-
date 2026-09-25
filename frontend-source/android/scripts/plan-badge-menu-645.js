/* Vyapar AI — verified account badge + explicit Pro/Business plan-card targeting. */
(function(){
'use strict';
const ACCOUNT_KEY='vyapar_ai_account_cache_v1',STATE_KEY='vyapar_ai_prod_v1';
const tickSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9.7 16.6-4.2-4.2 1.8-1.8 2.4 2.4 6.9-6.9 1.8 1.8z"/></svg>';
function readJson(k){try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(_){return{}}}
function normalizePlan(v){const p=String(v||'').trim().toLowerCase();if(p.includes('business'))return'business';if(p.includes('pro'))return'pro';return''}
function resolvedPlan(){const a=readJson(ACCOUNT_KEY),s=readJson(STATE_KEY),token=String(localStorage.getItem('vyapar_ai_auth_token_v1')||'').trim();const statePlan=(s?.subscription?.verified===true&&String(s?.subscription?.token||token).trim())?normalizePlan(s?.subscription?.plan):'';if(statePlan)return statePlan;const accountPlan=normalizePlan(a?.subscription?.plan),status=String(a?.subscription?.status||'').trim().toLowerCase();const inactive=/^(cancelled|canceled|expired|failed|none|inactive)$/.test(status);if(token&&accountPlan&&!inactive)return accountPlan;return''}
function decorateAccount(){const card=document.getElementById('productionAccountCard');if(!card)return;const title=card.querySelector('.production-account-head h3');if(!title)return;const plan=resolvedPlan();card.querySelectorAll('.vy647-plan-mark').forEach(el=>el.remove());let badge=title.querySelector('.vy645-plan-tick');if(!plan){if(badge)badge.remove()}else{if(!badge){badge=document.createElement('span');badge.className='vy645-plan-tick';badge.innerHTML=tickSvg;title.appendChild(badge)}badge.className='vy645-plan-tick '+plan;badge.setAttribute('role','img');badge.setAttribute('aria-label',plan==='business'?'Business verified':'Pro verified');badge.title=plan==='business'?'Business verified':'Pro verified'}const avatar=card.querySelector('.production-avatar, .account-avatar, .profile-avatar, .avatar');if(avatar){const wanted=plan||'';if(avatar.dataset.plan!==wanted){avatar.classList.remove('vy648-plan-avatar','pro','business');avatar.removeAttribute('data-plan');if(plan){avatar.classList.add('vy648-plan-avatar',plan);avatar.setAttribute('data-plan',plan)}}}}
function decoratePlanCards(){
  document.querySelectorAll('.subscription-plan-grid .subscription-plan-card').forEach(card=>{
    const name=String(card.querySelector('h2')?.textContent||'').trim().toLowerCase();
    for(const [className,wanted] of [['vy649-pro-card',name==='pro'],['vy649-business-card',name==='business']]){
      if(card.classList.contains(className)!==wanted)card.classList.toggle(className,wanted);
    }
  });
}
/* Bulk selection is owned by app.js; do not intercept its trigger clicks. */
let q=false;function refresh(){if(q)return;q=true;requestAnimationFrame(()=>{q=false;decorateAccount();decoratePlanCards()})}
new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('storage',refresh);window.addEventListener('load',refresh,{once:true});setTimeout(refresh,120);setTimeout(refresh,500);setTimeout(refresh,1200);
})();
