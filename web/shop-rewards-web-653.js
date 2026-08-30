/* Vyapar AI 6.5.3 web small-shop growth & reward system, ported from Android. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('web-ui')) return;

  const REWARD_STORE = 'vyapar_ai_shop_rewards_v1';

  function safeState(){
    try { return typeof state !== 'undefined' && state ? state : {}; }
    catch(error){ return {}; }
  }

  function n(value){
    try { return typeof num === 'function' ? num(value) : Number(value || 0) || 0; }
    catch(error){ return Number(value || 0) || 0; }
  }

  function moneyText(value){
    try { return typeof money === 'function' ? money(value) : '₹' + Math.round(n(value)).toLocaleString('en-IN'); }
    catch(error){ return '₹' + Math.round(n(value)).toLocaleString('en-IN'); }
  }

  function dayKey(value){
    const d = value instanceof Date ? value : new Date(value);
    if(Number.isNaN(d.getTime())) return '';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }

  function monthKeyLocal(value){
    const d = value instanceof Date ? value : new Date(value);
    if(Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0');
  }

  function shiftDays(date, delta){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + delta);
    return d;
  }

  function dayMetrics(dateString){
    const s = safeState();
    let itemSale = 0;
    let itemProfit = 0;
    let itemRecords = 0;
    let dailySale = 0;
    let dailyProfit = 0;
    let dailyRecords = 0;

    (Array.isArray(s.sales) ? s.sales : []).forEach(item => {
      if(String(item && item.date || '').trim() !== dateString) return;
      const qty = Math.max(0, n(item.qty));
      const selling = Math.max(0, n(item.sellingPrice));
      const purchase = Math.max(0, n(item.purchasePrice));
      itemSale += selling * qty;
      itemProfit += (selling - purchase) * qty;
      itemRecords += 1;
    });

    (Array.isArray(s.daily) ? s.daily : []).forEach(item => {
      if(String(item && item.date || '').trim() !== dateString) return;
      dailySale += Math.max(0, n(item.sale));
      dailyProfit += n(item.profit);
      dailyRecords += 1;
    });

    const hasDaily = dailyRecords > 0;
    return {
      sale: hasDaily ? dailySale : itemSale,
      profit: hasDaily ? dailyProfit : itemProfit,
      records: hasDaily ? dailyRecords : itemRecords,
      active: hasDaily || itemRecords > 0
    };
  }

  function activityDates(){
    const s = safeState();
    const set = new Set();
    (Array.isArray(s.sales) ? s.sales : []).forEach(item => {
      const d = String(item && item.date || '').trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
    });
    (Array.isArray(s.daily) ? s.daily : []).forEach(item => {
      const d = String(item && item.date || '').trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
    });
    return set;
  }

  function currentStreak(){
    const dates = activityDates();
    if(!dates.size) return 0;
    const today = new Date();
    let cursor = today;
    if(!dates.has(dayKey(cursor)) && dates.has(dayKey(shiftDays(cursor,-1)))) cursor = shiftDays(cursor,-1);
    let count = 0;
    while(count < 366 && dates.has(dayKey(cursor))){
      count += 1;
      cursor = shiftDays(cursor,-1);
    }
    return count;
  }

  function monthMetrics(month){
    const s = safeState();
    const dates = new Set();
    (Array.isArray(s.sales) ? s.sales : []).forEach(item => {
      const d = String(item && item.date || '').trim();
      if(d.startsWith(month + '-')) dates.add(d);
    });
    (Array.isArray(s.daily) ? s.daily : []).forEach(item => {
      const d = String(item && item.date || '').trim();
      if(d.startsWith(month + '-')) dates.add(d);
    });
    let sale = 0;
    let profit = 0;
    let records = 0;
    dates.forEach(d => {
      const m = dayMetrics(d);
      sale += m.sale;
      profit += m.profit;
      records += m.records;
    });
    return { sale, profit, records, activeDays: dates.size };
  }

  function stockHealth(){
    const s = safeState();
    const list = Array.isArray(s.stocks) ? s.stocks : [];
    if(!list.length) return { score: 8, low: 0, total: 0, message: 'Stock records add karne par score aur accurate hoga.' };
    let low = 0;
    list.forEach(item => {
      const qty = Math.max(0, n(item.qty !== undefined ? item.qty : item.availableQty));
      const min = Math.max(0, n(item.lowStock !== undefined ? item.lowStock : item.minAlertQty));
      if(min > 0 && qty <= min) low += 1;
    });
    const ratio = low / list.length;
    const score = Math.max(0, Math.round(25 * (1 - ratio)));
    return {
      score,
      low,
      total: list.length,
      message: low ? low + ' low-stock item' + (low === 1 ? '' : 's') + ' ko update/restock karein.' : 'Stock position healthy dikh rahi hai.'
    };
  }

  function healthScore(streak, today, month){
    const s = safeState();
    const stock = stockHealth();
    const consistency = Math.min(30, Math.round((Math.min(streak, 7) / 7) * 30));
    const totalSale = month.sale;
    const margin = totalSale > 0 ? (month.profit / totalSale) * 100 : 0;
    const marginScore = totalSale <= 0 ? 5 : Math.max(0, Math.min(25, Math.round((Math.max(0, margin) / 25) * 25)));
    const tracking = Math.min(20, Math.round((Math.min(month.activeDays, 8) / 8) * 20));
    const score = Math.max(0, Math.min(100, consistency + marginScore + tracking + stock.score));
    let next = 'Aaj ki sale ya daily entry save karke tracking start karein.';
    if(streak < 7 && today.active) next = '7-day Hisaab Streak ke liye daily records continue rakhein.';
    else if(stock.low > 0) next = stock.message;
    else if(totalSale > 0 && margin < 20) next = 'Purchase price aur selling margin review karein.';
    else if(month.activeDays < 8) next = 'Regular entries se Business Health aur reliable hoga.';
    else next = 'Records healthy hain — stock rotation aur repeat customers par focus karein.';
    return { score, margin, stock, next };
  }

  function growthData(){
    const now = new Date();
    const todayKey = dayKey(now);
    const yesterdayKey = dayKey(shiftDays(now,-1));
    const month = monthKeyLocal(now);
    const today = dayMetrics(todayKey);
    const yesterday = dayMetrics(yesterdayKey);
    const monthData = monthMetrics(month);
    const streak = currentStreak();
    const s = safeState();
    const yearGoal = Math.max(1, n(s.profile && s.profile.yearlyGoal) || 600000);
    const monthlyPaceGoal = yearGoal / 12;
    const monthlyProgress = Math.max(0, Math.min(100, monthlyPaceGoal ? monthData.sale / monthlyPaceGoal * 100 : 0));
    const health = healthScore(streak, today, monthData);
    let totalsData = { saleTotal: 0, profit: 0, margin: 0, year: String(now.getFullYear()) };
    try { if(typeof totals === 'function') totalsData = totals(); } catch(error){}
    const salesRecords = (Array.isArray(s.sales) ? s.sales.length : 0) + (Array.isArray(s.daily) ? s.daily.length : 0);
    const milestones = [
      { id:'sale10k', label:'₹10K Sales', detail:'Recorded yearly sales', done:n(totalsData.saleTotal) >= 10000 },
      { id:'sale50k', label:'₹50K Sales', detail:'Recorded yearly sales', done:n(totalsData.saleTotal) >= 50000 },
      { id:'sale1l', label:'₹1 Lakh Sales', detail:'Recorded yearly sales', done:n(totalsData.saleTotal) >= 100000 },
      { id:'records50', label:'50 Records', detail:'Sales / daily records', done:salesRecords >= 50 },
      { id:'records100', label:'100 Records', detail:'Consistent shop tracking', done:salesRecords >= 100 },
      { id:'streak7', label:'7-Day Hisaab Streak', detail:'Consecutive record days', done:streak >= 7 },
      { id:'streak30', label:'30-Day Hisaab Streak', detail:'Long-term consistency', done:streak >= 30 }
    ];
    const unlocked = milestones.filter(m => m.done).length;
    const levels = ['Shuruaat','Growing Shop','Strong Business','Established'];
    const levelIndex = unlocked >= 6 ? 3 : unlocked >= 4 ? 2 : unlocked >= 2 ? 1 : 0;
    const change = today.sale - yesterday.sale;
    let appreciation = 'Aaj ka hisaab record karte hi yahan aapki real progress dikhegi.';
    if(today.sale > 0 && yesterday.sale > 0 && change > 0) appreciation = 'Aaj ki recorded sale kal se ' + moneyText(change) + ' zyada hai.';
    else if(today.sale > 0 && yesterday.sale > 0 && change < 0) appreciation = 'Aaj ki sale kal se ' + moneyText(Math.abs(change)) + ' kam hai — daily trend track ho raha hai.';
    else if(today.sale > 0) appreciation = 'Aaj ' + moneyText(today.sale) + ' ki sale record hui hai. Hisaab updated hai.';
    else if(streak > 0) appreciation = streak + '-day Hisaab Streak active hai. Aaj ki entry se ise continue rakhein.';
    return { now, today, yesterday, monthData, streak, monthlyPaceGoal, monthlyProgress, health, totalsData, salesRecords, milestones, unlocked, level:levels[levelIndex], appreciation, change };
  }

  function summaryMarkup(d){
    const direction = d.change > 0 ? '↑ ' + moneyText(d.change) : d.change < 0 ? '↓ ' + moneyText(Math.abs(d.change)) : 'No change yet';
    const progress = Math.round(d.monthlyProgress);
    const unlockedText = d.unlocked + '/' + d.milestones.length;
    return `
      <section class="card shop-growth-card" id="shopGrowthSummary" aria-labelledby="shopGrowthTitle">
        <div class="shop-growth-head">
          <div>
            <span class="home-section-kicker">YOUR SHOP PROGRESS</span>
            <h3 id="shopGrowthTitle">Aaj ki Jeet</h3>
            <p>${d.appreciation}</p>
          </div>
          <div class="shop-streak" aria-label="${d.streak} day Hisaab streak"><span>🔥</span><b>${d.streak}</b><small>day streak</small></div>
        </div>
        <div class="shop-reward-grid">
          <div class="shop-reward-stat"><span>Sales today</span><b>${moneyText(d.today.sale)}</b><small>${d.yesterday.sale > 0 ? direction + ' vs yesterday' : 'Real saved sales only'}</small></div>
          <div class="shop-reward-stat"><span>Health score</span><b>${d.health.score}<em>/100</em></b><small>${d.health.next}</small></div>
          <div class="shop-reward-stat wide"><span>Monthly pace goal</span><b>${moneyText(d.monthData.sale)} <em>/ ${moneyText(d.monthlyPaceGoal)}</em></b><div class="shop-mini-track"><i style="width:${progress}%"></i></div><small>${progress}% of monthly pace derived from yearly goal</small></div>
        </div>
        <div class="shop-growth-foot">
          <div><b>${d.level}</b><small>Shop level · real activity based</small></div>
          <div><b>${unlockedText}</b><small>Milestones unlocked</small></div>
          <button type="button" class="btn primary shop-progress-btn" id="openShopProgress">View Progress</button>
        </div>
      </section>`;
  }

  function milestoneMarkup(m){
    return `<div class="shop-milestone ${m.done ? 'done' : ''}"><span class="shop-milestone-icon">${m.done ? '✓' : '○'}</span><div><b>${m.label}</b><small>${m.detail}</small></div></div>`;
  }

  function openProgress(){
    const old = document.getElementById('shopProgressSheet');
    if(old) old.remove();
    const d = growthData();
    const nextLocked = d.milestones.find(m => !m.done);
    const sheet = document.createElement('div');
    sheet.id = 'shopProgressSheet';
    sheet.className = 'shop-progress-overlay';
    sheet.innerHTML = `
      <div class="shop-progress-sheet" role="dialog" aria-modal="true" aria-labelledby="shopProgressHeading">
        <div class="shop-sheet-handle"></div>
        <div class="shop-sheet-head"><div><span class="home-section-kicker">SMALL SHOP GROWTH</span><h2 id="shopProgressHeading">Your Shop Journey</h2><p>Rewards sirf aapke saved business records se bante hain.</p></div><button type="button" class="shop-sheet-close" id="closeShopProgress" aria-label="Close">×</button></div>
        <div class="shop-sheet-score"><div class="shop-score-ring" style="--score:${d.health.score}"><span><b>${d.health.score}</b><small>/100</small></span></div><div><h3>Business Health</h3><p>${d.health.next}</p><small>Consistency + margin + stock + record completeness</small></div></div>
        <div class="shop-sheet-section"><div class="shop-sheet-title"><h3>Milestones</h3><span>${d.unlocked}/${d.milestones.length} unlocked</span></div><div class="shop-milestone-list">${d.milestones.map(milestoneMarkup).join('')}</div></div>
        <div class="shop-sheet-section"><div class="shop-sheet-title"><h3>Next target</h3></div><div class="shop-next-target"><b>${nextLocked ? nextLocked.label : 'All current milestones complete 🎉'}</b><p>${nextLocked ? nextLocked.detail : 'Naye milestones future growth ke saath add ho sakte hain.'}</p></div></div>
        <div class="shop-sheet-section"><div class="shop-sheet-title"><h3>This month</h3></div><div class="shop-month-grid"><div><span>Sales</span><b>${moneyText(d.monthData.sale)}</b></div><div><span>Profit</span><b>${moneyText(d.monthData.profit)}</b></div><div><span>Active days</span><b>${d.monthData.activeDays}</b></div><div><span>Records</span><b>${d.monthData.records}</b></div></div></div>
        <div class="shop-sheet-note"><b>No fake coins or paid XP.</b><span>Level aur milestones subscription se nahi, real shop activity se badhte hain.</span></div>
      </div>`;
    document.body.appendChild(sheet);
    document.body.classList.add('shop-progress-open');
    const close = () => { sheet.remove(); document.body.classList.remove('shop-progress-open'); };
    sheet.querySelector('#closeShopProgress').addEventListener('click', close);
    sheet.addEventListener('click', event => { if(event.target === sheet) close(); });
  }

  function persistMilestoneState(d){
    try {
      const prev = JSON.parse(localStorage.getItem(REWARD_STORE) || '{}');
      const doneIds = d.milestones.filter(m => m.done).map(m => m.id);
      const previousIds = Array.isArray(prev.doneIds) ? prev.doneIds : [];
      const newlyUnlocked = doneIds.filter(id => !previousIds.includes(id));
      localStorage.setItem(REWARD_STORE, JSON.stringify({ doneIds, updatedAt: Date.now() }));
      if(previousIds.length && newlyUnlocked.length && typeof showGlassToast === 'function'){
        const item = d.milestones.find(m => m.id === newlyUnlocked[0]);
        if(item) showGlassToast('Milestone unlocked: ' + item.label, 'success', 3200);
      }
    } catch(error){}
  }

  function enhanceHome(){
    const screen = document.getElementById('screen-home');
    if(!screen || screen.querySelector('#shopGrowthSummary')) return;
    const overview = screen.querySelector('.home-overview');
    if(!overview) return;
    const d = growthData();
    overview.insertAdjacentHTML('afterend', summaryMarkup(d));
    const button = screen.querySelector('#openShopProgress');
    if(button) button.addEventListener('click', openProgress);
    persistMilestoneState(d);
  }

  function boot(){
    enhanceHome();
    const screen = document.getElementById('screen-home');
    if(!screen) return;
    const observer = new MutationObserver(function(){
      if(!screen.querySelector('#shopGrowthSummary')) enhanceHome();
    });
    observer.observe(screen, { childList:true, subtree:false });
    window.openShopProgress = openProgress;
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
