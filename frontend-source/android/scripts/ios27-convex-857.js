/* Vyapar AI 8.5.7 preview — behaving convex lens + smarter recommendation presenter.
   No accounting/auth decisions are replaced. This layer only reacts to UI state. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy857-ios27');

  const lensSelector=[
    '.top',
    '.nav',
    '.android-sheet',
    '.shop-progress-sheet',
    '.vx643-modal',
    '.subscription-dialog',
    '.more-sheet',
    '.menu-popover',
    '#vyaparOtpGate .auth-card',
    '#screen-settings .vy675-settings-list',
    '#screen-settings .vy675-settings-intro',
    '#screen-settings .vy675-page-header',
    '#shopGrowthSummary'
  ].join(',');

  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

  function directChildByClass(surface,className){
    if(!surface)return null;
    for(let i=0;i<surface.children.length;i+=1){
      const child=surface.children[i];
      if(child.classList&&child.classList.contains(className))return child;
    }
    return null;
  }

  function ensureLens(surface){
    if(!surface||directChildByClass(surface,'vy857-convex-edge'))return;
    const edge=document.createElement('i');
    edge.className='vy857-convex-edge';
    edge.setAttribute('aria-hidden','true');
    surface.appendChild(edge);
    surface.classList.add('vy857-lens-surface');
  }

  function attachLenses(){
    document.querySelectorAll(lensSelector).forEach(ensureLens);
  }

  function pointFromEvent(event){
    if(event.touches&&event.touches[0])return event.touches[0];
    if(event.changedTouches&&event.changedTouches[0])return event.changedTouches[0];
    return event;
  }

  function updateLens(surface,event,active){
    if(!surface)return;
    const point=pointFromEvent(event);
    const rect=surface.getBoundingClientRect();
    if(!rect.width||!rect.height||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return;
    const rx=clamp((point.clientX-rect.left)/rect.width,0,1);
    const ry=clamp((point.clientY-rect.top)/rect.height,0,1);
    const edgeY=Math.round((ry-.5)*9);
    const spread=Math.round((.5-rx)*4);
    surface.style.setProperty('--vy857-px',(rx*100).toFixed(1)+'%');
    surface.style.setProperty('--vy857-py',(ry*100).toFixed(1)+'%');
    surface.style.setProperty('--vy857-edge-y',edgeY+'px');
    surface.style.setProperty('--vy857-red-edge-y',(-edgeY)+'px');
    surface.style.setProperty('--vy857-green-shift',(2+spread)+'px');
    surface.style.setProperty('--vy857-red-shift',(-2+spread)+'px');
    if(active)surface.classList.add('vy857-lens-active');
    clearTimeout(surface.__vy857LensTimer);
    surface.__vy857LensTimer=setTimeout(()=>surface.classList.remove('vy857-lens-active'),240);
  }

  function lensEvent(event){
    const surface=event.target&&event.target.closest?event.target.closest(lensSelector):null;
    if(!surface)return;
    updateLens(surface,event,event.type!=='pointerleave'&&event.type!=='touchend');
  }

  ['pointerdown','pointermove','pointerleave','touchstart','touchmove','touchend'].forEach(type=>{
    document.addEventListener(type,lensEvent,{passive:true,capture:true});
  });

  function number(value){
    const out=Number(value);
    return Number.isFinite(out)?out:0;
  }

  function todayKey(){
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }

  function currentState(){
    try{return window.state&&typeof window.state==='object'?window.state:{}}catch(_){return {}}
  }

  function recommendation(){
    const s=currentState();
    const today=todayKey();
    const daily=(Array.isArray(s.daily)?s.daily:[]).filter(item=>String(item&&item.date||'')===today);
    const itemSales=(Array.isArray(s.sales)?s.sales:[]).filter(item=>String(item&&item.date||'')===today);
    const hasToday=daily.length>0||itemSales.length>0;
    const stocks=Array.isArray(s.stocks)?s.stocks:[];
    let low=0;
    stocks.forEach(item=>{
      const qty=Math.max(0,number(item&&(item.qty!==undefined?item.qty:item.availableQty)));
      const min=Math.max(0,number(item&&(item.lowStock!==undefined?item.lowStock:item.minAlertQty)));
      if(min>0&&qty<=min)low+=1;
    });

    if(!hasToday){
      return{
        title:'Record today’s first sale',
        detail:'One real sale or daily entry keeps today’s trend, streak and profit view current.',
        action:'Open Sales',
        tab:'sales',
        icon:'✦'
      };
    }
    if(low>0){
      return{
        title:'Restock '+low+' low-stock item'+(low===1?'':'s'),
        detail:'Your sales are being recorded. Protect the next sale by checking low-stock products now.',
        action:'Open Stock',
        tab:'stock',
        icon:'↗'
      };
    }

    const customerDue=(Array.isArray(s.customers)?s.customers:[]).reduce((sum,item)=>sum+Math.max(0,number(item&&(item.due!==undefined?item.due:item.balance))),0);
    if(customerDue>0){
      return{
        title:'Review customer dues',
        detail:'Today is recorded and stock looks stable. A quick due check can improve cash-flow follow-up.',
        action:'Business',
        tab:'business',
        icon:'₹'
      };
    }

    return{
      title:'Review today before closing',
      detail:'Sales and stock look current. Check margin, expenses and cash position before the day ends.',
      action:'Business',
      tab:'business',
      icon:'✓'
    };
  }

  function recommendationSignature(data){
    return [data.title,data.detail,data.action,data.tab,data.icon].join('|');
  }

  function recommendationMarkup(data,compact){
    return '<div class="vy857-smart-rec'+(compact?' is-compact':'')+'" data-vy857-rec="'+data.tab+'" data-vy857-signature="'+recommendationSignature(data).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">'+
      '<div class="vy857-rec-orb">'+data.icon+'</div>'+
      '<div class="vy857-rec-copy"><span>NEXT BEST ACTION</span><b>'+data.title+'</b><small>'+data.detail+'</small></div>'+
      '<button type="button" class="vy857-rec-action" data-vy857-open="'+data.tab+'">'+data.action+'</button>'+
    '</div>';
  }

  function updateRecommendationNode(rec,data){
    if(!rec)return;
    const signature=recommendationSignature(data);
    if(rec.getAttribute('data-vy857-signature')===signature)return;
    const copy=rec.querySelector('.vy857-rec-copy');
    const orb=rec.querySelector('.vy857-rec-orb');
    const button=rec.querySelector('.vy857-rec-action');
    if(copy){
      const kicker=copy.querySelector('span');
      const title=copy.querySelector('b');
      const detail=copy.querySelector('small');
      if(kicker)kicker.textContent='NEXT BEST ACTION';
      if(title)title.textContent=data.title;
      if(detail)detail.textContent=data.detail;
    }
    if(orb)orb.textContent=data.icon;
    if(button){button.textContent=data.action;button.setAttribute('data-vy857-open',data.tab);}
    rec.setAttribute('data-vy857-rec',data.tab);
    rec.setAttribute('data-vy857-signature',signature);
  }

  function directRecommendation(parent){
    if(!parent)return null;
    for(let i=0;i<parent.children.length;i+=1){
      const child=parent.children[i];
      if(child.classList&&child.classList.contains('vy857-smart-rec'))return child;
    }
    return null;
  }

  function syncRecommendation(){
    const data=recommendation();
    const summary=document.getElementById('shopGrowthSummary');
    if(summary){
      let rec=directRecommendation(summary);
      if(!rec){
        const foot=summary.querySelector('.shop-growth-foot');
        const holder=document.createElement('div');
        holder.innerHTML=recommendationMarkup(data,false);
        rec=holder.firstElementChild;
        if(foot)summary.insertBefore(rec,foot);else summary.appendChild(rec);
      }else updateRecommendationNode(rec,data);
    }

    const sheet=document.querySelector('.shop-progress-sheet');
    if(sheet){
      let rec=directRecommendation(sheet);
      if(!rec){
        const score=sheet.querySelector('.shop-sheet-score');
        const holder=document.createElement('div');
        holder.innerHTML=recommendationMarkup(data,true);
        rec=holder.firstElementChild;
        if(score)score.parentNode.insertBefore(rec,score.nextSibling);
        else sheet.insertBefore(rec,sheet.firstChild);
      }else updateRecommendationNode(rec,data);
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target&&event.target.closest?event.target.closest('[data-vy857-open]'):null;
    if(!button)return;
    const tab=button.getAttribute('data-vy857-open');
    try{
      const close=document.getElementById('closeShopProgress');
      if(close)close.click();
    }catch(_){}
    try{if(typeof window.setTab==='function')window.setTab(tab,false);}catch(_){}
  },true);

  let queued=false;
  function scheduleSync(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      attachLenses();
      syncRecommendation();
    });
  }

  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'||record.attributeName==='class'||record.attributeName==='hidden'))scheduleSync();
  });

  function init(){
    root.classList.add('vy857-ios27');
    attachLenses();
    syncRecommendation();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    window.addEventListener('resize',scheduleSync,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
