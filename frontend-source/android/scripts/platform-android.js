/* Android auth tab indicator enhancer. Tabs remain tap-only to avoid accidental mode changes. */
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
    function sync(){
      tabs.classList.toggle('otp-selected',otp.classList.contains('active'));
    }
    sync();

    new MutationObserver(sync).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class','aria-selected']});

    pass.addEventListener('click',function(){setTimeout(sync,0)});
    otp.addEventListener('click',function(){setTimeout(sync,0)});
    return true;
  }

  if(!bind()){
    var observer=new MutationObserver(function(){ if(bind()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
