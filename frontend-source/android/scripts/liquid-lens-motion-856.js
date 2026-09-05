/* Vyapar AI 8.5.6 — smooth motion coordinator.
   Adds only presentation feedback; all auth/accounting/navigation decisions stay
   with the existing application functions. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy855-liquid-lens');

  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function replayClass(node,name,duration){
    if(!node)return;
    node.classList.remove(name);
    /* Force only this tiny animated element to restart; never reflow a page. */
    void node.offsetWidth;
    node.classList.add(name);
    clearTimeout(node.__vy856ReplayTimer);
    node.__vy856ReplayTimer=setTimeout(()=>node.classList.remove(name),duration||420);
  }

  /* ---------- Nav feedback ---------- */
  document.addEventListener('click',event=>{
    const button=event.target&&event.target.closest?event.target.closest('.nav button[data-android-tab]'):null;
    if(!button)return;
    if(!reduced())replayClass(button,'vy856-tab-pop',380);
  },true);

  /* ---------- Settings forward/back transitions ---------- */
  let settingsState='';
  function syncSettingsMotion(){
    const screen=document.getElementById('screen-settings');
    if(!screen||screen.classList.contains('hide'))return;
    const home=screen.querySelector('.vy675-settings-home');
    const page=screen.querySelector('.vy675-settings-page');
    const state=page&&!page.hidden?'page':home&&!home.hidden?'home':'';
    if(!state||state===settingsState)return;
    const previous=settingsState;
    settingsState=state;
    if(reduced())return;
    if(state==='page')replayClass(page,'vy856-settings-in',300);
    if(state==='home'&&previous==='page')replayClass(home,'vy856-settings-home-in',300);
  }

  /* ---------- Non-opaque liquid theme halo ---------- */
  let themeVisualBusy=false;
  function themeButtonCenter(event){
    if(event&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&event.clientX>0&&event.clientY>0){
      return{x:event.clientX,y:event.clientY};
    }
    const button=document.getElementById('themeToggle');
    if(button){
      const r=button.getBoundingClientRect();
      return{x:r.left+r.width/2,y:r.top+r.height/2};
    }
    return{x:innerWidth-36,y:36};
  }

  function spawnThemeLens(target,event){
    if(reduced())return;
    document.querySelectorAll('.vy856-theme-lens').forEach(node=>node.remove());
    const center=themeButtonCenter(event);
    const lens=document.createElement('div');
    lens.className='vy856-theme-lens '+(target==='light'?'to-light':'to-dark');
    lens.style.left=center.x+'px';
    lens.style.top=center.y+'px';
    const farX=Math.max(center.x,innerWidth-center.x);
    const farY=Math.max(center.y,innerHeight-center.y);
    const scale=Math.max(2,Math.hypot(farX,farY)/32+1.5);
    lens.style.setProperty('--vy856-theme-scale',String(scale));
    document.body.appendChild(lens);
    setTimeout(()=>lens.remove(),470);
  }

  function animateThemeButton(){
    if(reduced())return;
    const button=document.getElementById('themeToggle');
    replayClass(button,'vy856-theme-button-pop',420);
  }

  const priorToggle=typeof window.toggleTheme==='function'?window.toggleTheme:null;
  if(priorToggle&&!priorToggle.__vy856Wrapped){
    const wrapped=function(event){
      if(themeVisualBusy)return false;
      themeVisualBusy=true;
      const target=root.classList.contains('theme-light')?'dark':'light';
      spawnThemeLens(target,event);
      animateThemeButton();
      const result=priorToggle.call(this,event);
      setTimeout(()=>{themeVisualBusy=false},reduced()?80:300);
      return result;
    };
    wrapped.__vy856Wrapped=true;
    window.toggleTheme=wrapped;
  }

  const priorSetTheme=typeof window.setTheme==='function'?window.setTheme:null;
  if(priorSetTheme&&!priorSetTheme.__vy856Wrapped){
    const wrapped=function(theme,event){
      const target=theme==='light'?'light':'dark';
      const already=(target==='light')===root.classList.contains('theme-light');
      if(already)return false;
      spawnThemeLens(target,event);
      animateThemeButton();
      return priorSetTheme.call(this,target);
    };
    wrapped.__vy856Wrapped=true;
    window.setTheme=wrapped;
  }

  /* ---------- Keep the liquid lens aligned after any old renderer rebuilds
     the navbar. The stability layer owns coordinates; this only lets CSS
     animate the delta instead of snapping. ---------- */
  function nudgeLens(){
    const nav=document.getElementById('nav')||document.querySelector('.nav');
    if(!nav)return;
    const lens=nav.querySelector('.android-nav-glass-indicator');
    const active=nav.querySelector('button.active[data-android-tab]');
    if(!lens||!active)return;
    const x=active.offsetLeft;
    const w=active.offsetWidth;
    if(Math.abs((parseFloat(lens.style.width)||0)-w)>.2)lens.style.width=w+'px';
    const expected='translate3d('+x+'px,0,0)';
    if(lens.style.transform!==expected)lens.style.transform=expected;
  }

  let queued=false;
  function scheduleSync(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      syncSettingsMotion();
      nudgeLens();
    });
  }

  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'||record.attributeName==='class'||record.attributeName==='hidden'))scheduleSync();
  });

  function init(){
    root.classList.add('vy855-liquid-lens');
    syncSettingsMotion();
    nudgeLens();
    if(document.body){
      observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    }
    window.addEventListener('resize',scheduleSync,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(scheduleSync,100),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
