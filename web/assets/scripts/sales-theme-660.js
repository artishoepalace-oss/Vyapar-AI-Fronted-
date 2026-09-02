/* Vyapar AI 6.6.0 — consistent blue surfaces + corrected live Sales profit overview. */
(function(){
  'use strict';
  const VERSION='6.7.0.2026';
  const VERSION_CODE=6702026;
  const n=(v)=>{const x=Number(v||0);return Number.isFinite(x)?x:0;};
  const cash=(v)=>typeof window.money==='function'?window.money(v):'₹'+n(v).toLocaleString('en-IN');
  const pad=(v)=>String(v).padStart(2,'0');
  const nowParts=()=>{const d=new Date();return {year:String(d.getFullYear()),month:String(d.getFullYear())+'-'+pad(d.getMonth()+1),day:String(d.getFullYear())+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};};
  function s(){try{return typeof state!=='undefined'&&state?state:{};}catch(_){return {};}}
  function saleProfit(row){return (n(row.sellingPrice)-n(row.purchasePrice))*Math.max(0,n(row.qty));}
  function itemProfitForPrefix(prefix){return (s().sales||[]).reduce((sum,row)=>String(row.date||'').startsWith(prefix)?sum+saleProfit(row):sum,0);}
  function dailyProfitForPrefix(prefix){return (s().daily||[]).reduce((sum,row)=>String(row.date||'').startsWith(prefix)?sum+n(row.profit):sum,0);}
  function monthlyManualForMonth(month){return (s().monthly||[]).reduce((sum,row)=>String(row.month||'').slice(0,7)===month?sum+n(row.profit):sum,0);}
  function yearlyBreakdown(year){
    const y=String(year||'');
    const item=itemProfitForPrefix(y+'-');
    const daily=dailyProfitForPrefix(y+'-');
    const manual=(s().monthly||[]).reduce((sum,row)=>String(row.month||'').startsWith(y+'-')?sum+n(row.profit):sum,0);
    return {year:y,item,daily,manual,total:item+daily+manual};
  }
  function monthlySeries(){
    const map={};
    const add=(m,v)=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(m))map[m]=(map[m]||0)+n(v);};
    (s().sales||[]).forEach(r=>{const d=String(r.date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(d))add(d.slice(0,7),saleProfit(r));});
    (s().daily||[]).forEach(r=>{const d=String(r.date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(d))add(d.slice(0,7),n(r.profit));});
    (s().monthly||[]).forEach(r=>add(String(r.month||'').slice(0,7),n(r.profit)));
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b));
  }
  window.vy660YearlyProfitBreakdown=yearlyBreakdown;
  window.resolvedMonthlyProfitSeries=monthlySeries;
  window.yearlyProfitForYear=(year)=>yearlyBreakdown(year).total;
  window.monthlyStatsForYear=(year)=>{const vals=monthlySeries().filter(([m])=>m.startsWith(String(year)+'-')).map(([,v])=>n(v));const total=vals.reduce((a,b)=>a+b,0);return {count:vals.length,avg:vals.length?total/vals.length:0,high:vals.length?Math.max(...vals):0,low:vals.length?Math.min(...vals):0,total};};

  function footerMarkup(){return '<img class="vy660-footer-logo" src="assets/images/footer-logo.png" alt="Vyapar AI"><span>© 2026 Vyapar AI. All Rights Reserved.</span><span class="app-legal-links"><a href="pages/legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a><a href="pages/legal/terms.html" target="_blank" rel="noopener noreferrer">Terms</a><a href="pages/legal/refund.html" target="_blank" rel="noopener noreferrer">Refund</a><a href="pages/legal/delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a></span><strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';}
  function placeFooter(){
    document.querySelectorAll('.android-sheet-legal').forEach(x=>x.remove());
    const settings=document.getElementById('screen-settings');
    if(settings?.classList.contains('vy675-settings-ready')){
      document.querySelectorAll('#appLegalFooter').forEach(x=>x.remove());
      return;
    }
    document.querySelectorAll('#appLegalFooter').forEach((x,i)=>{if(i)x.remove();});
    let f=document.getElementById('appLegalFooter');
    if(!f){f=document.createElement('footer');f.id='appLegalFooter';f.className='app-legal-footer vy660-settings-footer';}
    const markup=footerMarkup();
    f.className='app-legal-footer vy660-settings-footer';
    if(f.innerHTML!==markup)f.innerHTML=markup;
    const stack=document.querySelector('#screen-settings .settings-stack')||settings;
    if(stack){if(f.parentNode!==stack)stack.appendChild(f);if(f.style.display)f.style.display='';}
    else if(f.style.display!=='none')f.style.display='none';
  }

  function enhanceSales(){
    const screen=document.getElementById('screen-sales');if(!screen)return;
    document.getElementById('vy659CombinedProfitCard')?.remove();
    const p=nowParts();const yearly=yearlyBreakdown(p.year);
    const monthManual=monthlyManualForMonth(p.month);
    const monthDaily=dailyProfitForPrefix(p.month+'-');
    const monthItem=itemProfitForPrefix(p.month+'-');
    const monthLive=monthManual+monthDaily+monthItem;
    const todayDaily=dailyProfitForPrefix(p.day);
    let card=document.getElementById('vy660ProfitCard');
    if(!card){card=document.createElement('div');card.id='vy660ProfitCard';card.className='card vy660-profit-card';screen.prepend(card);}
    const cardMarkup='<div class="vy660-profit-head"><div><span class="home-section-kicker">PROFIT OVERVIEW</span><h2>Yearly Profit · '+p.year+'</h2><strong>'+cash(yearly.total)+'</strong></div></div>'+ 
      '<div class="vy660-live-grid">'+
        '<div class="vy660-live-box"><span>This month · live</span><b>'+cash(monthLive)+'</b><small>Monthly manual '+cash(monthManual)+' + daily '+cash(monthDaily)+' + item-sale '+cash(monthItem)+'</small></div>'+ 
        '<div class="vy660-live-box"><span>Today\'s Daily Profit</span><b>'+cash(todayDaily)+'</b><small>Today only · Daily Quick Entry</small></div>'+ 
      '</div><p class="muted vy660-note">The old yearly manual total is no longer shown as “Monthly Profit”. Monthly live value uses only the current month; Daily Profit shows only today.</p>';
    if(card.innerHTML!==cardMarkup)card.innerHTML=cardMarkup;
    const dailyCard=[...screen.querySelectorAll('.card')].find(c=>/Daily Quick Entry/i.test(c.querySelector('h2')?.textContent||''));
    if(dailyCard){
      dailyCard.querySelectorAll('.vy659-included-note').forEach(x=>x.remove());
      let note=dailyCard.querySelector('.vy660-daily-note');
      if(!note){note=document.createElement('div');note.className='vy660-daily-note';dailyCard.querySelector('h2')?.insertAdjacentElement('afterend',note);}
      const noteMarkup='<b>Today\'s Daily Profit: '+cash(todayDaily)+'</b><span>Only entries dated '+p.day+' are counted here.</span>';
      if(note.innerHTML!==noteMarkup)note.innerHTML=noteMarkup;
    }
    const monthlyCard=document.getElementById('monthly-profit-entry');
    if(monthlyCard){
      monthlyCard.querySelectorAll('.vy659-included-note').forEach(x=>x.remove());
      let note=monthlyCard.querySelector('.vy660-month-note');
      if(!note){note=document.createElement('small');note.className='muted vy660-month-note';monthlyCard.appendChild(note);}
      const noteText='Monthly manual is counted only for its selected month. Current-month manual: '+cash(monthManual)+'.';
      if(note.textContent!==noteText)note.textContent=noteText;
    }
  }

  function closeUpdatePrompt(){
    const popup=document.getElementById('vy670UpdatePrompt');
    if(popup)popup.remove();
    document.body.classList.remove('subscription-dialog-open');
  }
  function openUpdateUrl(url){
    if(!url)return;
    if(window.AndroidApp&&typeof AndroidApp.openExternalUrl==='function')AndroidApp.openExternalUrl(url);
    else window.open(url,'_blank','noopener');
  }
  function showUpdatePrompt(data,force){
    const current=document.getElementById('vy670UpdatePrompt');
    if(current){current.querySelector('[data-update-now]')?.focus();return current;}
    const popup=document.createElement('div');
    popup.id='vy670UpdatePrompt';
    popup.className='subscription-overlay subscription-cancel-overlay';
    popup.innerHTML='<section class="subscription-dialog subscription-result-card" role="dialog" aria-modal="true" aria-labelledby="vy670UpdateTitle">'+
      '<div class="subscription-result-icon success" aria-hidden="true">↑</div>'+
      '<h2 id="vy670UpdateTitle"></h2><p data-update-message></p>'+
      '<button class="subscription-dialog-primary" data-update-now type="button">Update now</button>'+
      (force?'':'<button class="subscription-dialog-secondary" data-update-later type="button">Not now</button>')+
      '</section>';
    popup.querySelector('#vy670UpdateTitle').textContent=force?'Update required':'Vyapar AI update available';
    popup.querySelector('[data-update-message]').textContent='Version '+String(data.versionName||'new')+' is available.'+(force?' This version is required to continue safely.':'');
    popup.querySelector('[data-update-now]').onclick=()=>{closeUpdatePrompt();openUpdateUrl(data.apkUrl);};
    const later=popup.querySelector('[data-update-later]');if(later)later.onclick=closeUpdatePrompt;
    popup.addEventListener('click',event=>{if(event.target===popup&&!force)closeUpdatePrompt();});
    document.body.appendChild(popup);
    document.body.classList.add('subscription-dialog-open');
    setTimeout(()=>popup.querySelector('[data-update-now]')?.focus(),0);
    return popup;
  }

  window.fs607CheckUpdate=async function(manual){
    if(manual)window.__vy670ManualUpdateRequested=true;
    if(window.__vy670UpdateCheckPromise)return window.__vy670UpdateCheckPromise;
    window.__vy670UpdateCheckPromise=(async()=>{
      try{
        let currentCode=VERSION_CODE,currentName=VERSION;
        if(window.AndroidApp){try{if(typeof AndroidApp.getVersionCode==='function')currentCode=Number(AndroidApp.getVersionCode())||currentCode;}catch(_){}try{if(typeof AndroidApp.getVersionName==='function')currentName=String(AndroidApp.getVersionName()||currentName);}catch(_){}}
        const base=(typeof window.API_BASE_URL==='string'&&window.API_BASE_URL)||'https://vypar-backend.onrender.com';
        const res=await fetch(base+'/app/version',{headers:{Accept:'application/json'}});const data=await res.json();if(!res.ok||!data.success)throw new Error(data.message||'Update check failed');
        try{if(typeof state!=='undefined'&&state){state.appUpdate={checkedAt:new Date().toISOString(),currentCode,currentName,...data};localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(state));}}catch(_){}
        const requested=()=>Boolean(window.__vy670ManualUpdateRequested);
        if(Number(data.versionCode)>currentCode){
          const force=currentCode<Number(data.minimumSupportedVersionCode||0);
          const msg='Vyapar AI '+data.versionName+' available'+(force?' (required)':'')+'.';
          if(data.apkUrl){
            // Automatic checks stay silent unless the backend marks the update required.
            // Manual checks and required updates use ONE Vyapar AI modal; no JS confirm dialog.
            if(requested()||force)showUpdatePrompt(data,force);
          }else if(requested()&&typeof window.showGlassToast==='function')showGlassToast(msg+' Download link is not available yet.');
          else if(requested())alert(msg+' Download link is not available yet.');
        }else if(requested()){
          if(typeof window.showGlassToast==='function')showGlassToast('App is up to date: '+currentName);
          else alert('App is up to date: '+currentName);
        }
        return data;
      }catch(e){
        if(window.__vy670ManualUpdateRequested){if(typeof window.showGlassToast==='function')showGlassToast('Update check failed. Please try again.');else alert('Update check failed. Please try again.');}
        return null;
      }
    })();
    try{return await window.__vy670UpdateCheckPromise;}
    finally{window.__vy670UpdateCheckPromise=null;window.__vy670ManualUpdateRequested=false;}
  };

  if(typeof window.renderSales==='function'){const old=window.renderSales;window.renderSales=function(){const r=old.apply(this,arguments);enhanceSales();placeFooter();return r;};}
  if(typeof window.renderSettings==='function'){const old=window.renderSettings;window.renderSettings=function(){const r=old.apply(this,arguments);setTimeout(placeFooter,0);return r;};}
  const observer=new MutationObserver(()=>{
    clearTimeout(window.__vy660Timer);
    window.__vy660Timer=setTimeout(()=>{
      observer.disconnect();
      try{
        placeFooter();
        if(!document.getElementById('screen-sales')?.classList.contains('hide'))enhanceSales();
      }finally{
        observer.observe(document.documentElement,{subtree:true,childList:true});
      }
    },35);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(()=>{try{if(typeof window.renderHome==='function')window.renderHome();}catch(_){}try{if(typeof window.renderSales==='function')window.renderSales();}catch(_){}try{if(typeof window.renderSettings==='function')window.renderSettings();}catch(_){}placeFooter();enhanceSales();},0);
})();
