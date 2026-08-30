/* Vyapar AI 6.5.9 — unified yearly profit + footer placement patch. */
(function(){
  'use strict';
  const VERSION='6.5.9';
  const VERSION_CODE=65900;

  const n=(v)=>{ const x=Number(v||0); return Number.isFinite(x)?x:0; };
  const cash=(v)=> typeof window.money==='function' ? window.money(v) : '₹'+n(v).toLocaleString('en-IN');
  const currentYear=()=>String(new Date().getFullYear());

  function profitState(){
    try{ return typeof state!=='undefined' && state ? state : {}; }catch(_){ return {}; }
  }

  function combinedProfitBreakdown(year){
    const y=String(year||'').trim();
    const s=profitState();
    let itemSales=0,daily=0,monthly=0;
    (s.sales||[]).forEach(row=>{
      const date=String(row.date||'').trim();
      if(!date.startsWith(y+'-')) return;
      const qty=Math.max(0,n(row.qty));
      itemSales+=(n(row.sellingPrice)-n(row.purchasePrice))*qty;
    });
    (s.daily||[]).forEach(row=>{
      const date=String(row.date||'').trim();
      if(date.startsWith(y+'-')) daily+=n(row.profit);
    });
    (s.monthly||[]).forEach(row=>{
      const month=String(row.month||'').trim();
      if(month.startsWith(y+'-')) monthly+=n(row.profit);
    });
    return {year:y,itemSales,daily,monthly,total:itemSales+daily+monthly};
  }

  function combinedMonthlySeries(){
    const s=profitState();
    const map={};
    const add=(month,value)=>{
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
      map[month]=(map[month]||0)+n(value);
    };
    (s.sales||[]).forEach(row=>{
      const date=String(row.date||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      add(date.slice(0,7),(n(row.sellingPrice)-n(row.purchasePrice))*Math.max(0,n(row.qty)));
    });
    (s.daily||[]).forEach(row=>{
      const date=String(row.date||'').trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(date)) add(date.slice(0,7),n(row.profit));
    });
    (s.monthly||[]).forEach(row=>add(String(row.month||'').trim(),n(row.profit)));
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b));
  }

  function combinedYearlyProfitForYear(year){
    return combinedProfitBreakdown(year).total;
  }

  function combinedMonthlyStatsForYear(year){
    const y=String(year||'').trim();
    const vals=combinedMonthlySeries().filter(([m])=>m.startsWith(y+'-')).map(([,v])=>n(v));
    const total=vals.reduce((a,b)=>a+b,0);
    return {count:vals.length,avg:vals.length?total/vals.length:0,high:vals.length?Math.max(...vals):0,low:vals.length?Math.min(...vals):0,total};
  }

  // User-facing Yearly Profit is one combined figure across every profit input in Sales.
  window.vy659CombinedProfitBreakdown=combinedProfitBreakdown;
  window.resolvedMonthlyProfitSeries=combinedMonthlySeries;
  window.yearlyProfitForYear=combinedYearlyProfitForYear;
  window.monthlyStatsForYear=combinedMonthlyStatsForYear;

  function footerMarkup(){
    return '<img class="vy659-footer-logo" src="footer-logo.png" alt="Vyapar AI">'+
      '<span>© 2026 Vyapar AI. All Rights Reserved.</span>'+
      '<span class="app-legal-links">'+
        '<a href="privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>'+
        '<a href="terms.html" target="_blank" rel="noopener noreferrer">Terms</a>'+
        '<a href="refund.html" target="_blank" rel="noopener noreferrer">Refund</a>'+
        '<a href="delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a>'+
      '</span>'+
      '<strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';
  }

  function placeFooterOnlyInSettings(){
    // Remove branding footer from More sheet and any non-settings app surface.
    document.querySelectorAll('.android-sheet-legal').forEach(node=>node.remove());
    document.querySelectorAll('.gupta-legacy-signature').forEach(node=>{
      if(!node.closest('#appLegalFooter')) node.remove();
    });

    let footer=document.getElementById('appLegalFooter');
    if(!footer){
      footer=document.createElement('footer');
      footer.id='appLegalFooter';
      footer.className='app-legal-footer';
    }
    footer.innerHTML=footerMarkup();
    footer.classList.add('vy659-settings-footer');
    const settingsStack=document.querySelector('#screen-settings .settings-stack');
    if(settingsStack){
      if(footer.parentNode!==settingsStack) settingsStack.appendChild(footer);
      footer.style.display='';
    }else{
      footer.style.display='none';
    }
  }

  function enhanceSales(){
    const screen=document.getElementById('screen-sales');
    if(!screen) return;
    const year=currentYear();
    const b=combinedProfitBreakdown(year);
    let card=document.getElementById('vy659CombinedProfitCard');
    if(!card){
      card=document.createElement('div');
      card.id='vy659CombinedProfitCard';
      card.className='card vy659-combined-profit-card';
      screen.prepend(card);
    }
    card.innerHTML='<div class="vy659-profit-title"><div><span class="home-section-kicker">COMBINED PROFIT</span><h2>Yearly Profit · '+year+'</h2></div><strong>'+cash(b.total)+'</strong></div>'+
      '<div class="vy659-profit-breakdown">'+
        '<span><b>'+cash(b.itemSales)+'</b><small>Item sales profit</small></span>'+
        '<span><b>'+cash(b.daily)+'</b><small>Daily profit entries</small></span>'+
        '<span><b>'+cash(b.monthly)+'</b><small>Monthly profit entries</small></span>'+
      '</div><p class="muted vy659-profit-note">Yearly Profit adds all profit recorded in Sales: item-sale profit + daily profit + monthly profit.</p>';

    const dailyCard=[...screen.querySelectorAll('.card')].find(c=>/Daily Quick Entry/i.test(c.querySelector('h2')?.textContent||''));
    if(dailyCard && !dailyCard.querySelector('.vy659-included-note')){
      const p=document.createElement('small'); p.className='muted vy659-included-note'; p.textContent='Daily Profit is included in Yearly Profit.'; dailyCard.appendChild(p);
    }
    const monthlyCard=document.getElementById('monthly-profit-entry');
    if(monthlyCard && !monthlyCard.querySelector('.vy659-included-note')){
      const p=document.createElement('small'); p.className='muted vy659-included-note'; p.textContent='Monthly Profit is included in Yearly Profit.'; monthlyCard.appendChild(p);
    }
  }

  function enhanceAnalytics(){
    const screen=document.getElementById('screen-analytics'); if(!screen) return;
    const year=currentYear(); const b=combinedProfitBreakdown(year);
    const finance=screen.querySelector('.insight-finance-card');
    if(finance){
      const h=finance.querySelector('h2'); if(h) h.textContent='Yearly Profit Summary';
      const nums=finance.querySelector('.insight-finance-numbers');
      if(nums) nums.innerHTML=
        '<div><strong>'+cash(b.total)+'</strong><span>Combined yearly profit</span></div>'+ 
        '<div><strong>'+cash(b.itemSales)+'</strong><span>Item sales profit</span></div>'+ 
        '<div><strong>'+cash(b.daily+b.monthly)+'</strong><span>Daily + monthly profit</span></div>';
      let note=finance.querySelector('.vy658-finance-note');
      if(!note){ note=document.createElement('p'); note.className='muted vy658-finance-note'; finance.appendChild(note); }
      note.textContent='Combined Yearly Profit adds item-sale profit, daily profit entries and monthly profit entries. Accounting P&L remains transaction-based.';
    }
  }

  // Keep the 6.5.8 transaction-only margin safety, but use the 6.5.9 version fallback for update checks.
  if(typeof window.fs607CheckUpdate==='function'){
    window.fs607CheckUpdate=async function(manual){
      try{
        let currentCode=VERSION_CODE,currentName=VERSION;
        if(window.AndroidApp){
          try{ if(typeof AndroidApp.getVersionCode==='function') currentCode=Number(AndroidApp.getVersionCode())||currentCode; }catch(_){}
          try{ if(typeof AndroidApp.getVersionName==='function') currentName=String(AndroidApp.getVersionName()||currentName); }catch(_){}
        }
        const base=(typeof window.API_BASE_URL==='string'&&window.API_BASE_URL)||'https://vypar-backend.onrender.com';
        const res=await fetch(base+'/app/version',{headers:{Accept:'application/json'}});
        const data=await res.json();
        if(!res.ok||!data.success) throw new Error(data.message||'Update check failed');
        try{
          if(typeof state!=='undefined'&&state){
            state.appUpdate={checkedAt:new Date().toISOString(),currentCode,currentName,...data};
            localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(state));
          }
        }catch(_){}
        if(Number(data.versionCode)>currentCode){
          const force=currentCode<Number(data.minimumSupportedVersionCode||0);
          const msg='Vyapar AI '+data.versionName+' available'+(force?' (required)':'')+'.';
          if(data.apkUrl){
            const ok=confirm(msg+'\n\nOpen the update download?');
            if(ok){
              if(window.AndroidApp&&typeof AndroidApp.openExternalUrl==='function') AndroidApp.openExternalUrl(data.apkUrl);
              else window.open(data.apkUrl,'_blank','noopener');
            }
          }else if(manual && typeof window.showGlassToast==='function') showGlassToast(msg+' Download link is not available yet.');
        }else if(manual){
          if(typeof window.showGlassToast==='function') showGlassToast('App is up to date: '+currentName);
          else alert('App is up to date: '+currentName);
        }
        return data;
      }catch(e){
        if(manual){
          if(typeof window.showGlassToast==='function') showGlassToast('Update check failed. Please try again.');
          else alert('Update check failed. Please try again.');
        }
        return null;
      }
    };
  }

  function polish(){ placeFooterOnlyInSettings(); enhanceSales(); enhanceAnalytics(); }

  if(typeof window.renderSales==='function'){
    const old=window.renderSales;
    window.renderSales=function(){ const r=old.apply(this,arguments); enhanceSales(); placeFooterOnlyInSettings(); return r; };
  }
  if(typeof window.renderAnalytics==='function'){
    const old=window.renderAnalytics;
    window.renderAnalytics=function(){ const r=old.apply(this,arguments); enhanceAnalytics(); placeFooterOnlyInSettings(); return r; };
  }
  if(typeof window.renderSettings==='function'){
    const old=window.renderSettings;
    window.renderSettings=function(){ const r=old.apply(this,arguments); setTimeout(placeFooterOnlyInSettings,0); return r; };
  }
  if(typeof window.renderHome==='function'){
    const old=window.renderHome;
    window.renderHome=function(){ return old.apply(this,arguments); };
  }

  const observer=new MutationObserver(()=>{
    clearTimeout(window.__vy659Timer);
    window.__vy659Timer=setTimeout(polish,20);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('load',()=>setTimeout(polish,0),{once:true});
  setTimeout(()=>{
    try{ if(typeof window.renderHome==='function') window.renderHome(); }catch(_){}
    try{ if(typeof window.renderSales==='function') window.renderSales(); }catch(_){}
    try{ if(typeof window.renderAnalytics==='function') window.renderAnalytics(); }catch(_){}
    try{ if(typeof window.renderSettings==='function') window.renderSettings(); }catch(_){}
    polish();
  },0);
})();
