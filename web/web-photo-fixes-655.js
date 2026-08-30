/* Vyapar AI Web 6.5.5 — photo-driven DOM stabilizers. Web only. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('web-ui')) return;

  function normalizeFooter(){
    var app=document.querySelector('.app');
    var footer=document.getElementById('appLegalFooter');
    if(!app||!footer) return false;
    if(app.lastElementChild!==footer) app.appendChild(footer);
    footer.setAttribute('aria-label','Vyapar AI legal links');
    return true;
  }

  function normalizeLocks(root){
    (root||document).querySelectorAll('svg.android-nav-lock,svg.premium-lock-icon,svg.android-lock-icon').forEach(function(svg){
      svg.setAttribute('width',svg.classList.contains('android-nav-lock')?'13':'16');
      svg.setAttribute('height',svg.classList.contains('android-nav-lock')?'13':'16');
      svg.setAttribute('focusable','false');
      svg.setAttribute('aria-hidden','true');
    });
  }

  function repair(){
    normalizeFooter();
    normalizeLocks(document);
  }

  repair();
  requestAnimationFrame(repair);
  setTimeout(repair,80);
  setTimeout(repair,350);

  var observer=new MutationObserver(function(mutations){
    var needs=false;
    for(var i=0;i<mutations.length;i++){
      if(mutations[i].addedNodes&&mutations[i].addedNodes.length){needs=true;break;}
    }
    if(needs) requestAnimationFrame(repair);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
