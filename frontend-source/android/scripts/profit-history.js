/* One pass per source, independent of how many historical years are stored.
 * Same precedence as the accounting dashboard: posted sales > daily > items;
 * latest manual monthly profit is additive. Expenses are deducted exactly once. */
(function (root) {
  'use strict';
  const number = v => { const n = Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
  function date(value) {
    const raw = String(value || ''), match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const y = +match[1], m = +match[2], d = +match[3];
    const max = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return m >= 1 && m <= 12 && d >= 1 && d <= max ? raw.slice(0, 10) : '';
  }
  function empty(year) { return { year: String(year), revenue: 0, profit: 0, expenses: 0, net: 0, months: {} }; }
  function build(state) {
    const s = state || {}, years = {}, days = new Map(), manual = new Map();
    const business = String(s.activeBusinessId || s.currentStoreId || 'MAIN');
    const day = key => { if (!days.has(key)) days.set(key, {}); return days.get(key); };
    const month = (key, activity = true) => {
      const y = key.slice(0, 4), f = years[y] || (years[y] = empty(y));
      const m = f.months[key] || (f.months[key] = { revenue: 0, profit: 0, expenses: 0, net: 0, activity: false });
      if(activity) m.activity = true;
      return m;
    };
    (s.sales || []).forEach(x => {
      const d = date(x.date); if (!d) return;
      const bucket = day(d), r = bucket.item || (bucket.item = { revenue: 0, profit: 0 });
      const q = Math.max(0, number(x.qty));
      r.revenue += Math.max(0, number(x.sellingPrice)) * q;
      r.profit += (number(x.sellingPrice) - number(x.purchasePrice)) * q;
    });
    (s.daily || []).forEach(x => {
      const d = date(x.date); if (d) day(d).daily = { revenue: Math.max(0, number(x.sale)), profit: number(x.profit) };
    });
    (s.transactions611 || []).forEach(t => {
      const type = String(t.type).toUpperCase();
      if (String(t.businessId || 'MAIN') !== business || t.status === 'cancelled' || !['SALE', 'SALE_RETURN'].includes(type)) return;
      const d = date(t.date); if (!d) return;
      let revenue = 0, cost = 0;
      (t.items || []).forEach(i => {
        const qty = Math.max(0, number(i.qty || i.quantity));
        revenue += qty * Math.max(0, number(i.rate || i.price)) * (1 - Math.max(0, number(i.discount)) / 100);
        cost += qty * Math.max(0, number(i.purchaseRate || i.purchasePrice));
      });
      if (!(t.items || []).length) revenue = Math.max(0, number(t.baseAmount || t.total) - number(t.tax) - number(t.cess));
      const bucket = day(d), r = bucket.accounting || (bucket.accounting = { revenue: 0, profit: 0 }), sign = type === 'SALE_RETURN' ? -1 : 1;
      r.revenue += sign * revenue; r.profit += sign * (revenue - cost);
    });
    days.forEach((bucket, key) => {
      const v = bucket.accounting || bucket.daily || bucket.item, m = month(key.slice(0, 7));
      m.revenue += v.revenue; m.profit += v.profit;
    });
    (s.monthly || []).forEach(x => {
      const key = String(x.month || '').slice(0, 7);
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) manual.set(key, number(x.profit));
    });
    manual.forEach((value, key) => { month(key).profit += value; });
    (s.expenses || []).forEach(x => { const d = date(x.date); if (d) month(d.slice(0, 7), false).expenses += number(x.amount); });
    Object.values(years).forEach(f => {
      Object.values(f.months).forEach(m => { m.net = m.profit - m.expenses; f.revenue += m.revenue; f.profit += m.profit; f.expenses += m.expenses; });
      f.net = f.profit - f.expenses;
    });
    return years;
  }
  root.VyaparProfit = { build, empty };
})(window);
