/* Bounded dashboard: one selected year, two chart series at most, eight history
 * rows per page. Full history stays in storage and is available for export. */
(function (root) {
  'use strict';
  let selected = String(new Date().getFullYear()), comparison = String(+selected - 1), view = 'overview', page = 0;
  let snapshot = {}, dirty = true;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const amount = v => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const compact = v => Math.abs(v) >= 10000000 ? (v / 10000000).toFixed(1) + 'Cr' : Math.abs(v) >= 100000 ? (v / 100000).toFixed(1) + 'L' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(Math.round(v));
  const year = y => snapshot[y] || root.VyaparProfit.empty(y);
  const values = y => months.map((_, i) => (year(y).months[y + '-' + String(i + 1).padStart(2, '0')] || {}).net || 0);
  function chart(first, second, labels = months) {
    const all = second ? first.concat(second) : first;
    const min = Math.min(0, ...all), max = Math.max(0, ...all), range = max - min || 1;
    const y = n => 18 + (max - n) / range * 146, zero = y(0), step = 304 / Math.max(1, first.length);
    let svg = '<svg class="insight-chart" viewBox="0 0 360 200" role="img" aria-label="Monthly net profit chart. Exact values in the monthly details table.">';
    [max, (max + min) / 2, min].forEach(n => { svg += '<path class="chart-grid" d="M43 ' + y(n) + 'H352"/><text class="chart-axis" x="37" y="' + (y(n) + 3) + '" text-anchor="end">' + compact(n) + '</text>'; });
    svg += '<path class="chart-zero" d="M43 ' + zero + 'H352"/>';
    first.forEach((n, i) => {
      const x = 48 + i * step;
      [n].concat(second ? [second[i]] : []).forEach((v, j) => {
        const width = second ? 9 : 15, bx = x + j * 11;
        if (v) svg += '<rect class="' + (v < 0 ? 'chart-loss' : j ? 'chart-compare' : 'chart-profit') + '" x="' + bx + '" y="' + Math.min(zero, y(v)) + '" width="' + width + '" height="' + Math.max(1, Math.abs(y(v) - zero)) + '" rx="2"><title>' + labels[i] + ': ' + amount(v) + '</title></rect>';
      });
      svg += '<text class="chart-axis" x="' + (x + 8) + '" y="184" text-anchor="middle">' + labels[i] + '</text>';
    });
    return svg + '</svg>';
  }
  function options(active) {
    return [...new Set(Object.keys(snapshot).concat(selected, comparison, String(new Date().getFullYear())))].sort().reverse().map(y => '<option value="' + y + '"' + (y === active ? ' selected' : '') + '>' + y + '</option>').join('');
  }
  function table(compare) {
    return '<div class="insight-table"><table><thead><tr><th>Month</th>' + (compare ? '<th>' + selected + '</th><th>' + comparison + '</th><th>Change</th>' : '<th>Revenue</th><th>Expenses</th><th>Net profit</th>') + '</tr></thead><tbody>' + months.map((m, i) => {
      const f = year(selected).months[selected + '-' + String(i + 1).padStart(2, '0')] || {};
      const a = values(selected)[i], b = values(comparison)[i];
      return '<tr><th>' + m + '</th>' + (compare ? '<td>' + amount(a) + '</td><td>' + amount(b) + '</td><td>' + amount(a - b) + '</td>' : '<td>' + amount(f.revenue) + '</td><td>' + amount(f.expenses) + '</td><td>' + amount(f.net) + '</td>') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }
  function render(force) {
    const el = document.getElementById('screen-analytics'); if (!el) return;
    if (!force && el.classList.contains('hide')) { dirty = true; return; }
    if (dirty) { snapshot = root.VyaparProfit.build(root.state); dirty = false; }
    const f = year(selected), prior = year(String(+selected - 1));
    const years = Object.keys(snapshot).sort().reverse(), profile = (root.state || {}).profile || {};
    const goal = Math.max(1, Number(profile.yearlyGoal) || 240000), progress = Math.max(0, Math.min(100, f.net / goal * 100));
    const invested = Math.max(0, Number(profile.totalInvestment) || 0);
    const change = prior.net ? ((f.net - prior.net) / Math.abs(prior.net) * 100).toFixed(1) + '% vs ' + (+selected - 1) : 'No previous-year comparison';
    const tabs = '<div class="workspace-tabs" role="tablist" aria-label="Profit views">' + [['overview','Overview'],['compare','Compare'],['history','History'],['plan','Plan']].map(([id,label]) => '<button type="button" role="tab" aria-selected="' + (view === id) + '" onclick="VyaparInsights.selectView(\'' + id + '\')">' + label + '</button>').join('') + '</div>';
    let content = '';
    if (view === 'overview' || view === 'compare') {
      const compare = view === 'compare';
      content = '<section class="card insight-panel"><div class="workspace-heading"><div><h2>Monthly net profit</h2><p class="muted">' + (compare ? 'Compare the same months across two years.' : 'Profit after recorded business expenses.') + '</p></div>' + (compare ? '<label class="year-field"><span>Compare with</span><select aria-label="Comparison year" onchange="VyaparInsights.selectComparison(this.value)">' + options(comparison) + '</select></label>' : '') + '</div>' + (compare ? '<div class="chart-legend"><span>● ' + selected + '</span><span>● ' + comparison + '</span><span>● Loss</span></div>' : '') + chart(values(selected), compare ? values(comparison) : null) + (!Object.keys(f.months).length ? '<p class="insight-empty">No records for ' + selected + '. Choose another year or add a sale.</p>' : '') + '<details><summary>Monthly details</summary>' + table(compare) + '</details></section>';
      if (!compare) content += '<section class="card insight-panel"><div class="workspace-heading"><h2>Yearly goal</h2><strong>' + Math.round(progress) + '%</strong></div><progress max="100" value="' + progress + '" aria-label="Yearly goal progress"></progress><p class="muted">' + amount(f.net) + ' of ' + amount(goal) + '</p><button type="button" class="btn" onclick="VyaparInsights.selectView(\'plan\')">Edit goal & investment</button></section>';
    } else if (view === 'history') {
      page = Math.max(0, Math.min(page, Math.ceil(years.length / 8) - 1));
      content = '<section class="card insight-panel"><div class="workspace-heading"><div><h2>All years</h2><p class="muted">' + years.length + ' years saved</p></div><button type="button" class="btn" onclick="VyaparInsights.exportHistory()">Export CSV</button></div><div class="insight-history">' + years.slice(page * 8, page * 8 + 8).map(y => '<button type="button" onclick="VyaparInsights.selectYear(\'' + y + '\');VyaparInsights.selectView(\'overview\')"><span><b>' + y + '</b><small>Revenue ' + amount(year(y).revenue) + '</small></span><strong class="' + (year(y).net < 0 ? 'is-loss' : '') + '">' + amount(year(y).net) + ' <span aria-hidden="true">›</span></strong></button>').join('') + (!years.length ? '<p class="insight-empty">Your recorded years will appear here.</p>' : '') + '</div><div class="workspace-pager"><button class="btn" ' + (page === 0 ? 'disabled' : '') + ' onclick="VyaparInsights.turnPage(-1)">Previous</button><span>' + (page + 1) + ' / ' + Math.max(1, Math.ceil(years.length / 8)) + '</span><button class="btn" ' + ((page + 1) * 8 >= years.length ? 'disabled' : '') + ' onclick="VyaparInsights.turnPage(1)">Next</button></div></section>';
    } else {
      const growth = Number.isFinite(+profile.planningGrowth) ? Math.max(0, Math.min(100, +profile.planningGrowth)) : 18;
      const projected = Array.from({length:10}, (_, i) => '<tr><th>' + (+selected + i) + '</th><td>' + amount(goal * Math.pow(1 + growth / 100, i)) + '</td></tr>').join('');
      content = '<section class="card insight-panel"><h2>Goal & investment</h2><label for="insightGoal">Annual net profit goal</label><input id="insightGoal" type="number" min="1" inputmode="decimal" value="' + goal + '"><label for="insightInvestment">Total investment</label><input id="insightInvestment" type="number" min="0" inputmode="decimal" value="' + invested + '"><label for="insightGrowth">Planned annual growth (%)</label><input id="insightGrowth" type="number" min="0" max="100" inputmode="decimal" value="' + growth + '"><button type="button" class="btn primary" onclick="VyaparInsights.savePlan()">Save plan</button><p class="muted">' + (invested ? selected + ' return on investment: ' + (f.net / invested * 100).toFixed(1) + '%' : 'Add your investment to see return on investment.') + '</p><details><summary>10-year targets</summary><p class="muted">Planning estimates using your chosen growth rate.</p><div class="insight-table"><table><thead><tr><th>Year</th><th>Profit target</th></tr></thead><tbody>' + projected + '</tbody></table></div></details></section>';
    }
    if(view === 'overview') {
      const recorded = Object.values(f.months).filter(m => m.activity).map(m => m.profit), average = recorded.length ? f.profit / recorded.length : 0;
      const metrics = [['Gross profit', amount(f.profit)],['Monthly average · gross', amount(average)],['Highest month · gross', amount(recorded.length ? Math.max(...recorded) : 0)],['Lowest month · gross', amount(recorded.length ? Math.min(...recorded) : 0)],['Return on investment · net', invested ? (f.net / invested * 100).toFixed(1) + '%' : 'Add investment'],['Estimated payback · gross', invested && average > 0 ? (invested / average).toFixed(1) + ' months' : '—'],['Indicative value · 2× annual gross profit', amount(Math.max(0,f.profit * 2))]];
      content += '<section class="card insight-panel"><details><summary>Performance details</summary><div class="insight-table"><table><tbody>' + metrics.map(([label,value])=>'<tr><th>'+label+'</th><td>'+value+'</td></tr>').join('') + '</tbody></table></div><p class="muted">Payback and indicative value are planning estimates.</p></details></section>';
    }
    if(view === 'history' && years.length) {
      const visible = years.slice(page * 8, page * 8 + 8).reverse();
      content += '<section class="card insight-panel"><h2>Annual net profit</h2>' + chart(visible.map(y => year(y).net), null, visible).replace('Monthly net profit chart. Exact values in the monthly details table.', 'Annual net profit chart. Exact values in the year list above.') + '</section>';
    }
    el.innerHTML = '<div class="insights-workspace"><div class="workspace-heading"><div><span class="workspace-eyebrow">BUSINESS INSIGHTS</span><h1>Profit dashboard</h1></div><label class="year-field"><span>Year</span><select aria-label="Profit year" onchange="VyaparInsights.selectYear(this.value)">' + options(selected) + '</select></label></div><section class="card insight-balance"><span>' + selected + ' net profit</span><strong class="' + (f.net < 0 ? 'is-loss' : '') + '">' + amount(f.net) + '</strong><p class="muted">' + escape(change) + '</p><div class="insight-mini-stats"><div><span>Revenue</span><b>' + amount(f.revenue) + '</b></div><div><span>Expenses</span><b>' + amount(f.expenses) + '</b></div></div></section>' + tabs + content + '</div>';
  }
  root.VyaparInsights = {
    render, chart,
    invalidate() { dirty = true; },
    selectView(value) { if (['overview','compare','history','plan'].includes(value)) { view = value; render(true); } },
    selectYear(value) { if (/^\d{4}$/.test(value)) { selected = value; render(true); } },
    selectComparison(value) { if (/^\d{4}$/.test(value)) { comparison = value; render(true); } },
    turnPage(delta) { page += delta; render(true); },
    savePlan() {
      const goal = +document.getElementById('insightGoal').value, investment = +document.getElementById('insightInvestment').value, growth = +document.getElementById('insightGrowth').value;
      if (!Number.isFinite(goal) || goal <= 0 || !Number.isFinite(investment) || investment < 0 || !Number.isFinite(growth) || growth < 0 || growth > 100) { alert('Enter a positive goal, a valid investment and growth from 0 to 100%.'); return; }
      Object.assign(root.state.profile, { yearlyGoal: goal, totalInvestment: investment, planningGrowth: growth });
      root.save();
    },
    exportHistory() {
      const rows = ['year,month,revenue,gross_profit,expenses,net_profit'];
      Object.keys(snapshot).sort().forEach(y => Object.keys(snapshot[y].months).sort().forEach(m => { const f = snapshot[y].months[m]; rows.push([y,m,f.revenue,f.profit,f.expenses,f.net].join(',')); }));
      root.downloadBlob(new Blob(['\uFEFF' + rows.join('\r\n')], {type:'text/csv;charset=utf-8'}), 'vyapar-profit-history.csv');
    }
  };
})(window);
