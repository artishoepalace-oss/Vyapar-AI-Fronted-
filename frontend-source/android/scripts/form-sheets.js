/* Shared form presentation. Move the live form; never copy inputs or save logic. */
(function(root){
  'use strict';
  let active=null, scheduled=false;
  const fields=['sproduct','dsale','mprofit','stockItem'];
  function syncHeader(entry){
    const heading=entry.node.querySelector('h1,h2,h3');
    if(!heading)return;
    const title=heading.textContent.trim();
    const label=title==='Orders & Document Lifecycle'?'Orders & Documents':title;
    const target=entry.overlay.querySelector('#vyFormHeading');
    if(target.textContent!==label)target.textContent=label;
    // Hosts can lose their .card class or wrap their header during decoration.
    // Identify the source header by the real title, independently of its depth.
    const header=heading.closest('.calculator-head,.vx621-context-head,.adv-module-head');
    (header && entry.node.contains(header)?header:heading).classList.add('vy-form-source-heading');
  }
  function close(immediate){
    const entry=active;if(!entry)return false;
    const finish=()=>{
      if(entry.observer)entry.observer.disconnect();
      if(entry.placeholder.isConnected) entry.placeholder.replaceWith(entry.node);
      entry.node.hidden=entry.module || entry.hidden;
      if(entry.module)entry.node.classList.add('vy-form-parked');
      entry.overlay.remove();
      if(active===entry)active=null;
      document.body.classList.remove('vy-form-open');
      if(entry.trigger && entry.trigger.isConnected)entry.trigger.focus({preventScroll:true});
    };
    if(immediate){if(root.vyaparMotion)root.vyaparMotion.cancelOverlay(entry.overlay);if(active===entry)finish();}
    else if(root.vyaparMotion)root.vyaparMotion.closeOverlay(entry.overlay,finish);
    else finish();
    return true;
  }
  function openHost(node,context){
    if(!node || !node.isConnected)return;
    if(node.querySelector('.vx621-empty') && !node.querySelector('input,select,textarea,table'))return;
    if(active && active.node===node){
      syncHeader(active);
      return;
    }
    close(true);
    const trigger=document.activeElement,placeholder=document.createElement('span');
    placeholder.hidden=true;
    node.before(placeholder);
    const overlay=document.createElement('div');overlay.className='vy-form-overlay';overlay.id='vyFormSheet';
    overlay.innerHTML='<section class="vy-form-sheet" role="dialog" aria-modal="true" aria-labelledby="vyFormHeading" tabindex="-1"><div class="vy-form-handle" aria-hidden="true"></div><header class="vy-form-head"><h2 id="vyFormHeading"></h2><button type="button" class="vy-form-close" data-back-close aria-label="Close form">×</button></header><div class="vy-form-body"></div></section>';
    overlay.querySelector('h2').textContent=node.querySelector('h1,h2,h3')?.textContent.trim()||'Business tools';
    active={node,placeholder,overlay,trigger,context,hidden:node.hidden,module:node.id==='businessModuleArea'||!!node.dataset.vx621Host};
    node.classList.remove('vy-form-parked');
    node.hidden=false;
    overlay.querySelector('.vy-form-body').appendChild(node);
    document.body.appendChild(overlay);document.body.classList.add('vy-form-open');
    const entry=active;
    syncHeader(entry);
    entry.observer=new MutationObserver(()=>syncHeader(entry));
    entry.observer.observe(node,{childList:true,subtree:true,characterData:true});
    overlay.querySelector('[data-back-close]').onclick=()=>close(false);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close(false);});
    updateViewport();
    if(root.vyaparMotion)root.vyaparMotion.openOverlay(overlay);
  }
  function updateViewport(){
    const v=root.visualViewport;
    document.documentElement.style.setProperty('--vy-sheet-height',(v?v.height:root.innerHeight)+'px');
    document.documentElement.style.setProperty('--vy-sheet-top',(v?v.offsetTop:0)+'px');
  }
  function prepare(){
    scheduled=false;
    fields.forEach(id=>{
      const field=document.getElementById(id),card=field?.closest('.card');
      if(!card || card.closest('.vy-form-overlay,.vy-form-storage'))return;
      const screen=card.closest('.screen');if(!screen)return;
      const title=card.querySelector('h2,h3')?.textContent.trim()||'Add record';
      const launcher=document.createElement('section');launcher.className='card vy-form-launcher';
      launcher.dataset.formField=id;
      launcher.innerHTML='<h2></h2><p class="muted">Open the form to add or update your records.</p><button type="button" class="btn primary">Open form</button><div class="vy-form-storage" hidden></div>';
      launcher.querySelector('h2').textContent=title;
      card.before(launcher);launcher.querySelector('.vy-form-storage').appendChild(card);
      launcher.querySelector('button').onclick=()=>openHost(card,screen.id.replace('screen-',''));
    });
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(prepare);}}
  function openField(id){prepare();const card=document.getElementById(id)?.closest('.card');if(card)openHost(card,id==='stockItem'?'stock':'sales');}
  function wrap(name,after,before){
    const original=root[name];if(typeof original!=='function')return;
    root[name]=function(){
      if(before)before.apply(this,arguments);
      const run=()=>original.apply(this,arguments);
      const context=active?.module && ['p611Open','advRenderModule','fs607OpenPOS'].includes(name)?active.context:null;
      const result=context && root.VyaparUI621?.withHostContext?root.VyaparUI621.withHostContext(context,run):run();
      if(after)after.call(this,result,arguments);return result;
    };
  }
  // Return the original node before its owning page rerenders after a successful save.
  ['Sales','Stock','Business','Home'].forEach(label=>wrap('render'+label,schedule,()=>{if(active && active.context===label.toLowerCase())close(true);}));
  ['editSale','editMonthly'].forEach((name,i)=>wrap(name,()=>openField(i?'mprofit':'sproduct')));
  ['p611Open','businessShowModule','advRenderModule','fs607OpenPOS','vx621RenderDataManager'].forEach(name=>wrap(name,(result)=>{
    if(result===false)return;
    const host=document.getElementById('businessModuleArea');
    if(host?.closest('#screen-settings'))return;
    const context=host?.dataset.vx621Host||'business';
    if(host && host.querySelector('input,select,textarea,table'))openHost(host,context);
  }));
  ['p611Home','renderAdvancedHome'].forEach(name=>{
    const original=root[name];if(typeof original!=='function')return;
    root[name]=function(){if(active)return close(false);return original.apply(this,arguments);};
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('.android-quick-action[data-tab="sales"]');
    if(button)setTimeout(()=>{if(typeof currentTab!=='undefined'&&currentTab==='sales')openField('sproduct');},0);
  });
  document.addEventListener('focusin',event=>{
    if(!event.target.matches('input,textarea,select') || !event.target.closest('.vy-form-overlay'))return;
    setTimeout(()=>{if(event.target.isConnected)event.target.scrollIntoView({block:'nearest',behavior:'auto'});},180);
  });
  root.addEventListener('resize',updateViewport);
  if(root.visualViewport){root.visualViewport.addEventListener('resize',updateViewport);root.visualViewport.addEventListener('scroll',updateViewport);}
  function boot(){
    prepare();updateViewport();
    const app=document.querySelector('main')||document.querySelector('.app');
    if(app)new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))schedule();}).observe(app,{childList:true,subtree:true});
  }
  root.VyaparFormSheets={openHost,openField,close,prepare};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
