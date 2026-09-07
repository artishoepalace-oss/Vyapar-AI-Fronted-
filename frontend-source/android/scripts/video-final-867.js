/* Vyapar AI 8.6.7 — runtime guard for the exact glitches recorded on Android. */
(function(){
  'use strict';
  if(window.__vy867VideoFinalFix) return;
  window.__vy867VideoFinalFix = true;

  function important(el, prop, value){
    if(el && el.style) el.style.setProperty(prop, value, 'important');
  }

  function flatten(el, removePadding){
    if(!el) return;
    important(el,'background','transparent');
    important(el,'background-image','none');
    important(el,'border','0');
    important(el,'box-shadow','none');
    important(el,'backdrop-filter','none');
    important(el,'-webkit-backdrop-filter','none');
    if(removePadding) important(el,'padding','0');
  }

  function fixHomeSurfaces(){
    var home=document.getElementById('screen-home');
    if(!home) return;
    home.querySelectorAll('.home-section').forEach(function(el){ flatten(el,false); });
    var mount=home.querySelector('#homeQuickActionsMount');
    flatten(mount,true);
    home.querySelectorAll('.android-quick-actions,.home-metrics').forEach(function(el){
      flatten(el,true);
      important(el,'overflow','visible');
    });
    home.querySelectorAll('.home-metric-head').forEach(function(el){ flatten(el,true); });
  }

  var customersSvg='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.5-4.7 5.5-4.7s5 1.7 5.5 4.7"/><circle cx="17.2" cy="9" r="2.4"/><path d="M15.3 13.7c2.8-.5 5.1 1 5.6 4.3"/></svg>';
  function fixCustomersIcon(){
    var business=document.getElementById('screen-business');
    if(!business) return;
    business.querySelectorAll('.vx621-feature-card').forEach(function(card){
      var text=(card.textContent||'').replace(/\s+/g,' ').trim();
      if(!/Customers\s*&\s*Udhaar/i.test(text)) return;
      var icon=card.querySelector('.vx621-feature-icon');
      if(!icon || icon.dataset.vy867Monochrome==='1') return;
      icon.innerHTML=customersSvg;
      icon.dataset.vy867Monochrome='1';
      icon.classList.add('vy867-mono-customers');
    });
  }

  function fixNav(){
    var nav=document.getElementById('nav');
    if(!nav) return;
    nav.querySelectorAll('button').forEach(function(btn){
      important(btn,'filter','none');
      important(btn,'text-shadow','none');
    });
  }

  function fixUpdateButton(){
    var settings=document.getElementById('screen-settings');
    if(!settings || settings.getAttribute('data-vy675-page')!=='update') return;
    var card=settings.querySelector('#fs607Settings');
    if(!card) return;
    card.querySelectorAll('button,.btn').forEach(function(btn){
      important(btn,'background','#222428');
      important(btn,'background-image','none');
      important(btn,'border','1px solid #3b3f45');
      important(btn,'color','#fff');
      important(btn,'box-shadow','none');
    });
  }

  function fixMoreGeometry(){
    var overlay=document.getElementById('androidMoreSheet');
    if(!overlay) return;
    important(overlay,'padding','0');
    var sheet=overlay.querySelector('.android-sheet');
    if(!sheet) return;
    important(sheet,'position','absolute');
    important(sheet,'left',window.innerWidth<=390?'6px':'8px');
    important(sheet,'right',window.innerWidth<=390?'6px':'8px');
    important(sheet,'top','auto');
    important(sheet,'bottom','calc('+(window.innerWidth<=390?'80px':'82px')+' + env(safe-area-inset-bottom,0px))');
    important(sheet,'width','auto');
    important(sheet,'margin','0 auto');
    important(sheet,'transform','none');
    important(sheet,'border-radius',window.innerWidth<=390?'22px':'24px');
  }

  var queued=false;
  function repair(){
    queued=false;
    fixHomeSurfaces();
    fixCustomersIcon();
    fixNav();
    fixUpdateButton();
    fixMoreGeometry();
  }
  function queueRepair(){
    if(queued) return;
    queued=true;
    (window.requestAnimationFrame||function(cb){return setTimeout(cb,16);})(repair);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',repair,{once:true});
  else repair();
  window.addEventListener('resize',queueRepair,{passive:true});
  document.addEventListener('click',function(){setTimeout(queueRepair,0);},true);
  new MutationObserver(queueRepair).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-vy675-page']});
  setTimeout(repair,120);
  setTimeout(repair,500);
})();
