/* Vyapar AI — adaptive spring, inertia and compositor motion owner.
 * One motion owner for pages, dialogs, sheets, gestures and transient UI.
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
    '.upgrade-plan-popup','.upgrade-popup-overlay','.vy6601-select-overlay','.plan-success-overlay','.vy-form-overlay','.github-update-overlay'
  ].join(',');
  const cardSelector=[
    '[role="dialog"]','.android-sheet','.shop-progress-sheet','.production-modal','.subscription-dialog',
    '.glass-dialog-card','.vx643-modal','.vy6601-select-sheet','.upgrade-popup-box','.upgrade-plan-reference-card',
    '.account-delete-dialog','.modal-card','.sheet-content','.vy-form-sheet','.github-update-dialog'
  ].join(',');
  const transientSelector='.glass-toast';
  /* Cross-WebView damped-spring approximations. Values above 1 provide a tiny
     physical settle without the rubber-band look or per-frame layout work. */
  const ease='cubic-bezier(.18,.89,.32,1.12)';
  const easeSoft='cubic-bezier(.2,.82,.24,1.04)';
  const easeClose='cubic-bezier(.32,0,.2,1)';
  const pageEase='cubic-bezier(.18,.86,.22,1)';
  const moreEase='cubic-bezier(.18,.9,.22,1.08)';
  const physicsProfile={engine:'adaptive-damped-spring',scroll:'native-webview-fling',minAndroidApi:26};
  const closeSelector='#closeUpgradePopup,#closePlanSuccessPopup,#closeCancelPopup,#permissionLater,[data-glass-cancel],[data-glass-ok],[data-back-close],[data-update-later],.vy6601-select-head button,[data-cancel],#accountDeleteCancel,.production-close,.vx643-modal-close,[data-close]';
  const focusSelector='button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  const pageStyleProps=['position','top','left','right','bottom','width','height','margin','z-index','pointer-events','display','contain','isolation','transform','opacity','will-change','transition','backface-visibility','-webkit-backface-visibility'];
  let pageTransition=null,pendingNavigation=null,navigationDirection=null,settledNotice=0;

  function reduced(){return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function duration(ms){
    if(reduced()) return 0;
    return document.documentElement.classList.contains('perf-lite') ? Math.round(ms*.72) : ms;
  }
  function compactMotion(){
    const root=document.documentElement;
    // Older WebViews cannot clip sideways overflow without creating another
    // scrolling container. Use the bounded single-screen path on those engines.
    const canClip=window.CSS && typeof window.CSS.supports==='function' && window.CSS.supports('overflow','clip');
    return !canClip || root.classList.contains('perf-tier-legacy') || root.classList.contains('perf-low-ram');
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
  function renderedCss(node,prop,fallback){
    if(!node)return fallback;
    try{return getComputedStyle(node)[prop] || fallback;}catch(_){return css(node,prop,fallback);}
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

    // Inline transitions also override legacy !important transforms in old WebViews.
    if(typeof node.animate==='function' && !node.classList.contains('vy-unified-panel')){
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
    // Commit the starting pose before the next frame, including on older WebViews.
    node.getBoundingClientRect();
    timer=setTimeout(finish,Math.max(1100,time*3));
    frame=requestAnimationFrame(()=>{
      if(finished)return;
      node.style.setProperty('transition',keys.map(p=>p+' '+time+'ms '+easing).join(','),'important');
      keys.forEach(p=>node.style.setProperty(p,to[p],'important'));
      clearTimeout(timer);
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

  function stopPageTransition(flushPending=false){
    const active=pageTransition;
    if(!active)return;
    const next=flushPending?pendingNavigation:null;
    pendingNavigation=null;
    pageTransition=null;
    if(active.frame)cancelAnimationFrame(active.frame);
    if(active.timer)clearTimeout(active.timer);
    if(active.onEnd)active.incoming.removeEventListener('transitionend',active.onEnd);
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
    document.documentElement.classList.remove('vy-page-transitioning','vy-page-compact');
    if(next)next();
    // Legacy UI helpers can update content after the page finishes moving.
    // Notify after a paint instead of invalidating the animated layer.
    if(!settledNotice)settledNotice=setTimeout(()=>{
      settledNotice=0;
      if(!pageTransition&&typeof document.dispatchEvent==='function'&&typeof Event==='function'){
        document.dispatchEvent(new Event('vyapar-page-settled'));
      }
    },32);
  }

  function whenPageSettled(action){
    // Keep the visible slide intact; only the latest tap is replayed at its end.
    if(pageTransition){pendingNavigation=action;return true;}
    return action();
  }
  function navigate(tab,direction){
    return whenPageSettled(()=>{
      navigationDirection=direction===1||direction===-1?direction:null;
      try{return window.setTab(tab,false);}finally{navigationDirection=null;}
    });
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

    if(compactMotion()){
      /* Old GPUs stall while rasterizing two full-height screens. Keep the
         outgoing page hidden and animate only the already visible destination. */
      const time=duration(250);
      const distance=Math.min(24,Math.round((window.innerWidth||360)*.065))*(direction<0?-1:1);
      const base=css(incoming,'transform','none');
      const rest=base==='none'?'':base+' ';
      const active={outgoing,incoming,frame:0,timer:0,outgoingStyle:null,
        incomingStyle:saveInline(incoming,pageStyleProps)};
      pageTransition=active;
      outgoing.setAttribute('aria-hidden','true');
      incoming.removeAttribute('aria-hidden');
      incoming.classList.add('vy-page-incoming');
      document.documentElement.classList.add('vy-page-transitioning','vy-page-compact');
      incoming.style.setProperty('transition','none','important');
      incoming.style.setProperty('will-change','transform,opacity','important');
      incoming.style.setProperty('contain','paint','important');
      incoming.style.setProperty('transform',rest+'translate3d('+distance+'px,0,0)','important');
      incoming.style.setProperty('opacity','.94','important');
      const finish=()=>{if(pageTransition===active)stopPageTransition(true);};
      active.onEnd=event=>{if(event.target===incoming&&event.propertyName==='transform')finish();};
      incoming.addEventListener('transitionend',active.onEnd);
      active.timer=setTimeout(finish,Math.max(1000,time*3));
      // Give the WebView a paint opportunity without a synchronous full-page
      // layout read on the tap thread. The second frame starts the compositor.
      active.frame=requestAnimationFrame(()=>{
        if(pageTransition!==active)return;
        active.frame=requestAnimationFrame(()=>{
          if(pageTransition!==active)return;
          incoming.style.setProperty('transition','transform '+time+'ms '+pageEase+',opacity '+time+'ms '+pageEase,'important');
          incoming.style.setProperty('transform',base,'important');
          incoming.style.setProperty('opacity','1','important');
          clearTimeout(active.timer);
          active.timer=setTimeout(finish,time+96);
        });
      });
      return true;
    }

    const time=duration(460);
    if(!time)return false;
    const active={outgoing,incoming,frame:0,timer:0,
      outgoingStyle:saveInline(outgoing,pageStyleProps),incomingStyle:saveInline(incoming,pageStyleProps)};
    pageTransition=active;

    const rect=context.previousRect||pageRect(outgoing);
    const width=Math.max(1,Number(rect.width)||window.innerWidth||360);
    const travel=Math.max(width,window.innerWidth||width);
    const incomingDistance=travel*(direction<0?-1:1);
    const outgoingDistance=-incomingDistance;
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
    incoming.style.setProperty('pointer-events','none','important');
    incoming.style.setProperty('contain','paint','important');
    incoming.style.setProperty('backface-visibility','hidden','important');
    incoming.style.setProperty('-webkit-backface-visibility','hidden','important');
    outgoing.style.setProperty('will-change','transform','important');
    incoming.style.setProperty('will-change','transform','important');

    const finish=()=>{if(pageTransition===active)stopPageTransition(true);};
    const outgoingFrom=outgoingBase;
    const outgoingTo=outgoingRest+'translate3d('+outgoingDistance+'px,0,0)';
    const incomingFrom=incomingRest+'translate3d('+incomingDistance+'px,0,0)';
    const incomingTo=incomingBase;

    // CSS transitions override legacy !important screen transforms; Web Animations do not.
    // Move both real screens by one viewport, with no fade, cloning or rerendering.
    outgoing.style.setProperty('transition','none','important');
    incoming.style.setProperty('transition','none','important');
    outgoing.style.setProperty('transform',outgoingFrom,'important');
    incoming.style.setProperty('transform',incomingFrom,'important');
    incoming.getBoundingClientRect();
    active.onEnd=event=>{if(event.target===incoming&&event.propertyName==='transform')finish();};
    incoming.addEventListener('transitionend',active.onEnd);
    // If animation frames stop while the WebView is backgrounded or under
    // severe load, finish the handoff and replay the last navigation request.
    active.timer=setTimeout(finish,Math.max(1200,time*3));
    active.frame=requestAnimationFrame(()=>{
      if(pageTransition!==active)return;
      const transition='transform '+time+'ms '+pageEase;
      outgoing.style.setProperty('transition',transition,'important');
      incoming.style.setProperty('transition',transition,'important');
      outgoing.style.setProperty('transform',outgoingTo,'important');
      incoming.style.setProperty('transform',incomingTo,'important');
      clearTimeout(active.timer);
      active.timer=setTimeout(finish,time+96);
    });
    return true;
  }

  function scrollToPosition(top){
    const roots=[document.documentElement,document.body,document.scrollingElement].filter((node,index,all)=>node && all.indexOf(node)===index);
    const saved=roots.map(node=>[node,node.style.getPropertyValue('scroll-behavior'),node.style.getPropertyPriority('scroll-behavior')]);
    roots.forEach(node=>node.style.setProperty('scroll-behavior','auto','important'));
    const target=Math.max(0,Number(top)||0);
    // An explicit instant scroll also cancels a user/programmatic smooth scroll
    // before the destination is painted. Numeric scrollTo inherited old CSS.
    try{window.scrollTo({left:0,top:target,behavior:'instant'});}
    catch(_){window.scrollTo(0,target);}
    saved.forEach(([node,value,priority])=>{if(value)node.style.setProperty('scroll-behavior',value,priority);else node.style.removeProperty('scroll-behavior');});
  }
  function autoTop(){try{return typeof state!=='undefined' && state.settings && state.settings.autoScrollTop===true;}catch(_){return false;}}
  function beforePage(previous,next){
    /* Programmatic navigation can settle immediately; navbar/Back requests use navigate(). */
    // A popup can remove itself and navigate in the same callback. Release its
    // scroll lock before measuring/animating pages, not in a later observer
    // microtask that changes the viewport underneath the first slide frame.
    syncScrollLock();
    stopPageTransition();
    const top=Math.max(0,window.scrollY || (document.scrollingElement||document.documentElement).scrollTop || 0);
    positions[previous]=top;
    const previousNode=document.getElementById('screen-'+previous);
    cancel(previousNode);cancel(document.getElementById('screen-'+next));
    return {previous,next,direction:navigationDirection,previousNode,previousRect:compactMotion()?null:pageRect(previousNode),top:autoTop()?0:(Object.prototype.hasOwnProperty.call(positions,next)?positions[next]:0)};
  }
  function afterPage(context,node){
    if(!context || !node)return;
    scrollToPosition(context.top);
    if(context.previous!==context.next && !document.documentElement.classList.contains('vy855-booting')){
      const direction=context.direction || ((ranks[context.next]||0)<(ranks[context.previous]||0)?-1:1);
      if(!animatePagePair(context,node,direction))enter(node,direction);
    }
  }

  function visible(node){return node && node.isConnected && !node.hidden && css(node,'display','block')!=='none' && css(node,'visibility','visible')!=='hidden';}
  function topOverlay(){return Array.from(document.querySelectorAll(overlaySelector)).filter(visible).pop();}
  function syncScrollLock(){
    const locked=!!topOverlay();
    if(document.body.classList.contains('vy-popup-open')!==locked)document.body.classList.toggle('vy-popup-open',locked);
    if(document.documentElement.classList.contains('vy-popup-open')!==locked)document.documentElement.classList.toggle('vy-popup-open',locked);
  }
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
    // One surface contract for all app-owned dialogs. Native system dialogs stay native.
    overlay.classList.add('vy-unified-overlay');card.classList.add('vy-unified-panel');
    const info={card,trigger:overlay.__vyTrigger || document.activeElement,finish:null,focusTimer:0,sheet:true};
    const handle=card.querySelector('[data-sheet-dismiss]');
    if(handle && !handle.__vySwipe){
      handle.__vySwipe=true;
      let drag=null;
      const dragPoint=e=>(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0])||null;
      const resetDrag=(animateBack)=>{
        if(!drag)return;
        const state=drag;drag=null;
        const current=renderedCss(card,'transform',state.base);
        card.style.removeProperty('transition');
        overlay.style.removeProperty('transition');
        if(animateBack && card.isConnected){
          tween(card,{transform:current},{transform:state.base},260,null,ease);
          const opacity=renderedCss(overlay,'opacity','1');
          tween(overlay,{opacity},{opacity:'1'},170,null,easeSoft);
        }else{
          card.style.removeProperty('transform');
          overlay.style.removeProperty('opacity');
        }
      };
      handle.addEventListener('touchstart',e=>{
        const t=dragPoint(e);if(!t)return;
        cancel(card);cancel(overlay);
        const now=Date.now();
        drag={x:t.clientX,y:t.clientY,lastY:t.clientY,lastT:now,velocity:0,
          base:renderedCss(card,'transform','none'),height:Math.max(1,card.getBoundingClientRect().height||320)};
        card.style.setProperty('transition','none','important');
        overlay.style.setProperty('transition','none','important');
      },{passive:true});
      handle.addEventListener('touchmove',e=>{
        if(!drag)return;const t=dragPoint(e);if(!t)return;
        const dy=Math.max(0,t.clientY-drag.y),dx=Math.abs(t.clientX-drag.x);
        if(dx>dy+12)return;
        const now=Date.now(),dt=Math.max(8,now-drag.lastT);
        drag.velocity=(t.clientY-drag.lastY)/dt;drag.lastY=t.clientY;drag.lastT=now;
        const resisted=dy<120?dy*.82:98.4+(dy-120)*.56;
        const rest=drag.base==='none'?'':drag.base+' ';
        card.style.setProperty('transform',rest+'translate3d(0,'+Math.round(resisted*100)/100+'px,0)','important');
        overlay.style.setProperty('opacity',String(Math.max(.42,1-Math.min(.58,dy/drag.height*.72))),'important');
        if(e.cancelable)e.preventDefault();
      },{passive:false});
      handle.addEventListener('touchend',e=>{
        if(!drag)return;const t=dragPoint(e);
        const dy=t?Math.max(0,t.clientY-drag.y):0;
        const dx=t?Math.abs(t.clientX-drag.x):0;
        const velocity=drag.velocity;
        const threshold=Math.min(150,Math.max(72,drag.height*.20));
        const dismiss=dx<dy+18 && (dy>=threshold || (dy>26 && velocity>.52));
        if(dismiss){
          drag=null;
          if(e.cancelable)e.preventDefault();
          handle.click();
        }else resetDrag(true);
      },{passive:false});
      handle.addEventListener('touchcancel',()=>resetDrag(true),{passive:true});
    }
    overlays.set(overlay,info);guardOverlay(overlay);return info;
  }

  function springProgressFrames(ms,stiffness,damping,mass){
    const frames=Math.max(14,Math.min(26,Math.round(ms/18))),dt=(ms/1000)/frames;
    let x=0,v=0;const out=[{offset:0,p:0}];
    for(let i=1;i<=frames;i++){
      const a=(-stiffness*(x-1)-damping*v)/mass;
      v+=a*dt;x+=v*dt;
      /* Panels may settle a few percent past rest, like a damped physical sheet,
         but never enough to expose layout behind the rounded edge. */
      const p=Math.max(0,Math.min(1.055,x));
      out.push({offset:i/frames,p:i===frames?1:p});
    }
    return out;
  }
  function springPanelIn(node,base,fullSheet,more,ms,done){
    if(!node||reduced()||compactMotion()||typeof node.animate!=='function')return false;
    cancel(node);
    let height=320;
    try{height=Math.max(120,node.getBoundingClientRect().height||height);}catch(_){}
    const distance=fullSheet?Math.min(height+28,Math.max(360,(window.innerHeight||720)*.82)):(more?30:20);
    const startScale=fullSheet?1:(more ? .988 : .994);
    const rest=base==='none'?'':base+' ';
    const frames=springProgressFrames(ms,fullSheet?250:290,fullSheet?27:29,1).map(sample=>{
      const remaining=1-sample.p;
      return {offset:sample.offset,transform:rest+'translate3d(0,'+(distance*remaining).toFixed(2)+'px,0) scale('+(1-(1-startScale)*remaining).toFixed(4)+')'};
    });
    const saved=saveInline(node,['transform','will-change','transition']);
    let animation=null,timer=0,finished=false;
    const finish=()=>{
      if(finished)return;finished=true;if(timer)clearTimeout(timer);
      if(animation){try{animation.onfinish=null;animation.oncancel=null;animation.cancel();}catch(_){}}
      restoreInline(node,saved);running.delete(node);if(done)done();
    };
    try{
      node.style.setProperty('will-change','transform','important');
      animation=node.animate(frames,{duration:duration(ms),easing:'linear',fill:'both'});
      animation.onfinish=finish;animation.oncancel=()=>{};
      timer=setTimeout(finish,duration(ms)+100);
      running.set(node,{cancel:finish});
      return true;
    }catch(_){if(animation)try{animation.cancel();}catch(__){}restoreInline(node,saved);return false;}
  }

  function openOverlay(overlay){
    if(overlays.has(overlay) || !visible(overlay) || overlay.__vyClosing)return;
    const info=registerOverlay(overlay);if(!info)return;
    const card=info.card,sheet=info.sheet,more=overlay.id==='androidMoreSheet';
    cancel(card);cancel(overlay);
    const base=css(card,'transform','none');
    const rest=base==='none'?'':base+' ';
    const compact=more&&compactMotion();
    const entrance=more?(compact?245:460):sheet?280:220;
    tween(overlay,{opacity:'0'},{opacity:'1'},more?(compact?150:260):sheet?150:130,null,easeSoft);
    const fullSheet=info.sheet;
    const panelTime=more?entrance:fullSheet?300:sheet?235:195;
    if(!springPanelIn(card,base,fullSheet,more,panelTime,null)){
      tween(card,{transform:rest+(fullSheet?'translate3d(0,100%,0)':'translate3d(0,'+(sheet?'22':'10')+'px,0) scale('+(sheet?'.996':'.992')+')')},{transform:base},panelTime,null,more?moreEase:ease);
    }
    const focus=()=>{
      if(!overlay.isConnected || overlay.__vyClosing)return;
      if(!overlay.contains(document.activeElement)){
        const target=focusables(card)[0]||card;
        if(target===card)card.setAttribute('tabindex','-1');
        try{target.focus({preventScroll:true});}catch(_){ }
      }
    };
    // Focusing the first row causes a full layout read; do it after More's
    // entrance so the old WebView doesn't pause the moving sheet mid-frame.
    if(more)info.focusTimer=setTimeout(focus,duration(entrance)+20);
    else requestAnimationFrame(focus);
  }

  function cancelOverlay(overlay){
    const info=overlays.get(overlay);cancel(overlay);if(info){clearTimeout(info.focusTimer);cancel(info.card);}
    if(info && info.finish)info.finish();overlays.delete(overlay);
  }

  function closeOverlay(overlay,callback){
    if(!overlay){if(callback)callback();return;}
    if(overlay.__vyClosing)return;
    let info=overlays.get(overlay);
    if(!info)info=registerOverlay(overlay)||{card:overlay.querySelector?overlay.querySelector(cardSelector):null,trigger:null,sheet:false};
    overlay.__vyClosing=true;overlay.style.setProperty('pointer-events','auto','important');
    clearTimeout(info.focusTimer);
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;cancel(overlay);cancel(info.card);overlays.delete(overlay);
      if(callback)callback();else overlay.remove();
      if(overlay.id!=='androidMoreSheet' && info.trigger && info.trigger.isConnected && (document.activeElement===document.body || (overlay.contains && overlay.contains(document.activeElement)))){
        try{info.trigger.focus({preventScroll:true});}catch(_){ }
      }
    };
    info.finish=finish;overlays.set(overlay,info);
    if(!duration(120)){finish();return;}
    const card=info.card,overlayOpacity=renderedCss(overlay,'opacity','1');
    const fullSheet=info.sheet;
    const closeTime=overlay.id==='androidMoreSheet'?(compactMotion()?190:340):fullSheet?180:info.sheet?145:120;
    if(card){
      // Sample the visible frame before cancelling an unfinished entrance.
      const currentTransform=renderedCss(card,'transform','none');cancel(card);
      const rest=currentTransform==='none'?'':currentTransform+' ';
      tween(card,{transform:currentTransform},{transform:rest+(fullSheet?'translate3d(0,100%,0)':'translate3d(0,'+(info.sheet?'14':'7')+'px,0) scale('+(info.sheet?'.997':'.995')+')')},closeTime,null,easeClose);
    }
    cancel(overlay);tween(overlay,{opacity:overlayOpacity},{opacity:'0'},closeTime,finish,easeClose);
  }

  function dismissTop(){
    const overlay=topOverlay();if(!overlay)return false;if(overlay.__vyClosing)return true;
    const close=overlay.querySelector('[data-sheet-dismiss]') || overlay.querySelector(closeSelector+', [data-update-close]');if(close){close.click();return true;}return false;
  }

  window.vyaparMotion={enter,cancel,navigate,whenPageSettled,scrollTo:scrollToPosition,beforePage,afterPage,openOverlay,closeOverlay,cancelOverlay,dismissTop,stopPageTransition,physics:physicsProfile};

  function boot(){
    document.documentElement.classList.add('vy-motion-ready','vy-physics-motion');
    document.documentElement.setAttribute('data-motion-engine',physicsProfile.engine);
    document.addEventListener('pointerdown',()=>document.documentElement.classList.add('vy-pointer-input'),true);
    document.addEventListener('keydown',event=>{if(event.key==='Tab'||event.key.startsWith('Arrow'))document.documentElement.classList.remove('vy-pointer-input');},true);
    window.addEventListener('resize',()=>stopPageTransition(true),{passive:true});
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
      syncScrollLock();
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
