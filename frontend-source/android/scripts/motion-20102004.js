/* Vyapar AI — Telegram-inspired compositor motion owner.
 * One motion owner for pages, dialogs, sheets and transient UI.
 * Page navigation keeps the outgoing screen alive through the same paint cycle,
 * then animates outgoing + incoming surfaces together before cleanup.
 */
(function(){
  'use strict';
  if(window.vyaparMotion) return;

  const running=new WeakMap();
  const overlays=new WeakMap();
  const positions=Object.create(null);
  const ranks={home:0,business:1,sales:2,stock:3,analytics:4,upload:5,calculator:6,subscription:7,settings:8};
  const overlaySelector=[
    '.glass-dialog-overlay','.subscription-overlay','.shop-progress-overlay','.vx643-modal-overlay',
    '.production-overlay','.android-permission-overlay','.android-sheet-overlay','.account-delete-overlay',
    '.upgrade-plan-popup','.upgrade-popup-overlay','.vy6601-select-overlay','.plan-success-overlay','.vy-form-overlay'
  ].join(',');
  const cardSelector=[
    '[role="dialog"]','.android-sheet','.shop-progress-sheet','.production-modal','.subscription-dialog',
    '.glass-dialog-card','.vx643-modal','.vy6601-select-sheet','.upgrade-popup-box','.upgrade-plan-reference-card',
    '.account-delete-dialog','.modal-card','.sheet-content','.vy-form-sheet'
  ].join(',');
  const transientSelector='.glass-toast';
  const ease='cubic-bezier(.16,1,.3,1)';
  const easeSoft='cubic-bezier(.2,.8,.2,1)';
  const easeClose='cubic-bezier(.4,0,.2,1)';
  const closeSelector='#closeShopProgress,.android-sheet-close,#closeUpgradePopup,#closePlanSuccessPopup,#closeCancelPopup,#permissionLater,[data-glass-cancel],[data-glass-ok],[data-back-close],[data-update-later],.vy6601-select-head button,[data-cancel],#accountDeleteCancel,.production-close,.vx643-modal-close,[data-close]';
  const focusSelector='button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  const pageStyleProps=['position','top','left','right','bottom','width','height','margin','z-index','pointer-events','display','contain','isolation','transform','opacity','will-change','transition','backface-visibility','-webkit-backface-visibility'];
  let pageTransition=null,pageSequence=0;

  function reduced(){return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function duration(ms){
    if(reduced()) return 0;
    return document.documentElement.classList.contains('perf-lite') ? Math.round(ms*.72) : ms;
  }
  function css(node,prop,fallback){
    if(!node)return fallback;
    const inline=node.style && node.style.getPropertyValue ? node.style.getPropertyValue(prop) : '';
    if(inline)return inline;
    try{const value=getComputedStyle(node)[prop];return value==null||value===''?fallback:value;}catch(_){return fallback;}
  }
  function cancel(node){
    const job=node && running.get(node);
    if(job) job.cancel();
  }
  function saveInline(node,props){
    return props.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);
  }
  function restoreInline(node,saved){
    if(!node||!saved)return;
    saved.forEach(([prop,value,priority])=>{if(value)node.style.setProperty(prop,value,priority);else node.style.removeProperty(prop);});
  }

  function tween(node,from,to,ms,done,easing=ease){
    if(!node){if(done)done();return;}
    cancel(node);
    const time=duration(ms);
    if(!time || !node.isConnected){
      Object.keys(to||{}).forEach(p=>node.style.setProperty(p,to[p],'important'));
      if(done)done();
      return;
    }

    const keys=Object.keys(from);
    const props=['transition','will-change',...keys];
    const saved=props.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);
    let frame=0,timer=0,animation=null,finished=false;

    const restore=()=>{
      if(finished)return;
      finished=true;
      if(frame)cancelAnimationFrame(frame);
      if(timer)clearTimeout(timer);
      if(animation){try{animation.onfinish=null;animation.oncancel=null;animation.cancel();}catch(_){}}
      node.removeEventListener('transitionend',end);
      saved.forEach(([p,v,priority])=>{if(v)node.style.setProperty(p,v,priority);else node.style.removeProperty(p);});
      running.delete(node);
    };
    const finish=()=>{if(finished)return;restore();if(done)done();};
    const end=event=>{if(event.target===node && Object.prototype.hasOwnProperty.call(to,event.propertyName))finish();};
    running.set(node,{cancel:restore});

    if(typeof node.animate==='function'){
      try{
        const first={},last={};
        keys.forEach(k=>{first[k]=from[k];last[k]=to[k];});
        node.style.setProperty('will-change',keys.join(','),'important');
        animation=node.animate([first,last],{duration:time,easing,fill:'both',composite:'replace'});
        animation.onfinish=finish;
        animation.oncancel=()=>{};
        timer=setTimeout(finish,time+64);
        return;
      }catch(_){animation=null;}
    }

    node.style.setProperty('transition','none','important');
    node.style.setProperty('will-change',keys.join(','),'important');
    keys.forEach(p=>node.style.setProperty(p,from[p],'important'));
    node.addEventListener('transitionend',end);
    frame=requestAnimationFrame(()=>{
      if(finished)return;
      node.style.setProperty('transition',keys.map(p=>p+' '+time+'ms '+easing).join(','),'important');
      keys.forEach(p=>node.style.setProperty(p,to[p],'important'));
      timer=setTimeout(finish,time+56);
    });
  }

  function enter(node,direction){
    if(!node || reduced())return;
    cancel(node);
    const base=css(node,'transform','none');
    const rest=base==='none'?'':base+' ';
    const distance=Math.min(34,Math.round((window.innerWidth||360)*.095))*(direction<0?-1:1);
    tween(node,{transform:rest+'translate3d('+distance+'px,0,0)'},{transform:base},205,null,ease);
  }

  function stopPageTransition(){
    const active=pageTransition;
    if(!active)return;
    pageTransition=null;
    if(active.frame)cancelAnimationFrame(active.frame);
    if(active.frame2)cancelAnimationFrame(active.frame2);
    if(active.timer)clearTimeout(active.timer);
    (active.animations||[]).forEach(animation=>{try{animation.onfinish=null;animation.oncancel=null;animation.cancel();}catch(_){}});
    const outgoing=active.outgoing,incoming=active.incoming;
    if(outgoing){
      restoreInline(outgoing,active.outgoingStyle);
      outgoing.classList.remove('vy-page-outgoing');
      outgoing.setAttribute('aria-hidden','true');
    }
    if(incoming){
      restoreInline(incoming,active.incomingStyle);
      incoming.classList.remove('vy-page-incoming');
      incoming.removeAttribute('aria-hidden');
    }
    document.documentElement.classList.remove('vy-page-transitioning');
  }

  function pageRect(node){
    try{
      if(node&&typeof node.getBoundingClientRect==='function'){
        const rect=node.getBoundingClientRect();
        if(rect&&Number.isFinite(rect.width)&&rect.width>0)return {top:rect.top,left:rect.left,width:rect.width,height:rect.height};
      }
    }catch(_){}
    return {top:0,left:0,width:Math.max(1,window.innerWidth||360),height:Math.max(1,window.innerHeight||640)};
  }

  function animatePagePair(context,incoming,direction){
    const outgoing=context && context.previousNode;
    if(!outgoing||!incoming||outgoing===incoming||reduced())return false;
    stopPageTransition();

    const time=duration(218);
    if(!time)return false;
    const token=++pageSequence;
    const active={token,outgoing,incoming,animations:[],frame:0,frame2:0,timer:0,
      outgoingStyle:saveInline(outgoing,pageStyleProps),incomingStyle:saveInline(incoming,pageStyleProps)};
    pageTransition=active;

    const rect=context.previousRect||pageRect(outgoing);
    const width=Math.max(1,Number(rect.width)||window.innerWidth||360);
    const incomingDistance=Math.min(46,Math.max(28,Math.round(width*.12)))*(direction<0?-1:1);
    const outgoingDistance=Math.min(18,Math.max(10,Math.round(width*.045)))*(direction<0?1:-1);
    const incomingBase=css(incoming,'transform','none');
    const outgoingBase=css(outgoing,'transform','none');
    const incomingRest=incomingBase==='none'?'':incomingBase+' ';
    const outgoingRest=outgoingBase==='none'?'':outgoingBase+' ';

    outgoing.classList.add('vy-page-outgoing');
    incoming.classList.add('vy-page-incoming');
    outgoing.setAttribute('aria-hidden','true');
    incoming.removeAttribute('aria-hidden');
    document.documentElement.classList.add('vy-page-transitioning');

    /* Keep .hide on the outgoing screen so app/navigation state still sees only the destination.
       Inline display overrides .hide only for this compositor handoff. */
    outgoing.style.setProperty('display','block','important');
    outgoing.style.setProperty('position','fixed','important');
    outgoing.style.setProperty('top',Math.round(rect.top||0)+'px','important');
    outgoing.style.setProperty('left',Math.round(rect.left||0)+'px','important');
    outgoing.style.setProperty('right','auto','important');
    outgoing.style.setProperty('bottom','auto','important');
    outgoing.style.setProperty('width',Math.ceil(width)+'px','important');
    outgoing.style.setProperty('height','auto','important');
    outgoing.style.setProperty('margin','0','important');
    outgoing.style.setProperty('z-index','2','important');
    outgoing.style.setProperty('pointer-events','none','important');
    outgoing.style.setProperty('contain','paint','important');
    outgoing.style.setProperty('backface-visibility','hidden','important');
    outgoing.style.setProperty('-webkit-backface-visibility','hidden','important');

    incoming.style.setProperty('position','relative','important');
    incoming.style.setProperty('z-index','3','important');
    incoming.style.setProperty('backface-visibility','hidden','important');
    incoming.style.setProperty('-webkit-backface-visibility','hidden','important');
    outgoing.style.setProperty('will-change','transform','important');
    incoming.style.setProperty('will-change','transform','important');

    const finish=()=>{if(pageTransition===active)stopPageTransition();};
    const outgoingFrom=outgoingBase;
    const outgoingTo=outgoingRest+'translate3d('+outgoingDistance+'px,0,0)';
    const incomingFrom=incomingRest+'translate3d('+incomingDistance+'px,0,0)';
    const incomingTo=incomingBase;

    if(typeof incoming.animate==='function'&&typeof outgoing.animate==='function'){
      try{
        const outAnim=outgoing.animate([{transform:outgoingFrom},{transform:outgoingTo}],{duration:time,easing:ease,fill:'both',composite:'replace'});
        const inAnim=incoming.animate([{transform:incomingFrom},{transform:incomingTo}],{duration:time,easing:ease,fill:'both',composite:'replace'});
        active.animations.push(outAnim,inAnim);
        inAnim.onfinish=finish;
        inAnim.oncancel=()=>{};
        active.timer=setTimeout(finish,time+48);
        return true;
      }catch(_){active.animations.length=0;}
    }

    outgoing.style.setProperty('transition','none','important');
    incoming.style.setProperty('transition','none','important');
    outgoing.style.setProperty('transform',outgoingFrom,'important');
    incoming.style.setProperty('transform',incomingFrom,'important');
    /* Two frames intentionally: frame 1 commits the start pose; frame 2 starts movement.
       This avoids WebView coalescing start/end styles into a hard cut. */
    active.frame=requestAnimationFrame(()=>{
      if(pageTransition!==active)return;
      active.frame2=requestAnimationFrame(()=>{
        if(pageTransition!==active)return;
        const transition='transform '+time+'ms '+ease;
        outgoing.style.setProperty('transition',transition,'important');
        incoming.style.setProperty('transition',transition,'important');
        outgoing.style.setProperty('transform',outgoingTo,'important');
        incoming.style.setProperty('transform',incomingTo,'important');
        active.timer=setTimeout(finish,time+48);
      });
    });
    return true;
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
    /* A rapid tap settles the old handoff first, making the current destination the only live screen. */
    stopPageTransition();
    const top=Math.max(0,window.scrollY || (document.scrollingElement||document.documentElement).scrollTop || 0);
    positions[previous]=top;
    const previousNode=document.getElementById('screen-'+previous);
    cancel(previousNode);cancel(document.getElementById('screen-'+next));
    return {previous,next,previousNode,previousRect:pageRect(previousNode),top:autoTop()?0:(Object.prototype.hasOwnProperty.call(positions,next)?positions[next]:0)};
  }
  function afterPage(context,node){
    if(!context || !node)return;
    scrollToPosition(context.top);
    if(context.previous!==context.next && !document.documentElement.classList.contains('vy855-booting')){
      const direction=(ranks[context.next]||0)<(ranks[context.previous]||0)?-1:1;
      if(!animatePagePair(context,node,direction))enter(node,direction);
    }
  }

  function visible(node){return node && node.isConnected && !node.hidden && css(node,'display','block')!=='none' && css(node,'visibility','visible')!=='hidden';}
  function topOverlay(){return Array.from(document.querySelectorAll(overlaySelector)).filter(visible).pop();}
  function focusables(node){return Array.from(node.querySelectorAll(focusSelector)).filter(el=>visible(el) && el.getClientRects().length);}
  function isSheet(overlay,card){
    if(overlay && overlay.matches && overlay.matches('.vy-form-overlay'))return true;
    return !!(card && ((typeof card.matches==='function' && card.matches('.android-sheet,.shop-progress-sheet,.vy6601-select-sheet,.sheet-content')) || (typeof overlay.matches==='function' && overlay.matches('.android-sheet-overlay,.shop-progress-overlay,.vy6601-select-overlay'))));
  }
  function guardOverlay(overlay){
    if(!overlay || overlay.__vyMotionGuard)return;
    overlay.__vyMotionGuard=true;
    overlay.addEventListener('click',event=>{
      if(overlay.__vyClosing){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  function registerOverlay(overlay){
    const card=overlay && overlay.querySelector ? overlay.querySelector(cardSelector) : null;
    if(!overlay || !card)return null;
    const info={card,trigger:document.activeElement,finish:null,sheet:isSheet(overlay,card)};
    overlays.set(overlay,info);guardOverlay(overlay);return info;
  }

  function openOverlay(overlay){
    if(overlays.has(overlay) || !visible(overlay) || overlay.__vyClosing)return;
    const info=registerOverlay(overlay);if(!info)return;
    const card=info.card,sheet=info.sheet;
    cancel(card);cancel(overlay);
    const base=css(card,'transform','none');
    const rest=base==='none'?'':base+' ';
    tween(overlay,{opacity:'0'},{opacity:'1'},sheet?145:125,null,easeSoft);
    const fullSheet=typeof overlay.matches==='function' && overlay.matches('.vy-form-overlay,.shop-progress-overlay');
    tween(card,{transform:rest+(fullSheet?'translate3d(0,100%,0)':'translate3d(0,'+(sheet?'22':'10')+'px,0) scale('+(sheet?'.996':'.992')+')')},{transform:base},fullSheet?280:sheet?220:185,null,ease);
    requestAnimationFrame(()=>{
      if(!overlay.isConnected || overlay.__vyClosing)return;
      if(!overlay.contains(document.activeElement)){
        const target=focusables(card)[0]||card;
        if(target===card)card.setAttribute('tabindex','-1');
        try{target.focus({preventScroll:true});}catch(_){ }
      }
    });
  }

  function cancelOverlay(overlay){
    const info=overlays.get(overlay);cancel(overlay);if(info)cancel(info.card);
    if(info && info.finish)info.finish();overlays.delete(overlay);
  }

  function closeOverlay(overlay,callback){
    if(!overlay){if(callback)callback();return;}
    if(overlay.__vyClosing)return;
    let info=overlays.get(overlay);
    if(!info)info=registerOverlay(overlay)||{card:overlay.querySelector?overlay.querySelector(cardSelector):null,trigger:null,sheet:false};
    overlay.__vyClosing=true;overlay.style.setProperty('pointer-events','auto','important');
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;cancel(overlay);cancel(info.card);overlays.delete(overlay);
      if(callback)callback();else overlay.remove();
      if(info.trigger && info.trigger.isConnected && (document.activeElement===document.body || (overlay.contains && overlay.contains(document.activeElement)))){
        try{info.trigger.focus({preventScroll:true});}catch(_){ }
      }
    };
    info.finish=finish;overlays.set(overlay,info);
    if(!duration(120)){finish();return;}
    const card=info.card,overlayOpacity=css(overlay,'opacity','1');
    const fullSheet=typeof overlay.matches==='function' && overlay.matches('.vy-form-overlay,.shop-progress-overlay');
    if(card){
      const currentTransform=css(card,'transform','none');cancel(card);
      const rest=currentTransform==='none'?'':currentTransform+' ';
      tween(card,{transform:currentTransform},{transform:rest+(fullSheet?'translate3d(0,100%,0)':'translate3d(0,'+(info.sheet?'14':'7')+'px,0) scale('+(info.sheet?'.997':'.995')+')')},fullSheet?180:info.sheet?145:120,null,easeClose);
    }
    cancel(overlay);tween(overlay,{opacity:overlayOpacity},{opacity:'0'},fullSheet?180:info.sheet?145:120,finish,easeClose);
  }

  function dismissTop(){
    const overlay=topOverlay();if(!overlay)return false;if(overlay.__vyClosing)return true;
    const close=overlay.querySelector(closeSelector);if(close){close.click();return true;}return false;
  }

  window.vyaparMotion={enter,cancel,scrollTo:scrollToPosition,beforePage,afterPage,openOverlay,closeOverlay,cancelOverlay,dismissTop,stopPageTransition};

  function boot(){
    document.documentElement.classList.add('vy-motion-ready');
    document.querySelectorAll(overlaySelector).forEach(openOverlay);
    const observer=new MutationObserver(records=>{
      records.forEach(record=>{
        if(record.type==='attributes'){
          const node=record.target;
          if(node.nodeType===1 && (typeof node.matches==='function' && node.matches(overlaySelector)) && visible(node) && !overlays.has(node))openOverlay(node);
          return;
        }
        record.addedNodes.forEach(node=>{
          if(node.nodeType!==1)return;
          if((typeof node.matches==='function' && node.matches(overlaySelector)))openOverlay(node);
          if(typeof node.querySelectorAll==='function')node.querySelectorAll(overlaySelector).forEach(openOverlay);
          if(typeof node.matches==='function' && node.matches(transientSelector)){
            const base=css(node,'transform','none');const rest=base==='none'?'':base+' ';
            tween(node,{transform:rest+'translate3d(0,5px,0)'},{transform:base},150,null,ease);
          }
        });
      });
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
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
        Array.from(event.target.children).filter(node=>node.tagName!=='SUMMARY').forEach(node=>{
          cancel(node);const base=css(node,'transform','none');const rest=base==='none'?'':base+' ';
          tween(node,{transform:rest+'translate3d(0,-4px,0)'},{transform:base},145,null,ease);
        });
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
