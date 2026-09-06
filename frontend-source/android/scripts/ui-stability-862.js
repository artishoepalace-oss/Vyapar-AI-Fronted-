/* Vyapar AI 8.6.2 — final UI coordinator.
   Keeps account authentication intact while removing the obsolete local password-lock gate. */
(function(){
  'use strict';

  const root=document.documentElement;
  let queued=false;

  function light(){return root.classList.contains('theme-light')||Boolean(document.body&&document.body.classList.contains('theme-light'))}

  function unlockPasswordTab(){
    const gate=document.getElementById('vyaparOtpGate');
    if(!gate)return;
    const pass=gate.querySelector('#tab-login-pass');
    const tabs=pass&&pass.closest('.auth-method-tabs');
    if(pass){
      pass.disabled=false;
      pass.removeAttribute('disabled');
      pass.removeAttribute('aria-disabled');
      pass.classList.remove('vx643-password-locked');
      pass.textContent='Login with Password';
    }
    if(tabs)tabs.classList.remove('vx643-password-disabled');
  }

  function simplifySecuritySettings(){
    const section=document.getElementById('vx622AppLockSection');
    if(section){
      section.querySelectorAll('.vx622-switch,.vx643-security-status').forEach(node=>node.remove());
      const title=section.querySelector('.vx622-lock-heading h2,.vx643-security-copy h2');
      if(title)title.textContent='Account password';
      const copy=section.querySelector('.vx622-lock-heading p,.vx643-security-copy p');
      if(copy)copy.textContent='Change your sign-in password. Email OTP remains available.';
      const kicker=section.querySelector('.settings-kicker');
      if(kicker)kicker.textContent='SIGN-IN';
      section.classList.add('vy862-security-simplified');
    }

    document.querySelectorAll('#screen-settings .vy675-settings-row,#screen-settings [data-vy675-setting]').forEach(row=>{
      const text=(row.textContent||'').toLowerCase();
      if(!text.includes('privacy & security')&&!text.includes('password login and app protection'))return;
      const title=row.querySelector('b,strong,.vy675-settings-title');
      const sub=row.querySelector('small,.vy675-settings-subtitle');
      if(title&&/privacy|security/i.test(title.textContent||''))title.textContent='Sign-in & privacy';
      if(sub)sub.textContent='Account password, OTP and privacy options';
    });
  }

  function syncSystemBars(){
    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light());
    }catch(_){ }
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',light()?'#f5f5f7':'#000000');
  }

  function removeThemeDebris(){
    document.querySelectorAll('.android-nav-glass-indicator,.vy852-theme-bloom,.vy853-theme-reveal,.vy854-theme-wipe,.vy855-theme-curtain,.theme-ripple,.vx657-theme-crossfade,.vy856-liquid-lens,.vy856-liquid-orb').forEach(node=>node.remove());
  }

  function normalize(){
    unlockPasswordTab();
    simplifySecuritySettings();
    syncSystemBars();
    removeThemeDebris();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }

  const observer=new MutationObserver(schedule);
  function init(){
    normalize();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.addEventListener('load',schedule,{once:true});
})();
