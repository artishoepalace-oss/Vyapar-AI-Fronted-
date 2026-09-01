(() => {
  'use strict';

  function removeLegacyInfo(){
    document.querySelectorAll('.cu-help').forEach(node => node.remove());
    document.querySelectorAll('.p2-form-intro').forEach(node => {
      const text=String(node.textContent||'').replace(/\s+/g,' ').trim();
      if(/^quick tip$/i.test(text)) node.remove();
    });
  }

  let queued=false;
  const schedule=()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;removeLegacyInfo();});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{removeLegacyInfo();},{once:true});
  else removeLegacyInfo();

  if(window.MutationObserver){
    const observer=new MutationObserver(records=>{
      if(records.some(r=>r.addedNodes&&r.addedNodes.length)) schedule();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
