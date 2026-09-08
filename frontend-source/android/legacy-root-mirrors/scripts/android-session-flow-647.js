/* Vyapar AI 6.4.7 — Android startup/session routing + account-password app lock. */
(function(){
  'use strict';

  var TOKEN_KEY='vyapar_ai_auth_token_v1';
  var REFRESH_KEY='vyapar_ai_auth_refresh_token_v1';
  var ACCOUNT_KEY='vyapar_ai_account_cache_v1';
  var POLICY_KEY='vyapar_ai_password_login_policy_v1';
  var UNLOCK_KEY='vyapar_ai_startup_unlocked_v1';
  var API_BASE='https://vypar-backend.onrender.com';
  var MIN_SPLASH_MS=1050;
  var startedAt=Date.now();

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(_){return fallback}}
  function account(){return readJson(ACCOUNT_KEY,{})}
  function accountEmail(){var a=account();return String((a.user&&a.user.email)||a.email||'').trim().toLowerCase()}
  function token(){return String(localStorage.getItem(TOKEN_KEY)||'').trim()}
  function passwordPolicy(){var p=readJson(POLICY_KEY,{});return p&&typeof p==='object'?p:{}}
  function lockEnabled(email){email=String(email||'').trim().toLowerCase();return !!(email&&passwordPolicy()[email]===true)}
  function sessionUnlocked(email){try{return sessionStorage.getItem(UNLOCK_KEY)===String(email||'').trim().toLowerCase()}catch(_){return false}}
  function markUnlocked(email){try{sessionStorage.setItem(UNLOCK_KEY,String(email||'').trim().toLowerCase())}catch(_){}}
  function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}

  function ensureSplash(){
    if(document.getElementById('vy647StartupSplash'))return;
    var splash=document.createElement('div');
    splash.id='vy647StartupSplash';
    splash.innerHTML='<div class="vy647-splash-core"><img src="assets/images/logo.png" alt="Vyapar AI"><strong>Vyapar AI</strong><span>Loading secure session…</span><div class="vy647-splash-bar"><i></i></div></div>';
    document.body.appendChild(splash);
  }

  function hideLegacyLoader(){var old=document.getElementById('appLoader');if(old)old.style.visibility='hidden'}
  function removeSplash(){var splash=document.getElementById('vy647StartupSplash');if(!splash)return;splash.classList.add('out');setTimeout(function(){splash.remove()},220)}
  function waitMinimum(fn){var delay=Math.max(0,MIN_SPLASH_MS-(Date.now()-startedAt));setTimeout(fn,delay)}

  async function jsonResponse(response){
    var text=await response.text(),data={};
    try{data=text?JSON.parse(text):{}}catch(_){}
    if(!response.ok||data.success===false)throw new Error(data.message||'Password verification failed');
    return data;
  }

  function saveLogin(data){
    var access=String(data.token||data.accessToken||data.access_token||data?.data?.token||data?.data?.accessToken||'').trim();
    var refresh=String(data.refreshToken||data.refresh_token||data?.data?.refreshToken||'').trim();
    if(access)localStorage.setItem(TOKEN_KEY,access);
    if(refresh)localStorage.setItem(REFRESH_KEY,refresh);
    var old=account();
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user||data?.data?.user||old.user||null,subscription:data.subscription||data?.data?.subscription||old.subscription||null}));
  }

  function showPasswordGate(){
    var email=accountEmail();
    if(!email||!token()||!lockEnabled(email)||sessionUnlocked(email)){removeSplash();return}
    document.getElementById('vy647PasswordGate')?.remove();
    var gate=document.createElement('div');
    gate.id='vy647PasswordGate';
    gate.innerHTML='<main class="vy647-lock-card" role="dialog" aria-modal="true" aria-labelledby="vy647LockTitle">'+
      '<img src="assets/images/logo.png" alt="Vyapar AI"><h1 id="vy647LockTitle">Welcome Back</h1><p>Enter your account password to open Vyapar AI.</p>'+
      '<label>Account</label><div class="vy647-email">'+esc(email)+'</div><label for="vy647Password">Password</label>'+
      '<input id="vy647Password" type="password" autocomplete="current-password" placeholder="Enter password">'+
      '<div id="vy647LockError" class="vy647-lock-error" aria-live="polite"></div><button id="vy647Unlock" type="button">Unlock App</button>'+
      '<button id="vy647UseLogin" class="secondary" type="button">Use another login method</button></main>';
    document.body.appendChild(gate);removeSplash();

    var input=document.getElementById('vy647Password'),submit=document.getElementById('vy647Unlock'),error=document.getElementById('vy647LockError');
    async function unlock(){
      var password=String(input.value||'');
      if(password.length<8||password.length>72){error.textContent='Enter your account password.';return}
      error.textContent='';submit.disabled=true;submit.textContent='Checking…';
      try{
        var data=await jsonResponse(await fetch(API_BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:email,password:password})}));
        saveLogin(data);markUnlocked(email);gate.remove();
      }catch(e){error.textContent=e&&e.message?e.message:'Wrong password';input.value='';input.focus()}
      finally{submit.disabled=false;submit.textContent='Unlock App'}
    }
    submit.onclick=unlock;
    input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();unlock()}});
    document.getElementById('vy647UseLogin').onclick=function(){
      try{sessionStorage.removeItem(UNLOCK_KEY)}catch(_){}
      localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REFRESH_KEY);localStorage.removeItem(ACCOUNT_KEY);location.reload();
    };
    setTimeout(function(){input.focus()},80);
  }

  function routeAfterSplash(){
    if(!token()){removeSplash();return}
    var timeout=Date.now()+9000;
    (function poll(){
      var authGate=document.getElementById('vyaparOtpGate');
      if(!token()){removeSplash();return}
      if(!authGate){showPasswordGate();return}
      if(Date.now()>timeout){removeSplash();return}
      setTimeout(poll,80);
    })();
  }

  function resolvePlan(){
    var a=account(),p=String((a.subscription&&a.subscription.plan)||a.plan||(a.user&&a.user.plan)||'').toLowerCase();
    if(p.indexOf('business')>=0)return 'business';if(p.indexOf('pro')>=0)return 'pro';return '';
  }

  function decoratePlanIdentity(){
    // plan-badge-menu-645 is the single owner of the paid verification mark.
    // Older builds added .vy647-plan-mark from this observer as well, which
    // produced two ticks and an endless mutation/paint loop on some WebViews.
    var card=document.getElementById('productionAccountCard');if(!card)return;
    card.querySelectorAll('.vy647-plan-mark').forEach(function(mark){mark.remove()});
  }

  var refreshQueued=false;
  function refresh(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(function(){refreshQueued=false;decoratePlanIdentity()})}

  ensureSplash();hideLegacyLoader();waitMinimum(routeAfterSplash);
  new MutationObserver(function(){hideLegacyLoader();refresh()}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){hideLegacyLoader();refresh()},{once:true});
  window.addEventListener('load',function(){hideLegacyLoader();refresh()},{once:true});
})();
