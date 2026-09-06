/* Vyapar AI 8.5.7 final UI coordinator.
   Presentation only: existing auth/accounting/business decisions remain untouched. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy858-unified');
  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const shellSelector='.top,.nav';

  /* Existing 8.5.7 lens nodes may still exist on old cards; CSS hides those.
     Only the top/nav shell receives visible optical movement. */
  let scrollQueued=false;
  function syncScrollRefraction(){
    scrollQueued=false;
    const y=Math.max(0,window.scrollY||document.documentElement.scrollTop||0);
    const shift=((y%18)-9)*0.18;
    document.querySelectorAll(shellSelector).forEach(shell=>{
      shell.style.setProperty('--vy858-scroll-shift',shift.toFixed(2)+'px');
      shell.style.setProperty('--vy858-scroll-shift-neg',(-shift).toFixed(2)+'px');
    });
  }
  function queueScrollRefraction(){
    if(scrollQueued)return;
    scrollQueued=true;
    requestAnimationFrame(syncScrollRefraction);
  }
  window.addEventListener('scroll',queueScrollRefraction,{passive:true});

  function polishAuthLabels(){
    const pass=document.getElementById('tab-login-pass');
    const otp=document.getElementById('tab-login-otp');
    const passSubmit=document.getElementById('login-password-submit');
    const otpSubmit=document.getElementById('login-otp-submit');
    if(pass)pass.textContent='Password';
    if(otp)otp.textContent='Email OTP';
    if(passSubmit&&!/Signing/i.test(passSubmit.textContent||''))passSubmit.textContent='Sign In';
    if(otpSubmit&&!/Verifying/i.test(otpSubmit.textContent||''))otpSubmit.textContent='Verify & Sign In';
  }

  /* Telegram-like large watery radial theme reveal from the actual top-right control. */
  let themeBusy=false;
  function centerFrom(event){
    if(event&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&event.clientX>0&&event.clientY>0){
      return{x:event.clientX,y:event.clientY};
    }
    const button=document.getElementById('themeToggle');
    if(button){const r=button.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};}
    return{x:innerWidth-34,y:34};
  }
  function createSweep(target,event){
    document.querySelectorAll('.vy858-theme-sweep').forEach(node=>node.remove());
    if(reduced())return null;
    const c=centerFrom(event);
    const farX=Math.max(c.x,innerWidth-c.x);
    const farY=Math.max(c.y,innerHeight-c.y);
    const radius=Math.ceil(Math.hypot(farX,farY)+36);
    const layer=document.createElement('div');
    layer.className='vy858-theme-sweep '+(target==='light'?'to-light':'to-dark');
    layer.style.setProperty('--vy858-theme-x',c.x+'px');
    layer.style.setProperty('--vy858-theme-y',c.y+'px');
    layer.style.setProperty('--vy858-theme-radius',radius+'px');
    layer.style.setProperty('--vy858-theme-scale',String(radius/32));
    document.body.appendChild(layer);
    return layer;
  }

  const priorToggle=typeof window.toggleTheme==='function'?window.toggleTheme:null;
  if(priorToggle&&!priorToggle.__vy858Wrapped){
    const wrapped=function(event){
      if(themeBusy)return false;
      themeBusy=true;
      const target=root.classList.contains('theme-light')?'dark':'light';
      const layer=createSweep(target,event);
      setTimeout(()=>{
        try{priorToggle.call(this,event);}catch(_){themeBusy=false;layer?.remove();}
      },reduced()?0:190);
      setTimeout(()=>{
        layer?.remove();
        themeBusy=false;
        polishAuthLabels();
      },reduced()?80:560);
      return false;
    };
    wrapped.__vy858Wrapped=true;
    window.toggleTheme=wrapped;
  }

  const priorSetTheme=typeof window.setTheme==='function'?window.setTheme:null;
  if(priorSetTheme&&!priorSetTheme.__vy858Wrapped){
    const wrapped=function(theme,event){
      const target=theme==='light'?'light':'dark';
      const already=(target==='light')===root.classList.contains('theme-light');
      if(already||themeBusy)return false;
      themeBusy=true;
      const layer=createSweep(target,event);
      setTimeout(()=>{try{priorSetTheme.call(this,target,event);}catch(_){}},reduced()?0:190);
      setTimeout(()=>{layer?.remove();themeBusy=false;polishAuthLabels();},reduced()?80:560);
      return false;
    };
    wrapped.__vy858Wrapped=true;
    window.setTheme=wrapped;
  }

  /* More/Journey: keep the document fixed behind the liquid popup and restore position. */
  let pageY=0;
  function lockBody(){
    if(document.body.dataset.vy858Locked==='1')return;
    pageY=window.scrollY||0;
    document.body.dataset.vy858Locked='1';
    document.body.style.setProperty('--vy858-page-y',pageY+'px');
  }
  function unlockBody(){
    if(document.body.dataset.vy858Locked!=='1')return;
    document.body.dataset.vy858Locked='0';
    requestAnimationFrame(()=>window.scrollTo(0,pageY));
  }
  function syncPopupState(){
    const more=document.querySelector('.android-sheet-overlay');
    const journey=document.querySelector('.shop-progress-overlay');
    if(more||journey)lockBody();else unlockBody();
    [more?.querySelector('.android-sheet'),journey?.querySelector('.shop-progress-sheet')].filter(Boolean).forEach(sheet=>{
      if(sheet.dataset.vy858Prepared)return;
      sheet.dataset.vy858Prepared='1';
      sheet.scrollTop=0;
    });
  }

  document.addEventListener('click',event=>{
    const moreButton=event.target&&event.target.closest?event.target.closest('.nav button[data-android-tab="more"],.nav button[data-tab="more"]'):null;
    if(moreButton)pageY=window.scrollY||0;
  },true);

  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      polishAuthLabels();
      syncPopupState();
      syncScrollRefraction();
    });
  }

  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.type==='childList'||r.attributeName==='class'||r.attributeName==='hidden'))schedule();
  });

  function init(){
    root.classList.add('vy858-unified');
    polishAuthLabels();
    syncScrollRefraction();
    syncPopupState();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(schedule,100),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
