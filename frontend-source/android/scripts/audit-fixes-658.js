/* Vyapar AI 6.5.8 — audit stability and financial clarity patch. */
(function(){
  'use strict';
  const V='6.5.9';

  function currentYear(){ return String(new Date().getFullYear()); }
  function n(v){ const x=Number(v||0); return Number.isFinite(x)?x:0; }
  function moneySafe(v){ return typeof window.money==='function' ? window.money(v) : '₹'+n(v).toLocaleString('en-IN'); }
  function pctSafe(v){ return typeof window.pct==='function' ? window.pct(v) : n(v).toFixed(1)+'%'; }

  function transactionProfitForYear(year){
    try{
      const prefix=String(year)+'-';
      const detailed=typeof window.detailedBusinessData==='function' ? window.detailedBusinessData() : null;
      if(detailed && detailed.profitByMonth){
        return Object.entries(detailed.profitByMonth)
          .filter(([month])=>String(month).startsWith(prefix))
          .reduce((sum,[,value])=>sum+n(value),0);
      }
    }catch(_){}
    return 0;
  }
  window.vy658TransactionProfitForYear=transactionProfitForYear;

  // Keep manually recorded yearly profit separate from transaction-derived margin.
  if(typeof window.totals==='function'){
    window.totals=function(){
      const year=typeof window.currentYearValue==='function' ? window.currentYearValue() : currentYear();
      const profit=typeof window.yearlyProfitForYear==='function' ? window.yearlyProfitForYear(year) : 0;
      const saleTotal=typeof window.yearlySalesForYear==='function' ? window.yearlySalesForYear(year) : 0;
      const transactionProfit=transactionProfitForYear(year);
      return {year,saleTotal,profit,transactionProfit,qty:0,margin:saleTotal?transactionProfit/saleTotal*100:0};
    };
  }

  function enhanceHome(){
    const screen=document.getElementById('screen-home'); if(!screen) return;
    const stats=[...screen.querySelectorAll('.home-metrics .stat')];
    const margin=stats.find(card=>/margin/i.test(card.textContent||''));
    if(margin){
      const small=margin.querySelector('small');
      if(small) small.textContent='Recorded transaction profit vs sales';
    }
  }

  function enhanceAnalytics(){
    const screen=document.getElementById('screen-analytics'); if(!screen) return;
    const year=typeof window.currentYearValue==='function'?window.currentYearValue():currentYear();
    const declared=typeof window.yearlyProfitForYear==='function'?window.yearlyProfitForYear(year):0;
    const revenue=typeof window.yearlySalesForYear==='function'?window.yearlySalesForYear(year):0;
    const recordedProfit=transactionProfitForYear(year);
    let trackedExpenses=0;
    try{
      const b=typeof window.analyticsExpenseBreakdown==='function'?window.analyticsExpenseBreakdown(year):{};
      trackedExpenses=Object.values(b||{}).reduce((s,v)=>s+n(v),0);
    }catch(_){}

    const finance=screen.querySelector('.insight-finance-card');
    if(finance){
      const h=finance.querySelector('h2'); if(h) h.textContent='Transaction Snapshot';
      const nums=finance.querySelector('.insight-finance-numbers');
      if(nums) nums.innerHTML=
        '<div><strong>'+moneySafe(revenue)+'</strong><span>Recorded revenue</span></div>'+ 
        '<div><strong>'+moneySafe(recordedProfit)+'</strong><span>Recorded transaction profit</span></div>'+ 
        '<div><strong>'+moneySafe(trackedExpenses)+'</strong><span>Tracked expenses</span></div>';
      let note=finance.querySelector('.vy658-finance-note');
      if(!note){ note=document.createElement('p'); note.className='muted vy658-finance-note'; finance.appendChild(note); }
      note.textContent='Manual / historical yearly profit ('+moneySafe(declared)+') is kept separate so transaction revenue is never mixed with declared profit.';
      const mini=finance.querySelector('.insight-mini-goal'); if(mini) mini.style.display='none';
      const oldGoal=[...finance.querySelectorAll('small.muted')].find(x=>/yearly profit goal/i.test(x.textContent||'')); if(oldGoal) oldGoal.style.display='none';
    }
    const pnl=screen.querySelector('.insight-pnl-card');
    if(pnl){
      const h=pnl.querySelector('h2'); if(h) h.textContent='Recorded Revenue & Costs';
      const kicker=pnl.querySelector('.home-section-kicker'); if(kicker) kicker.textContent='TRANSACTION DATA';
    }
  }

  // Render wrappers are intentionally additive: no feature or core module is removed.
  if(typeof window.renderHome==='function'){
    const old=window.renderHome;
    window.renderHome=function(){ const r=old.apply(this,arguments); enhanceHome(); return r; };
  }
  if(typeof window.renderAnalytics==='function'){
    const old=window.renderAnalytics;
    window.renderAnalytics=function(){ const r=old.apply(this,arguments); enhanceAnalytics(); return r; };
  }

  // Disable the heavy full-screen transition overlay. Screens are already rendered locally.
  window.showTabLoader=function(){
    const l=document.getElementById('tabLoader'); if(l) l.classList.remove('show');
  };

  // Update check persists metadata without calling the global save() render cycle.
  window.fs607CheckUpdate=async function(manual){
    try{
      let currentCode=65900,currentName=V;
      if(window.AndroidApp){
        try{ if(typeof AndroidApp.getVersionCode==='function') currentCode=Number(AndroidApp.getVersionCode())||currentCode; }catch(_){}
        try{ if(typeof AndroidApp.getVersionName==='function') currentName=String(AndroidApp.getVersionName()||currentName); }catch(_){}
      }
      const base=(typeof window.API_BASE_URL==='string'&&window.API_BASE_URL)||'https://vypar-backend.onrender.com';
      const res=await fetch(base+'/app/version',{headers:{Accept:'application/json'}});
      const data=await res.json();
      if(!res.ok||!data.success) throw new Error(data.message||'Update check failed');
      if(typeof state!=='undefined' && state){
        state.appUpdate={checkedAt:new Date().toISOString(),currentCode,currentName,...data};
        try{
          const key=(typeof window.STORAGE_KEY==='string'&&window.STORAGE_KEY)||'vyapar_ai_prod_v1';
          localStorage.setItem(key,JSON.stringify(state));
        }catch(_){}
      }
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

  function enhanceSettings(){
    const screen=document.getElementById('screen-settings'); if(!screen) return;
    [...screen.querySelectorAll('.card')].forEach(card=>{
      const h=card.querySelector('h2');
      if(h && /app update/i.test(h.textContent||'')){
        const p=card.querySelector('p.muted');
        if(p) p.textContent='Check whether a newer Vyapar AI version is available.';
      }
    });
  }

  function enhanceSales(){
    const screen=document.getElementById('screen-sales'); if(!screen) return;
    // Gold is reserved for premium status; normal save actions use primary blue.
    [...screen.querySelectorAll('button.gold')].forEach(b=>{ b.classList.remove('gold'); b.classList.add('primary'); });
    // Stage 2 owns the canonical Year filter. Remove the legacy injector so
    // MutationObserver rerenders cannot create a second Year selector beside it.
    const card=document.getElementById('monthly-profit-records');
    if(card) card.querySelectorAll('.vy658-year-filter').forEach(node=>node.remove());
  }

  function enhanceStock(){
    const screen=document.getElementById('screen-stock'); if(!screen) return;
    const empty=[...screen.querySelectorAll('p.muted')].find(p=>(p.textContent||'').trim()==='No stock data yet.');
    if(empty){
      empty.className='vy658-empty-state';
      empty.innerHTML='<b>No stock added yet</b><span>Add your first item to start quantity and low-stock tracking.</span><button type="button" class="btn primary">+ Add Stock Item</button>';
      empty.querySelector('button').addEventListener('click',()=>{ const i=document.getElementById('stockItem'); if(i){i.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>i.focus(),250);} });
    }
  }

  function enhanceBulkLabels(root=document){
    [...root.querySelectorAll('button')].forEach(b=>{
      const t=(b.textContent||'').trim();
      const oc=b.getAttribute('onclick')||'';
      if(t==='Clear Selected') b.textContent='Deselect All';
      else if(t==='Clear' && /SelectAll|selectAll|SelectAllRecent|LegacySelectAll|StockSelectAll|DataSelectAll|PlatformTxSelectAll|GenericSelectAll/.test(oc)) b.textContent='Deselect All';
    });
  }

  function enhanceFooter(root=document){
    root.querySelectorAll('#appLegalFooter,.android-sheet-legal').forEach(footer=>{
      if(!footer.querySelector('.vy658-footer-logo')){
        const img=document.createElement('img'); img.className='vy658-footer-logo'; img.src='assets/images/footer-logo.png'; img.alt='Vyapar AI'; footer.prepend(img);
      }
      [...footer.querySelectorAll('a')].forEach(a=>{ if(/delete account/i.test(a.textContent||'')) a.remove(); });
    });
  }

  function polish(){ enhanceHome(); enhanceAnalytics(); enhanceSettings(); enhanceSales(); enhanceStock(); enhanceBulkLabels(); enhanceFooter(); }
  const observer=new MutationObserver(()=>{ clearTimeout(window.__vy658PolishTimer); window.__vy658PolishTimer=setTimeout(polish,30); });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('load',()=>setTimeout(polish,0),{once:true});
  setTimeout(()=>{
    // Re-render the two finance surfaces once so corrected totals are visible immediately.
    try{ if(typeof window.renderHome==='function') window.renderHome(); }catch(_){}
    try{ if(typeof window.renderAnalytics==='function') window.renderAnalytics(); }catch(_){}
    polish();
  },0);
})();
