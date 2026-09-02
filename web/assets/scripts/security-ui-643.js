/* Vyapar AI 6.5.2 — shared web + Android navbar tap-only + refresh-aware account password policy */
(function(){
  'use strict';

  var POLICY_KEY='vyapar_ai_password_login_policy_v1';
  var ACCOUNT_KEY='vyapar_ai_account_cache_v1';
  var TOKEN_KEY='vyapar_ai_auth_token_v1';
  var API_BASE='https://vypar-backend.onrender.com';

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(_){return fallback}}
  function account(){return readJson(ACCOUNT_KEY,{})}
  function accountEmail(){
    var a=account();
    return String((a.user&&a.user.email)||a.email||'').trim().toLowerCase();
  }
  function policy(){var p=readJson(POLICY_KEY,{});return p&&typeof p==='object'?p:{}}
  function savePolicy(p){try{localStorage.setItem(POLICY_KEY,JSON.stringify(p))}catch(_){}}
  function enabledFor(email){email=String(email||'').trim().toLowerCase();return !!(email&&policy()[email]===true)}
  function setEnabled(email,value){
    email=String(email||'').trim().toLowerCase();
    if(!email)return;
    var p=policy();p[email]=value===true;savePolicy(p);
  }
  function token(){return String(localStorage.getItem(TOKEN_KEY)||'').trim()}
  function notify(msg,type){
    if(typeof window.showGlassToast==='function')window.showGlassToast(msg,type||'success');
    else alert(msg);
  }

  /* Tap-only bottom navigation on both web and Android. Stops drag/swipe while preserving normal button clicks. */
  function stopNavGesture(event){
    var nav=event.target&&event.target.closest?event.target.closest('#nav'):null;
    if(!nav)return;
    if(event.type.indexOf('pointer')===0 || event.type.indexOf('touch')===0){
      event.stopPropagation();
    }
  }
  ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend'].forEach(function(type){
    document.addEventListener(type,stopNavGesture,true);
  });

  function modal(enableAfter){
    var email=accountEmail();
    if(!email||!token()){
      notify('Sign in with Email OTP first, then manage password login.','error');
      return;
    }
    document.getElementById('vx643PasswordModal')?.remove();
    var overlay=document.createElement('div');
    overlay.id='vx643PasswordModal';
    overlay.className='vx643-modal-overlay';
    overlay.innerHTML='\
      <div class="vx643-modal" role="dialog" aria-modal="true" aria-labelledby="vx643ModalTitle">\
        <h2 id="vx643ModalTitle">Change account password</h2>\
        <p>This is the same password used by “Login with Password”. Your email stays the same.</p>\
        <label>Account email</label>\
        <div class="vx643-email">'+email.replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})+'</div>\
        <label for="vx643NewPassword">New password</label>\
        <input id="vx643NewPassword" type="password" autocomplete="new-password" placeholder="8–72 characters">\
        <label for="vx643ConfirmPassword">Confirm password</label>\
        <input id="vx643ConfirmPassword" type="password" autocomplete="new-password" placeholder="Repeat new password">\
        <div class="vx643-error" id="vx643ModalError"></div>\
        <div class="vx643-modal-actions">\
          <button type="button" data-cancel>Cancel</button>\
          <button type="button" class="primary" data-save>Update password</button>\
        </div>\
      </div>';
    document.body.appendChild(overlay);
    var close=function(){overlay.remove()};
    overlay.querySelector('[data-cancel]').onclick=close;
    overlay.addEventListener('click',function(e){if(e.target===overlay)close()});
    var save=overlay.querySelector('[data-save]');
    save.onclick=async function(){
      var pass=String(document.getElementById('vx643NewPassword')?.value||'');
      var confirm=String(document.getElementById('vx643ConfirmPassword')?.value||'');
      var err=document.getElementById('vx643ModalError');
      if(pass.length<8||pass.length>72){err.textContent='Password must be 8–72 characters.';return}
      if(pass!==confirm){err.textContent='Passwords do not match.';return}
      err.textContent='';save.disabled=true;save.textContent='Updating…';
      try{
        var authenticatedFetch=typeof window.vyaparAuthFetch==='function'?window.vyaparAuthFetch:fetch;
        var response=await authenticatedFetch(API_BASE+'/auth/password',{
          method:'PUT',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},
          body:JSON.stringify({password:pass})
        });
        var data={};
        try{data=await response.json()}catch(_){data={}}
        if(!response.ok||data.success===false)throw new Error(data.message||'Unable to update password');
        if(enableAfter===true)setEnabled(email,true);
        close();
        refreshSecurityCard();
        refreshAuthPolicy();
        notify('Account password updated.','success');
      }catch(error){
        err.textContent=error&&error.message?error.message:'Unable to update password';
        save.disabled=false;save.textContent='Update password';
      }
    };
    setTimeout(function(){document.getElementById('vx643NewPassword')?.focus()},30);
  }

  window.vx643ChangeAccountPassword=function(){modal(false)};
  window.vx643TogglePasswordLogin=function(input){
    var email=accountEmail();
    if(!email||!token()){
      if(input)input.checked=false;
      notify('Sign in with Email OTP first.','error');
      return;
    }
    if(input&&input.checked){
      input.checked=false;
      modal(true);
      return;
    }
    setEnabled(email,false);
    refreshSecurityCard();
    refreshAuthPolicy();
    notify('Password login disabled. Email OTP remains available.','success');
  };

  function securityMarkup(){
    var email=accountEmail();
    var on=enabledFor(email);
    return '\
      <div class="settings-section-heading vx622-lock-heading">\
        <div class="vx643-security-copy">\
          <span class="settings-kicker">SECURITY</span>\
          <h2>Inside app lock</h2>\
          <p class="muted">Control account password login for this app.</p>\
        </div>\
        <label class="vx622-switch" aria-label="Password login on or off">\
          <input id="vx643PasswordLoginToggle" type="checkbox" '+(on?'checked':'')+' onchange="vx643TogglePasswordLogin(this)">\
          <span></span>\
        </label>\
      </div>\
      <div class="vx643-security-status">\
        <span><b>Password login</b><small>'+(on?'Your saved account email can use the account password.':'Locked. Email OTP is the only login method until enabled.')+'</small></span>\
        <i class="vx643-state '+(on?'on':'off')+'">'+(on?'Enabled':'Locked')+'</i>\
      </div>\
      <div class="vx643-security-actions">\
        <button type="button" class="btn" onclick="vx643ChangeAccountPassword()">Change Password</button>\
      </div>';
  }

  function refreshSecurityCard(){
    var section=document.getElementById('vx622AppLockSection');
    if(!section)return false;
    if(section.dataset.vx643Security==='1'){
      var email=accountEmail(),on=enabledFor(email),toggle=document.getElementById('vx643PasswordLoginToggle');
      if(toggle)toggle.checked=on;
      var state=section.querySelector('.vx643-state');if(state){state.textContent=on?'Enabled':'Locked';state.className='vx643-state '+(on?'on':'off')}
      var small=section.querySelector('.vx643-security-status small');if(small)small.textContent=on?'Your saved account email can use the account password.':'Locked. Email OTP is the only login method until enabled.';
      return true;
    }
    section.dataset.vx643Security='1';
    section.innerHTML=securityMarkup();
    return true;
  }

  function authCandidateEmail(gate){
    var pass=gate.querySelector('#login-email');
    var otp=gate.querySelector('#login-otp-email');
    return String((pass&&pass.value)||(otp&&otp.value)||accountEmail()||'').trim().toLowerCase();
  }
  function refreshAuthPolicy(){
    var gate=document.getElementById('vyaparOtpGate');
    if(!gate)return false;
    var passTab=gate.querySelector('#tab-login-pass');
    var otpTab=gate.querySelector('#tab-login-otp');
    if(!passTab||!otpTab)return false;
    var email=authCandidateEmail(gate);
    var on=enabledFor(email);
    var tabs=passTab.closest('.auth-method-tabs');
    if(on){
      passTab.disabled=false;
      passTab.removeAttribute('aria-disabled');
      passTab.classList.remove('vx643-password-locked');
      if(tabs)tabs.classList.remove('vx643-password-disabled');
      if(passTab.textContent.indexOf('Login with Password')<0)passTab.textContent='Login with Password';
    }else{
      if(passTab.classList.contains('active')&&!otpTab.classList.contains('active')){
        passTab.disabled=false;
        try{otpTab.click()}catch(_){}
      }
      passTab.disabled=true;
      passTab.setAttribute('aria-disabled','true');
      passTab.classList.add('vx643-password-locked');
      if(tabs)tabs.classList.add('vx643-password-disabled');
      passTab.textContent='Login with Password';
    }
    if(!gate.dataset.vx643EmailBound){
      gate.dataset.vx643EmailBound='1';
      ['#login-email','#login-otp-email'].forEach(function(sel){
        var input=gate.querySelector(sel);
        if(!input)return;
        input.addEventListener('input',function(){
          var other=gate.querySelector(sel==='#login-email'?'#login-otp-email':'#login-email');
          if(other&&other.value!==input.value)other.value=input.value;
          refreshAuthPolicy();
        });
      });
    }
    return true;
  }

  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;refreshSecurityCard();refreshAuthPolicy()});
  }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('load',schedule,{once:true});
  schedule();
})();
