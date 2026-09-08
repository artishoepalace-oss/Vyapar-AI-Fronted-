/* Vyapar AI — one motion owner for navigation, forms and dialogs.
 * Transitions use transform/opacity only. No page clones, frame loops or API changes.
 * Inline priorities intentionally supersede legacy animation:none UI layers.
 */
(function(){
  'use strict';
  if(window.vyaparMotion) return;
  const running=new WeakMap();
  const overlays=new WeakMap();
  const positions=Object.create(null);
  const ranks={home:0,business:1,sales:2,stock:3,analytics:4,upload:5,calculator:6,subscription:7,settings:8};
  const overlaySelector='.glass-dialog-overlay,.subscription-overlay,.shop-progress-overlay,.vx643-modal-overlay,.production-overlay,.android-permission-overlay,.android-sheet-overlay,.account-delete-overlay,.upgrade-plan-popup,.vy6601-select-overlay';
  const closeSelector='#closeShopProgress,.android-sheet-close,#closeUpgradePopup,#closePlanSuccessPopup,#closeCancelPopup,#permissionLater,[data-glass-cancel],[data-glass-ok],[data-back-close],[data-update-later],.vy6601-select-head button,[data-cancel],#accountDeleteCancel,.production-close,.vx643-modal-close,[data-close]';
  const focusSelector='button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  function reduced(){return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function duration(ms){
    if(reduced()) return 0;
    // Auto still has motion on Android 7/8; Lite shortens motion instead of removing it.
    return document.documentElement.classList.contains('perf-lite') ? Math.round(ms*.8) : ms;
  }
  function cancel(node){ const job=node && running.get(node); if(job) job.cancel(); }
  function tween(node,from,to,ms,done){
    if(!node) {if(done)done();return;}
    cancel(node);
    const time=duration(ms);
    if(!time || !node.isConnected){if(done)done();return;}
    const props=['transition','will-change',...Object.keys(from)];
    const saved=props.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);
    let frame=0,timer=0,finished=false;
    const restore=()=>{
      if(finished)return;
      finished=true; cancelAnimationFrame(frame); clearTimeout(timer);
      node.removeEventListener('transitionend',end);
      node.style.setProperty('transition','none','important');
      saved.filter(entry=>entry[0]!=='transition').forEach(([p,v,priority])=>{if(v)node.style.setProperty(p,v,priority);else node.style.removeProperty(p);});
      const entry=saved[0]; if(entry[1])node.style.setProperty(entry[0],entry[1],entry[2]);else node.style.removeProperty(entry[0]);
      running.delete(node);
    };
    const finish=()=>{if(finished)return;restore();if(done)done();};
    const end=event=>{if(event.target===node && Object.prototype.hasOwnProperty.call(to,event.propertyName))finish();};
    running.set(node,{cancel:restore});
    node.style.setProperty('transition','none','important');
    node.style.setProperty('will-change',Object.keys(from).join(','),'important');
    Object.keys(from).forEach(p=>node.style.setProperty(p,from[p],'important'));
    // One bounded layout read per interaction establishes the first transition frame.
    void node.offsetWidth;
    node.addEventListener('transitionend',end);
    frame=requestAnimationFrame(()=>{
      if(finished)return;
      node.style.setProperty('transition',Object.keys(to).map(p=>p+' '+time+'ms cubic-bezier(.22,.75,.2,1)').join(','),'important');
      Object.keys(to).forEach(p=>node.style.setProperty(p,to[p],'important'));
      timer=setTimeout(finish,time+64);
    });
  }
  function enter(node,direction){
    if(!node || reduced())return;
    cancel(node);
    const base=getComputedStyle(node).transform;
    const rest=base==='none'?'':base+' ';
    const distance=Math.min(64,Math.round((window.innerWidth||360)*.16))*(direction<0?-1:1);
    tween(node,{transform:rest+'translate3d('+distance+'px,0,0)',opacity:'.94'},{transform:base,opacity:'1'},290);
  }
  function scrollToPosition(top){
    const roots=[document.documentElement,document.body,document.scrollingElement].filter((node,index,all)=>node && all.indexOf(node)===index);
    const saved=roots.map(node=>[node,node.style.getPropertyValue('scroll-behavior'),node.style.getPropertyPriority('scroll-behavior')]);
    roots.forEach(node=>node.style.setProperty('scroll-behavior','auto','important'));
    window.scrollTo(0,Math.max(0,Number(top)||0));
    saved.forEach(([node,value,priority])=>{if(value)node.style.setProperty('scroll-behavior',value,priority);else node.style.removeProperty('scroll-behavior');});
  }
  function autoTop(){try{return typeof state!=='undefined' && state.settings && state.settings.autoScrollTop===true;}catch(_){return false;}}
  function beforePage(previous,next){
    const top=Math.max(0,window.scrollY || (document.scrollingElement||document.documentElement).scrollTop || 0);
    positions[previous]=top;
    cancel(document.getElementById('screen-'+previous));
    return {previous,next,top: autoTop()?0:(Object.prototype.hasOwnProperty.call(positions,next)?positions[next]:0)};
  }
  function afterPage(context,node){
    if(!context || !node)return;
    scrollToPosition(context.top);
    if(context.previous!==context.next && !document.documentElement.classList.contains('vy855-booting')){
      enter(node,(ranks[context.next]||0)<(ranks[context.previous]||0)?-1:1);
    }
  }
  function visible(node){return node && node.isConnected && !node.hidden && getComputedStyle(node).display!=='none' && getComputedStyle(node).visibility!=='hidden';}
  function topOverlay(){return Array.from(document.querySelectorAll(overlaySelector)).filter(visible).pop();}
  function focusables(node){return Array.from(node.querySelectorAll(focusSelector)).filter(el=>visible(el) && el.getClientRects().length);}
  function openOverlay(overlay){
    if(overlays.has(overlay) || !visible(overlay))return;
    const card=overlay.querySelector('[role="dialog"],.android-sheet,.shop-progress-sheet,.production-modal');
    if(!card)return;
    const info={card,trigger:document.activeElement,finish:null};
    overlays.set(overlay,info);
    overlay.addEventListener('click',event=>{
      if(overlay.__vyClosing){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    cancel(card);
    const base=getComputedStyle(card).transform;
    const rest=base==='none'?'':base+' ';
    tween(overlay,{opacity:'.25'},{opacity:'1'},220);
    tween(card,{transform:rest+'translate3d(0,32px,0) scale(.975)'},{transform:base},290);
    requestAnimationFrame(()=>{
      if(!overlay.isConnected || overlay.__vyClosing)return;
      if(!overlay.contains(document.activeElement)){
        const target=focusables(card)[0]||card;
        if(target===card)card.setAttribute('tabindex','-1');
        try{target.focus({preventScroll:true});}catch(_){}
      }
    });
  }
  function cancelOverlay(overlay){
    const info=overlays.get(overlay);
    cancel(overlay); if(info)cancel(info.card);
    if(info && info.finish)info.finish();
    overlays.delete(overlay);
  }
  function closeOverlay(overlay,callback){
    if(!overlay){if(callback)callback();return;}
    if(overlay.__vyClosing)return;
    if(!overlays.has(overlay))openOverlay(overlay);
    const info=overlays.get(overlay)||{card:overlay.querySelector('[role="dialog"]'),trigger:null};
    overlay.__vyClosing=true;
    // Freeze repeated clicks while keeping the backdrop in place during the exit.
    overlay.style.setProperty('pointer-events','auto','important');
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;
      cancel(overlay);cancel(info.card);overlays.delete(overlay);
      if(callback)callback();else overlay.remove();
      if(info.trigger && info.trigger.isConnected && (document.activeElement===document.body || overlay.contains(document.activeElement))){
        try{info.trigger.focus({preventScroll:true});}catch(_){}
      }
    };
    info.finish=finish;overlays.set(overlay,info);
    cancel(overlay);cancel(info.card);
    if(!duration(180)){finish();return;}
    const card=info.card;
    if(card){const base=getComputedStyle(card).transform; tween(card,{transform:base},{transform:(base==='none'?'':base+' ')+'translate3d(0,22px,0) scale(.98)'},180);}
    tween(overlay,{opacity:'1'},{opacity:'0'},180,finish);
  }
  function dismissTop(){
    const overlay=topOverlay();
    if(!overlay)return false;
    if(overlay.__vyClosing)return true;
    const close=overlay.querySelector(closeSelector);
    if(close){close.click();return true;}
    return false;
  }
  window.vyaparMotion={enter,cancel,scrollTo:scrollToPosition,beforePage,afterPage,openOverlay,closeOverlay,cancelOverlay,dismissTop};
  function boot(){
    document.documentElement.classList.add('vy-motion-ready');
    document.querySelectorAll(overlaySelector).forEach(openOverlay);
    new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node.nodeType!==1)return;
        if(node.matches(overlaySelector))openOverlay(node);
        node.querySelectorAll(overlaySelector).forEach(openOverlay);
      }));
    }).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('keydown',event=>{
      const overlay=topOverlay();if(!overlay)return;
      if(event.key==='Escape' && dismissTop()){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.key!=='Tab')return;
      const items=focusables(overlay);if(!items.length){event.preventDefault();return;}
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey && (document.activeElement===first || !overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
    },true);
    document.addEventListener('toggle',event=>{
      if(event.target.tagName==='DETAILS' && event.target.open){
        Array.from(event.target.children).filter(node=>node.tagName!=='SUMMARY').forEach(node=>enter(node,1));
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
