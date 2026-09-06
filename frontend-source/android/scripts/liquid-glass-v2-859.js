/* Vyapar AI 8.5.9 — Liquid Glass V2 coordinator.
   Owns only optical shell interaction + More popup presentation/close behavior. */
(function(){
  'use strict';
  const root=document.documentElement;
  root.classList.add('vy859-liquid-v2');
  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let frame=0,savedY=0,closing=false;

  function shellAtPoint(clientX,clientY,target){
    const shell=target&&target.closest?target.closest('.top,.nav'):null;
    if(!shell)return;
    const rect=shell.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const x=Math.max(0,Math.min(100,((clientX-rect.left)/rect.width)*100));
    const y=Math.max(0,Math.min(100,((clientY-rect.top)/rect.height)*100));
    shell.style.setProperty('--vy859-pointer-x',x.toFixed(1)+'%');
    shell.style.setProperty('--vy859-pointer-y',y.toFixed(1)+'%');
    shell.style.setProperty('--vy859-glass-x',x.toFixed(1)+'%');
  }
  function queuePoint(x,y,target){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=0;shellAtPoint(x,y,target)});
  }
  document.addEventListener('pointerdown',event=>queuePoint(event.clientX,event.clientY,event.target),{passive:true,capture:true});
  document.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&event.buttons===0)queuePoint(event.clientX,event.clientY,event.target)},{passive:true,capture:true});
  document.addEventListener('touchstart',event=>{const t=event.touches&&event.touches[0];if(t)queuePoint(t.clientX,t.clientY,event.target)},{passive:true,capture:true});

  function syncMore(){
    const overlay=document.getElementById('androidMoreSheet');
    const open=Boolean(overlay);
    if(document.body)document.body.classList.toggle('vy859-modal-open',open);
    if(!overlay){closing=false;return}
    if(overlay.dataset.vy859Ready==='1')return;
    overlay.dataset.vy859Ready='1';
    const sheet=overlay.querySelector('.android-sheet');
    if(sheet){
      sheet.scrollTop=0;
      sheet.addEventListener('pointerdown',event=>{
        const rect=sheet.getBoundingClientRect();
        const x=Math.max(0,Math.min(100,((event.clientX-rect.left)/Math.max(1,rect.width))*100));
        sheet.style.setProperty('--vy859-sheet-x',x.toFixed(1)+'%');
      },{passive:true});
    }
    const more=document.querySelector('.nav button[data-android-tab="more"],.nav button[data-tab="more"]');
    if(more)more.setAttribute('aria-expanded','true');
  }

  function removeMore(tab){
    const overlay=document.getElementById('androidMoreSheet');
    if(overlay)overlay.remove();
    if(document.body)document.body.classList.remove('android-sheet-open','more-sheet-open','vy859-modal-open');
    document.querySelectorAll('.nav [aria-expanded="true"]').forEach(btn=>btn.setAttribute('aria-expanded','false'));
    closing=false;
    if(tab&&typeof window.setTab==='function')window.setTab(tab,false);
    else requestAnimationFrame(()=>window.scrollTo(0,savedY));
  }
  function closeMore(tab){
    if(closing)return;
    closing=true;
    const overlay=document.getElementById('androidMoreSheet');
    if(!overlay){removeMore(tab);return}
    overlay.classList.add('vy859-sheet-leaving');
    setTimeout(()=>removeMore(tab),reduced()?0:180);
  }

  document.addEventListener('click',event=>{
    const moreButton=event.target&&event.target.closest?event.target.closest('.nav button[data-android-tab="more"],.nav button[data-tab="more"]'):null;
    if(moreButton){savedY=window.scrollY||0;setTimeout(syncMore,0);return}
    const overlay=event.target&&event.target.closest?event.target.closest('#androidMoreSheet'):null;
    if(!overlay)return;
    const item=event.target.closest&&event.target.closest('.android-sheet-item[data-tab]');
    const close=event.target.closest&&event.target.closest('.android-sheet-close');
    if(item||close||event.target===overlay){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(item){item.classList.add('vy859-pressed');closeMore(item.getAttribute('data-tab')||'')}
      else closeMore('');
    }
  },true);

  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.type==='childList'))requestAnimationFrame(syncMore);
  });
  function init(){
    root.classList.add('vy859-liquid-v2');
    if(document.body)observer.observe(document.body,{childList:true,subtree:false});
    syncMore();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
