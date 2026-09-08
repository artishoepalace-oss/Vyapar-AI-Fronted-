/* Vyapar AI — Android 7–16 runtime performance profile (2026-09-01) */
(function(){
  'use strict';
  var root=document.documentElement;
  if(!root || !root.classList.contains('native-android')) return;

  function n(v,d){ v=Number(v); return isFinite(v)?v:d; }
  function androidApi(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.getAndroidSdkInt==='function'){
        return n(window.AndroidApp.getAndroidSdkInt(),0);
      }
    }catch(e){}
    var m=(navigator.userAgent||'').match(/Android\s([0-9]+)/i);
    var major=m?n(m[1],0):0;
    if(major===7) return 24;
    if(major===8) return 26;
    if(major===9) return 28;
    if(major===10) return 29;
    if(major===11) return 30;
    if(major===12) return 31;
    if(major===13) return 33;
    if(major===14) return 34;
    if(major===15) return 35;
    if(major>=16) return 36;
    return 0;
  }
  function nativeMemoryMb(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.getMemoryClassMb==='function'){
        return n(window.AndroidApp.getMemoryClassMb(),0);
      }
    }catch(e){}
    return 0;
  }
  function nativeLowRam(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.isLowRamDevice==='function'){
        return !!window.AndroidApp.isLowRamDevice();
      }
    }catch(e){}
    return false;
  }

  var api=androidApi();
  var cores=n(navigator.hardwareConcurrency,0);
  var deviceMemory=n(navigator.deviceMemory,0);
  var memoryMb=nativeMemoryMb();
  var lowRam=nativeLowRam() || (deviceMemory>0 && deviceMemory<=2) || (memoryMb>0 && memoryMb<=192);

  var tier='modern';
  if((api>0 && api<=27) || lowRam) tier='legacy';
  else if((api>0 && api<=30) || (cores>0 && cores<=4) || (deviceMemory>0 && deviceMemory<=4)) tier='mid';

  root.classList.remove('perf-tier-legacy','perf-tier-mid','perf-tier-modern','perf-low-ram');
  root.classList.add('perf-tier-'+tier);
  if(lowRam) root.classList.add('perf-low-ram');
  if(api) root.setAttribute('data-android-api',String(api));
  root.setAttribute('data-perf-tier',tier);
  if(memoryMb) root.setAttribute('data-memory-class-mb',String(memoryMb));

  /* Do not mutate layout continuously. Toggle one cheap class at gesture start/end. */
  var scrollTimer=0;
  var scrollFrame=0;
  var scrolling=false;
  function markScrolling(){
    scrollFrame=0;
    if(!scrolling){ scrolling=true; root.classList.add('perf-scrolling'); }
  }
  function beginScroll(){
    if(!scrolling && !scrollFrame) scrollFrame=requestAnimationFrame(markScrolling);
    if(scrollTimer) clearTimeout(scrollTimer);
    scrollTimer=setTimeout(endScroll,140);
  }
  function endScroll(){
    if(scrollFrame){ cancelAnimationFrame(scrollFrame); scrollFrame=0; }
    if(scrollTimer){ clearTimeout(scrollTimer); scrollTimer=0; }
    if(scrolling){ scrolling=false; root.classList.remove('perf-scrolling'); }
  }
  window.addEventListener('scroll',beginScroll,{passive:true});
  /* One touchstart is cheaper than doing JS work on every touchmove frame. */
  document.addEventListener('touchstart',beginScroll,{passive:true});
  document.addEventListener('touchend',function(){
    if(scrollTimer) clearTimeout(scrollTimer);
    scrollTimer=setTimeout(endScroll,90);
  },{passive:true});
  document.addEventListener('touchcancel',endScroll,{passive:true});
  document.addEventListener('visibilitychange',function(){ if(document.hidden) endScroll(); },{passive:true});
  window.addEventListener('pagehide',endScroll,{passive:true});

  /* Delay decoding of large, non-critical local artwork. The app logo remains eager. */
  function tuneImages(){
    var imgs=document.images||[];
    for(var i=0;i<imgs.length;i++){
      var img=imgs[i];
      if(!img || img.closest && img.closest('#appLoader')) continue;
      if(img.classList && (img.classList.contains('logo') || img.classList.contains('vy659-footer-logo'))) continue;
      try{ img.decoding='async'; }catch(e){}
      if(img.classList && img.classList.contains('upgrade-plan-reference-image')){
        try{ img.loading='lazy'; }catch(e){}
      }
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tuneImages,{once:true});
  else tuneImages();

  /* Razorpay downloads in parallel so it cannot hold the login/startup path.
     If a user reaches Plans unusually quickly, wait for that same script rather
     than showing a false "missing" error while it is still downloading. */
  window.vyaparWaitForRazorpay=function(timeoutMs){
    if(typeof window.Razorpay==='function') return Promise.resolve(window.Razorpay);
    var script=document.querySelector('script[src*="checkout.razorpay.com/v1/checkout.js"]');
    if(!script) return Promise.reject(new Error('Razorpay checkout script is unavailable'));
    return new Promise(function(resolve,reject){
      var settled=false;
      var timer=setTimeout(function(){ finish(new Error('Razorpay checkout timed out')); },Math.max(1000,n(timeoutMs,12000)));
      function cleanup(){
        clearTimeout(timer);
        script.removeEventListener('load',loaded);
        script.removeEventListener('error',failed);
      }
      function finish(error){
        if(settled) return;
        settled=true;
        cleanup();
        if(!error && typeof window.Razorpay==='function') resolve(window.Razorpay);
        else reject(error || new Error('Razorpay checkout did not initialize'));
      }
      function loaded(){ finish(null); }
      function failed(){ finish(new Error('Razorpay checkout could not be loaded')); }
      script.addEventListener('load',loaded,{once:true});
      script.addEventListener('error',failed,{once:true});
      if(typeof window.Razorpay==='function') finish(null);
    });
  };

  /* Exposed only for diagnostics/settings UI; no polling. */
  window.VyaparPerformanceProfile={api:api,tier:tier,lowRam:lowRam,cores:cores,memoryMb:memoryMb,deviceMemory:deviceMemory};
})();
