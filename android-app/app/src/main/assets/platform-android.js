/* Vyapar AI 6.4.2 — Android auth swipe + responsive label enhancer. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('native-android')) return;

  function bind(){
    var gate=document.getElementById('vyaparOtpGate');
    if(!gate) return false;
    var tabs=gate.querySelector('.auth-method-tabs');
    var pass=gate.querySelector('#tab-login-pass');
    var otp=gate.querySelector('#tab-login-otp');
    if(!tabs||!pass||!otp||tabs.dataset.swipeBound==='1') return !!tabs;

    tabs.dataset.swipeBound='1';
    pass.textContent='Login with Password';
    otp.textContent='Login with OTP';
    var help=gate.querySelector('.auth-help');
    if(help) help.textContent='Vyapar AI 6.5.9';

    var startX=null;
    function sync(){
      tabs.classList.toggle('otp-selected',otp.classList.contains('active'));
    }
    sync();

    new MutationObserver(sync).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class','aria-selected']});

    tabs.addEventListener('touchstart',function(e){
      if(e.touches&&e.touches.length===1) startX=e.touches[0].clientX;
    },{passive:true});
    tabs.addEventListener('touchend',function(e){
      if(startX===null||!e.changedTouches||!e.changedTouches.length) return;
      var dx=e.changedTouches[0].clientX-startX;
      startX=null;
      if(Math.abs(dx)<28) return;
      if(dx<0 && !otp.classList.contains('active')) otp.click();
      if(dx>0 && !pass.classList.contains('active')) pass.click();
    },{passive:true});

    pass.addEventListener('click',function(){setTimeout(sync,0)});
    otp.addEventListener('click',function(){setTimeout(sync,0)});
    return true;
  }

  if(!bind()){
    var observer=new MutationObserver(function(){ if(bind()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
