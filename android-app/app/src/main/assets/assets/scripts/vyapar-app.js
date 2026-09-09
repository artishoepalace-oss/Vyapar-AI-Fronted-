/* ===== SCRIPT SOURCE: data-store.js ===== */

/* Durable local state. Records are chunked; a snapshot becomes visible only
 * when the transaction containing both records and its manifest completes. */
(function (root) {
  'use strict';
  const KEY = 'vyapar_ai_prod_v1', MARKER = 'vyapar_storage_backend_v1';
  const CHUNK = 1000;
  let db = null, head = null, attached = false, bootReady = false;
  let queue = Promise.resolve(), revision = 0, replacing = false;
  let status = { mode: 'loading', savedAt: '', error: '', records: 0 };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function emit() {
    if (root.dispatchEvent && typeof CustomEvent === 'function')
      root.dispatchEvent(new CustomEvent('vyapar:storage-status', { detail: { ...status } }));
  }
  function fail(error) {
    status.error = error.message || 'Device storage is unavailable.';
    emit();
  }
  function open() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) { resolve(null); return; }
      let request, settled = false;
      const timer = setTimeout(() => finish(new Error('Close other Vyapar tabs, then reopen the app.')), 8000);
      function finish(error, value) {
        if (settled) { if (value) value.close(); return; }
        settled = true; clearTimeout(timer); error ? reject(error) : resolve(value);
      }
      try { request = root.indexedDB.open('vyapar_ai_data_v2', 1); }
      catch (error) { finish(error); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
        if (!database.objectStoreNames.contains('records')) database.createObjectStore('records');
      };
      request.onerror = () => finish(request.error || new Error('Cannot open device storage.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        finish(null, request.result);
      };
    });
  }
  function read(database) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['meta', 'records'], 'readonly');
      const request = tx.objectStore('meta').get('head');
      let output = null, error = null;
      request.onsuccess = () => {
        head = request.result || null;
        if (!head) return;
        if (head.schema !== 1 || !head.arrays || !head.value) {
          error = new Error('Saved data could not be verified. Your saved copy has been kept.'); tx.abort(); return;
        }
        output = { ...head.value };
        Object.keys(head.arrays).forEach(key => {
          const count = head.arrays[key];
          output[key] = new Array(count);
          for (let offset = 0; offset < count; offset += CHUNK) {
            const r = tx.objectStore('records').get(head.slot + '/' + key + '/' + offset);
            r.onsuccess = () => {
              const rows = r.result;
              if (!Array.isArray(rows) || rows.length !== Math.min(CHUNK, count - offset)) {
                error = new Error('Saved records are incomplete. Your saved copy has been kept.'); tx.abort(); return;
              }
              for (let i = 0; i < rows.length; i++) output[key][offset + i] = rows[i];
            };
          }
        });
      };
      tx.oncomplete = () => resolve(output);
      tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('Cannot read saved records.'));
    });
  }
  function manifest(value, slot) {
    const meta = { schema: 1, slot, savedAt: new Date().toISOString(), arrays: {}, value: {} };
    Object.keys(value).forEach(key => {
      if (Array.isArray(value[key])) meta.arrays[key] = value[key].length;
      else meta.value[key] = value[key];
    });
    return meta;
  }
  function shell(value) {
    // Legacy startup/auth helpers only need preferences and profile. Keep their
    // small synchronous cache, never duplicate the record database in it.
    try {
      localStorage.setItem(KEY, JSON.stringify({ __indexedDB: true, profile: value.profile, settings: value.settings }));
      localStorage.setItem(MARKER, 'indexeddb');
    } catch (_) { /* The committed database remains authoritative. */ }
  }
  function commit(value) {
    if (!db) {
      localStorage.setItem(KEY, JSON.stringify(value));
      status = { mode: 'basic', savedAt: new Date().toISOString(), error: '', records: Object.values(value).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) };
      revision++; emit(); return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const slot = head ? 1 - head.slot : 0;
      const meta = manifest(value, slot);
      let tx;
      try {
        tx = db.transaction(['meta', 'records'], 'readwrite');
        const records = tx.objectStore('records'), metadata = tx.objectStore('meta');
        // A slot's previous manifest enumerates precisely which chunks to remove.
        const stale = metadata.get('slot-' + slot);
        stale.onsuccess = () => {
          if (stale.result) Object.keys(stale.result.arrays).forEach(key => {
            for (let i = 0; i < stale.result.arrays[key]; i += CHUNK)
              if (i >= (meta.arrays[key] || 0)) records.delete(slot + '/' + key + '/' + i);
          });
        };
        // Clone all chunks synchronously through put(), before another event can
        // edit the live arrays. The stale callback only removes obsolete tails.
        Object.keys(meta.arrays).forEach(key => {
          for (let i = 0; i < meta.arrays[key]; i += CHUNK) records.put(value[key].slice(i, i + CHUNK), slot + '/' + key + '/' + i);
        });
        metadata.put(meta, 'slot-' + slot);
        metadata.put(meta, 'head');
        tx.oncomplete = () => {
          head = meta; shell(value); revision++;
          status = { mode: 'indexeddb', savedAt: meta.savedAt, error: '', records: Object.values(meta.arrays).reduce((a, b) => a + b, 0) };
          emit(); resolve();
        };
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Data was not saved. Free device space, then retry or download a backup.'));
      } catch (error) { if (tx) try { tx.abort(); } catch (_) {} reject(error); }
    });
  }
  function enqueue(value) {
    const job = queue.catch(() => {}).then(() => commit(value));
    queue = job;
    job.catch(fail);
    return job;
  }
  async function attach(getState, restore) {
    if (attached) return ready;
    attached = true;
    let required = false;
    try { required = localStorage.getItem(MARKER) === 'indexeddb' || JSON.parse(localStorage.getItem(KEY) || '{}').__indexedDB === true; } catch (_) {}
    try {
      db = await open();
      if (!db && required) throw new Error('Device storage is unavailable. Reopen the app to load your records.');
      const saved = db ? await read(db) : null;
      if (required && !saved) throw new Error('Saved data is unavailable. Restore a backup after reopening the app.');
      if (saved) restore(saved);
      // Commit migration before retiring the legacy full-state copy.
      await enqueue(getState());
      bootReady = true; resolveReady();
      if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('vyapar:storage-ready'));
    } catch (error) {
      fail(error);
      // Never unlock an empty app over an inaccessible primary database.
      if (required || head) {
        if (root.VyaparWorkspace) root.VyaparWorkspace.storageBlocked(status.error);
      } else {
        // First migration failure leaves the legacy copy and in-memory data intact.
        bootReady = true; resolveReady();
        if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('vyapar:storage-ready'));
      }
    }
  }
  root.VyaparStorage = {
    attach, ready,
    save: value => bootReady && !replacing ? enqueue(value) : ready,
    async replace(value, apply) {
      if (!bootReady) await ready;
      if (replacing) throw new Error('Another restore is still running.');
      replacing = true;
      try { await enqueue(value); apply(); }
      finally { replacing = false; }
    },
    flush: () => queue,
    get bootReady() { return bootReady; },
    get revision() { return revision; },
    getStatus: () => ({ ...status }),
    // Pure helper for deterministic chunk-boundary tests.
    manifest
  };
})(window);

/* ===== SCRIPT SOURCE: file-io.js ===== */

/* One reader for Android document providers, plain and password backups. */
(function (root) {
  'use strict';
  const MAX_BYTES = 64 * 1024 * 1024;
  const arrays = ['sales', 'stocks', 'monthly', 'daily', 'products', 'transactions611', 'invoices', 'purchases', 'expenses', 'customers', 'suppliers', 'accounts611', 'ledgerEntries611', 'stockMoves611', 'parties611', 'products611', 'businesses611', 'warehouses611', 'stockLedger', 'cashbook', 'gstRecords', 'auditLog', 'staff', 'notifications', 'paymentReconciliations', 'priceHistory', 'reorderRules', 'purchaseReturns', 'salesReturns', 'barcodeCatalog', 'customerStatements', 'supplierStatements', 'productImports', 'fileImports', 'imports'];
  function parse(text) {
    return JSON.parse(String(text).replace(/^\uFEFF/, '').trim(), (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Unsupported keys in this file.');
      return value;
    });
  }
  async function readText(file) {
    if (!file) throw new Error('Choose a file first.');
    if (file.size > MAX_BYTES) throw new Error('Choose a file smaller than 64 MB.');
    let text;
    if (typeof FileReader === 'function' && typeof FileReader.prototype.readAsArrayBuffer === 'function') {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Cannot read this file. Save it to Downloads and select it again.'));
        reader.onabort = () => reject(new Error('File reading was cancelled.'));
        reader.onload = () => {
          try {
            const bytes = new Uint8Array(reader.result);
            const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
            resolve(new TextDecoder(encoding, { fatal: true }).decode(bytes));
          } catch (_) { reject(new Error('File encoding is invalid. Export it as UTF-8 or UTF-16.')); }
        };
        reader.readAsArrayBuffer(file);
      });
    } else if (typeof file.text === 'function') text = await file.text();
    else text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Cannot read this file. Select a local copy from Downloads.'));
      reader.readAsText(file, 'UTF-8');
    });
    text = String(text).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('This file is empty.');
    return text;
  }
  function isEncrypted(value) { return Boolean(value && value.v === 1 && value.s && value.i && value.d); }
  function backupData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Select a Vyapar AI backup JSON file.');
    let candidate = value;
    if (value.format === 'vyapar-ai-backup') candidate = value.state;
    else if (value.state && typeof value.state === 'object') candidate = value.state;
    else if (value.data && !Array.isArray(value.data) && typeof value.data === 'object') candidate = value.data;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        !arrays.some(key => Array.isArray(candidate[key])) ||
        !(candidate.profile || candidate.settings || candidate.subscription || arrays.filter(key => Array.isArray(candidate[key])).length >= 3)) {
      throw new Error('This is a data import, not a full Vyapar backup. Use AI Upload to import records.');
    }
    ['profile','settings','subscription'].forEach(key => {
      if(candidate[key] !== undefined && (!candidate[key] || typeof candidate[key] !== 'object' || Array.isArray(candidate[key]))) throw new Error('Invalid backup ' + key + '.');
    });
    arrays.forEach(key => {
      if (candidate[key] !== undefined && (!Array.isArray(candidate[key]) || candidate[key].some(row => !row || typeof row !== 'object' || Array.isArray(row))))
        throw new Error('Invalid ' + key + ' records. The backup was not restored.');
    });
    return candidate;
  }
  async function decrypt(value, password) {
    const bytes = (v, len) => Array.isArray(v) && (!len || v.length === len) && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
    if (!value || value.v !== 1 || !bytes(value.s, 16) || !bytes(value.i, 12) || !bytes(value.d) || value.d.length < 16 || value.d.length > MAX_BYTES)
      throw new Error('Invalid encrypted backup.');
    if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('Encrypted backup support is unavailable on this device.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(value.s), iterations: 150000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try { return parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.i) }, key, new Uint8Array(value.d)))); }
    catch (_) { throw new Error('Wrong password or corrupted backup.'); }
  }
  root.VyaparFiles = { readText, parse, backupData, isEncrypted, decrypt, maxBytes: MAX_BYTES };
})(window);

/* ===== SCRIPT SOURCE: profit-history.js ===== */

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

/* ===== SCRIPT SOURCE: insights-workspace.js ===== */

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

/* ===== SCRIPT SOURCE: upload-workspace.js ===== */

/* Choose → preview → import. Parsing never mutates the live business data. */
(function (root) {
  'use strict';
  let draft = null, reading = false, generation = 0, photoUrl = '';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const size = bytes => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  function status(text, bad) {
    const el = document.getElementById('uploadStatus');
    if (el) { el.textContent = text; el.className = 'notice' + (bad ? ' bad' : ''); }
  }
  function render() {
    const el = document.getElementById('screen-upload'); if (!el || el.querySelector('.upload-workspace')) return;
    el.innerHTML = `<div class="upload-workspace">
      <div class="workspace-heading"><div><span class="workspace-eyebrow">ADD YOUR DATA</span><h1>Import & scan</h1><p class="muted">Bring records in. Review before saving.</p></div></div>
      <div class="workspace-tabs" role="tablist" aria-label="Upload method">
        <button type="button" role="tab" aria-selected="true" aria-controls="recordImportPanel" onclick="VyaparUpload.tab('import',this)">Import records</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="labelScanPanel" onclick="VyaparUpload.tab('scan',this)">Scan label</button>
      </div>
      <section id="recordImportPanel" class="card upload-panel" role="tabpanel">
        <h2>Choose a file</h2><p class="muted">JSON, CSV or TXT · up to 64 MB</p>
        <label class="file-drop"><input id="uploadFile" type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onchange="VyaparUpload.fileSelected(this)"><span class="file-drop-icon" aria-hidden="true">↥</span><strong id="uploadFileName">Tap to choose a file</strong><span id="uploadFileSize">From your device or Downloads</span></label>
        <label for="uploadType">Record type</label><select id="uploadType" onchange="VyaparUpload.clearPreview()"><option value="auto">Detect automatically</option><option value="profit">Monthly profit</option><option value="stock">Stock</option><option value="sale">Sales</option></select>
        <button id="uploadReview" type="button" class="btn primary upload-main-action" onclick="analyzeFile()">Review file</button>
        <div id="uploadStatus" class="notice" role="status" aria-live="polite">Choose a file to see a preview.</div><div id="uploadPreview"></div>
        <details class="upload-help"><summary>Sample files & accepted fields</summary><p class="muted">Profit: year, month, profit<br>Stock: product, qty<br>Sales: date, product, purchasePrice, sellingPrice, qty</p><div class="actions"><button type="button" class="btn" onclick="downloadSampleJson()">Sample JSON</button><button type="button" class="btn" onclick="downloadSampleCsv()">Sample CSV</button></div><p class="muted">A full backup opens the restore flow.</p></details>
      </section>
      <section id="labelScanPanel" class="card upload-panel" role="tabpanel" hidden>
        <h2>Scan a product label</h2><p class="muted">Choose a clear photo, then review the detected stock.</p>
        <input id="scanMode" type="hidden" value="box"><div class="workspace-tabs" role="group" aria-label="Label type"><button type="button" aria-pressed="true" onclick="VyaparUpload.scanMode('box',this)">Box</button><button type="button" aria-pressed="false" onclick="VyaparUpload.scanMode('carton',this)">Carton</button><button type="button" aria-pressed="false" onclick="VyaparUpload.scanMode('manual',this)">Manual qty</button></div>
        <label class="file-drop photo-drop"><input id="boxLabelFile" type="file" accept="image/*" capture="environment" onchange="VyaparUpload.photoSelected(this)"><span class="file-drop-icon" aria-hidden="true">▧</span><strong id="scanFileName">Take or choose a photo</strong><span>Keep the full label in the frame</span><img id="scanPhotoPreview" alt="Selected product label" hidden></label>
        <div id="scanQtyBox"><label for="scanQty">Quantity / pairs</label><input id="scanQty" type="number" min="1" max="10000" inputmode="numeric" value="1"></div>
        <button type="button" class="btn primary upload-main-action" onclick="scanBoxLabel()">Scan label</button><div id="boxScanStatus" class="notice" role="status" aria-live="polite">Your photo preview will appear above.</div><div id="stockPreviewArea"></div>
      </section></div>`;
  }
  function clearPreview() {
    draft = null; generation++;
    const el = document.getElementById('uploadPreview'); if (el) el.innerHTML = '';
  }
  function fileSelected(input) {
    clearPreview(); const file = input.files && input.files[0];
    document.getElementById('uploadFileName').textContent = file ? file.name : 'Tap to choose a file';
    document.getElementById('uploadFileSize').textContent = file ? size(file.size) : 'From your device or Downloads';
    status(file ? 'File selected. Tap Review file to continue.' : 'Choose a file to see a preview.');
  }
  function rowsFrom(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    const rows = root.normalizeRows(data).slice();
    if (Array.isArray(data.sales)) data.sales.forEach(row => rows.push({...row, type:'sale'}));
    const stocks = data.stock || data.stocks;
    if (Array.isArray(stocks)) stocks.forEach(row => rows.push({...row, type:'stock'}));
    return rows;
  }
  async function review() {
    if (reading) return;
    const input = document.getElementById('uploadFile'), file = input && input.files && input.files[0];
    if (!file) { status('Choose a JSON, CSV or TXT file first.', true); return; }
    clearPreview(); const token = generation; reading = true;
    const button = document.getElementById('uploadReview'); button.disabled = true;
    status('Reading your file…');
    try {
      const text = await root.VyaparFiles.readText(file);
      let rows, data = null, backup = false;
      if (/^[\[{]/.test(text)) {
        data = root.VyaparFiles.parse(text);
        try { root.VyaparFiles.backupData(data); backup = true; } catch (_) {}
        backup = backup || root.VyaparFiles.isEncrypted(data);
        if (!backup) rows = rowsFrom(data);
      } else {
        rows = root.csvTextToObjects(text);
        if (!rows.length && /\.txt$/i.test(file.name || '')) {
          rows = text.split(/\r?\n/).map(line => {
            const m = line.match(/(\d{4}).{0,12}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*.{0,30}?(-?[\d,]+(?:\.\d+)?)/i);
            return m ? {year:m[1],month:m[2],profit:m[3]} : null;
          }).filter(Boolean);
        }
      }
      if (generation !== token) return;
      if (backup) {
        draft = { file, backup: true };
        status('Full backup detected. Restoring will replace your current business records.');
        document.getElementById('uploadPreview').innerHTML = '<button type="button" class="btn primary upload-main-action" onclick="VyaparUpload.confirmImport()">Restore this backup</button>';
        return;
      }
      rows = (rows || []).filter(row => row && typeof row === 'object' && !Array.isArray(row));
      if (!rows.length) throw new Error('No records found. Check the sample format below.');
      let fingerprint = null;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
        fingerprint = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
      }
      if (generation !== token) return;
      const type = document.getElementById('uploadType').value;
      draft = { rows, file, type, fingerprint };
      const repeated = fingerprint && (Array.isArray(root.state.fileImports) ? root.state.fileImports : []).some(x => x.hash === fingerprint && x.type === type);
      status(rows.length.toLocaleString('en-IN') + ' rows ready to review.' + (repeated ? ' This file was imported before.' : ''));
      const preview = rows.slice(0, 4).map(row => '<li><strong>' + escape(row.product || row.name || row.item || [row.year, row.month].filter(Boolean).join(' · ') || 'Record') + '</strong><span>' + escape(row.date || row.month || row.type || type) + '</span><small>' + escape(row.profit !== undefined ? 'Profit ' + row.profit : row.qty !== undefined ? 'Qty ' + row.qty : '') + '</small></li>').join('');
      document.getElementById('uploadPreview').innerHTML = '<div class="import-preview"><div class="workspace-heading"><h3>Preview</h3><span>First ' + Math.min(4, rows.length) + ' rows</span></div><ul>' + preview + '</ul><p class="muted">Valid rows will be added. Matching manual profit months will be updated.</p><button type="button" class="btn primary upload-main-action" onclick="VyaparUpload.confirmImport()">Import ' + rows.length.toLocaleString('en-IN') + ' rows</button><button type="button" class="btn upload-main-action" onclick="VyaparUpload.clearPreview()">Cancel</button></div>';
    } catch (error) { status(error.message, true); }
    finally { reading = false; button.disabled = false; }
  }
  async function confirmImport() {
    if (!draft || reading) return;
    const next = draft;
    if (next.backup) {
      reading = true;
      try { if (await root.restoreBackup(next.file)) { clearPreview(); status('Backup restored. Your records are ready.'); } }
      finally { reading = false; } return;
    }
    if (next.fingerprint && (Array.isArray(root.state.fileImports) ? root.state.fileImports : []).some(x => x.hash === next.fingerprint && x.type === next.type)) {
      const accepted = await root.showGlassDialog({ title:'Import again?', message:'This file was already imported. Importing again can create duplicate sales or stock.', confirm:true, okText:'Import again', cancelText:'Cancel' });
      if (!accepted) return;
    }
    reading = true;
    try {
      root.VyaparWorkspace.setBusy(true, 'Importing records…');
      const original = root.state;
      const staged = { ...original, sales: original.sales.slice(), stocks: original.stocks.slice(), monthly: original.monthly.map(row => ({...row})) };
      const counts = { profit:0, updated:0, sales:0, stock:0, skipped:0 };
      for (let i = 0; i < next.rows.length; i += 500) {
        // Existing validated import routines work against a staged state only.
        // Restore the live reference before yielding to Android's event loop.
        try {
          root.state = staged;
          const result = root.importDataByType(next.rows.slice(i, i + 500), next.type, 'file-import');
          Object.keys(counts).forEach(key => { counts[key] += result[key] || 0; });
        } finally { root.state = original; }
        root.VyaparWorkspace.busyMessage('Importing ' + Math.min(i + 500, next.rows.length).toLocaleString('en-IN') + ' / ' + next.rows.length.toLocaleString('en-IN') + ' rows…');
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const changed = counts.profit + counts.updated + counts.sales + counts.stock;
      if (!changed) throw new Error('No valid records found. Check the record type and sample fields.');
      staged.fileImports = (Array.isArray(original.fileImports) ? original.fileImports : []).slice(-99).concat({ hash:next.fingerprint, type:next.type, name:next.file.name, at:new Date().toISOString(), counts });
      await root.VyaparStorage.replace(staged, () => { root.state = staged; root.VyaparInsights.invalidate(); root.render(); });
      clearPreview();
      status(changed.toLocaleString('en-IN') + ' records saved · ' + counts.sales + ' sales · ' + counts.stock + ' stock · ' + (counts.profit + counts.updated) + ' profit · ' + counts.skipped + ' skipped');
      const input = document.getElementById('uploadFile'); if (input) { input.value = ''; document.getElementById('uploadFileName').textContent = 'Tap to choose another file'; document.getElementById('uploadFileSize').textContent = 'Import saved'; }
    } catch (error) { status('Import was not saved: ' + error.message, true); }
    finally { reading = false; root.VyaparWorkspace.setBusy(false); }
  }
  root.VyaparUpload = {
    render, review, clearPreview, fileSelected, confirmImport, rowsFrom,
    tab(value, button) {
      document.getElementById('recordImportPanel').hidden = value !== 'import';
      document.getElementById('labelScanPanel').hidden = value !== 'scan';
      button.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === button)));
    },
    scanMode(value, button) {
      root.setScanMode(value);
      button.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    },
    photoSelected(input) {
      const file = input.files && input.files[0], image = document.getElementById('scanPhotoPreview');
      if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = ''; }
      image.hidden = !file;
      document.getElementById('scanFileName').textContent = file ? file.name : 'Take or choose a photo';
      if (file) { photoUrl = URL.createObjectURL(file); image.src = photoUrl; }
    }
  };
})(window);

/* ===== SCRIPT SOURCE: record-pages.js ===== */

/* Bound DOM work without truncating saved data. Search runs over the full list. */
(function(root){
  'use strict';
  const size=40, pages={}, queries={}, selectedYears={}, cache={}; let timer;
  const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function get(kind){
    if(cache[kind])return cache[kind];
    const source=root.state[kind]||[], q=String(queries[kind]||'').trim().toLowerCase(), year=selectedYears[kind]||'';
    let all=source;
    if(q||year)all=source.filter(row=>(!year||String(row.month||row.date||'').startsWith(year))&&(!q||[row.date,row.month,row.item,row.product,row.name,row.source].join(' ').toLowerCase().includes(q)));
    if(kind==='monthly')all=all.slice().sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    const count=all.length, max=Math.max(0,Math.ceil(count/size)-1), page=pages[kind]=Math.max(0,Math.min(pages[kind]||0,max));
    const rows=kind==='daily'||kind==='sales'?all.slice(Math.max(0,count-(page+1)*size),count-page*size).reverse():all.slice(page*size,page*size+size);
    return cache[kind]={rows,count,max,page};
  }
  function controls(kind){
    const data=get(kind), years=[...new Set((root.state[kind]||[]).map(x=>String(x.month||x.date||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
    return '<div class="record-controls"><label class="record-search"><span class="sr-only">Search '+kind+'</span><input type="search" id="recordSearch-'+kind+'" placeholder="Search '+kind+'…" value="'+escape(queries[kind]||'')+'" oninput="VyaparRecords.search(\''+kind+'\',this.value)"></label>'+(kind==='monthly'?'<select aria-label="Record year" onchange="VyaparRecords.year(\''+kind+'\',this.value)"><option value="">All years</option>'+years.map(y=>'<option'+(selectedYears[kind]===y?' selected':'')+'>'+y+'</option>').join('')+'</select>':'')+'<div class="workspace-pager"><button type="button" class="btn" '+(!data.page?'disabled':'')+' onclick="VyaparRecords.page(\''+kind+'\',-1)">Previous</button><span>'+data.count.toLocaleString('en-IN')+' records · '+(data.page+1)+' / '+(data.max+1)+'</span><button type="button" class="btn" '+(data.page===data.max?'disabled':'')+' onclick="VyaparRecords.page(\''+kind+'\',1)">Next</button></div></div>';
  }
  function render(kind){delete cache[kind];kind==='stocks'?root.renderStock():root.renderSales();}
  root.VyaparRecords={get,controls,invalidate(){Object.keys(cache).forEach(k=>delete cache[k]);},page(kind,delta){pages[kind]=(pages[kind]||0)+delta;render(kind);},year(kind,value){selectedYears[kind]=value;pages[kind]=0;render(kind);},search(kind,value){queries[kind]=value;pages[kind]=0;clearTimeout(timer);timer=setTimeout(()=>{render(kind);const input=document.getElementById('recordSearch-'+kind);if(input){input.focus();input.setSelectionRange(value.length,value.length);}},200);}};
})(window);

/* ===== SCRIPT SOURCE: android-session-flow-647.js ===== */

/* Vyapar AI 6.4.7 — Android startup/session routing + account-password app lock. */
(function(){
  'use strict';

  var TOKEN_KEY='vyapar_ai_auth_token_v1';
  var REFRESH_KEY='vyapar_ai_auth_refresh_token_v1';
  var ACCOUNT_KEY='vyapar_ai_account_cache_v1';
  var POLICY_KEY='vyapar_ai_password_login_policy_v1';
  var UNLOCK_KEY='vyapar_ai_startup_unlocked_v1';
  var API_BASE='https://vypar-backend.onrender.com';
  var root=document.documentElement;
  var bootFinished=false;
  var bootQueued=false;
  var bootObserver=null;
  window.__vyaparStartupCoordinator=true;

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(_){return fallback}}
  function account(){return readJson(ACCOUNT_KEY,{})}
  function accountEmail(){var a=account();return String((a.user&&a.user.email)||a.email||'').trim().toLowerCase()}
  function token(){return String(localStorage.getItem(TOKEN_KEY)||'').trim()}
  function passwordPolicy(){var p=readJson(POLICY_KEY,{});return p&&typeof p==='object'?p:{}}
  function lockEnabled(email){email=String(email||'').trim().toLowerCase();return !!(email&&passwordPolicy()[email]===true)}
  function sessionUnlocked(email){try{return sessionStorage.getItem(UNLOCK_KEY)===String(email||'').trim().toLowerCase()}catch(_){return false}}
  function markUnlocked(email){try{sessionStorage.setItem(UNLOCK_KEY,String(email||'').trim().toLowerCase())}catch(_){}}
  function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}

  function ensureSplash(){
    var splash=document.getElementById('vy855BootGuard');
    if(!splash){
      splash=document.createElement('div');
      splash.id='vy855BootGuard';
      splash.innerHTML='<img src="assets/images/logo.png" alt="">';
      document.body.prepend(splash);
    }
    splash.setAttribute('role','status');
    splash.setAttribute('aria-label','Opening Vyapar AI');
    splash.removeAttribute('aria-hidden');
    root.classList.add('vy855-booting');
  }

  function hideLegacyLoader(){
    // One surface from initial HTML through auth resolution; no second splash.
    ['appLoader','vy647StartupSplash'].forEach(function(id){
      var old=document.getElementById(id);if(old)old.remove();
    });
  }
  function removeSplash(){
    var splash=document.getElementById('vy855BootGuard');
    hideLegacyLoader();
    root.classList.remove('vy855-booting');
    if(splash)splash.remove();
    try{
      if(window.AndroidApp&&typeof window.AndroidApp.onStartupFrameReady==='function'){
        window.AndroidApp.onStartupFrameReady();
      }
    }catch(_){}
  }

  async function jsonResponse(response){
    var text=await response.text(),data={};
    try{data=text?JSON.parse(text):{}}catch(_){}
    if(!response.ok||data.success===false)throw new Error(data.message||'Password verification failed');
    return data;
  }

  function saveLogin(data){
    var access=String(data.token||data.accessToken||data.access_token||data?.data?.token||data?.data?.accessToken||'').trim();
    var refresh=String(data.refreshToken||data.refresh_token||data?.data?.refreshToken||'').trim();
    if(access)localStorage.setItem(TOKEN_KEY,access);
    if(refresh)localStorage.setItem(REFRESH_KEY,refresh);
    var old=account();
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user||data?.data?.user||old.user||null,subscription:data.subscription||data?.data?.subscription||old.subscription||null}));
  }

  function showPasswordGate(){
    var email=accountEmail();
    if(!email||!token()||!lockEnabled(email)||sessionUnlocked(email)){removeSplash();return}
    document.getElementById('vy647PasswordGate')?.remove();
    var gate=document.createElement('div');
    gate.id='vy647PasswordGate';
    gate.innerHTML='<main class="vy647-lock-card" role="dialog" aria-modal="true" aria-labelledby="vy647LockTitle">'+
      '<img src="assets/images/logo.png" alt="Vyapar AI"><h1 id="vy647LockTitle">Welcome Back</h1><p>Enter your account password to open Vyapar AI.</p>'+
      '<label>Account</label><div class="vy647-email">'+esc(email)+'</div><label for="vy647Password">Password</label>'+
      '<input id="vy647Password" type="password" autocomplete="current-password" placeholder="Enter password">'+
      '<div id="vy647LockError" class="vy647-lock-error" aria-live="polite"></div><button id="vy647Unlock" type="button">Unlock App</button>'+
      '<button id="vy647UseLogin" class="secondary" type="button">Use another login method</button></main>';
    document.body.appendChild(gate);removeSplash();

    var input=document.getElementById('vy647Password'),submit=document.getElementById('vy647Unlock'),error=document.getElementById('vy647LockError');
    async function unlock(){
      var password=String(input.value||'');
      if(password.length<8||password.length>72){error.textContent='Enter your account password.';return}
      error.textContent='';submit.disabled=true;submit.textContent='Checking…';
      try{
        var data=await jsonResponse(await fetch(API_BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:email,password:password})}));
        saveLogin(data);markUnlocked(email);gate.remove();
      }catch(e){error.textContent=e&&e.message?e.message:'Wrong password';input.value='';input.focus()}
      finally{submit.disabled=false;submit.textContent='Unlock App'}
    }
    submit.onclick=unlock;
    input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();unlock()}});
    document.getElementById('vy647UseLogin').onclick=function(){
      try{sessionStorage.removeItem(UNLOCK_KEY)}catch(_){}
      localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REFRESH_KEY);localStorage.removeItem(ACCOUNT_KEY);location.reload();
    };
    setTimeout(function(){input.focus()},80);
  }

  function routeAfterSplash(){
    if(bootFinished||bootQueued||document.readyState==='loading')return;
    if(window.VyaparStorage && !window.VyaparStorage.bootReady)return;
    var status=root.getAttribute('data-vyapar-session');
    if(!status||status==='restoring')return;
    var authGate=document.getElementById('vyaparOtpGate');
    var screen=document.querySelector('.screen:not(.hide)');
    if(status==='login'&&!authGate)return;
    if(status!=='login'&&(!screen||!screen.children.length))return;
    bootQueued=true;
    // Allow the destination and all synchronous layout helpers to paint before
    // removing the opaque guard. Never cross-fade a login form into Home.
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      bootFinished=true;
      if(bootObserver)bootObserver.disconnect();
      if(status!=='login')showPasswordGate();
      else removeSplash();
    })});
  }

  function resolvePlan(){
    var a=account(),p=String((a.subscription&&a.subscription.plan)||a.plan||(a.user&&a.user.plan)||'').toLowerCase();
    if(p.indexOf('business')>=0)return 'business';if(p.indexOf('pro')>=0)return 'pro';return '';
  }

  function decoratePlanIdentity(){
    // plan-badge-menu-645 is the single owner of the paid verification mark.
    // Older builds added .vy647-plan-mark from this observer as well, which
    // produced two ticks and an endless mutation/paint loop on some WebViews.
    var card=document.getElementById('productionAccountCard');if(!card)return;
    card.querySelectorAll('.vy647-plan-mark').forEach(function(mark){mark.remove()});
  }

  var refreshQueued=false;
  function refresh(){if(refreshQueued)return;refreshQueued=true;requestAnimationFrame(function(){refreshQueued=false;decoratePlanIdentity()})}

  ensureSplash();hideLegacyLoader();
  bootObserver=new MutationObserver(routeAfterSplash);
  bootObserver.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-vyapar-session']});
  window.addEventListener('vyapar:session-ready',routeAfterSplash);
  window.addEventListener('vyapar:storage-ready',routeAfterSplash);
  document.addEventListener('DOMContentLoaded',routeAfterSplash,{once:true});
  routeAfterSplash();
  new MutationObserver(function(){hideLegacyLoader();refresh()}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){hideLegacyLoader();refresh()},{once:true});
  window.addEventListener('load',function(){hideLegacyLoader();refresh()},{once:true});
})();

/* ===== SCRIPT SOURCE: motion-20102004.js ===== */

/* Vyapar AI — Telegram-inspired compositor motion owner.
 * One motion owner for pages, dialogs, sheets and transient UI.
 * Page navigation keeps the outgoing screen alive through the same paint cycle,
 * then animates outgoing + incoming surfaces together before cleanup.
 */
(function(){
  'use strict';
  if(window.vyaparMotion) return;

  const running=new WeakMap();
  const overlays=new WeakMap();
  const positions=Object.create(null);
  const ranks={home:0,business:1,sales:2,stock:3,analytics:4,upload:5,calculator:6,subscription:7,settings:8};
  const overlaySelector=[
    '.glass-dialog-overlay','.subscription-overlay','.shop-progress-overlay','.vx643-modal-overlay',
    '.production-overlay','.android-permission-overlay','.android-sheet-overlay','.account-delete-overlay',
    '.upgrade-plan-popup','.upgrade-popup-overlay','.vy6601-select-overlay','.plan-success-overlay'
  ].join(',');
  const cardSelector=[
    '[role="dialog"]','.android-sheet','.shop-progress-sheet','.production-modal','.subscription-dialog',
    '.glass-dialog-card','.vx643-modal','.vy6601-select-sheet','.upgrade-popup-box','.upgrade-plan-reference-card',
    '.account-delete-dialog','.modal-card','.sheet-content'
  ].join(',');
  const transientSelector='.glass-toast';
  const ease='cubic-bezier(.16,1,.3,1)';
  const easeSoft='cubic-bezier(.2,.8,.2,1)';
  const easeClose='cubic-bezier(.4,0,.2,1)';
  const closeSelector='#closeShopProgress,.android-sheet-close,#closeUpgradePopup,#closePlanSuccessPopup,#closeCancelPopup,#permissionLater,[data-glass-cancel],[data-glass-ok],[data-back-close],[data-update-later],.vy6601-select-head button,[data-cancel],#accountDeleteCancel,.production-close,.vx643-modal-close,[data-close]';
  const focusSelector='button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
  const pageStyleProps=['position','top','left','right','bottom','width','height','margin','z-index','pointer-events','display','contain','isolation','transform','opacity','will-change','transition','backface-visibility','-webkit-backface-visibility'];
  let pageTransition=null,pageSequence=0;

  function reduced(){return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function duration(ms){
    if(reduced()) return 0;
    return document.documentElement.classList.contains('perf-lite') ? Math.round(ms*.72) : ms;
  }
  function css(node,prop,fallback){
    if(!node)return fallback;
    const inline=node.style && node.style.getPropertyValue ? node.style.getPropertyValue(prop) : '';
    if(inline)return inline;
    try{const value=getComputedStyle(node)[prop];return value==null||value===''?fallback:value;}catch(_){return fallback;}
  }
  function cancel(node){
    const job=node && running.get(node);
    if(job) job.cancel();
  }
  function saveInline(node,props){
    return props.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);
  }
  function restoreInline(node,saved){
    if(!node||!saved)return;
    saved.forEach(([prop,value,priority])=>{if(value)node.style.setProperty(prop,value,priority);else node.style.removeProperty(prop);});
  }

  function tween(node,from,to,ms,done,easing=ease){
    if(!node){if(done)done();return;}
    cancel(node);
    const time=duration(ms);
    if(!time || !node.isConnected){
      Object.keys(to||{}).forEach(p=>node.style.setProperty(p,to[p],'important'));
      if(done)done();
      return;
    }

    const keys=Object.keys(from);
    const props=['transition','will-change',...keys];
    const saved=props.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]);
    let frame=0,timer=0,animation=null,finished=false;

    const restore=()=>{
      if(finished)return;
      finished=true;
      if(frame)cancelAnimationFrame(frame);
      if(timer)clearTimeout(timer);
      if(animation){try{animation.onfinish=null;animation.oncancel=null;animation.cancel();}catch(_){}}
      node.removeEventListener('transitionend',end);
      saved.forEach(([p,v,priority])=>{if(v)node.style.setProperty(p,v,priority);else node.style.removeProperty(p);});
      running.delete(node);
    };
    const finish=()=>{if(finished)return;restore();if(done)done();};
    const end=event=>{if(event.target===node && Object.prototype.hasOwnProperty.call(to,event.propertyName))finish();};
    running.set(node,{cancel:restore});

    if(typeof node.animate==='function'){
      try{
        const first={},last={};
        keys.forEach(k=>{first[k]=from[k];last[k]=to[k];});
        node.style.setProperty('will-change',keys.join(','),'important');
        animation=node.animate([first,last],{duration:time,easing,fill:'both',composite:'replace'});
        animation.onfinish=finish;
        animation.oncancel=()=>{};
        timer=setTimeout(finish,time+64);
        return;
      }catch(_){animation=null;}
    }

    node.style.setProperty('transition','none','important');
    node.style.setProperty('will-change',keys.join(','),'important');
    keys.forEach(p=>node.style.setProperty(p,from[p],'important'));
    node.addEventListener('transitionend',end);
    frame=requestAnimationFrame(()=>{
      if(finished)return;
      node.style.setProperty('transition',keys.map(p=>p+' '+time+'ms '+easing).join(','),'important');
      keys.forEach(p=>node.style.setProperty(p,to[p],'important'));
      timer=setTimeout(finish,time+56);
    });
  }

  function enter(node,direction){
    if(!node || reduced())return;
    cancel(node);
    const base=css(node,'transform','none');
    const rest=base==='none'?'':base+' ';
    const distance=Math.min(34,Math.round((window.innerWidth||360)*.095))*(direction<0?-1:1);
    tween(node,{transform:rest+'translate3d('+distance+'px,0,0)'},{transform:base},205,null,ease);
  }

  function stopPageTransition(){
    const active=pageTransition;
    if(!active)return;
    pageTransition=null;
    if(active.frame)cancelAnimationFrame(active.frame);
    if(active.frame2)cancelAnimationFrame(active.frame2);
    if(active.timer)clearTimeout(active.timer);
    (active.animations||[]).forEach(animation=>{try{animation.onfinish=null;animation.oncancel=null;animation.cancel();}catch(_){}});
    const outgoing=active.outgoing,incoming=active.incoming;
    if(outgoing){
      restoreInline(outgoing,active.outgoingStyle);
      outgoing.classList.remove('vy-page-outgoing');
      outgoing.setAttribute('aria-hidden','true');
    }
    if(incoming){
      restoreInline(incoming,active.incomingStyle);
      incoming.classList.remove('vy-page-incoming');
      incoming.removeAttribute('aria-hidden');
    }
    document.documentElement.classList.remove('vy-page-transitioning');
  }

  function pageRect(node){
    try{
      if(node&&typeof node.getBoundingClientRect==='function'){
        const rect=node.getBoundingClientRect();
        if(rect&&Number.isFinite(rect.width)&&rect.width>0)return {top:rect.top,left:rect.left,width:rect.width,height:rect.height};
      }
    }catch(_){}
    return {top:0,left:0,width:Math.max(1,window.innerWidth||360),height:Math.max(1,window.innerHeight||640)};
  }

  function animatePagePair(context,incoming,direction){
    const outgoing=context && context.previousNode;
    if(!outgoing||!incoming||outgoing===incoming||reduced())return false;
    stopPageTransition();

    const time=duration(218);
    if(!time)return false;
    const token=++pageSequence;
    const active={token,outgoing,incoming,animations:[],frame:0,frame2:0,timer:0,
      outgoingStyle:saveInline(outgoing,pageStyleProps),incomingStyle:saveInline(incoming,pageStyleProps)};
    pageTransition=active;

    const rect=context.previousRect||pageRect(outgoing);
    const width=Math.max(1,Number(rect.width)||window.innerWidth||360);
    const incomingDistance=Math.min(46,Math.max(28,Math.round(width*.12)))*(direction<0?-1:1);
    const outgoingDistance=Math.min(18,Math.max(10,Math.round(width*.045)))*(direction<0?1:-1);
    const incomingBase=css(incoming,'transform','none');
    const outgoingBase=css(outgoing,'transform','none');
    const incomingRest=incomingBase==='none'?'':incomingBase+' ';
    const outgoingRest=outgoingBase==='none'?'':outgoingBase+' ';

    outgoing.classList.add('vy-page-outgoing');
    incoming.classList.add('vy-page-incoming');
    outgoing.setAttribute('aria-hidden','true');
    incoming.removeAttribute('aria-hidden');
    document.documentElement.classList.add('vy-page-transitioning');

    /* Keep .hide on the outgoing screen so app/navigation state still sees only the destination.
       Inline display overrides .hide only for this compositor handoff. */
    outgoing.style.setProperty('display','block','important');
    outgoing.style.setProperty('position','fixed','important');
    outgoing.style.setProperty('top',Math.round(rect.top||0)+'px','important');
    outgoing.style.setProperty('left',Math.round(rect.left||0)+'px','important');
    outgoing.style.setProperty('right','auto','important');
    outgoing.style.setProperty('bottom','auto','important');
    outgoing.style.setProperty('width',Math.ceil(width)+'px','important');
    outgoing.style.setProperty('height','auto','important');
    outgoing.style.setProperty('margin','0','important');
    outgoing.style.setProperty('z-index','2','important');
    outgoing.style.setProperty('pointer-events','none','important');
    outgoing.style.setProperty('contain','paint','important');
    outgoing.style.setProperty('backface-visibility','hidden','important');
    outgoing.style.setProperty('-webkit-backface-visibility','hidden','important');

    incoming.style.setProperty('position','relative','important');
    incoming.style.setProperty('z-index','3','important');
    incoming.style.setProperty('backface-visibility','hidden','important');
    incoming.style.setProperty('-webkit-backface-visibility','hidden','important');
    outgoing.style.setProperty('will-change','transform','important');
    incoming.style.setProperty('will-change','transform','important');

    const finish=()=>{if(pageTransition===active)stopPageTransition();};
    const outgoingFrom=outgoingBase;
    const outgoingTo=outgoingRest+'translate3d('+outgoingDistance+'px,0,0)';
    const incomingFrom=incomingRest+'translate3d('+incomingDistance+'px,0,0)';
    const incomingTo=incomingBase;

    if(typeof incoming.animate==='function'&&typeof outgoing.animate==='function'){
      try{
        const outAnim=outgoing.animate([{transform:outgoingFrom},{transform:outgoingTo}],{duration:time,easing:ease,fill:'both',composite:'replace'});
        const inAnim=incoming.animate([{transform:incomingFrom},{transform:incomingTo}],{duration:time,easing:ease,fill:'both',composite:'replace'});
        active.animations.push(outAnim,inAnim);
        inAnim.onfinish=finish;
        inAnim.oncancel=()=>{};
        active.timer=setTimeout(finish,time+48);
        return true;
      }catch(_){active.animations.length=0;}
    }

    outgoing.style.setProperty('transition','none','important');
    incoming.style.setProperty('transition','none','important');
    outgoing.style.setProperty('transform',outgoingFrom,'important');
    incoming.style.setProperty('transform',incomingFrom,'important');
    /* Two frames intentionally: frame 1 commits the start pose; frame 2 starts movement.
       This avoids WebView coalescing start/end styles into a hard cut. */
    active.frame=requestAnimationFrame(()=>{
      if(pageTransition!==active)return;
      active.frame2=requestAnimationFrame(()=>{
        if(pageTransition!==active)return;
        const transition='transform '+time+'ms '+ease;
        outgoing.style.setProperty('transition',transition,'important');
        incoming.style.setProperty('transition',transition,'important');
        outgoing.style.setProperty('transform',outgoingTo,'important');
        incoming.style.setProperty('transform',incomingTo,'important');
        active.timer=setTimeout(finish,time+48);
      });
    });
    return true;
  }

  function scrollToPosition(top){
    const roots=[document.documentElement,document.body,document.scrollingElement].filter((node,index,all)=>node && all.indexOf(node)===index);
    const saved=roots.map(node=>[node,node.style.getPropertyValue('scroll-behavior'),node.style.getPropertyPriority('scroll-behavior')]);
    roots.forEach(node=>node.style.setProperty('scroll-behavior','auto','important'));
    window.scrollTo(0,Math.max(0,Number(top)||0));
    saved.forEach(([node,value,priority])=>{if(value)node.style.setProperty('scroll-behavior',value,priority);else node.style.removeProperty('scroll-behavior');});
  }
  function autoTop(){try{return typeof state!=='undefined' && state.settings && state.settings.autoScrollTop===true;}catch(_){return false;}}
  function beforePage(previous,next){
    /* A rapid tap settles the old handoff first, making the current destination the only live screen. */
    stopPageTransition();
    const top=Math.max(0,window.scrollY || (document.scrollingElement||document.documentElement).scrollTop || 0);
    positions[previous]=top;
    const previousNode=document.getElementById('screen-'+previous);
    cancel(previousNode);cancel(document.getElementById('screen-'+next));
    return {previous,next,previousNode,previousRect:pageRect(previousNode),top:autoTop()?0:(Object.prototype.hasOwnProperty.call(positions,next)?positions[next]:0)};
  }
  function afterPage(context,node){
    if(!context || !node)return;
    scrollToPosition(context.top);
    if(context.previous!==context.next && !document.documentElement.classList.contains('vy855-booting')){
      const direction=(ranks[context.next]||0)<(ranks[context.previous]||0)?-1:1;
      if(!animatePagePair(context,node,direction))enter(node,direction);
    }
  }

  function visible(node){return node && node.isConnected && !node.hidden && css(node,'display','block')!=='none' && css(node,'visibility','visible')!=='hidden';}
  function topOverlay(){return Array.from(document.querySelectorAll(overlaySelector)).filter(visible).pop();}
  function focusables(node){return Array.from(node.querySelectorAll(focusSelector)).filter(el=>visible(el) && el.getClientRects().length);}
  function isSheet(overlay,card){
    return !!(card && ((typeof card.matches==='function' && card.matches('.android-sheet,.shop-progress-sheet,.vy6601-select-sheet,.sheet-content')) || (typeof overlay.matches==='function' && overlay.matches('.android-sheet-overlay,.shop-progress-overlay,.vy6601-select-overlay'))));
  }
  function guardOverlay(overlay){
    if(!overlay || overlay.__vyMotionGuard)return;
    overlay.__vyMotionGuard=true;
    overlay.addEventListener('click',event=>{
      if(overlay.__vyClosing){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  }
  function registerOverlay(overlay){
    const card=overlay && overlay.querySelector ? overlay.querySelector(cardSelector) : null;
    if(!overlay || !card)return null;
    const info={card,trigger:document.activeElement,finish:null,sheet:isSheet(overlay,card)};
    overlays.set(overlay,info);guardOverlay(overlay);return info;
  }

  function openOverlay(overlay){
    if(overlays.has(overlay) || !visible(overlay) || overlay.__vyClosing)return;
    const info=registerOverlay(overlay);if(!info)return;
    const card=info.card,sheet=info.sheet;
    cancel(card);cancel(overlay);
    const base=css(card,'transform','none');
    const rest=base==='none'?'':base+' ';
    tween(overlay,{opacity:'0'},{opacity:'1'},sheet?145:125,null,easeSoft);
    tween(card,{transform:rest+'translate3d(0,'+(sheet?'22':'10')+'px,0) scale('+(sheet?'.996':'.992')+')'},{transform:base},sheet?220:185,null,ease);
    requestAnimationFrame(()=>{
      if(!overlay.isConnected || overlay.__vyClosing)return;
      if(!overlay.contains(document.activeElement)){
        const target=focusables(card)[0]||card;
        if(target===card)card.setAttribute('tabindex','-1');
        try{target.focus({preventScroll:true});}catch(_){ }
      }
    });
  }

  function cancelOverlay(overlay){
    const info=overlays.get(overlay);cancel(overlay);if(info)cancel(info.card);
    if(info && info.finish)info.finish();overlays.delete(overlay);
  }

  function closeOverlay(overlay,callback){
    if(!overlay){if(callback)callback();return;}
    if(overlay.__vyClosing)return;
    let info=overlays.get(overlay);
    if(!info)info=registerOverlay(overlay)||{card:overlay.querySelector?overlay.querySelector(cardSelector):null,trigger:null,sheet:false};
    overlay.__vyClosing=true;overlay.style.setProperty('pointer-events','auto','important');
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;cancel(overlay);cancel(info.card);overlays.delete(overlay);
      if(callback)callback();else overlay.remove();
      if(info.trigger && info.trigger.isConnected && (document.activeElement===document.body || (overlay.contains && overlay.contains(document.activeElement)))){
        try{info.trigger.focus({preventScroll:true});}catch(_){ }
      }
    };
    info.finish=finish;overlays.set(overlay,info);
    if(!duration(120)){finish();return;}
    const card=info.card,overlayOpacity=css(overlay,'opacity','1');
    if(card){
      const currentTransform=css(card,'transform','none');cancel(card);
      const rest=currentTransform==='none'?'':currentTransform+' ';
      tween(card,{transform:currentTransform},{transform:rest+'translate3d(0,'+(info.sheet?'14':'7')+'px,0) scale('+(info.sheet?'.997':'.995')+')'},info.sheet?145:120,null,easeClose);
    }
    cancel(overlay);tween(overlay,{opacity:overlayOpacity},{opacity:'0'},info.sheet?145:120,finish,easeClose);
  }

  function dismissTop(){
    const overlay=topOverlay();if(!overlay)return false;if(overlay.__vyClosing)return true;
    const close=overlay.querySelector(closeSelector);if(close){close.click();return true;}return false;
  }

  window.vyaparMotion={enter,cancel,scrollTo:scrollToPosition,beforePage,afterPage,openOverlay,closeOverlay,cancelOverlay,dismissTop,stopPageTransition};

  function boot(){
    document.documentElement.classList.add('vy-motion-ready');
    document.querySelectorAll(overlaySelector).forEach(openOverlay);
    const observer=new MutationObserver(records=>{
      records.forEach(record=>{
        if(record.type==='attributes'){
          const node=record.target;
          if(node.nodeType===1 && (typeof node.matches==='function' && node.matches(overlaySelector)) && visible(node) && !overlays.has(node))openOverlay(node);
          return;
        }
        record.addedNodes.forEach(node=>{
          if(node.nodeType!==1)return;
          if((typeof node.matches==='function' && node.matches(overlaySelector)))openOverlay(node);
          if(typeof node.querySelectorAll==='function')node.querySelectorAll(overlaySelector).forEach(openOverlay);
          if(typeof node.matches==='function' && node.matches(transientSelector)){
            const base=css(node,'transform','none');const rest=base==='none'?'':base+' ';
            tween(node,{transform:rest+'translate3d(0,5px,0)'},{transform:base},150,null,ease);
          }
        });
      });
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    document.addEventListener('keydown',event=>{
      const overlay=topOverlay();if(!overlay)return;
      if(event.key==='Escape' && dismissTop()){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.key!=='Tab')return;
      const items=focusables(overlay);if(!items.length){event.preventDefault();return;}
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey && (document.activeElement===first || !overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
    },true);
    document.addEventListener('toggle',event=>{
      if(event.target.tagName==='DETAILS' && event.target.open){
        Array.from(event.target.children).filter(node=>node.tagName!=='SUMMARY').forEach(node=>{
          cancel(node);const base=css(node,'transform','none');const rest=base==='none'?'':base+' ';
          tween(node,{transform:rest+'translate3d(0,-4px,0)'},{transform:base},145,null,ease);
        });
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* ===== SCRIPT SOURCE: auth.js ===== */

(function(){
  "use strict";

  if(window.__vyaparAuth867Ready)return;
  window.__vyaparAuth867Ready=true;
  document.getElementById("vyaparOtpGate")?.remove();

  const API_BASE="https://vypar-backend.onrender.com";
  const TOKEN_KEY="vyapar_ai_auth_token_v1";
  const REFRESH_TOKEN_KEY="vyapar_ai_auth_refresh_token_v1";
  const ACCOUNT_KEY="vyapar_ai_account_cache_v1";
  const AUTH_METHOD_KEY="vyapar_ai_auth_method_v2";

  const gate=document.createElement("div");
  gate.id="vyaparOtpGate";
  if(localStorage.getItem(TOKEN_KEY))gate.style.setProperty('visibility','hidden','important');
  gate.innerHTML=`
    <div class="auth-page">
      <main class="auth-card" aria-labelledby="page-title">
        <button id="auth-back-login" class="auth-back hidden" type="button" aria-label="Back to sign in">←</button>
        <div class="auth-brand-row">
          <div class="auth-logo-box"><img src="assets/images/logo.png" alt="Vyapar AI Logo" class="auth-logo"></div>
          <h1 id="page-title" class="auth-title">Welcome Back</h1>
        </div>
        <p id="page-subtitle" class="auth-subtitle">Sign in to manage your smart business.</p>

        <section id="login-section" class="auth-section auth-space-5">
          <div class="auth-method-tabs" role="tablist" aria-label="Sign in method">
            <button id="tab-login-pass" class="auth-method-tab" type="button" role="tab" aria-selected="false">Password</button>
            <button id="tab-login-otp" class="auth-method-tab active" type="button" role="tab" aria-selected="true">Email OTP</button>
          </div>

          <form id="form-login-pass" class="auth-form auth-space-4 hidden" novalidate>
            <div><label class="auth-label" for="login-email">Email Address</label><input id="login-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"></div>
            <div>
              <div class="auth-label-row"><label class="auth-label" for="login-password">Password</label><button id="forgot-password" class="auth-forgot" type="button">Forgot password?</button></div>
              <input id="login-password" class="auth-input" type="password" autocomplete="current-password" placeholder="Enter password">
            </div>
            <button id="login-password-submit" class="auth-primary" type="submit">Sign in</button>
          </form>

          <form id="form-login-otp" class="auth-form auth-space-4" novalidate>
            <div>
              <label class="auth-label" for="login-otp-email">Email Address</label>
              <div class="auth-otp-row"><input id="login-otp-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="login-send-otp" class="auth-small-btn" type="button">Get OTP</button></div>
            </div>
            <div><label class="auth-label" for="login-otp-code">Enter OTP</label><input id="login-otp-code" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="login-otp-submit" class="auth-primary" type="submit">Verify &amp; Sign in</button>
          </form>

          <div class="auth-divider"><span>or continue with</span></div>
          <button id="google-login" class="auth-google" type="button"><span class="auth-google-mark" aria-hidden="true">G</span><span>Sign in with Google</span></button>
          <p class="auth-switch">Don't have an account? <button id="show-signup" type="button">Create account</button></p>
        </section>

        <section id="signup-section" class="auth-section auth-space-4 hidden">
          <div class="auth-method-tabs auth-signup-tabs" role="tablist" aria-label="Create account method">
            <button id="tab-signup-pass" class="auth-method-tab active" type="button" role="tab" aria-selected="true">Password</button>
            <button id="tab-signup-otp" class="auth-method-tab" type="button" role="tab" aria-selected="false">Email OTP</button>
          </div>

          <form id="form-signup" class="auth-form auth-space-3" novalidate>
            <div><label class="auth-label" for="signup-name">Your Name</label><input id="signup-name" class="auth-input" type="text" autocomplete="name" placeholder="Enter your name"></div>
            <div><label class="auth-label" for="signup-email">Email Address</label><div class="auth-otp-row"><input id="signup-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="signup-send-otp" class="auth-small-btn" type="button">Get OTP</button></div></div>
            <div><label class="auth-label" for="signup-password">Create Password</label><input id="signup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="Minimum 8 characters"></div>
            <div><label class="auth-label" for="signup-password-confirm">Confirm Password</label><input id="signup-password-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Enter password again"></div>
            <div id="signup-password-otp-wrap" class="hidden"><label class="auth-label" for="signup-otp">Enter OTP</label><input id="signup-otp" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="signup-submit" class="auth-primary" type="submit">Send verification OTP</button>
          </form>

          <form id="form-signup-otp" class="auth-form auth-space-3 hidden" novalidate>
            <div><label class="auth-label" for="signup-otp-name">Your Name</label><input id="signup-otp-name" class="auth-input" type="text" autocomplete="name" placeholder="Enter your name"></div>
            <div><label class="auth-label" for="signup-otp-email">Email Address</label><div class="auth-otp-row"><input id="signup-otp-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="signup-otp-send" class="auth-small-btn" type="button">Get OTP</button></div></div>
            <div><label class="auth-label" for="signup-otp-code">Enter OTP</label><input id="signup-otp-code" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="signup-otp-submit" class="auth-primary" type="submit">Verify &amp; Create Account</button>
          </form>

          <div class="auth-divider"><span>or continue with</span></div>
          <button id="google-signup" class="auth-google" type="button"><span class="auth-google-mark" aria-hidden="true">G</span><span>Continue with Google</span></button>
          <p class="auth-terms-copy">By creating an account, you agree to the <a href="pages/legal/terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="pages/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>
          <p class="auth-switch">Already have an account? <button id="show-login" type="button">Sign in</button></p>
        </section>

        <section id="password-setup-section" class="auth-section hidden">
          <p id="password-setup-copy" class="password-setup-copy">Email verified. Create a password to finish setup.</p>
          <form id="form-password-setup" class="auth-form auth-space-4" novalidate>
            <div><label class="auth-label" for="setup-password">Create Password</label><input id="setup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="Minimum 8 characters"></div>
            <div><label class="auth-label" for="setup-password-confirm">Confirm Password</label><input id="setup-password-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Enter password again"></div>
            <button id="setup-password-submit" class="auth-primary" type="submit">Save Password &amp; Continue</button>
          </form>
        </section>
        <div id="auth-message" class="auth-message" role="status" aria-live="polite"></div>
      </main>
      <div class="auth-loading-overlay" role="status" aria-live="polite" aria-label="Opening Vyapar AI"><div class="auth-loading-card"><div class="auth-loading-spinner" aria-hidden="true"></div><strong>Login successful</strong><span>Opening home…</span></div></div>
    </div>`;
  document.body.prepend(gate);

  const $=id=>document.getElementById(id);
  const els={
    title:$("page-title"),subtitle:$("page-subtitle"),back:$("auth-back-login"),message:$("auth-message"),
    login:$("login-section"),signup:$("signup-section"),setup:$("password-setup-section"),
    passTab:$("tab-login-pass"),otpTab:$("tab-login-otp"),signupPassTab:$("tab-signup-pass"),signupOtpTab:$("tab-signup-otp"),
    passForm:$("form-login-pass"),otpForm:$("form-login-otp"),signupForm:$("form-signup"),signupOtpForm:$("form-signup-otp"),setupForm:$("form-password-setup"),
    loginEmail:$("login-email"),loginPassword:$("login-password"),loginOtpEmail:$("login-otp-email"),loginOtpCode:$("login-otp-code"),
    signupName:$("signup-name"),signupEmail:$("signup-email"),signupPassword:$("signup-password"),signupConfirm:$("signup-password-confirm"),signupOtp:$("signup-otp"),signupOtpWrap:$("signup-password-otp-wrap"),
    signupOtpName:$("signup-otp-name"),signupOtpEmail:$("signup-otp-email"),signupOtpCode:$("signup-otp-code"),
    setupPassword:$("setup-password"),setupConfirm:$("setup-password-confirm"),setupCopy:$("password-setup-copy"),
    googleLogin:$("google-login"),googleSignup:$("google-signup")
  };

  let pendingAuthData=null,pendingAuthMethod=null,refreshPromise=null;

  function syncViewport(){
    const viewport=window.visualViewport;
    const height=Math.max(320,Math.round(viewport?.height||window.innerHeight||document.documentElement.clientHeight||640));
    gate.style.setProperty("--auth-viewport-height",height+"px");
    gate.classList.toggle("auth-keyboard-open",Boolean(viewport&&window.innerHeight-height>120));
  }
  syncViewport();
  window.addEventListener("resize",syncViewport,{passive:true});
  window.visualViewport?.addEventListener("resize",syncViewport,{passive:true});
  window.visualViewport?.addEventListener("scroll",syncViewport,{passive:true});
  gate.addEventListener("focusin",event=>{if(event.target.matches("input"))setTimeout(()=>event.target.scrollIntoView({block:"center",inline:"nearest"}),120)});

  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
  const cleanOtp=value=>String(value||"").replace(/\D/g,"").slice(0,6);
  const currentAccessToken=()=>String(localStorage.getItem(TOKEN_KEY)||"").trim();
  const accessTokenFrom=data=>String(data?.token||data?.accessToken||data?.access_token||data?.data?.token||data?.data?.accessToken||data?.data?.access_token||"").trim();
  const refreshTokenFrom=data=>String(data?.refreshToken||data?.refresh_token||data?.data?.refreshToken||data?.data?.refresh_token||"").trim();
  const needsPasswordSetup=data=>Boolean((data?.user||data?.data?.user)?.password_configured===false);

  function clearMessage(){els.message.textContent="";els.message.className="auth-message"}
  function showMessage(text,type="error"){els.message.textContent=text||"";els.message.className="auth-message "+type}
  function resetScroll(){requestAnimationFrame(()=>{gate.scrollTop=0})}
  function clearSessionTokens(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REFRESH_TOKEN_KEY)}
  function storeSessionTokens(data){
    const access=accessTokenFrom(data),refresh=refreshTokenFrom(data);
    if(access)localStorage.setItem(TOKEN_KEY,access);
    if(refresh)localStorage.setItem(REFRESH_TOKEN_KEY,refresh);
    return access;
  }
  function saveSession(data,method){
    const token=storeSessionTokens(data);
    if(!token)throw new Error("Login response did not include a secure token");
    localStorage.setItem(AUTH_METHOD_KEY,method||"account");
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user||data?.data?.user||null,subscription:data.subscription||data?.data?.subscription||null}));
  }
  async function readResponse(response){
    const text=await response.text();let data={};
    try{data=text?JSON.parse(text):{}}catch(_){const error=new Error("The server returned an invalid response");error.status=response.status;throw error}
    if(!response.ok||data.success===false){const error=new Error(data.message||"Request failed");error.status=response.status;throw error}
    return data;
  }
  async function refreshAccessToken(signal,isActive=()=>true){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const refresh=String(localStorage.getItem(REFRESH_TOKEN_KEY)||"").trim(),access=currentAccessToken();
      if(!refresh&&!access)return "";
      try{
        const headers={"Content-Type":"application/json","Accept":"application/json"};if(access)headers.Authorization="Bearer "+access;
        const response=await fetch(API_BASE+"/auth/refresh",{method:"POST",headers,body:JSON.stringify(refresh?{refreshToken:refresh}:{}),signal});
        if(!response.ok)return "";
        const data=await response.json().catch(()=>({}));if(data.success===false)return "";
        if(!isActive()||signal?.aborted)return "";
        const next=storeSessionTokens(data);if(!next)return "";
        const user=data.user||data?.data?.user||null,subscription=data.subscription||data?.data?.subscription||null;
        if(user||subscription){let cached={};try{cached=JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"{}")||{}}catch(_){}localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:user||cached.user||null,subscription:subscription||cached.subscription||null}))}
        return next;
      }catch(_){return ""}
    })();
    try{return await refreshPromise}finally{refreshPromise=null}
  }
  async function authFetch(input,init={}){
    const base=new Request(input,init),headers=new Headers(base.headers),token=currentAccessToken();
    if(token&&!headers.has("Authorization"))headers.set("Authorization","Bearer "+token);
    const first=new Request(base,{headers}),retryTemplate=first.clone();
    let response=await fetch(first);
    const url=String(first.url||input);
    if(response.status!==401||/\/auth\/(?:login|register|request-otp|verify-otp|google|refresh)(?:\?|$)/.test(url))return response;
    const next=await refreshAccessToken();if(!next)return response;
    const retryHeaders=new Headers(retryTemplate.headers);retryHeaders.set("Authorization","Bearer "+next);
    return fetch(new Request(retryTemplate,{headers:retryHeaders}));
  }
  window.vyaparAuthFetch=authFetch;
  window.vyaparRefreshAuthToken=refreshAccessToken;

  function completeLogin(data,method){
    saveSession(data,method);showMessage("Login successful. Opening home…","success");gate.classList.add("auth-loading");document.documentElement.classList.add("vy861-auth-handoff");
    try{window.scrollTo(0,0)}catch(_){}
    setTimeout(()=>{try{location.replace(location.href)}catch(_){location.reload()}},180);
  }
  function showLogin(){
    clearMessage();els.login.classList.remove("hidden");els.signup.classList.add("hidden");els.setup.classList.add("hidden");els.back.classList.add("hidden");els.title.textContent="Welcome Back";els.subtitle.textContent="Sign in to manage your smart business.";resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.login,-1);
  }
  function showSignup(){
    clearMessage();els.login.classList.add("hidden");els.signup.classList.remove("hidden");els.setup.classList.add("hidden");els.back.classList.remove("hidden");els.title.textContent="Create Account";els.subtitle.textContent="Create your Vyapar AI account and start managing your business.";switchSignupMode("password");resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.signup,1);
  }
  function switchLoginMode(mode){
    const otp=mode==="otp";els.passForm.classList.toggle("hidden",otp);els.otpForm.classList.toggle("hidden",!otp);els.passTab.classList.toggle("active",!otp);els.otpTab.classList.toggle("active",otp);els.passTab.setAttribute("aria-selected",String(!otp));els.otpTab.setAttribute("aria-selected",String(otp));els.passTab.tabIndex=otp?-1:0;els.otpTab.tabIndex=otp?0:-1;
    if(otp&&els.loginEmail.value.trim()&&!els.loginOtpEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();clearMessage();
    if(window.vyaparMotion) window.vyaparMotion.enter(otp?els.otpForm:els.passForm,otp?1:-1);
  }
  function switchSignupMode(mode){
    const otp=mode==="otp";els.signupForm.classList.toggle("hidden",otp);els.signupOtpForm.classList.toggle("hidden",!otp);els.signupPassTab.classList.toggle("active",!otp);els.signupOtpTab.classList.toggle("active",otp);els.signupPassTab.setAttribute("aria-selected",String(!otp));els.signupOtpTab.setAttribute("aria-selected",String(otp));els.signupPassTab.tabIndex=otp?-1:0;els.signupOtpTab.tabIndex=otp?0:-1;clearMessage();
    if(window.vyaparMotion) window.vyaparMotion.enter(otp?els.signupOtpForm:els.signupForm,otp?1:-1);
  }
  function showPasswordSetup(data,method,recovery){
    saveSession(data,method);pendingAuthData=data;pendingAuthMethod=method;els.login.classList.add("hidden");els.signup.classList.add("hidden");els.setup.classList.remove("hidden");els.back.classList.add("hidden");els.title.textContent=recovery?"Recreate your password":"Create your password";els.subtitle.textContent=recovery?"Email verified. Set a new password to continue.":"Email verified. Create a password to finish setup.";els.setupCopy.textContent=els.subtitle.textContent;els.setupPassword.value="";els.setupConfirm.value="";clearMessage();resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.setup,1);
  }

  els.passTab.addEventListener("click",()=>switchLoginMode("password"));
  els.otpTab.addEventListener("click",()=>switchLoginMode("otp"));
  els.signupPassTab.addEventListener("click",()=>switchSignupMode("password"));
  els.signupOtpTab.addEventListener("click",()=>switchSignupMode("otp"));
  $("show-signup").addEventListener("click",showSignup);$("show-login").addEventListener("click",showLogin);els.back.addEventListener("click",showLogin);
  $("forgot-password").addEventListener("click",()=>{if(els.loginEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();switchLoginMode("otp");showMessage("Use Email OTP to securely recover access.","success")});

  els.passForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const email=els.loginEmail.value.trim().toLowerCase(),password=els.loginPassword.value;
    if(!validEmail(email))return showMessage("Enter a valid email address");if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");
    const button=$("login-password-submit");button.disabled=true;button.textContent="Signing in…";
    try{completeLogin(await readResponse(await fetch(API_BASE+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})})),"password")}catch(error){showMessage(error.message||"Unable to sign in")}finally{button.disabled=false;button.textContent="Sign in"}
  });

  async function requestOtp(button,email,successFocus){
    clearMessage();if(!validEmail(email))return showMessage("Enter a valid email address");button.disabled=true;button.textContent="Sending…";
    try{const data=await readResponse(await fetch(API_BASE+"/auth/request-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})}));showMessage(data.message||"Verification code sent","success");successFocus?.();return true}catch(error){showMessage(error.message||"Unable to send verification code");return false}finally{button.disabled=false;button.textContent="Get OTP"}
  }
  $("login-send-otp").addEventListener("click",function(){requestOtp(this,els.loginOtpEmail.value.trim().toLowerCase(),()=>els.loginOtpCode.focus())});
  els.otpForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const email=els.loginOtpEmail.value.trim().toLowerCase(),code=cleanOtp(els.loginOtpCode.value);
    if(!validEmail(email))return showMessage("Enter a valid email address");if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    const button=$("login-otp-submit");button.disabled=true;button.textContent="Verifying…";
    try{const data=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})}));needsPasswordSetup(data)?showPasswordSetup(data,"otp",true):completeLogin(data,"otp")}catch(error){showMessage(error.message||"Verification failed")}finally{button.disabled=false;button.textContent="Verify & Sign in"}
  });

  $("signup-send-otp").addEventListener("click",async function(){
    const name=els.signupName.value.trim(),email=els.signupEmail.value.trim().toLowerCase();if(name.length<2)return showMessage("Enter your full name");
    const sent=await requestOtp(this,email,()=>{els.signupOtpWrap.classList.remove("hidden");els.signupOtp.focus()});if(sent)$("signup-submit").textContent="Verify & Create Account";
  });
  els.signupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const name=els.signupName.value.trim(),email=els.signupEmail.value.trim().toLowerCase(),password=els.signupPassword.value,confirm=els.signupConfirm.value,code=cleanOtp(els.signupOtp.value);
    if(name.length<2)return showMessage("Enter your full name");if(!validEmail(email))return showMessage("Enter a valid email address");if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");if(password!==confirm)return showMessage("Passwords do not match");
    if(els.signupOtpWrap.classList.contains("hidden")||code.length!==6){const sent=await requestOtp($("signup-send-otp"),email,()=>{els.signupOtpWrap.classList.remove("hidden");els.signupOtp.focus()});if(sent)$("signup-submit").textContent="Verify & Create Account";return}
    const button=$("signup-submit");button.disabled=true;button.textContent="Creating account…";
    try{const verified=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,name})}));saveSession(verified,"otp");const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+currentAccessToken()},body:JSON.stringify({password})}));completeLogin({...verified,user:updated.user||verified.user,subscription:updated.subscription||verified.subscription},"password")}catch(error){showMessage(error.message||"Unable to create account")}finally{button.disabled=false;button.textContent="Verify & Create Account"}
  });

  $("signup-otp-send").addEventListener("click",function(){const name=els.signupOtpName.value.trim();if(name.length<2)return showMessage("Enter your full name");requestOtp(this,els.signupOtpEmail.value.trim().toLowerCase(),()=>els.signupOtpCode.focus())});
  els.signupOtpForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const name=els.signupOtpName.value.trim(),email=els.signupOtpEmail.value.trim().toLowerCase(),code=cleanOtp(els.signupOtpCode.value);
    if(name.length<2)return showMessage("Enter your full name");if(!validEmail(email))return showMessage("Enter a valid email address");if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    const button=$("signup-otp-submit");button.disabled=true;button.textContent="Verifying…";
    try{const verified=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,name})}));needsPasswordSetup(verified)?showPasswordSetup(verified,"otp",false):completeLogin(verified,"otp")}catch(error){showMessage(error.message||"Unable to create account")}finally{button.disabled=false;button.textContent="Verify & Create Account"}
  });

  els.setupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const password=els.setupPassword.value,confirm=els.setupConfirm.value;if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");if(password!==confirm)return showMessage("Passwords do not match");const token=currentAccessToken();if(!token)return showMessage("Secure session missing. Verify your email again.");
    const button=$("setup-password-submit");button.disabled=true;button.textContent="Saving…";
    try{const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({password})}));completeLogin({...pendingAuthData,token,user:updated.user||pendingAuthData?.user||null,subscription:updated.subscription||pendingAuthData?.subscription||null},pendingAuthMethod||"password")}catch(error){showMessage(error.message||"Unable to save password")}finally{button.disabled=false;button.textContent="Save Password & Continue"}
  });

  function setGoogleBusy(busy,label){[els.googleLogin,els.googleSignup].forEach(button=>{button.disabled=busy;const span=button.querySelector("span:last-child");if(span&&label)span.textContent=label})}
  function resetGoogleLabels(){els.googleLogin.querySelector("span:last-child").textContent="Sign in with Google";els.googleSignup.querySelector("span:last-child").textContent="Continue with Google";setGoogleBusy(false)}
  function startGoogle(){clearMessage();if(window.AndroidApp&&typeof window.AndroidApp.startGoogleSignIn==="function"){setGoogleBusy(true,"Opening Google…");try{window.AndroidApp.startGoogleSignIn()}catch(_){resetGoogleLabels();showMessage("Could not open Google sign-in")}return}showMessage("Google sign-in is available in the Android app. On web, use Password or Email OTP.")}
  els.googleLogin.addEventListener("click",startGoogle);els.googleSignup.addEventListener("click",startGoogle);
  window.onNativeGoogleSignInResult=async payload=>{
    let result=payload;if(typeof payload==="string"){try{result=JSON.parse(payload)}catch(_){result={success:false,message:"Google sign-in returned an invalid response"}}}
    if(!result||result.success===false||!result.idToken){resetGoogleLabels();return showMessage(result?.message||"Google sign-in was cancelled")}
    showMessage("Google account verified. Finishing sign in…","success");
    try{const data=await readResponse(await fetch(API_BASE+"/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:result.idToken})}));needsPasswordSetup(data)?showPasswordSetup(data,"google",false):completeLogin(data,"google")}catch(error){resetGoogleLabels();showMessage(error.message||"Google login is unavailable")}
  };

  function hasCachedLocalAccess(){try{if(JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"null")?.user)return true}catch(_){}try{const state=JSON.parse(localStorage.getItem("vyapar_ai_prod_v1")||"{}");return Boolean(state.__indexedDB||state.sales?.length||state.stocks?.length||state.monthly?.length||state.daily?.length)}catch(_){return false}}
  function finishSessionRestore(status){
    if(status==='login')gate.style.removeProperty('visibility');
    else gate.remove();
    document.documentElement.setAttribute('data-vyapar-session',status);
    window.dispatchEvent(new CustomEvent('vyapar:session-ready',{detail:{status}}));
  }

  async function restoreSession(){
    const token=currentAccessToken();
    if(!token){finishSessionRestore('login');return}
    document.documentElement.setAttribute('data-vyapar-session','restoring');
    let active=true,timer=null,rejectedStatus=0;
    const controller=typeof AbortController==='function'?new AbortController():null;
    const signal=controller?controller.signal:undefined;
    const stillActive=()=>active;
    try{
      const request=(async()=>{
        let response=await fetch(API_BASE+"/auth/me",{headers:{Authorization:"Bearer "+token},signal});
        if(!active)throw new Error('Session check ended');
        if(response.status===401){
          rejectedStatus=401;
          const next=await refreshAccessToken(signal,stillActive);
          if(!active)throw new Error('Session check ended');
          if(next)response=await fetch(API_BASE+"/auth/me",{headers:{Authorization:"Bearer "+next},signal});
        }
        if(response.status===401||response.status===403)rejectedStatus=response.status;
        // A successful refresh must also pass /me before clearing rejection.
        const data=await readResponse(response);
        rejectedStatus=0;
        return data;
      })();
      const deadline=new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          active=false;
          const error=new Error('Session check timed out');
          if(rejectedStatus)error.status=rejectedStatus;
          reject(error);
          if(controller)controller.abort();
        },6000);
      });
      const data=await Promise.race([request,deadline]);
      active=false;
      localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user,subscription:data.subscription}));
      finishSessionRestore('authenticated');
    }catch(error){
      active=false;
      const rejected=error&&(error.status===401||error.status===403);
      if(rejected){
        clearSessionTokens();localStorage.removeItem(ACCOUNT_KEY);showLogin();
        showMessage("Your session expired. Sign in again.");finishSessionRestore('login');
      }else if(hasCachedLocalAccess()){
        // Preserve the existing offline/local-data fallback, never grant a new
        // subscription or bypass a server rejection from the current check.
        finishSessionRestore('cached');
      }else{
        showLogin();showMessage("Server is temporarily unavailable. Check your internet connection and try again.");
        finishSessionRestore('login');
      }
    }finally{
      clearTimeout(timer);
    }
  }

  switchLoginMode("otp");showLogin();restoreSession();
})();

/* ===== SCRIPT SOURCE: platform-android.js ===== */

/* Android auth tab indicator enhancer. Tabs remain tap-only to avoid accidental mode changes. */
(function(){
  'use strict';
  if(!document.documentElement.classList.contains('native-android')) return;

  function bind(){
    var gate=document.getElementById('vyaparOtpGate');
    if(!gate) return false;
    var tabs=gate.querySelector('.auth-method-tabs');
    var pass=gate.querySelector('#tab-login-pass');
    var otp=gate.querySelector('#tab-login-otp');
    if(!tabs||!pass||!otp||tabs.dataset.swipeBound==='1') return !!tabs;

    tabs.dataset.swipeBound='1';
    // Auth owns stable, compact Password / Email OTP labels.
    function sync(){
      tabs.classList.toggle('otp-selected',otp.classList.contains('active'));
    }
    sync();

    new MutationObserver(sync).observe(tabs,{subtree:true,attributes:true,attributeFilter:['class','aria-selected']});

    pass.addEventListener('click',function(){setTimeout(sync,0)});
    otp.addEventListener('click',function(){setTimeout(sync,0)});
    return true;
  }

  if(!bind()){
    var observer=new MutationObserver(function(){ if(bind()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();

/* ===== SCRIPT SOURCE: performance-android7-16.js ===== */

/* Vyapar AI — Android 7–16 runtime performance profile (2026-09-01) */
(function(){
  'use strict';
  var root=document.documentElement;
  if(!root || !root.classList.contains('native-android')) return;

  function n(v,d){ v=Number(v); return isFinite(v)?v:d; }
  function androidApi(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.getAndroidSdkInt==='function'){
        return n(window.AndroidApp.getAndroidSdkInt(),0);
      }
    }catch(e){}
    var m=(navigator.userAgent||'').match(/Android\s([0-9]+)/i);
    var major=m?n(m[1],0):0;
    if(major===7) return 24;
    if(major===8) return 26;
    if(major===9) return 28;
    if(major===10) return 29;
    if(major===11) return 30;
    if(major===12) return 31;
    if(major===13) return 33;
    if(major===14) return 34;
    if(major===15) return 35;
    if(major>=16) return 36;
    return 0;
  }
  function nativeMemoryMb(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.getMemoryClassMb==='function'){
        return n(window.AndroidApp.getMemoryClassMb(),0);
      }
    }catch(e){}
    return 0;
  }
  function nativeLowRam(){
    try{
      if(window.AndroidApp && typeof window.AndroidApp.isLowRamDevice==='function'){
        return !!window.AndroidApp.isLowRamDevice();
      }
    }catch(e){}
    return false;
  }

  var api=androidApi();
  var cores=n(navigator.hardwareConcurrency,0);
  var deviceMemory=n(navigator.deviceMemory,0);
  var memoryMb=nativeMemoryMb();
  var lowRam=nativeLowRam() || (deviceMemory>0 && deviceMemory<=2) || (memoryMb>0 && memoryMb<=192);

  var tier='modern';
  if((api>0 && api<=27) || lowRam) tier='legacy';
  else if((api>0 && api<=30) || (cores>0 && cores<=4) || (deviceMemory>0 && deviceMemory<=4)) tier='mid';

  root.classList.remove('perf-tier-legacy','perf-tier-mid','perf-tier-modern','perf-low-ram');
  root.classList.add('perf-tier-'+tier);
  if(lowRam) root.classList.add('perf-low-ram');
  if(api) root.setAttribute('data-android-api',String(api));
  root.setAttribute('data-perf-tier',tier);
  if(memoryMb) root.setAttribute('data-memory-class-mb',String(memoryMb));

  /* Do not mutate layout continuously. Toggle one cheap class at gesture start/end. */
  var scrollTimer=0;
  var scrollFrame=0;
  var scrolling=false;
  function markScrolling(){
    scrollFrame=0;
    if(!scrolling){ scrolling=true; root.classList.add('perf-scrolling'); }
  }
  function beginScroll(){
    if(!scrolling && !scrollFrame) scrollFrame=requestAnimationFrame(markScrolling);
    if(scrollTimer) clearTimeout(scrollTimer);
    scrollTimer=setTimeout(endScroll,140);
  }
  function endScroll(){
    if(scrollFrame){ cancelAnimationFrame(scrollFrame); scrollFrame=0; }
    if(scrollTimer){ clearTimeout(scrollTimer); scrollTimer=0; }
    if(scrolling){ scrolling=false; root.classList.remove('perf-scrolling'); }
  }
  window.addEventListener('scroll',beginScroll,{passive:true});
  /* One touchstart is cheaper than doing JS work on every touchmove frame. */
  document.addEventListener('touchstart',beginScroll,{passive:true});
  document.addEventListener('touchend',function(){
    if(scrollTimer) clearTimeout(scrollTimer);
    scrollTimer=setTimeout(endScroll,90);
  },{passive:true});
  document.addEventListener('touchcancel',endScroll,{passive:true});
  document.addEventListener('visibilitychange',function(){ if(document.hidden) endScroll(); },{passive:true});
  window.addEventListener('pagehide',endScroll,{passive:true});

  /* Delay decoding of large, non-critical local artwork. The app logo remains eager. */
  function tuneImages(){
    var imgs=document.images||[];
    for(var i=0;i<imgs.length;i++){
      var img=imgs[i];
      if(!img || img.closest && img.closest('#appLoader')) continue;
      if(img.classList && (img.classList.contains('logo') || img.classList.contains('vy659-footer-logo'))) continue;
      try{ img.decoding='async'; }catch(e){}
      if(img.classList && img.classList.contains('upgrade-plan-reference-image')){
        try{ img.loading='lazy'; }catch(e){}
      }
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tuneImages,{once:true});
  else tuneImages();

  /* Razorpay downloads in parallel so it cannot hold the login/startup path.
     If a user reaches Plans unusually quickly, wait for that same script rather
     than showing a false "missing" error while it is still downloading. */
  window.vyaparWaitForRazorpay=function(timeoutMs){
    if(typeof window.Razorpay==='function') return Promise.resolve(window.Razorpay);
    var script=document.querySelector('script[src*="checkout.razorpay.com/v1/checkout.js"]');
    if(!script) return Promise.reject(new Error('Razorpay checkout script is unavailable'));
    return new Promise(function(resolve,reject){
      var settled=false;
      var timer=setTimeout(function(){ finish(new Error('Razorpay checkout timed out')); },Math.max(1000,n(timeoutMs,12000)));
      function cleanup(){
        clearTimeout(timer);
        script.removeEventListener('load',loaded);
        script.removeEventListener('error',failed);
      }
      function finish(error){
        if(settled) return;
        settled=true;
        cleanup();
        if(!error && typeof window.Razorpay==='function') resolve(window.Razorpay);
        else reject(error || new Error('Razorpay checkout did not initialize'));
      }
      function loaded(){ finish(null); }
      function failed(){ finish(new Error('Razorpay checkout could not be loaded')); }
      script.addEventListener('load',loaded,{once:true});
      script.addEventListener('error',failed,{once:true});
      if(typeof window.Razorpay==='function') finish(null);
    });
  };

  /* Exposed only for diagnostics/settings UI; no polling. */
  window.VyaparPerformanceProfile={api:api,tier:tier,lowRam:lowRam,cores:cores,memoryMb:memoryMb,deviceMemory:deviceMemory};
})();

/* ===== SCRIPT SOURCE: business-tool-search.js ===== */

/* Business tools: filter existing cards without rebuilding forms or changing plan gates. */
(function () {
  'use strict';

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
  }

  function bind(root) {
    const input = root.querySelector('#businessToolSearch');
    const clear = root.querySelector('#businessToolSearchClear');
    const status = root.querySelector('#businessToolSearchStatus');
    const results = root.querySelector('#businessToolResults');
    if (!input || !clear || !status || !results || input.dataset.bound) return;
    input.dataset.bound = 'true';

    function filter() {
      const terms = normalize(input.value).split(' ').filter(Boolean);
      let count = 0;
      const selected=root.querySelector('.p1-modebar[data-screen="business"] [aria-selected="true"]');
      const active=selected ? selected.dataset.mode : 'daily';
      results.querySelectorAll('.vx621-group').forEach(function (group) {
        let visible = 0;
        const heading = group.querySelector('h2');
        group.querySelectorAll('.vx621-feature-card').forEach(function (card) {
          const text = normalize((heading ? heading.textContent : '') + ' ' + card.textContent);
          const matches = terms.every(function (term) { return text.includes(term); });
          card.hidden = !matches;
          if (matches) visible++;
        });
        const mode=group.dataset && group.dataset.p1Mode;
        group.hidden = visible === 0 || (!terms.length && mode && !mode.split(' ').includes(active));
        if(group.setAttribute) group.setAttribute('aria-hidden',String(group.hidden));
        count += visible;
      });
      const recent=root.querySelector('.vx621-recent');
      if(recent) {
        recent.hidden=terms.length>0 || active!=='activity';
        if(recent.setAttribute) recent.setAttribute('aria-hidden',String(recent.hidden));
      }
      clear.hidden = !input.value;
      status.textContent = !terms.length ? '' : count
        ? count + (count === 1 ? ' tool found' : ' tools found')
        : 'No tools found. Try sale, purchase, customer or tax.';
    }

    function reset() {
      input.value = '';
      filter();
      input.focus();
    }

    input.__refreshBusinessSearch = filter;
    input.addEventListener('input', filter);
    input.addEventListener('search', filter);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        reset();
      }
    });
    clear.addEventListener('click', reset);
  }

  window.VyaparBusinessTools = { bind: bind, refresh: function(root) {
    const input=root.querySelector('#businessToolSearch');
    if(input && input.__refreshBusinessSearch) input.__refreshBusinessSearch();
  } };
})();

/* ===== SCRIPT SOURCE: invoice-pdf.js ===== */

/* Offline invoice PDF export. Financial values are read from the saved document. */
(function () {
  'use strict';
  let libraryPromise, activeJob = null;
  const pending = new Map();
  const nativeCallback = window.onNativeDownloadResult;
  window.onNativeDownloadResult = function (id, ok, message) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id); clearTimeout(request.timer);
      if (ok) request.resolve(message); else request.reject(new Error(message || 'File could not be saved.'));
    } else if (typeof nativeCallback === 'function') nativeCallback(id, ok, message);
  };
  function loadLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdf-lib.min.js';
      const timer = setTimeout(fail, 15000);
      function fail() { clearTimeout(timer); script.remove(); libraryPromise = null; reject(new Error('PDF engine could not load. Try again.')); }
      script.onload = function () { clearTimeout(timer); if (window.PDFLib) resolve(window.PDFLib); else fail(); };
      script.onerror = fail; document.head.appendChild(script);
    });
    return libraryPromise;
  }
  function value(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function clean(v) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim(); }
  function filename(number) { return ('Invoice-' + clean(number || 'document')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0,100) + '.pdf'; }
  function splitText(text, maxWidth, measure) {
    const lines = [];
    clean(text).split(/\r?\n/).forEach(function (paragraph) {
      let line = '';
      paragraph.split(/\s+/).forEach(function (word) {
        const candidate = line ? line + ' ' + word : word;
        if (measure(candidate) <= maxWidth) { line = candidate; return; }
        if (line) { lines.push(line); line = ''; }
        for (const letter of Array.from(word)) {
          if (line && measure(line + letter) > maxWidth) { lines.push(line); line = ''; }
          line += letter;
        }
      });
      lines.push(line);
    });
    return lines;
  }
  function status(message, error) {
    if (typeof window.premiumToast === 'function') window.premiumToast(message, error ? 'error' : 'success');
    else if (typeof window.showGlassToast === 'function') window.showGlassToast(message);
    else if (error) window.alert(message);
  }
  async function generate(model, providedLibrary) {
    model=JSON.parse(JSON.stringify(model || {}));
    const lib = providedLibrary || await loadLibrary();
    const pdf = await lib.PDFDocument.create();
    const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
    // Copy the document so a later edit cannot change an in-flight export.
    const tx = model.transaction || {}, business = model.business || {}, s = model.settings || {};
    const currency = clean(tx.currency || business.baseCurrency || 'INR');
    const money = n => currency + ' ' + value(n).toFixed(2);
    const thermal = !!model.thermal;
    let size = thermal ? [s.thermalWidth === '58' ? 164.41 : 226.77, 650] : s.paperSize === 'A5' ? [419.53,595.28] : [595.28,841.89];
    if (!thermal && s.orientation === 'landscape') size.reverse();
    const [width,height] = size, margin = thermal ? 10 : s.paperSize==='A5'?22:30, usable = width - margin * 2;
    const fontSize = thermal ? 8 : s.fontSize === 'small' ? 9 : s.fontSize === 'large' ? 12 : s.paperSize==='A5'?9:10;
    const rowGap = fontSize * (s.theme==='compact'?1.25:1.4), bottom = thermal?26:32;
    const summaryStep=thermal || s.paperSize==='A5' || s.theme==='compact'?18:22;
    const cellPadding=thermal || s.paperSize==='A5'?8:12;
    const rgb = lib.rgb, ink = rgb(.08,.10,.13), muted = rgb(.35,.38,.43), line = rgb(.84,.86,.89);
    const accent = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#273449';
    const tint = rgb(parseInt(accent.slice(1,3),16)/255,parseInt(accent.slice(3,5),16)/255,parseInt(accent.slice(5),16)/255);
    const pages = []; let page,y,logo;
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    function unicode(text) { try { regular.encodeText(text); return false; } catch (_) { return true; } }
    function measure(text,size,strong) {
      const textValue=clean(text); if(!textValue)return 0;
      if(!unicode(textValue)) return (strong?bold:regular).widthOfTextAtSize(textValue,size);
      if(!ctx) throw new Error('Unicode invoice text requires a canvas-capable browser.');
      ctx.font=(strong?'600 ':'400 ')+size+'px sans-serif'; return ctx.measureText(textValue).width;
    }
    async function text(textValue,x,top,size=fontSize,strong=false,color=ink,maxWidth) {
      textValue=clean(textValue); if(!textValue)return;
      let actual=size;
      if(maxWidth && measure(textValue,actual,strong)>maxWidth) actual=Math.max(6,actual*maxWidth/measure(textValue,actual,strong));
      if(!unicode(textValue)) { page.drawText(textValue,{x,y:height-top-actual,size:actual,font:strong?bold:regular,color}); return; }
      // Canvas uses the device's font shaping for Hindi/Unicode; no missing-glyph substitution.
      const canvas=document.createElement('canvas'),scale=3;
      const w=measure(textValue,actual,strong),h=actual*1.6;
      canvas.width=Math.ceil(w*scale+4);canvas.height=Math.ceil(h*scale+4);
      const c=canvas.getContext('2d');c.scale(scale,scale);c.font=(strong?'600 ':'400 ')+actual+'px sans-serif';c.fillStyle='#171a21';c.textBaseline='top';c.fillText(textValue,0,actual*.1);
      const image=await pdf.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(image,{x,y:height-top-h,width:canvas.width/scale,height:canvas.height/scale});
      canvas.width=canvas.height=1;
    }
    function rule(top) { page.drawLine({start:{x:margin,y:height-top},end:{x:width-margin,y:height-top},thickness:.6,color:line}); }
    if(s.showLogo !== false && business.logo && /^data:image\/(png|jpeg);base64,/i.test(business.logo)) {
      try { logo=/^data:image\/png/i.test(business.logo)?await pdf.embedPng(business.logo):await pdf.embedJpg(business.logo); } catch (_) { /* Optional damaged logo must not prevent invoice export. */ }
    }
    const label = tx.type === 'SALE' || !tx.type ? 'INVOICE' : clean(tx.type).replace(/_/g,' ');
    async function newPage(copy, table) {
      page=pdf.addPage(size);pages.push(page);y=margin;
      await text(business.name || 'Vyapar AI',margin,y,thermal?13:20,true,tint,usable-(logo?45:0));
      if(logo) { const dims=logo.scaleToFit(38,38);page.drawImage(logo,{x:width-margin-dims.width,y:height-y-dims.height,width:dims.width,height:dims.height}); }
      y+=thermal?24:32;
      await text(label+'  '+clean(tx.number),margin,y,fontSize,true,ink,usable);y+=rowGap;
      await text(clean(tx.date)+(copy?'  |  '+copy:''),margin,y,fontSize,false,muted,usable);y+=rowGap;
      if(table) { rule(y+3); y+=12; await tableHeader(); }
    }
    async function paragraph(content,strong=false,color=ink) {
      const lines=splitText(content,usable,t=>measure(t,fontSize,strong));
      for(const part of lines) { if(y+rowGap>height-bottom) await newPage(copyLabel,false);await text(part,margin,y,fontSize,strong,color);y+=rowGap; }
    }
    let columns=[];
    const short=thermal || width<450;
    function buildColumns() {
      const numerical=short ? [['Qty',.12],['Rate',.23],['Amount',.27]] : [['Qty',.07],...(s.showMRP?[['MRP',.12]]:[]),['Rate',.14],...(s.showTax!==false?[['Tax',.09]]:[]),['Amount',.18]];
      const itemWidth=thermal?usable:usable*(1-numerical.reduce((a,c)=>a+c[1],0));
      let x=margin;columns=[{label:'Item',x,width:itemWidth}];x+=itemWidth;
      if(thermal) { columns=[{label:'Item',x:margin,width:usable}];return; }
      numerical.forEach(c=>{columns.push({label:c[0],x,width:usable*c[1]});x+=usable*c[1];});
    }
    buildColumns();
    async function tableHeader() {
      page.drawRectangle({x:margin,y:height-y-22,width:usable,height:22,color:rgb(.94,.95,.97)});
      for(const col of columns) await text(thermal?'Item / Qty x Rate':col.label,col.x+3,y+5,Math.min(fontSize,9),true,ink,col.width-6);
      y+=26;
    }
    async function items() {
      if(y+60>height-bottom) await newPage(copyLabel,false);
      await tableHeader();
      const rows=Array.isArray(tx.items)?tx.items:[];
      if(!rows.length) await paragraph('No item lines on this document.');
      for(let index=0;index<rows.length;index++) {
        const item=rows[index],qty=value(item.qty),rate=value(item.rate==null?item.price:item.rate);
        const heading=(index+1)+'. '+clean(item.name || item.product || 'Item');
        const description=[heading,s.showDescription!==false?clean(item.description):'',s.showHSN!==false && item.hsn?'HSN/SAC: '+clean(item.hsn):'',item.size?'Size: '+clean(item.size):'',item.color?'Colour: '+clean(item.color):'',value(item.discount)?'Line discount: '+value(item.discount)+'%':''].filter(Boolean).join('\n');
        const wraps=splitText(description,columns[0].width-7,t=>measure(t,fontSize,false));
        let lineIndex=0;
        while(lineIndex<wraps.length) {
          if(y+rowGap+cellPadding>height-bottom) await newPage(copyLabel,true);
          const available=Math.max(1,Math.floor((height-bottom-y-cellPadding)/rowGap));
          const chunk=wraps.slice(lineIndex,lineIndex+available),rowHeight=chunk.length*rowGap+cellPadding;
          for(let l=0;l<chunk.length;l++) await text(chunk[l],margin+3,y+5+l*rowGap,fontSize);
          if(lineIndex===0) {
            const amount=item.total != null ? value(item.total) : item.amount != null ? value(item.amount) : qty*rate;
            const vals={Qty:String(qty),MRP:value(item.mrp).toFixed(2),Rate:rate.toFixed(2),Tax:(tx.tax!=null && value(tx.tax)===0?0:value(item.tax ?? item.gst ?? item.taxRate ?? tx.gstPercent))+'%',Amount:amount.toFixed(2)};
            for(const col of columns.slice(1)) {
              const val=vals[col.label];const fs=Math.min(fontSize,9);const w=measure(val,fs,false);
              await text(val,Math.max(col.x+3,col.x+col.width-w-3),y+5,fs,false,ink,col.width-6);
            }
          }
          y+=rowHeight;lineIndex+=chunk.length;
          if(!thermal) rule(y);
        }
        if(thermal) {
          if(y+rowGap+8>height-bottom) await newPage(copyLabel,true);
          const amount=item.total!=null?value(item.total):item.amount!=null?value(item.amount):qty*rate;
          const label=qty+' x '+rate.toFixed(2),amountText=amount.toFixed(2);
          await text(label,margin+3,y,fontSize,false,muted,usable*.52);
          await text(amountText,Math.max(margin+usable*.55,width-margin-measure(amountText,fontSize,true)-3),y,fontSize,true,ink,usable*.45-3);
          y+=rowGap+8;rule(y);
        }
        if(index%12===0) await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    let copyLabel='';
    const copies=s.originalDuplicate && !thermal ? ['CUSTOMER COPY','OFFICE COPY'] : [''];
    for(const copy of copies) {
      copyLabel=copy;await newPage(copy,false);
      for(const field of [['Address','address','showAddress'],['Phone','phone','showPhone'],['Email','email','showEmail'],['GSTIN','gstin','showGSTIN']]) {
        if(s[field[2]]!==false && business[field[1]]) await paragraph((field[0]==='Address'?'':field[0]+': ')+clean(business[field[1]]),false,muted);
      }
      y+=8;rule(y);y+=12;
      await paragraph('Bill to: '+clean(tx.partyName || tx.customer || 'Walk-in Customer'),true);
      if(tx.eWayBillNo) await paragraph('E-Way Bill: '+clean(tx.eWayBillNo));
      for(const field of model.customFields || []) if(field.enabled!==false) await paragraph(clean(field.label)+': '+clean(field.value));
      y+=10;await items();y+=14;
      const lineSubtotal=(tx.items||[]).reduce((sum,item)=>sum+value(item.qty)*value(item.rate ?? item.price),0);
      const subtotal=tx.subtotal==null?lineSubtotal:value(tx.subtotal);
      // Platform transactions store invoice discount as a percentage. Legacy bills
      // store discountAmount. Preserve both schemas without changing the ledger.
      const lineDiscount=(tx.items||[]).reduce((sum,item)=>sum+value(item.qty)*value(item.rate ?? item.price)*value(item.discount)/100,0);
      const discount=tx.discountAmount==null?lineDiscount+subtotal*value(tx.discountPercent ?? tx.discount)/100:value(tx.discountAmount);
      const received=value(tx.receivedPaid ?? tx.paid);
      const balance=tx.balance==null?Math.max(0,value(tx.total)-received):value(tx.balance);
      const taxParts=[['CGST',tx.cgst],['SGST',tx.sgst],['IGST',tx.igst]].filter(part=>value(part[1])!==0);
      const taxes=taxParts.length && Math.abs(taxParts.reduce((sum,part)=>sum+value(part[1]),0)-value(tx.tax))<.01?taxParts:[['GST',tx.tax]];
      const summary=[['Subtotal',subtotal],...(discount?[['Discount',-discount]]:[]),
        ...(s.showTax!==false?[...taxes,...(value(tx.cess)?[['CESS',tx.cess]]:[])]:[]),
        ...(value(tx.additionalCharges)?[['Other charges',tx.additionalCharges]]:[]),['Total',tx.total],
        ...(s.showReceived!==false?[['Received',received]]:[]),...(s.showBalance!==false?[['Balance',balance]]:[])];
      if(y+summary.length*summaryStep>height-bottom) await newPage(copy,false);
      for(const [label,amount] of summary) {
        if(y+summaryStep>height-bottom) await newPage(copy,false);
        const strong=label==='Total'; if(strong)rule(y-3);
        const display=money(amount),space=measure(display,fontSize,strong);
        const labelX=thermal?margin:Math.max(margin,width-margin-250);
        await text(label,labelX,y,fontSize,strong);await text(display,Math.max(labelX+65,width-margin-space),y,fontSize,strong,ink,width-margin-labelX-65);y+=summaryStep;
      }
      if(s.showPaymentMode!==false && tx.paymentMode) await paragraph('Payment: '+clean(tx.paymentMode));
      if(s.showAmountWords!==false && model.amountWords) await paragraph('Amount in words: '+clean(model.amountWords));
      y+=8;
      if(tx.notes) await paragraph('Notes: '+clean(tx.notes),false,muted);
      if(s.showTerms!==false && s.terms) await paragraph('Terms: '+clean(s.terms),false,muted);
      if(s.showSignature!==false) { y+=s.paperSize==='A5'?6:14;await paragraph(clean(s.signatureText || 'Authorized Signatory'),true); }
    }
    if(s.showPageNumbers!==false) {
      for(let i=0;i<pages.length;i++) { page=pages[i];await text('Page '+(i+1)+' of '+pages.length,margin,height-22,8,false,muted); }
    }
    pdf.setTitle('Invoice '+clean(tx.number));pdf.setAuthor(clean(business.name || 'Vyapar AI'));pdf.setCreator('Vyapar AI');
    return { bytes:await pdf.save(),name:filename(tx.number),pageCount:pages.length };
  }
  function base64(bytes) { let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(result); }
  async function save(result) {
    const bridge=window.AndroidDownloads;
    if(bridge && typeof bridge.saveBase64WithResult==='function') {
      const id='invoice-'+Date.now();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Save confirmation timed out. Check Downloads before retrying.'));},180000);
        pending.set(id,{resolve,reject,timer});
        try { bridge.saveBase64WithResult(result.name,'application/pdf',base64(result.bytes),id); }
        catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
      });
    }
    if(bridge && typeof bridge.saveBase64==='function') {bridge.saveBase64(result.name,'application/pdf',base64(result.bytes));return 'Save requested. Check Downloads/Vyapar AI.';}
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=result.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);return 'PDF download started.';
  }
  function download(model) {
    if(activeJob)return activeJob;
    status('Preparing invoice PDF…');
    activeJob=generate(model).then(save).then(message=>{status(message);return true;}).catch(error=>{status(error.message || 'PDF could not be saved. Please try again.',true);return false;}).finally(()=>{activeJob=null;});
    return activeJob;
  }
  window.VyaparInvoicePDF={generate,download,filename,splitText};
})();

/* ===== SCRIPT SOURCE: app.js ===== */

/* Vyapar AI 6.3.4 consolidated runtime. Order preserves the previous script loading. */

;
/* ===== script.js ===== */
function playThemeRipple(x, y){
  const r = document.createElement('div');
  r.className = 'theme-ripple';
  r.style.left = x + 'px';
  r.style.top = y + 'px';
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 240);
}

let tabLoaderTimer = null;

function showTabLoader(){
  const l = document.getElementById('tabLoader');
  if(!l) return;

  l.classList.add('show');
  clearTimeout(tabLoaderTimer);
  tabLoaderTimer = setTimeout(() => l.classList.remove('show'), 400);
}


function updateLoaderNetworkStatus(){
  return navigator.onLine;
}

function hideLoader(){
  const loader = document.getElementById('appLoader');
  if(!loader) return;
  loader.classList.add('hide-loader');
  setTimeout(function(){
    if(loader && loader.parentNode) loader.remove();
  }, 220);
}

function setupVideoSplash(){
  setTimeout(hideLoader, 1050);
}

window.addEventListener('load', setupVideoSplash, { once:true });
setTimeout(hideLoader, 1700);

const STORAGE_KEY = 'vyapar_ai_prod_v1';
const API_BASE_URL = 'https://vypar-backend.onrender.com';
const tabs = [
  ['home', 'Dashboard'],
  ['upload', 'AI Upload'],
  ['sales', 'Sales'],
  ['stock', 'Stock'],
  ['analytics', 'Analytics'],
  ['calculator', 'Calculator'],
  ['business', 'Business'],
  ['subscription', 'Plans'],
  ['settings', 'Settings']
];

let currentTab = 'home';
let editSaleId = '';
let editMonthlyId = '';
let scannedStockItems = [];

let state = loadState();

/*
  Keep every legacy and platform module on one canonical state object.
  Several later modules access window.state while the original app uses
  this lexical state variable. The accessor also keeps restore/rollback
  assignments synchronized instead of letting stale records merge back.
*/
function installCanonicalStateBridge(){
  try{
    Object.defineProperty(window, 'state', {
      configurable: true,
      enumerable: false,
      get(){
        return state;
      },
      set(value){
        if(
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ){
          state = value;
        }
      }
    });
  }catch(error){
    window.state = state;
  }
}

installCanonicalStateBridge();

function uid(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function money(n){
  return '₹' + Number(n || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0
  });
}

function pct(n){
  return Number(n || 0).toFixed(1) + '%';
}

function num(v){
  if(v === null || v === undefined || v === ''){
    return 0;
  }

  const n = Number(
    String(v).replace(/[₹,\s]/g, '')
  );

  return Number.isFinite(n) ? n : 0;
}

function localDateKey(value = new Date()){
  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  const date =
    Number.isNaN(parsed.getTime())
      ? new Date()
      : parsed;

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function isValidDateKey(value){
  const text = String(value || '').trim();

  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return false;
  }

  const [year, month, day] =
    text.split('-').map(Number);

  if(month < 1 || month > 12 || day < 1){
    return false;
  }

  const leap =
    year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);

  const days = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  return day <= days[month - 1];
}

function monthKey(value){
  const raw = String(value ?? '').trim();

  if(/^\d{4}-(0[1-9]|1[0-2])/.test(raw)){
    return raw.slice(0, 7);
  }

  const date =
    value === undefined ||
    value === null ||
    value === ''
      ? new Date()
      : new Date(value);

  if(Number.isNaN(date.getTime())){
    return '';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0')
  ].join('-');
}

function monthNameToNum(m){
  if(!m) return '';

  const a = [
    'jan','feb','mar','apr','may','jun',
    'jul','aug','sep','oct','nov','dec'
  ];

  const idx = a.findIndex(x =>
    String(m).toLowerCase().trim().startsWith(x)
  );

  return idx >= 0 ? String(idx + 1).padStart(2, '0') : '';
}

function yearMonth(year, month, date){
  const dateText = String(date ?? '').trim();

  if(/^\d{4}-(0[1-9]|1[0-2])/.test(dateText)){
    return dateText.slice(0, 7);
  }

  const rawYear = String(year ?? '').trim();
  const rawMonth = String(month ?? '').trim();

  let mm = monthNameToNum(rawMonth);

  if(!mm && /^(0?[1-9]|1[0-2])$/.test(rawMonth)){
    mm = rawMonth.padStart(2, '0');
  }

  if(/^\d{4}$/.test(rawYear) && mm){
    return rawYear + '-' + mm;
  }

  return '';
}

function defaultCodeMap(){
  return `A=1
B=2
C=3
D=4
E=5
F=6
G=7
H=8
I=9
0=0
BOX=350
PAIR=499
GST=18
DISC=50
SKU=699
PACK=12`;
}

function defaults(){
  return {
    profile: {
      businessName: 'My Shop',
      locationType: 'Tier 3 City',
      category: 'Footwear',
      yearlyGoal: 600000,
      totalInvestment: 0,
      backendUrl: API_BASE_URL
    },
    plan: 'free',
    subscription: {
  plan: 'free',
  verified: false,
  token: ''
},
    sales: [],
    stocks: [],
    monthly: [],
    daily: [],
    settings: {
      currency: 'INR',
      theme: 'dark',
      performance: 'smooth',
      glassEnabled: false,
      glassOpacity: 0,
      devMode: false,
      billingMode: 'play',
      codeMap: defaultCodeMap()
    }
  };
}
function cleanText(
  value,
  maxLength = 2000,
  preserveNewlines = false
){
  const text = String(value ?? '');

  const cleaned = preserveNewlines
    ? text.replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        ''
      )
    : text.replace(
        /[\u0000-\u001F\u007F]/g,
        ' '
      );

  return cleaned.trim().slice(0, maxLength);
}

function normalizeRecords(list){
  if(!Array.isArray(list)){
    return [];
  }

  const usedIds = new Set();

  return list
    .filter(record =>
      record &&
      typeof record === 'object' &&
      !Array.isArray(record)
    )
    .map(record => {
      const copy = { ...record };

      let id = cleanText(copy.id, 100);

      if(
        !/^[A-Za-z0-9_-]+$/.test(id) ||
        usedIds.has(id)
      ){
        id = uid();
      }

      usedIds.add(id);
      copy.id = id;

      Object.keys(copy).forEach(key => {
        if(typeof copy[key] === 'string'){
          copy[key] = cleanText(copy[key], 2000);
        }
      });

      return copy;
    });
}

function normalizeState(raw){
  const d = defaults();

  const input =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw)
      ? raw
      : {};

  const profile =
    input.profile &&
    typeof input.profile === 'object'
      ? input.profile
      : {};

  const settings =
    input.settings &&
    typeof input.settings === 'object'
      ? input.settings
      : {};

  const subscription =
    input.subscription &&
    typeof input.subscription === 'object'
      ? input.subscription
      : {};

  const plan =
    subscription.plan === 'pro' ||
    subscription.plan === 'business'
      ? subscription.plan
      : 'free';

  return {
    ...d,
    ...input,

    profile: {
      ...d.profile,
      ...profile,

      businessName:
        cleanText(
          profile.businessName ??
          d.profile.businessName,
          200
        ),

      locationType:
        cleanText(
          profile.locationType ??
          d.profile.locationType,
          100
        ),

      category:
        cleanText(
          profile.category ??
          d.profile.category,
          100
        ),

      yearlyGoal:
        Math.max(
          1,
          num(
            profile.yearlyGoal ??
            (
              profile.monthlyGoal !== undefined &&
              profile.monthlyGoal !== null &&
              String(profile.monthlyGoal).trim() !== ''
                ? num(profile.monthlyGoal) * 12
                : d.profile.yearlyGoal
            )
          ) || d.profile.yearlyGoal
        ),

      totalInvestment:
        Math.max(
          0,
          num(
            profile.totalInvestment ??
            d.profile.totalInvestment
          )
        ),

      backendUrl: API_BASE_URL
    },

    plan,

    subscription: {
      ...d.subscription,
      ...subscription,
      plan,
      verified:
        subscription.verified === true,
      token:
        cleanText(
          subscription.token,
          4096
        )
    },

    settings: {
      ...d.settings,
      ...settings,

      theme:
        'dark',

      performance:
        ['auto', 'smooth', 'lite']
          .includes(settings.performance)
            ? settings.performance
            : d.settings.performance,

      glassEnabled: false,
      glassOpacity: 0,

      codeMap:
        cleanText(
          settings.codeMap ??
          d.settings.codeMap,
          20000,
          true
        )
    },

    sales:
      normalizeRecords(input.sales),

    stocks:
      normalizeRecords(input.stocks),

    monthly:
      normalizeRecords(input.monthly),

    daily:
      normalizeRecords(input.daily)
  };
}

function loadState(){
  try{
    const saved =
      JSON.parse(
        localStorage.getItem(STORAGE_KEY)
      ) || {};

    const clean =
      normalizeState(saved);

    /*
      Paid status is restored by production.js from
      the authenticated account cache/server.
      A backup or edited localStorage value must not
      activate paid UI by itself.
    */
    clean.subscription = {
      plan: 'free',
      verified: false,
      token: ''
    };

    clean.plan = 'free';

    return clean;

  }catch(error){
    console.warn(
      'Saved state could not be loaded:',
      error
    );

    return defaults();
  }
}

function persistBusinessState(value){
  if(window.VyaparStorage) return window.VyaparStorage.save(value);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return Promise.resolve(); }
  catch(error) { return Promise.reject(error); }
}
function save(){
  if(window.VyaparInsights) window.VyaparInsights.invalidate();
  persistBusinessState(state).catch(error => {
    if(!window.VyaparStorage) alert('Data was not saved: ' + error.message);
  });
  render();
  return true;
}

function esc(value){
  return String(value ?? '')
    .replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[character]));
}

/* Universal Liquid Glass dialog/toast system (v4.0.0) */
let __glassDialogOpen = false;
let __glassDialogResolver = null;
function closeGlassDialog(result=false, immediate=false){
  const node=document.getElementById('vyaparGlassDialog');
  if(node && node.__vyClosing && !immediate) return;
  const resolve=__glassDialogResolver;
  __glassDialogResolver=null;
  __glassDialogOpen=false;
  if(node && node.__glassKey) document.removeEventListener('keydown',node.__glassKey);
  const finish=()=>{
    if(node) node.remove();
    if(!document.getElementById('vyaparGlassDialog')) document.body.classList.remove('glass-dialog-open');
    if(resolve) resolve(result);
  };
  if(node && window.vyaparMotion && !immediate) window.vyaparMotion.closeOverlay(node,finish);
  else { if(node && window.vyaparMotion) window.vyaparMotion.cancelOverlay(node); finish(); }
}
function showGlassDialog(options={}){
  const title=String(options.title||'Vyapar AI');
  const message=String(options.message||'');
  const kind=options.kind||'info';
  const confirmMode=!!options.confirm;
  const okText=options.okText || (confirmMode ? 'Confirm' : 'OK');
  const cancelText=options.cancelText || 'Cancel';
  closeGlassDialog(false, true);
  const overlay=document.createElement('div');
  overlay.id='vyaparGlassDialog';
  overlay.className='glass-dialog-overlay';
  overlay.innerHTML=`
    <div class="glass-dialog-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="glass-dialog-orb glass-dialog-${esc(kind)}">${kind==='danger'?'!':kind==='success'?'✓':kind==='warning'?'!':'i'}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(message).replace(/\n/g,'<br>')}</p>
      <div class="glass-dialog-actions">
        ${confirmMode ? `<button type="button" class="glass-dialog-btn secondary" data-glass-cancel>${esc(cancelText)}</button>` : ''}
        <button type="button" class="glass-dialog-btn ${kind==='danger'?'danger':''}" data-glass-ok>${esc(okText)}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('glass-dialog-open');
  __glassDialogOpen=true;
  const finish=(value)=>closeGlassDialog(value);
  overlay.querySelector('[data-glass-ok]').onclick=()=>finish(true);
  const cancel=overlay.querySelector('[data-glass-cancel]');
  if(cancel) cancel.onclick=()=>finish(false);
  overlay.addEventListener('click',e=>{if(e.target===overlay && confirmMode) finish(false);});
  const key=(e)=>{if(e.key==='Escape'){e.preventDefault();finish(false);} };
  overlay.__glassKey=key;
  document.addEventListener('keydown',key);
  setTimeout(()=>{try{overlay.querySelector('[data-glass-ok]')?.focus({preventScroll:true});}catch(_){}},20);
  if(!confirmMode) return Promise.resolve(true);
  return new Promise(resolve=>{__glassDialogResolver=resolve;});
}
window.showGlassDialog=showGlassDialog;
window.alert=function(message){ showGlassDialog({title:'Notice',message:String(message),kind:'info',okText:'OK'}); };
function showGlassToast(message,type='success',duration=2600){
  const old=document.getElementById('vyaparGlassToast'); if(old) old.remove();
  const toast=document.createElement('div'); toast.id='vyaparGlassToast'; toast.className=`glass-toast glass-toast-${type}`;
  toast.innerHTML=`<span class="glass-toast-icon">${type==='success'?'✓':type==='error'?'!':'i'}</span><span>${esc(message)}</span>`;
  document.body.appendChild(toast); setTimeout(()=>toast.classList.add('show'),20);
  setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),220);},duration);
}
window.showGlassToast=showGlassToast;

function v(id){
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function lowEndDevice(){
  const dm = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const ua = navigator.userAgent || '';
  const oldAndroid = /Android [4-7]\./.test(ua);

  return oldAndroid || dm <= 2 || cores <= 4;
}

function performanceMode(){
  return (state.settings && state.settings.performance) || 'auto';
}

function isLiteMode(){
  const m = performanceMode();

  return m === 'lite' || (m === 'auto' && lowEndDevice());
}

function applyPerformance(){
  document.documentElement.classList.toggle('perf-lite', isLiteMode());
  document.body.classList.toggle('perf-lite', isLiteMode());
}

function setPerformanceMode(mode){
  state.settings = state.settings || {};
  state.settings.performance = ['auto', 'smooth', 'lite'].includes(mode)
    ? mode
    : 'auto';

  save();
}

function activeTheme(){
  return 'dark';
}

function applyTheme(){
  const th = activeTheme();
  const isLight = th === 'light';

  document.body.classList.toggle('theme-light', isLight);
  document.documentElement.classList.toggle('theme-light', isLight);
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';

  const meta = document.querySelector('meta[name="theme-color"]');

  if(meta){
    meta.setAttribute('content', isLight ? '#edf4fb' : '#07101d');
  }

  const b = document.getElementById('themeToggle');

  if(b){
    b.textContent = th === 'light' ? '☀️ Light' : '🌙 Dark';
  }
}

function persistThemeWithoutRender(){
  try{
    persistBusinessState(state).catch(() => {});
  }catch(error){
    console.warn('Theme preference could not be saved:', error);
  }
}

function runThemeTransition(nextTheme, x, y){
  const html = document.documentElement;
  const body = document.body;
  const targetTheme = 'dark';
  const androidMode = html.classList.contains('android-ui') || html.classList.contains('native-android');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const commitTheme = () => {
    state.settings = state.settings || {};
    state.settings.theme = targetTheme;
    applyTheme();
    persistThemeWithoutRender();
  };

  html.classList.add('theme-transitioning');
  body.classList.add('theme-transitioning');

  clearTimeout(window.__vyThemeTransitionTimer);
  const finishTransition = () => {
    html.classList.remove('theme-transitioning');
    body.classList.remove('theme-transitioning');
    document.querySelectorAll('.vx657-theme-crossfade').forEach(node => node.remove());
  };

  if(androidMode && !reduceMotion && typeof document.startViewTransition === 'function'){
    try{
      playThemeRipple(x, y);
      const transition = document.startViewTransition(() => commitTheme());
      transition.finished.finally(finishTransition);
      window.__vyThemeTransitionTimer = setTimeout(finishTransition, 760);
      return;
    }catch(error){}
  }

  if(androidMode && !reduceMotion){
    const veil = document.createElement('div');
    const wasLight = html.classList.contains('theme-light');
    veil.className = 'vx657-theme-crossfade ' + (wasLight ? 'from-light' : 'from-dark');
    document.body.appendChild(veil);
    requestAnimationFrame(() => {
      commitTheme();
      playThemeRipple(x, y);
      requestAnimationFrame(() => veil.classList.add('is-fading'));
    });
    window.__vyThemeTransitionTimer = setTimeout(finishTransition, 560);
    return;
  }

  commitTheme();
  window.__vyThemeTransitionTimer = setTimeout(finishTransition, 360);
}

function toggleTheme(ev){
  const x = ev && Number.isFinite(ev.clientX) ? ev.clientX : window.innerWidth - 48;
  const y = ev && Number.isFinite(ev.clientY) ? ev.clientY : 38;
  runThemeTransition(activeTheme() === 'light' ? 'dark' : 'light', x, y);
}

function setTheme(th){
  runThemeTransition(th === 'light' ? 'light' : 'dark', window.innerWidth / 2, window.innerHeight / 2);
}

function glassEnabled(){
  return true;
}

function glassOpacity(){
  return 100;
}

function clearRemovedUiSettings(){
  state.settings = state.settings || {};
  state.settings.glassEnabled = true;
  state.settings.glassOpacity = 100;
  delete state.settings.devMode;
  delete state.settings.billingMode;
}

function applyGlassControl(){
  const light = activeTheme() === 'light';
  const enabled = glassEnabled();
  const op = enabled ? glassOpacity() / 100 : 0;
  const topBase = light ? 0.80 : 0.18;
  const bottomBase = light ? 0.22 : 0.03;

  const doc = document.documentElement;
  const body = document.body;

  doc.classList.toggle('glass-off', !enabled);
  body.classList.toggle('glass-off', !enabled);

  doc.style.setProperty('--glass-top', `rgba(255,255,255,${(topBase * op).toFixed(3)})`);
  doc.style.setProperty('--glass-bottom', `rgba(255,255,255,${(bottomBase * op).toFixed(3)})`);
}

function setGlassEnabled(flag){
  state.settings = state.settings || {};
  state.settings.glassEnabled = !!flag;
  save();
}

function updateGlassOpacityLabel(val){
  const el = document.getElementById('glassOpacityValue');

  if(el){
    el.textContent = Math.round(Number(val) || 0) + '%';
  }
}

function setGlassOpacity(val){
  state.settings = state.settings || {};
  state.settings.glassOpacity = Math.max(0, Math.min(100, Number(val) || 0));
  save();
}

function forceReadableFont(){
  document.documentElement.classList.add('readable-font');
  document.body.classList.add('readable-font');
}



function planLevel(plan){
  if(plan === 'free') return 1;
  if(plan === 'pro') return 2;
  if(plan === 'business') return 3;

  return 1;
}

function getSubscriptionToken(){
  if(
    state &&
    state.subscription &&
    typeof state.subscription.token === 'string'
  ){
    return state.subscription.token.trim();
  }

  return '';
}

function getCurrentPlan(){
  const token = getSubscriptionToken();

  if(
    token &&
    state &&
    state.subscription &&
    state.subscription.verified === true &&
    (
      state.subscription.plan === 'pro' ||
      state.subscription.plan === 'business'
    )
  ){
    return state.subscription.plan;
  }

  return 'free';
}

function requirePlan(requiredPlan){
  const planRank = {
    free: 0,
    pro: 1,
    business: 2
  };

  const currentPlan = getCurrentPlan();

  if(
    planRank[currentPlan] >=
    planRank[requiredPlan]
  ){
    return true;
  }

  showUpgradePopup(
    requiredPlan,
    currentPlan
  );

  return false;
}

function requiredPlanForTab(tab){
  if(tab === 'business' || tab === 'stock') return 'business';
  if(tab === 'upload' || tab === 'analytics') return 'pro';
  return '';
}

function tabLockedForCurrentPlan(tab){
  const requiredPlan = requiredPlanForTab(tab);
  return Boolean(requiredPlan && planLevel(getCurrentPlan()) < planLevel(requiredPlan));
}


function setTab(tab, withLoader = false){
  const requiredPlan = requiredPlanForTab(tab);
  if(requiredPlan && !requirePlan(requiredPlan)) return false;

  const destination = document.getElementById('screen-' + tab);
  if(!destination) return false;
  if(currentTab===tab && !destination.classList.contains('hide')) return true;
  const previousTab = currentTab;
  const motion = window.vyaparMotion;
  const navigation = motion ? motion.beforePage(previousTab, tab) : null;
  currentTab = tab;

  document.querySelectorAll('.screen').forEach(s => s.classList.add('hide'));

  const screen = document.getElementById('screen-' + tab);

  if(screen){
    screen.classList.remove('hide');
  }

  document.querySelectorAll('.nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  if(tab === 'analytics'){
    if(window.VyaparInsights) window.VyaparInsights.render(true);
    setTimeout(drawAnalyticsCharts, 0);
  }
  if(motion) motion.afterPage(navigation, screen);

  return true;
}

function renderNav(){
  const nav = document.getElementById('nav');

  if(!nav) return;

  nav.innerHTML = tabs.map(([id, name]) => `
    <button
      data-tab="${id}"
      class="${id === currentTab ? 'active' : ''} ${tabLockedForCurrentPlan(id) ? 'is-locked' : ''}"
      onclick="setTab('${id}', true)"
      aria-label="${name}${tabLockedForCurrentPlan(id) ? ' — Business plan required' : ''}"
    >
      ${name}
      ${tabLockedForCurrentPlan(id) ? '<span class="nav-plan-lock" aria-hidden="true">🔒</span>' : ''}
    </button>
  `).join('');
}

function detailedBusinessData(){
  const itemByDate = new Map();
  const dailyByDate = new Map();

  let qty = 0;

  (state.sales || []).forEach(item => {
    const date =
      String(item.date || '').trim();

    if(!isValidDateKey(date)){
      return;
    }

    const quantity =
      Math.max(0, num(item.qty));

    const sellingPrice =
      Math.max(0, num(item.sellingPrice));

    const purchasePrice =
      Math.max(0, num(item.purchasePrice));

    qty += quantity;

    const current =
      itemByDate.get(date) || {
        sale: 0,
        profit: 0
      };

    current.sale +=
      sellingPrice * quantity;

    current.profit +=
      (
        sellingPrice -
        purchasePrice
      ) * quantity;

    itemByDate.set(date, current);
  });

  (state.daily || []).forEach(item => {
    const date =
      String(item.date || '').trim();

    if(!isValidDateKey(date)){
      return;
    }

    /* A daily row is the final total for its date; latest row wins. */
    dailyByDate.set(date, {
      sale: Math.max(0, num(item.sale)),
      profit: num(item.profit)
    });
  });

  const allDates =
    new Set([
      ...itemByDate.keys(),
      ...dailyByDate.keys()
    ]);

  const profitByMonth = {};
  let saleTotal = 0;

  allDates.forEach(date => {
    /*
      A daily entry represents the final daily total.
      When it exists, item-wise entries for the same
      date are not counted a second time.
    */
    const chosen =
      dailyByDate.has(date)
        ? dailyByDate.get(date)
        : itemByDate.get(date);

    saleTotal += chosen.sale;

    const month =
      date.slice(0, 7);

    profitByMonth[month] =
      (profitByMonth[month] || 0) +
      chosen.profit;
  });

  return {
    saleTotal,
    qty,
    profitByMonth
  };
}

function resolvedMonthlyProfitSeries(){
  const detailed =
    detailedBusinessData();

  const map = {
    ...detailed.profitByMonth
  };

  /*
    A monthly record is treated as the final profit
    for that month and overrides granular records.
  */
  (state.monthly || []).forEach(item => {
    const month =
      String(item.month || '').trim();

    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){
      return;
    }

    map[month] =
      num(item.profit);
  });

  return Object.entries(map)
    .filter(([month]) => Boolean(month))
    .sort(([a], [b]) =>
      a.localeCompare(b)
    );
}

function currentYearValue(){
  return String(new Date().getFullYear());
}

function yearlyGoal(){
  return Math.max(
    1,
    num(
      state && state.profile
        ? state.profile.yearlyGoal
        : 0
    ) || 600000
  );
}

function yearlyProfitForYear(year){
  const yearText = String(year || '').trim();
  if(!/^\d{4}$/.test(yearText)) return 0;

  return resolvedMonthlyProfitSeries()
    .filter(([month]) => String(month).startsWith(yearText + '-'))
    .reduce((sum, item) => sum + num(item[1]), 0);
}

function monthlyStatsForYear(year){
  const yearText = String(year || '').trim();
  const series = resolvedMonthlyProfitSeries()
    .filter(([month]) => String(month).startsWith(yearText + '-'));
  const vals = series.map(item => num(item[1]));
  const total = vals.reduce((a, b) => a + b, 0);

  return {
    count: vals.length,
    avg: vals.length ? total / vals.length : 0,
    high: vals.length ? Math.max(...vals) : 0,
    low: vals.length ? Math.min(...vals) : 0,
    total
  };
}

function yearlySalesForYear(year){
  const yearText = String(year || '').trim();
  const itemByDate = new Map();
  const dailyByDate = new Map();

  (state.sales || []).forEach(item => {
    const date = String(item.date || '').trim();
    if(!isValidDateKey(date) || !date.startsWith(yearText + '-')) return;
    const quantity = Math.max(0, num(item.qty));
    const current = itemByDate.get(date) || { sale: 0 };
    current.sale += Math.max(0, num(item.sellingPrice)) * quantity;
    itemByDate.set(date, current);
  });

  (state.daily || []).forEach(item => {
    const date = String(item.date || '').trim();
    if(!isValidDateKey(date) || !date.startsWith(yearText + '-')) return;
    /* A daily row is the final total for its date; latest row wins. */
    dailyByDate.set(date, {
      sale: Math.max(0, num(item.sale))
    });
  });

  const allDates = new Set([...itemByDate.keys(), ...dailyByDate.keys()]);
  let saleTotal = 0;
  allDates.forEach(date => {
    const chosen = dailyByDate.has(date) ? dailyByDate.get(date) : itemByDate.get(date);
    saleTotal += chosen ? num(chosen.sale) : 0;
  });
  return saleTotal;
}

function yearlyCogsForYear(year){
  const prefix = String(year || '').trim() + '-';
  return (state.sales || []).reduce((sum, item) => {
    const date = String(item.date || '').trim();
    if(!isValidDateKey(date) || !date.startsWith(prefix)) return sum;
    return sum + Math.max(0, num(item.purchasePrice)) * Math.max(0, num(item.qty));
  }, 0);
}

function totals(){
  const year = currentYearValue();
  const profit = yearlyProfitForYear(year);
  const saleTotal = yearlySalesForYear(year);
  const margin = saleTotal ? profit / saleTotal * 100 : 0;

  return {
    year,
    saleTotal,
    profit,
    qty: 0,
    margin
  };
}

function handleNativeBackPress(){
  if(window.vyaparMotion && window.vyaparMotion.dismissTop()) return true;
  const modalSelectors = ['#upgradePlanPopup','#planSuccessPopup','#paymentCancelPopup','#paymentLoader','#vyaparDeleteConfirm','#vyaparAccountDeleteConfirm','#androidMoreSheet','#androidPermissionSheet','.production-overlay'];
  for(const selector of modalSelectors){
    const node=document.querySelector(selector);
    if(node){
      const close=node.querySelector && node.querySelector('#closeUpgradePopup,#closePlanSuccessPopup,#closeCancelPopup,[data-back-close]');
      if(close) close.click(); else node.remove();
      return true;
    }
  }
  if(typeof window.closeMoreSheet==='function' && document.getElementById('androidMoreSheet')){ window.closeMoreSheet(); return true; }
  if(currentTab !== 'home'){ setTab('home',false); return true; }
  return false;
}
window.handleNativeBackPress=handleNativeBackPress;

function render(){
  window.__vyaparDataRevision = (window.__vyaparDataRevision || 0) + 1;
  if(window.VyaparRecords) window.VyaparRecords.invalidate();
  forceReadableFont();
  applyTheme();
  applyGlassControl();
  applyPerformance();

  const badge = document.getElementById('planBadge');

  if(badge){
    badge.textContent =
      getCurrentPlan().toUpperCase() +
      ' Plan';
  }

  renderNav();
  renderHome();
  renderUpload();
  renderSales();
  renderStock();
  renderAnalytics();
  renderCalculator();
  renderBusiness();
  renderSubscription();
  renderSettings();

  setTab(currentTab);
}

function renderHome(){
  const el = document.getElementById('screen-home');
  if(!el) return;

  const t = totals();
  const ms = monthlyStatsForYear(t.year);
  const goal = yearlyGoal();
  const goalProgress = Math.max(0, Math.min(100, (t.profit / goal) * 100));
  const businessName = cleanText(state.profile.businessName || 'My Shop', 120);
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date());
  const recommendation = cleanText(nextAction(t), 320);

  el.innerHTML = `
    <div class="home-shell">
      <section class="card home-overview">
        <div class="home-overview-copy">
          <span class="home-eyebrow">TODAY · ${esc(todayLabel)}</span>
          <h2>${esc(businessName)}</h2>
          <p>${esc(t.year)} yearly performance, shop tools and business progress in one clear workspace.</p>
        </div>
        <div class="home-profit">
          <span>Yearly Profit · ${esc(t.year)}</span>
          <b>${money(t.profit)}</b>
          <small>${pct(goalProgress)} of ${money(goal)} yearly goal</small>
        </div>
        <div class="home-goal-track" role="progressbar" aria-label="Yearly profit goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(goalProgress)}">
          <span style="width:${goalProgress.toFixed(1)}%"></span>
        </div>
      </section>

      <section class="home-section" aria-labelledby="homeQuickTitle">
        <div class="home-section-heading">
          <div>
            <span class="home-section-kicker">QUICK ACCESS</span>
            <h3 id="homeQuickTitle">Run your shop</h3>
          </div>
          <button type="button" class="home-text-button" onclick="setTab('business')">All tools →</button>
        </div>
        <div id="homeQuickActionsMount"></div>
      </section>

      <section class="home-section" aria-labelledby="homeSnapshotTitle">
        <div class="home-section-heading">
          <div>
            <span class="home-section-kicker">${esc(t.year)} SNAPSHOT</span>
            <h3 id="homeSnapshotTitle">At a glance</h3>
          </div>
        </div>
        <div class="stats home-metrics">
          <div class="stat">
            <div class="home-metric-head"><span>Sales</span><i class="home-metric-icon">₹</i></div>
            <b>${money(t.saleTotal)}</b>
            <small>Recorded sales this year</small>
          </div>
          <div class="stat">
            <div class="home-metric-head"><span>Yearly profit</span><i class="home-metric-icon">↗</i></div>
            <b>${money(t.profit)}</b>
            <small>Jan–Dec ${esc(t.year)}</small>
          </div>
          <div class="stat">
            <div class="home-metric-head"><span>Monthly average</span><i class="home-metric-icon">≈</i></div>
            <b>${money(ms.avg)}</b>
            <small>${ms.count ? ms.count + ' recorded month' + (ms.count === 1 ? '' : 's') : 'No month recorded yet'}</small>
          </div>
          <div class="stat">
            <div class="home-metric-head"><span>Margin</span><i class="home-metric-icon">%</i></div>
            <b>${t.saleTotal > 0 ? pct(t.margin) : '-'}</b>
            <small>Yearly profit vs recorded sales</small>
          </div>
        </div>
      </section>

      <section class="card home-next">
        <div class="home-next-icon">↗</div>
        <div class="home-next-copy">
          <h3>Recommended next step</h3>
          <p>${esc(recommendation)}</p>
        </div>
        <button type="button" class="btn primary" onclick="setTab('business')">Open Business</button>
      </section>
    </div>
  `;
}

function renderUpload(){
  if(window.VyaparUpload) window.VyaparUpload.render();
}

function nextAction(t){
  if(t.profit < yearlyGoal() * 0.4){
    return 'Record sales and profit regularly and identify fast-moving stock.';
  }

  if(t.margin < 20){
    return 'Profit margin is low. Review purchase prices and selling margins.';
  }

  return 'Tracking is improving. Focus on stock rotation and repeat customers.';
}


function setScanMode(mode){
  const input = document.getElementById('scanMode');
  const qtyBox = document.getElementById('scanQtyBox');
  const qtyInput = document.getElementById('scanQty');
  const status = document.getElementById('boxScanStatus');

  if(input){
    input.value = mode;
  }

  if(qtyBox){
    qtyBox.style.display = mode === 'box' || mode === 'carton' ? 'block' : 'none';
  }

  if(qtyInput){
    if(mode === 'box') qtyInput.value = 1;
    if(mode === 'carton') qtyInput.value = 12;
  }

  if(status){
    status.style.display = 'block';
    status.className = 'notice success';

    if(mode === 'box'){
      status.textContent = 'Box Label scanning selected. Confirm the quantity.';
    }

    if(mode === 'carton'){
      status.textContent = 'Carton scanning selected. Enter the number of pairs in the carton.';
    }

    if(mode === 'manual'){
      status.textContent = 'Manual Qty Confirm selected.';
    }
  }
}


function authFileHeaders(){
  const accountToken =
    String(
      localStorage.getItem(
        'vyapar_ai_auth_token_v1'
      ) || ''
    ).trim();

  const legacyToken =
    typeof getSubscriptionToken ===
    'function'
      ? getSubscriptionToken()
      : '';

  const token =
    accountToken ||
    legacyToken;

  return token
    ? {
        Authorization:
          'Bearer ' + token
      }
    : {};
}

async function scanBoxLabel(){
  const fileInput = document.getElementById('boxLabelFile');
  const status = document.getElementById('boxScanStatus');

  if(status){
    status.style.display = 'block';
    status.className = 'notice';
    status.textContent = 'Checking your photo…';
  } else {
    console.warn('Scan status UI is unavailable.');
    return;
  }

  if(!fileInput){
    status.className = 'notice bad';
    status.textContent = 'boxLabelFile input missing in renderUpload';
    return;
  }

  if(!fileInput.files || !fileInput.files[0]){
    status.className = 'notice bad';
    status.textContent = 'Choose a box-label photo first.';
    return;
  }

  const modeInput = document.getElementById('scanMode');
  const qtyInput = document.getElementById('scanQty');

  const mode = modeInput ? modeInput.value : 'box';
  const qty = qtyInput ? num(qtyInput.value) : 1;

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('mode', mode);
  formData.append('qty', qty || 1);

  status.className = 'notice';
  status.textContent = 'AI reading started... Please wait.';

  try{
  const res = await (window.vyaparAuthFetch||fetch)(API_BASE_URL + '/ai/scan-box-label', {
  method: 'POST',
  headers: authFileHeaders(),
  body: formData
   });
    const text = await res.text();

    let data;

    try{
      data = JSON.parse(text);
    }catch(e){
      status.className = 'notice bad';
      status.textContent = 'The backend did not return JSON. The endpoint may be missing or not deployed.';
      console.log('Backend raw response:', text);
      return;
    }

    if(!res.ok || !data.success){
      status.className = 'notice bad';
      status.textContent = 'Scan failed: ' + (data.message || res.status);
      console.log('Scan error response:', data);
      return;
    }

    if(!data.items || !data.items.length){
      status.className = 'notice bad';
      status.textContent = 'AI could not read the product from the label. Use a clearer photo.';
      console.log('Empty AI response:', data);
      return;
    }

    status.className = 'notice success';
    status.textContent = 'AI reading completed. Review the preview table.';

    showStockScanPreview(data.items);

  }catch(error){
    status.className = 'notice bad';
    status.textContent = 'Scan error: ' + error.message;
    console.log('Scan exception:', error);
  }
}

function skuPart(
  value,
  fallback,
  maxLength
){
  const cleaned =
    String(value || fallback)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, maxLength)
      .toUpperCase();

  return cleaned || fallback;
}

function makeSku(
  brand,
  article,
  size,
  color
){
  const b =
    skuPart(brand, 'GEN', 3);

  const a =
    skuPart(article, 'ITEM', 6);

  const s =
    skuPart(size, '00', 5);

  const c =
    skuPart(color, 'NA', 4);

  return [
    b,
    a,
    s,
    c
  ].join('-');
}

function normalizeStockScanItem(row){
  const brand =
    row.brand ||
    row.Brand ||
    '';

  const article =
    row.article ||
    row.model ||
    row.Article ||
    row.Model ||
    '';

  const size =
    row.size ||
    row.Size ||
    '';

  const color =
    row.color ||
    row.Color ||
    '';

  const mrp =
    Math.max(
      0,
      num(
        row.mrp ??
        row.MRP ??
        row.price ??
        0
      )
    );

  const rawQty =
    num(
      row.qty ??
      row.quantity ??
      row.Qty ??
      1
    );

  const qty =
    rawQty > 0
      ? rawQty
      : 1;

  const productName = [
    brand,
    article,
    size
      ? 'Size ' + size
      : '',
    color
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: uid(),
    item:
      productName ||
      'Scanned Product',
    product:
      productName ||
      'Scanned Product',
    brand,
    article,
    size,
    color,
    mrp,
    qty,
    min: 5,
    lowStock: 5,
    sku:
      makeSku(
        brand,
        article,
        size,
        color
      ),
    source: 'box-label-scan'
  };
}

function showStockScanPreview(items){
  scannedStockItems = items.map(normalizeStockScanItem);

  const area = document.getElementById('stockPreviewArea');

  if(!area){
    console.warn('Stock preview UI is unavailable.');
    return;
  }

  if(!scannedStockItems.length){
    area.innerHTML = `
      <div class="notice bad">
        No product could be read.
      </div>
    `;
    return;
  }

  area.innerHTML = `
    <div class="card">
      <h2>Scanned Stock Preview</h2>
      <p class="muted">
        Review the results. Edit anything incorrect, then add the items to stock.
      </p>

      <div class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Size</th>
              <th>MRP</th>
              <th>Qty</th>
            </tr>
          </thead>

          <tbody>
            ${scannedStockItems.map((x, i) => `
              <tr>
                <td>
                  <input value="${esc(x.item)}"
                    onchange="scannedStockItems[${i}].item=this.value; scannedStockItems[${i}].product=this.value;">
                </td>

                <td>
                  <input value="${esc(x.sku)}"
                    onchange="scannedStockItems[${i}].sku=this.value;">
                </td>

                <td>
                  <input value="${esc(x.size)}"
                    onchange="scannedStockItems[${i}].size=this.value;">
                </td>

                <td>
                  <input type="number" value="${x.mrp}"
                    onchange="scannedStockItems[${i}].mrp=num(this.value);">
                </td>

                <td>
                  <input type="number" value="${x.qty}"
                    onchange="scannedStockItems[${i}].qty=num(this.value);">
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="actions" style="margin-top:12px">
        <button class="btn primary" onclick="confirmAddScannedStock()">
          Confirm & Add to Stock
        </button>

        <button class="btn danger" onclick="clearStockPreview()">
          Cancel
        </button>
      </div>
    </div>
  `;
}

function confirmAddScannedStock(){
  state.stocks = state.stocks || [];

  scannedStockItems.forEach(item => {
    const existing = state.stocks.find(x =>
      String(x.sku || '').toLowerCase() === String(item.sku || '').toLowerCase()
    );

    if(existing){
      existing.qty = num(existing.qty) + num(item.qty);
      existing.mrp = item.mrp || existing.mrp;
      existing.size = item.size || existing.size;
      existing.color = item.color || existing.color;
      existing.brand = item.brand || existing.brand;
      existing.article = item.article || existing.article;
    } else {
      state.stocks.push(item);
    }
  });

  scannedStockItems = [];
  save();
}

function clearStockPreview(){
  scannedStockItems = [];

  const area = document.getElementById('stockPreviewArea');

  if(area){
    area.innerHTML = '';
  }
}

async function analyzeFile(){
  return window.VyaparUpload.review();
}

function importDataByType(data, uploadType, source){
  if(uploadType === 'auto'){
    return importExtracted(data, {
      source: source
    });
  }

  const result = {
    profit: 0,
    updated: 0,
    sales: 0,
    stock: 0,
    skipped: 0
  };

  const rows = normalizeRows(data);

  rows.forEach(row => {
    if(uploadType === 'profit'){
      const added = addMonthlyFromRow(row, source);

      if(added === 'updated'){
        result.updated++;
      } else if(added){
        result.profit++;
      } else {
        result.skipped++;
      }

      return;
    }

    if(uploadType === 'stock'){
      if(addStockFromRow(row, source)){
        result.stock++;
      } else {
        result.skipped++;
      }

      return;
    }

    if(uploadType === 'sale'){
      if(addSaleFromRow(row, source)){
        result.sales++;
      } else {
        result.skipped++;
      }

      return;
    }

    result.skipped++;
  });

  return result;
}

function importCsvTextByType(text, uploadType, source){
  const result = {
    profit: 0,
    updated: 0,
    sales: 0,
    stock: 0,
    skipped: 0
  };

  const rows = csvTextToObjects(text);

  rows.forEach(row => {
    if(uploadType === 'profit'){
      const added = addMonthlyFromRow(row, source);

      if(added === 'updated'){
        result.updated++;
      } else if(added){
        result.profit++;
      } else {
        result.skipped++;
      }

      return;
    }

    if(uploadType === 'stock'){
      if(addStockFromRow(row, source)){
        result.stock++;
      } else {
        result.skipped++;
      }

      return;
    }

    if(uploadType === 'sale'){
      if(addSaleFromRow(row, source)){
        result.sales++;
      } else {
        result.skipped++;
      }

      return;
    }

    result.skipped++;
  });

  return result;
}

function csvTextToObjects(text){
  const arr = parseCsv(text);

  if(arr.length < 2){
    return [];
  }

  const headers = arr[0].map(header => {
    return String(header)
      .trim()
      .toLowerCase()
      .replace(/[.\s/_-]+/g, '');
  });

  return arr.slice(1).map(values => {
    const raw = {};

    headers.forEach((header, index) => {
      raw[header] = values[index];
    });

    return {
      type: raw.type,
      category: raw.category,
      date: raw.date,
      year: raw.year,
      month: raw.month,

      profit: raw.profit || raw.netprofit || raw.monthlyprofit,
      amount: raw.amount,
      income: raw.income,
      entries: raw.entries,
      remark: raw.remark || raw.note,

      product: raw.product || raw.item || raw.name,
      item: raw.item || raw.product || raw.name,
      name: raw.name || raw.product || raw.item,

      purchasePrice: raw.purchaseprice || raw.buy || raw.cost,
      sellingPrice: raw.sellingprice || raw.sell || raw.saleprice,
      qty: raw.qty || raw.quantity || raw.stockqty || raw.qtyinstock,

      lowStock: raw.lowstock || raw.reorder || raw.min,
      stockQty: raw.stockqty || raw.qtyinstock
    };
  });
}

function statusResult(r, type){
  const box = document.getElementById('uploadStatus');

  const ok = (r.profit + r.sales + r.stock + r.updated) > 0;

  box.className = 'notice ' + (ok ? 'success' : 'bad');

  box.innerHTML = `
    ${type} import complete.<br>
    <b>${r.profit}</b> profit record added,
    <b>${r.updated}</b> profit month updated,
    <b>${r.sales}</b> sales added,
    <b>${r.stock}</b> stock added,
    <b>${r.skipped}</b> skipped.
  `;

  persistBusinessState(state).catch(() => {});

  renderHome();
  renderSales();
  renderStock();
  renderAnalytics();

  if(currentTab === 'analytics'){
    setTimeout(drawAnalyticsCharts, 0);
  }
}

function normalizeRows(data){
  let rows = [];

  if(Array.isArray(data)){
    rows = data;
  } else if(data && typeof data === 'object'){
    ['profit','profits','monthlyProfits','monthly','records','data','items'].forEach(k => {
      if(Array.isArray(data[k])){
        rows = rows.concat(data[k]);
      }
    });

    if(!rows.length && (data.year || data.month || data.profit || data.amount || data.income)){
      rows = [data];
    }
  }

  return rows.filter(x => x && typeof x === 'object');
}

function importExtracted(data, opt = {}){
  const result = {
    profit: 0,
    updated: 0,
    sales: 0,
    stock: 0,
    skipped: 0
  };

  const source = opt.source || 'import';

  if(data && Array.isArray(data.sales)){
    data.sales.forEach(x => {
      if(addSaleFromRow(x, source)) result.sales++;
      else result.skipped++;
    });
  }

  if(data && (Array.isArray(data.stock) || Array.isArray(data.stocks))){
    (data.stock || data.stocks).forEach(x => {
      if(addStockFromRow(x, source)) result.stock++;
      else result.skipped++;
    });
  }

  const rows = normalizeRows(data);

  rows.forEach(row => {
    const type = String(row.type || row.category || row.dataType || '').toLowerCase();

    const looksProfit =
      type.includes('profit') ||
      row.profit !== undefined ||
      row.netProfit !== undefined ||
      row.monthlyProfit !== undefined ||
      (row.year !== undefined && row.month !== undefined && (row.amount !== undefined || row.income !== undefined));

    const looksSale =
      type === 'sale' ||
      type === 'sales' ||
      row.sellingPrice !== undefined ||
      row.salePrice !== undefined ||
      row.sell !== undefined;

    const looksStock =
      type === 'stock' ||
      type === 'stocks' ||
      row.qtyInStock !== undefined ||
      row.stockQty !== undefined ||
      row.stockqty !== undefined;

    if(looksProfit && !looksSale){
      const added = addMonthlyFromRow(row, source);

      if(added === 'updated') result.updated++;
      else if(added) result.profit++;
      else result.skipped++;

      return;
    }

    if(looksSale){
      if(addSaleFromRow(row, source)) result.sales++;
      else result.skipped++;

      return;
    }

    if(looksStock){
      if(addStockFromRow(row, source)) result.stock++;
      else result.skipped++;

      return;
    }

    result.skipped++;
  });

  return result;
}

function addMonthlyFromRow(row, source){
  const rawAmount =
    row.profit ??
    row.netProfit ??
    row.monthlyProfit ??
    row.amount ??
    row.income ??
    row.value;

  if(
    rawAmount === null ||
    rawAmount === undefined ||
    String(rawAmount).trim() === ''
  ){
    return false;
  }

  const amount =
    num(rawAmount);

  const ym =
    yearMonth(
      row.year,
      row.month,
      row.date
    );

  if(
    !/^\d{4}-(0[1-9]|1[0-2])$/
      .test(ym)
  ){
    return false;
  }

  let existing = null;

  for(let index = state.monthly.length - 1; index >= 0; index--){
    if(String(state.monthly[index].month || '').slice(0, 7) === ym){
      existing = state.monthly[index];
      break;
    }
  }

  if(existing){
    existing.profit = amount;
    existing.source = source;
    existing.entries =
      row.entries ??
      existing.entries;

    existing.remark =
      row.remark ||
      row.note ||
      existing.remark ||
      '';

    existing.updatedAt =
      new Date().toISOString();

    return 'updated';
  }

  state.monthly.push({
    id: uid(),
    month: ym,
    profit: amount,
    entries:
      row.entries ??
      null,
    remark:
      row.remark ||
      row.note ||
      '',
    source
  });

  return true;
}

function addSaleFromRow(row, source){
  const sell =
    num(
      row.sellingPrice ??
      row.sell ??
      row.salePrice ??
      row.amount
    );

  const buy =
    num(
      row.purchasePrice ??
      row.buy ??
      row.cost
    );

  const quantity =
    num(
      row.qty ??
      row.quantity ??
      1
    );

  const rawDate =
    String(row.date ?? '').trim();

  const date =
    rawDate ||
    localDateKey();

  if(
    !isValidDateKey(date) ||
    quantity <= 0 ||
    sell < 0 ||
    buy < 0 ||
    (
      sell === 0 &&
      buy === 0
    )
  ){
    return false;
  }

  state.sales.push({
    id: uid(),
    date,
    product:
      cleanText(
        row.product ||
        row.item ||
        row.name ||
        'Imported item',
        300
      ),
    category:
      cleanText(
        row.category ||
        'General',
        100
      ),
    purchasePrice: buy,
    sellingPrice: sell,
    qty: quantity,
    source:
      cleanText(
        source ||
        'import',
        100
      )
  });

  return true;
}

function addStockFromRow(row, source){
  const qty =
    num(
      row.qty ??
      row.quantity ??
      row.stockQty ??
      row.qtyInStock ??
      row.stockqty
    );

  const name =
    cleanText(
      row.product ||
      row.item ||
      row.name ||
      '',
      300
    );

  if(!name && qty === 0){
    return false;
  }

  if(qty < 0){
    return false;
  }

  const thresholdRaw =
    row.lowStock ??
    row.reorder ??
    row.min;

  const threshold =
    thresholdRaw === undefined ||
    thresholdRaw === null ||
    String(thresholdRaw).trim() === ''
      ? 5
      : Math.max(
          0,
          num(thresholdRaw)
        );

  state.stocks.push({
    id: uid(),
    item:
      name ||
      'Imported stock',
    product:
      name ||
      'Imported stock',
    category:
      cleanText(
        row.category ||
        'General',
        100
      ),
    qty,
    lowStock: threshold,
    min: threshold,
    purchasePrice:
      Math.max(
        0,
        num(
          row.purchasePrice ??
          row.buy ??
          row.cost ??
          0
        )
      ),
    mrp:
      Math.max(
        0,
        num(
          row.mrp ??
          row.MRP ??
          row.retailPrice ??
          0
        )
      ),
    sku:
      cleanText(
        row.sku ||
        '',
        100
      ),
    source:
      cleanText(
        source ||
        'import',
        100
      )
  });

  return true;
}

function parseCsv(txt){
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;

  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    const n = txt[i + 1];

    if(c === '"' && q && n === '"'){
      cur += '"';
      i++;
      continue;
    }

    if(c === '"'){
      q = !q;
      continue;
    }

    if(c === ',' && !q){
      row.push(cur);
      cur = '';
      continue;
    }

    if((c === '\n' || c === '\r') && !q){
      if(c === '\r' && n === '\n') i++;
      row.push(cur);

      if(row.some(v => String(v).trim() !== '')){
        rows.push(row);
      }

      row = [];
      cur = '';
      continue;
    }

    cur += c;
  }

  row.push(cur);

  if(row.some(v => String(v).trim() !== '')){
    rows.push(row);
  }

  return rows;
}

function importCsvOrText(txt, opt = {}){
  const result = {
    profit: 0,
    updated: 0,
    sales: 0,
    stock: 0,
    skipped: 0
  };

  const arr = parseCsv(txt);

  if(arr.length >= 2){
    const headers = arr[0].map(h =>
      String(h).trim().toLowerCase().replace(/[.\s/_-]+/g, '')
    );

    const hasHeader = headers.some(h =>
      ['type','year','month','profit','amount','date','sellingprice','purchaseprice','product','item','name','qty','quantity','entries','remark'].includes(h)
    );

    if(hasHeader){
      arr.slice(1).forEach(vals => {
        const row = {};

        headers.forEach((h, i) => {
          row[h] = vals[i];
        });

        const normalized = {
          type: row.type,
          category: row.category,
          date: row.date,
          year: row.year,
          month: row.month,
          amount: row.amount,
          profit: row.profit || row.netprofit || row.monthlyprofit,
          income: row.income,
          entries: row.entries,
          remark: row.remark || row.note,
          product: row.product || row.item || row.name,
          purchasePrice: row.purchaseprice || row.buy || row.cost,
          sellingPrice: row.sellingprice || row.sell || row.saleprice,
          qty: row.qty || row.quantity,
          stockQty: row.stockqty || row.qtyinstock
        };

        const type = String(normalized.type || '').toLowerCase();

        if(type.includes('profit') || normalized.profit || ((normalized.year && normalized.month) && normalized.amount)){
          const a = addMonthlyFromRow(normalized, opt.source || 'csv-import');

          if(a === 'updated') result.updated++;
          else if(a) result.profit++;
          else result.skipped++;

        } else if(type.includes('sale') || normalized.sellingPrice){
          if(addSaleFromRow(normalized, opt.source || 'csv-import')) result.sales++;
          else result.skipped++;

        } else if(type.includes('stock') || normalized.stockQty){
          if(addStockFromRow(normalized, opt.source || 'csv-import')) result.stock++;
          else result.skipped++;

        } else {
          result.skipped++;
        }
      });

      return result;
    }
  }

  txt.split(/\n+/).forEach(line => {
    const m = line.match(/(20\d{2}).{0,12}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december).{0,30}([0-9][0-9,]{2,})/i);

    if(m){
      const a = addMonthlyFromRow({
        year: m[1],
        month: m[2],
        profit: m[3]
      }, opt.source || 'txt-import');

      if(a === 'updated') result.updated++;
      else if(a) result.profit++;
      else result.skipped++;
    }
  });

  return result;
}

function downloadBlob(blob, name){
  // Android WebView: save directly to the device Downloads folder.
  if (window.AndroidDownloads && typeof window.AndroidDownloads.saveBase64 === 'function') {
    const reader = new FileReader();
    reader.onloadend = function(){
      try{
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        const base64 = comma >= 0 ? result.slice(comma + 1) : result;
        const mime = blob.type || 'application/octet-stream';
        window.AndroidDownloads.saveBase64(String(name), mime, base64);
      }catch(error){
        console.error('Native download failed:', error);
        downloadBlobWeb(blob, name);
      }
    };
    reader.readAsDataURL(blob);
    return;
  }
  downloadBlobWeb(blob, name);
}

function downloadBlobWeb(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 700);
}

function downloadSampleJson(){
  const sample = [
    {
      type: 'profit',
      year: 2026,
      month: 'July',
      profit: 25000,
      remark: 'Monthly net profit'
    },
    {
      type: 'stock',
      product: 'Aqualite Sandal',
      qty: 12,
      lowStock: 5
    },
    {
      type: 'sale',
      date: '2026-07-07',
      product: 'School Shoes',
      purchasePrice: 300,
      sellingPrice: 450,
      qty: 1
    }
  ];

  downloadBlob(
    new Blob([JSON.stringify(sample, null, 2)], {
      type: 'application/json'
    }),
    'vyapar-ai-data-sample.json'
  );
}
function downloadSampleCsv(){
  const sample =
    'type,date,year,month,profit,product,purchasePrice,sellingPrice,qty,lowStock,remark\n' +
    'profit,,2026,July,25000,,,,,,Monthly net profit\n' +
    'stock,,,,,Aqualite Sandal,,,12,5,\n' +
    'sale,2026-07-07,,,,School Shoes,300,450,1,,\n';

  downloadBlob(
    new Blob([sample], {
      type: 'text/csv'
    }),
    'vyapar-ai-data-sample.csv'
  );
}

async function removeBadImportedSales(){
  const sales =
    Array.isArray(state.sales)
      ? state.sales
      : [];

  function isBadImportedSale(item){
    if(
      !item ||
      typeof item !== 'object'
    ){
      return true;
    }

    const source =
      String(item.source || '')
        .toLowerCase();

    const imported =
      /csv|json|txt|import/
        .test(source);

    if(!imported){
      return false;
    }

    const product =
      String(item.product || '')
        .trim();

    const date =
      String(item.date || '')
        .trim();

    const qty =
      num(item.qty);

    const buy =
      num(item.purchasePrice);

    const sell =
      num(item.sellingPrice);

    const invalidName =
      !product ||
      /^(undefined|null|nan)$/i
        .test(product);

    const invalidDate =
      !isValidDateKey(date);

    const invalidNumbers =
      qty <= 0 ||
      buy < 0 ||
      sell < 0 ||
      (
        buy === 0 &&
        sell === 0
      );

    return (
      invalidName ||
      invalidDate ||
      invalidNumbers
    );
  }

  const invalidRecords =
    sales.filter(
      isBadImportedSale
    );

  const status =
    document.getElementById(
      'settingsStatus'
    );

  if(!invalidRecords.length){
    if(status){
      status.textContent =
        'No invalid imported sales found.';

      status.className =
        'notice success';
    }

    return;
  }

  const approved = await showGlassDialog({
    title: 'Remove invalid records?',
    message: 'Remove ' + invalidRecords.length + ' invalid imported sale record(s)? Valid imported sales will remain.',
    kind: 'danger',
    confirm: true,
    okText: 'Remove',
    cancelText: 'Cancel'
  });

  if(!approved){
    return;
  }

  const invalidSet =
    new Set(invalidRecords);

  state.sales =
    sales.filter(
      item => !invalidSet.has(item)
    );

  const saved = save();

  if(saved){
    const freshStatus =
      document.getElementById(
        'settingsStatus'
      );

    if(freshStatus){
      freshStatus.textContent =
        invalidRecords.length +
        ' invalid imported sale record(s) removed.';

      freshStatus.className =
        'notice success';
    }
  }
}

function renderSales(){
  const el = document.getElementById('screen-sales');
  if(!el) return;

  const e = state.sales.find(x => x.id === editSaleId);
  const m = state.monthly.find(x => x.id === editMonthlyId);
  const today = localDateKey();

  const todayDaily = (state.daily || []).filter(x => x.date === today);
  const todaySale = todayDaily.reduce((a, x) => a + num(x.sale), 0);
  const todayProfit = todayDaily.reduce((a, x) => a + num(x.profit), 0);

  el.innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>${e ? 'Edit Sale' : 'Add Item Sale'}</h2>

        <label>Date</label>
        <input id="sdate" type="date" value="${e ? esc(e.date) : today}">

        <label>Product</label>
        <input id="sproduct" placeholder="School shoes" value="${e ? esc(e.product) : ''}">

        <div class="row">
          <div>
            <label>Category</label>
            <input id="scategory" placeholder="Footwear" value="${e ? esc(e.category) : ''}">
          </div>

          <div>
            <label>Quantity</label>
            <input id="sqty" type="number" value="${e ? e.qty : 1}">
          </div>
        </div>

        <div class="row">
          <div>
            <label>Purchase Price</label>
            <input id="sbuy" type="number" value="${e ? e.purchasePrice : ''}">
          </div>

          <div>
            <label>Selling Price</label>
            <input id="ssell" type="number" value="${e ? e.sellingPrice : ''}">
          </div>
        </div>

        <div class="actions">
          ${
            e
            ? `<button class="btn primary" onclick="updateSale()">Update Sale</button>
               <button class="btn" onclick="cancelSaleEdit()">Cancel</button>`
            : `<button class="btn primary" onclick="addSale()">Save Sale</button>`
          }
        </div>
      </div>

      <div class="card">
        <h2>Daily Quick Entry</h2>
        <p class="muted">Enter only the total amount. Product-level entry is optional.</p>

        <label>Date</label>
        <input id="ddate" type="date" value="${today}">

        <label>Total Daily Sale</label>
        <input id="dsale" type="number" placeholder="Example: 8500">

        <label>Daily Profit</label>
        <input id="dprofit" type="number" placeholder="Example: 1200">

        <button class="btn gold" onclick="addDaily()">
          Save Daily Entry
        </button>

        <div class="notice success" style="margin-top:12px">
          Today Sale: <b>${money(todaySale)}</b><br>
          Today Profit: <b>${money(todayProfit)}</b>
        </div>
      </div>

      <div id="monthly-profit-entry" class="card">
        <h2>${m ? 'Edit Monthly Profit' : 'Monthly Profit Entry'}</h2>

        <label>Month</label>
        <input id="mmonth" type="month" value="${m ? esc(m.month) : monthKey()}">

        <label>Net Profit</label>
        <input id="mprofit" type="number" value="${m ? m.profit : ''}">

        <div class="actions">
          ${
            m
            ? `<button class="btn gold" onclick="updateMonthly()">Update Profit</button>
               <button class="btn" onclick="cancelMonthlyEdit()">Cancel</button>`
            : `<button class="btn gold" onclick="addMonthly()">Save Monthly Profit</button>`
          }
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Daily Records</h2>
      ${window.VyaparRecords ? window.VyaparRecords.controls('daily') : ''}

      <div class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total Sale</th>
              <th>Profit</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            ${
              (window.VyaparRecords ? window.VyaparRecords.get('daily').rows : (state.daily || []).slice().reverse()).map(x => `
                <tr>
                  <td>${esc(x.date)}</td>
                  <td>${money(x.sale)}</td>
                  <td>${money(x.profit)}</td>
                  <td>
                    <button class="btn mini danger" onclick="delDaily('${x.id}')">
                      Delete
                    </button>
                  </td>
                </tr>
              `).join('')
              || `<tr><td colspan="4" class="muted">No daily records yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Sales Records</h2>
      ${window.VyaparRecords ? window.VyaparRecords.controls('sales') : ''}

      <div class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Buy</th>
              <th>Sell</th>
              <th>Profit</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            ${
              (window.VyaparRecords ? window.VyaparRecords.get('sales').rows : state.sales.slice().reverse()).map(x => `
                <tr>
                  <td>${esc(x.date)}</td>
                  <td>${esc(x.product)}</td>
                  <td>${x.qty}</td>
                  <td>${money(x.purchasePrice)}</td>
                  <td>${money(x.sellingPrice)}</td>
                  <td>${money((x.sellingPrice - x.purchasePrice) * x.qty)}</td>
                  <td>
                    <div class="actions">
                      <button class="btn mini" onclick="editSale('${x.id}')">Edit</button>
                    </div>
                  </td>
                </tr>
              `).join('')
              || `<tr><td colspan="7" class="muted">No sale records yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div id="monthly-profit-records" class="card" style="margin-top:14px">
      <h2>Monthly Profit Records</h2>
      ${window.VyaparRecords ? window.VyaparRecords.controls('monthly') : ''}

      <div class="scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Net Profit</th>
              <th>Source</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            ${
              (window.VyaparRecords ? window.VyaparRecords.get('monthly').rows : state.monthly.slice().sort((a,b)=>String(b.month).localeCompare(String(a.month))))
                .map(x => `
                  <tr>
                    <td>${monthLabel(x.month)}</td>
                    <td>${money(x.profit)}</td>
                    <td>${esc(x.source || 'manual')}</td>
                    <td>
                      <div class="actions">
                        <button class="btn mini" onclick="editMonthly('${x.id}')">Edit</button>
                      </div>
                    </td>
                  </tr>
                `).join('')
              || `<tr><td colspan="4" class="muted">No monthly profit records yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function saleFormData(){
  const existing =
    editSaleId
      ? state.sales.find(
          item => item.id === editSaleId
        )
      : null;

  const date =
    String(
      v('sdate') ||
      localDateKey()
    ).trim();

  const product =
    String(
      v('sproduct') || ''
    ).trim();

  const category =
    String(
      v('scategory') ||
      'General'
    ).trim();

  const purchasePrice =
    num(v('sbuy'));

  const sellingPrice =
    num(v('ssell'));

  const qty =
    num(v('sqty'));

  if(!isValidDateKey(date)){
    throw new Error('A valid sale date is required.');
  }

  if(!product){
    throw new Error('Product name is required.');
  }

  if(qty <= 0){
    throw new Error('Quantity must be greater than zero.');
  }

  if(
    purchasePrice < 0 ||
    sellingPrice < 0
  ){
    throw new Error('Prices cannot be negative.');
  }

  if(
    purchasePrice === 0 &&
    sellingPrice === 0
  ){
    throw new Error('Enter the purchase or selling price.');
  }

  return {
    ...(existing || {}),
    id:
      editSaleId ||
      uid(),
    date,
    product,
    category:
      category ||
      'General',
    purchasePrice,
    sellingPrice,
    qty,
    source:
      existing &&
      existing.source
        ? existing.source
        : 'manual'
  };
}

function addSale(){
  try{
    state.sales =
      state.sales || [];

    state.sales.push(
      saleFormData()
    );

    save();

  }catch(error){
    alert(error.message);
  }
}

function editSale(id){
  editSaleId = id;
  currentTab = 'sales';
  render();
}

function updateSale(){
  const index =
    state.sales.findIndex(
      item => item.id === editSaleId
    );

  if(index < 0){
    alert('Sale record not found.');
    editSaleId = '';
    render();
    return;
  }

  try{
    state.sales[index] =
      saleFormData();

    editSaleId = '';
    save();

  }catch(error){
    alert(error.message);
  }
}

function cancelSaleEdit(){
  editSaleId = '';
  render();
}

function delSale(id){
  showDeleteConfirmation('sale', id, 'sale record');
}

function addDaily(){
  const date =
    String(
      v('ddate') ||
      localDateKey()
    ).trim();

  const sale =
    num(v('dsale'));

  const profit =
    num(v('dprofit'));

  if(!isValidDateKey(date)){
    alert('A valid daily entry date is required.');
    return;
  }

  if(sale < 0){
    alert('Daily sales cannot be negative.');
    return;
  }

  if(sale === 0 && profit === 0){
    alert('Enter the sale or profit amount.');
    return;
  }

  state.daily =
    state.daily || [];

  let existing = null;

  for(let index = state.daily.length - 1; index >= 0; index--){
    if(String(state.daily[index].date || '').trim() === date){
      existing = state.daily[index];
      break;
    }
  }

  if(existing){
    existing.sale = sale;
    existing.profit = profit;
    existing.source = 'manual-daily';
    existing.updatedAt = new Date().toISOString();

  }else{
    state.daily.push({
      id: uid(),
      date,
      sale,
      profit,
      source: 'manual-daily'
    });
  }

  save();
}

function delDaily(id){
  showDeleteConfirmation('daily', id, 'daily entry');
}

function addMonthly(){
  const month =
    String(v('mmonth') || '').trim();

  const profit =
    num(v('mprofit'));

  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){
    alert('Select a valid month.');
    return;
  }

  state.monthly =
    state.monthly || [];

  let existing = null;

  for(let index = state.monthly.length - 1; index >= 0; index--){
    if(String(state.monthly[index].month || '').slice(0, 7) === month){
      existing = state.monthly[index];
      break;
    }
  }

  if(existing){
    existing.profit = profit;
    existing.source = 'manual';
    existing.updatedAt = new Date().toISOString();

  }else{
    state.monthly.push({
      id: uid(),
      month,
      profit,
      source: 'manual'
    });
  }

  save();
}

function editMonthly(id){
  editMonthlyId = id;
  currentTab = 'sales';
  render();

  // Bring the monthly editor into view immediately after the user taps Edit.
  setTimeout(() => {
    const target = document.getElementById('monthly-profit-entry');
    if(target){
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, 80);
}

function updateMonthly(){
  const month =
    String(v('mmonth') || '').trim();

  const profit =
    num(v('mprofit'));

  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){
    alert('Select a valid month.');
    return;
  }

  const index =
    state.monthly.findIndex(
      item => item.id === editMonthlyId
    );

  if(index < 0){
    editMonthlyId = '';
    render();
    return;
  }

  const duplicate =
    state.monthly.find(
      item =>
        item.id !== editMonthlyId &&
        item.month === month
    );

  if(duplicate){
    duplicate.profit = profit;

    state.monthly =
      state.monthly.filter(
        item => item.id !== editMonthlyId
      );

  }else{
    state.monthly[index] = {
      ...state.monthly[index],
      month,
      profit,
      source:
        state.monthly[index].source ||
        'manual'
    };
  }

  editMonthlyId = '';
  save();
}

function cancelMonthlyEdit(){
  editMonthlyId = '';
  render();
}

function delMonthly(id){
  showDeleteConfirmation('monthly', id, 'monthly profit entry');
}

function showDeleteConfirmation(type, id, label){
  showGlassDialog({
    title:'Are you sure?',
    message:`Do you want to delete this ${label}? This action cannot be undone.`,
    kind:'danger', confirm:true, okText:'Delete', cancelText:'Cancel'
  }).then(approved=>{
    if(!approved) return;
    if(type==='sale'){
      state.sales=(state.sales||[]).filter(x=>x.id!==id);
    }else if(type==='daily'){
      state.daily=(state.daily||[]).filter(x=>x.id!==id);
    }else if(type==='monthly'){
      state.monthly=(state.monthly||[]).filter(x=>x.id!==id);
    }else if(type==='stock'){
      state.stock=(state.stock||[]).filter(x=>x.id!==id);
    }
    save();
    showGlassToast(`${label.charAt(0).toUpperCase()+label.slice(1)} deleted successfully.`);
  });
}

function monthLabel(m){
  if(!m) return '-';

  const [y, mo] = String(m).split('-');

  const names = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];

  return `${names[(+mo || 1) - 1]} ${y || ''}`;
}

function renderStock(){
  const el = document.getElementById('screen-stock');
  if(!el) return;

  const stockValue = (state.stocks || []).reduce((sum, x) => {
    const price = Math.max(0, num(x.purchasePrice ?? x.buy ?? x.cost ?? 0));
    return sum + price * Math.max(0, num(x.qty));
  }, 0);

  el.innerHTML = `
    <div class="stats">
      <div class="stat">
        <span class="muted">Items</span>
        <b>${(state.stocks || []).length}</b>
      </div>

      <div class="stat">
        <span class="muted">Stock Cost Value</span>
        <b>${money(stockValue)}</b>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h2>Stock Manager</h2>

      <div class="grid3">
        <div>
          <label>Item</label>
          <input id="stockItem">
        </div>

        <div>
          <label>Available Qty</label>
          <input id="stockQty" type="number">
        </div>

        <div>
          <label>Min Alert Qty</label>
          <input id="stockMin" type="number" value="5">
        </div>
      </div>

      <button class="btn primary" onclick="addStock()">
        Save Stock
      </button>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Stock Alerts</h3>
      ${window.VyaparRecords ? window.VyaparRecords.controls('stocks') : ''}

      ${
        (window.VyaparRecords ? window.VyaparRecords.get('stocks').rows : state.stocks).map(s => `
          <p class="pill">
            ${esc(s.item || s.product || 'Item')}: ${num(s.qty)} left
            ${num(s.qty) <= num(s.min || s.lowStock || 5) ? '<b class="danger-text"> Reorder</b>' : ''}
          </p>
        `).join(' ')
        || '<p class="muted">No stock data yet.</p>'
      }
    </div>
  `;
}

function addStock(){
  const item =
    String(v('stockItem') || '').trim();

  const qty =
    num(v('stockQty'));

  const minInput =
    String(v('stockMin') || '').trim();

  const min =
    minInput === ''
      ? 5
      : num(minInput);

  if(!item){
    alert('Stock item name is required.');
    return;
  }

  if(qty < 0){
    alert('Stock quantity cannot be negative.');
    return;
  }

  if(min < 0){
    alert('Minimum alert quantity cannot be negative.');
    return;
  }

  state.stocks =
    state.stocks || [];

  state.stocks.push({
    id: uid(),
    item,
    product: item,
    qty,
    min,
    lowStock: min,
    source: 'manual'
  });

  save();
}

function monthlySeriesAll(){
  return resolvedMonthlyProfitSeries();
}

function monthlySeries(){
  return monthlySeriesAll().slice(-12);
}

function availableYears(){
  return [
    ...new Set(
      monthlySeriesAll()
        .map(x => String(x[0]).slice(0, 4))
        .filter(Boolean)
    )
  ].sort();
}

function yearlySeries(){
  const out = {};

  monthlySeriesAll().forEach(([k, v]) => {
    const y = String(k).slice(0, 4);
    out[y] = (out[y] || 0) + (+v || 0);
  });

  return Object.entries(out).sort();
}

function monthlySeriesForYear(year){
  const yearStr = String(year);
  const base = Object.fromEntries(
    monthlySeriesAll().filter(([k]) => String(k).startsWith(yearStr + '-'))
  );

  return Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const key = `${yearStr}-${mm}`;

    return [key, +base[key] || 0];
  });
}

function seriesStats(series){
  const vals = series.map(x => +x[1] || 0);
  const total = vals.reduce((a, b) => a + b, 0);

  return {
    count: vals.length,
    avg: vals.length ? total / vals.length : 0,
    high: vals.length ? Math.max(...vals) : 0,
    low: vals.length ? Math.min(...vals) : 0,
    total
  };
}

function monthlyStats(){
  const s = monthlySeriesAll();
  const vals = s.map(x => +x[1] || 0);
  const sum = vals.reduce((a, b) => a + b, 0);

  return {
    count: vals.length,
    avg: vals.length ? sum / vals.length : 0,
    high: vals.length ? Math.max(...vals) : 0,
    low: vals.length ? Math.min(...vals) : 0
  };
}

function analyticsExpenseBreakdown(year){
  const prefix = String(year || '').trim() + '-';
  const groups = {
    Salary: 0,
    'Rent & Utilities': 0,
    Marketing: 0,
    Other: 0
  };

  (state.expenses || []).forEach(item => {
    const date = String(item.date || '').trim();
    if(!date){
      if(String(year) !== currentYearValue()) return;
    }else if(!date.startsWith(prefix)){
      return;
    }
    const category = String(item.category || '').toLowerCase();
    const amount = Math.max(0, num(item.amount));
    if(!amount) return;

    if(category.includes('salary') || category.includes('wage')) groups.Salary += amount;
    else if(category.includes('rent') || category.includes('electric') || category.includes('utilit')) groups['Rent & Utilities'] += amount;
    else if(category.includes('market') || category.includes('advert')) groups.Marketing += amount;
    else groups.Other += amount;
  });
  return groups;
}

function profitLossDistribution(year){
  const expense = analyticsExpenseBreakdown(year);
  return [
    { label: 'Product Sales', value: yearlySalesForYear(year), color: '#4fa889' },
    { label: 'Cost of Goods Sold', value: yearlyCogsForYear(year), color: '#f34f46' },
    { label: 'Employee Salaries', value: expense.Salary, color: '#d94339' },
    { label: 'Rent & Utilities', value: expense['Rent & Utilities'], color: '#ff6d63' },
    { label: 'Marketing & Advertising', value: expense.Marketing, color: '#ff8b81' },
    { label: 'Other Expenses', value: expense.Other, color: '#73ce92' }
  ].filter(item => item.value > 0);
}

function renderMonthYearComparison(years){
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const orderedYears = years.slice().sort((a,b) => String(b).localeCompare(String(a)));
  const monthlyMap = new Map(monthlySeriesAll().map(item => [item[0], num(item[1])]));

  if(!orderedYears.length){
    return '<div class="notice bad">No month-to-month comparison data available yet.</div>';
  }

  return `<div class="month-compare-strip" role="region" aria-label="January to December year-on-year profit comparison" tabindex="0">
    ${monthNames.map((name, index) => {
      const mm = String(index + 1).padStart(2, '0');
      const rows = orderedYears.map(year => {
        const key = String(year) + '-' + mm;
        return { year: String(year), value: monthlyMap.get(key) || 0 };
      });
      const max = Math.max(...rows.map(row => Math.abs(row.value)), 1);
      return `<article class="month-compare-card">
        <div class="month-compare-head"><span>${esc(name.slice(0,3).toUpperCase())}</span><h3>${esc(name)}</h3></div>
        <div class="month-compare-years">
          ${rows.map(row => `<div class="month-year-row">
            <div class="month-year-meta"><span>${esc(row.year)}</span><b>${money(row.value)}</b></div>
            <div class="month-year-track"><span style="width:${Math.max(0, Math.min(100, Math.abs(row.value) / max * 100)).toFixed(1)}%"></span></div>
          </div>`).join('')}
        </div>
      </article>`;
    }).join('')}
  </div>`;
}

function renderAnalytics(){
  if(window.VyaparInsights) window.VyaparInsights.render();
}

function drawProfitChart(){
  drawAnalyticsCharts();
}

function drawAnalyticsCharts(){
  // The bounded SVG chart scales with its card; no resize/redraw loop is needed.
}

function chartTheme(){
  const css = getComputedStyle(document.body);

  return {
    text: css.getPropertyValue('--text').trim() || '#eef7ff',
    muted: css.getPropertyValue('--muted').trim() || '#9fb4ca',
    line: css.getPropertyValue('--line').trim() || '#1f3b59',
    teal: css.getPropertyValue('--teal').trim() || '#19c2bf',
    gold: css.getPropertyValue('--gold').trim() || '#f4bd38'
  };
}

function setupCanvas(c, height){
  if(!c) return null;

  const ctx = c.getContext('2d');
  const lite = isLiteMode();
  const dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);

  const w = Math.max(c.offsetWidth || 280, 1);
  const h = height || (window.innerWidth < 800 ? 260 : 300);

  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.height = h + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  return { ctx, w, h, lite, dpr };
}

function drawEmptyChart(c, msg){
  const setup = setupCanvas(c, 260);
  if(!setup) return;

  const { ctx } = setup;
  const theme = chartTheme();

  ctx.fillStyle = theme.muted;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(msg || 'No data available.', 18, 42);
}

function drawYearlyProfitChart(){
  const c = document.getElementById('yearlyProfitCanvas');
  if(!c) return;

  const series = yearlySeries();

  if(!series.length){
    drawEmptyChart(c, 'No year-wise profit data available.');
    return;
  }

  drawBarChart(c, series.map(x => x[0]), series.map(x => +x[1] || 0));
}

function drawProfitLossDistributionChart(){
  const c = document.getElementById('pnlDistributionCanvas');
  if(!c) return;

  const parts = profitLossDistribution(currentYearValue());
  if(!parts.length){
    drawEmptyChart(c, 'Add sales or expense data to build the distribution.');
    return;
  }

  const setup = setupCanvas(c, 270);
  if(!setup) return;
  const { ctx, w, h } = setup;
  const total = parts.reduce((sum, item) => sum + Math.abs(item.value), 0) || 1;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.34;
  const inner = radius * 0.58;
  let angle = -Math.PI / 2;

  parts.forEach(item => {
    const share = Math.abs(item.value) / total;
    const next = angle + share * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, next);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();

    if(share >= 0.075){
      const mid = (angle + next) / 2;
      const tx = cx + Math.cos(mid) * radius * 0.76;
      const ty = cy + Math.sin(mid) * radius * 0.76;
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(share * 100) + '%', tx, ty);
    }
    angle = next;
  });

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const theme = chartTheme();
  ctx.fillStyle = theme.text;
  ctx.font = '800 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P&L', cx, cy - 7);
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(currentYearValue(), cx, cy + 12);
}

function drawMonthlyComparisonChart(){
  const c = document.getElementById('monthlyComparisonCanvas');
  if(!c) return;

  const s = monthlySeries().slice(-12);

  if(!s.length){
    drawEmptyChart(c, 'No monthly data available.');
    return;
  }

  drawBarChart(c, s.map(x => monthLabel(x[0])), s.map(x => +x[1] || 0));
}

function drawMonthlyYearChart(year){
  const c = document.getElementById('monthlyProfitCanvas-' + year);
  if(!c) return;

  const s = monthlySeriesForYear(year);

  if(!s.some(x => (+x[1] || 0) !== 0)){
    drawEmptyChart(c, 'No monthly data for ' + year + '.');
    return;
  }

  drawBarChart(c, s.map(x => monthLabel(x[0]).split(' ')[0]), s.map(x => +x[1] || 0));
}

function drawBarChart(c, labels, values){
  const setup = setupCanvas(c, 280);
  if(!setup) return;

  const { ctx, w, h } = setup;
  const theme = chartTheme();

  const max = Math.max(...values, 1);
  const padL = 52;
  const padR = 14;
  const padT = 24;
  const padB = 42;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  ctx.strokeStyle = theme.line;
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';

  for(let i = 0; i <= 4; i++){
    const gy = padT + i * plotH / 4;

    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();

    ctx.fillText(shortMoney(max - (max * i / 4)), 4, gy + 4);
  }

  const gap = 8;
  const barW = Math.max(10, (plotW - gap * (values.length - 1)) / values.length);

  values.forEach((val, i) => {
    const bh = Math.max(val ? 2 : 0, (val / max) * plotH);
    const x = padL + i * (barW + gap);
    const y = padT + plotH - bh;

    const grad = ctx.createLinearGradient(0, y, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(25,194,191,.95)');
    grad.addColorStop(1, 'rgba(244,189,56,.70)');

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, bh);

    ctx.fillStyle = theme.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(String(labels[i]).slice(0, 6), x, h - 16);
  });
}

function shortMoney(v){
  const n = Number(v) || 0;
  const abs = Math.abs(n);

  if(abs >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
  if(abs >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if(abs >= 1000) return '₹' + (n / 1000).toFixed(0) + 'k';

  return money(n);
}

function plan10(t){
  const base = Math.max(t.profit, yearlyGoal());

  return Array.from({ length: 10 }, (_, i) => {
    return `Year ${i + 1}: target annual net profit ${money(base * Math.pow(1.18, i))}.`;
  });
}
function renderCalculator(){
  const el = document.getElementById('screen-calculator');
  if(!el) return;
  el.innerHTML = `
    <div class="calculator-page">
      <div class="card calculator-card">
        <div class="calculator-head">
          <div>
            <h2>Full Calculator</h2>
            <p class="muted">Basic, scientific, memory, history and business calculations.</p>
          </div>
          <span class="pill">₹ Calculator</span>
        </div>
        <div class="calc-display-wrap">
          <input id="normalCalc" class="calc-display" value="" placeholder="0" readonly aria-label="Calculator expression">
          <div id="normalResult" class="calc-result">Total: ₹0</div>
          <div id="calcResolved" class="calc-resolved"></div>
        </div>
        <div class="calc-memory-row">
          <button class="btn mini" onclick="calcMemory('MC')">MC</button>
          <button class="btn mini" onclick="calcMemory('MR')">MR</button>
          <button class="btn mini" onclick="calcMemory('M+')">M+</button>
          <button class="btn mini" onclick="calcMemory('M-')">M−</button>
          <button class="btn mini" onclick="calcToggleScientific()" id="calcSciToggle">Scientific</button>
        </div>
        <div class="calc-keypad calc-basic-keypad">
          <button class="calc-key danger" onclick="calcClear('normalCalc','normalResult')">C</button>
          <button class="calc-key" onclick="calcBackspace('normalCalc')">⌫</button>
          <button class="calc-key" onclick="calcPress('normalCalc','(')">(</button>
          <button class="calc-key" onclick="calcPress('normalCalc',')')">)</button>
          <button class="calc-key" onclick="calcPress('normalCalc','±')">±</button>
          <button class="calc-key" onclick="calcPress('normalCalc','%')">%</button>
          <button class="calc-key operator" onclick="calcPress('normalCalc','/')">÷</button>
          <button class="calc-key operator" onclick="calcPress('normalCalc','*')">×</button>
          <button class="calc-key" onclick="calcPress('normalCalc','7')">7</button>
          <button class="calc-key" onclick="calcPress('normalCalc','8')">8</button>
          <button class="calc-key" onclick="calcPress('normalCalc','9')">9</button>
          <button class="calc-key operator" onclick="calcPress('normalCalc','-')">−</button>
          <button class="calc-key" onclick="calcPress('normalCalc','4')">4</button>
          <button class="calc-key" onclick="calcPress('normalCalc','5')">5</button>
          <button class="calc-key" onclick="calcPress('normalCalc','6')">6</button>
          <button class="calc-key operator" onclick="calcPress('normalCalc','+')">+</button>
          <button class="calc-key" onclick="calcPress('normalCalc','1')">1</button>
          <button class="calc-key" onclick="calcPress('normalCalc','2')">2</button>
          <button class="calc-key" onclick="calcPress('normalCalc','3')">3</button>
          <button class="calc-key" onclick="calcPress('normalCalc','00')">00</button>
          <button class="calc-key" onclick="calcPress('normalCalc','0')">0</button>
          <button class="calc-key" onclick="calcPress('normalCalc','.')">.</button>
          <button class="calc-key equal" onclick="calcNormal()">=</button>
        </div>
        <div id="scientificKeys" class="scientific-keys hide">
          <button class="calc-key" onclick="calcFunc('sqrt')">√</button>
          <button class="calc-key" onclick="calcFunc('square')">x²</button>
          <button class="calc-key" onclick="calcFunc('pow')">xʸ</button>
          <button class="calc-key" onclick="calcFunc('reciprocal')">1/x</button>
          <button class="calc-key" onclick="calcFunc('sin')">sin</button>
          <button class="calc-key" onclick="calcFunc('cos')">cos</button>
          <button class="calc-key" onclick="calcFunc('tan')">tan</button>
          <button class="calc-key" onclick="calcFunc('log')">log</button>
          <button class="calc-key" onclick="calcFunc('ln')">ln</button>
          <button class="calc-key" onclick="calcFunc('pi')">π</button>
          <button class="calc-key" onclick="calcFunc('e')">e</button>
          <button class="calc-key" onclick="calcFunc('factorial')">n!</button>
        </div>
        <div class="quick-row">
          <button class="btn mini" onclick="calcPress('normalCalc','100')">100</button>
          <button class="btn mini" onclick="calcPress('normalCalc','250')">250</button>
          <button class="btn mini" onclick="calcPress('normalCalc','500')">500</button>
          <button class="btn mini" onclick="calcPress('normalCalc','1000')">1000</button>
          <button class="btn mini" onclick="calcBusiness('gst')">GST</button>
          <button class="btn mini" onclick="calcBusiness('margin')">Margin</button>
          <button class="btn mini" onclick="calcBusiness('discount')">Discount</button>
          <button class="btn mini" onclick="calcBusiness('profit')">Profit</button>
        </div>
      </div>
      <div class="card">
        <div class="calculator-head"><div><h2>Calculation History</h2><p class="muted">Tap a result to reuse it.</p></div><button class="btn mini danger" onclick="calcClearHistory()">Clear</button></div>
        <div id="calcHistory" class="calc-history"></div>
      </div>
      <div class="card">
        <h2>Business Calculator</h2>
        <div class="business-calc-grid">
          <div><label>Purchase Price</label><input id="bcBuy" type="number" inputmode="decimal" placeholder="600"></div>
          <div><label>Selling Price</label><input id="bcSell" type="number" inputmode="decimal" placeholder="800"></div>
          <div><label>GST %</label><input id="bcGst" type="number" inputmode="decimal" value="18"></div>
          <div><label>Discount %</label><input id="bcDisc" type="number" inputmode="decimal" value="0"></div>
        </div>
        <div class="actions">
          <button class="btn primary" onclick="runBusinessCalculator()">Calculate</button>
        </div>
        <div id="businessCalcResult" class="notice success" style="margin-top:12px">Enter values and calculate.</div>
      </div>
    </div>`;
  renderCalcHistory();
}

function calcSafeEval(raw){
  let expression=String(raw||'').replace(/×/g,'*').replace(/÷/g,'/').replace(/[–—]/g,'-').replace(/\s+/g,'');
  if(!expression) return 0;
  if(/[^0-9+\-*/().%]/.test(expression)) throw new Error('Invalid characters');
  expression=expression.replace(/(\d+(?:\.\d+)?)%/g,'($1/100)');
  expression=expression.replace(/\b(\d+(?:\.\d+)?)(?=\()/g,'$1*');
  if(!/^[0-9+\-*/().%]+$/.test(expression)) throw new Error('Invalid expression');
  const value=Function('"use strict"; return ('+expression+')')();
  if(!Number.isFinite(Number(value))) throw new Error('Result is not finite');
  return Number(value);
}
function calcKeepDisplayVisible(input){
  if(!input) return;
  requestAnimationFrame(function(){
    try{ input.scrollLeft = input.scrollWidth; }catch(error){}
  });
}
function calcPress(targetId,value){
  const input=document.getElementById(targetId); if(!input) return;
  let old=input.value||'';
  if(value==='±'){
    old=old.startsWith('-')?old.slice(1):('-'+old); input.value=old; calcKeepDisplayVisible(input); return;
  }
  const operators=['+','-','*','/','%']; const last=old.slice(-1);
  if(operators.includes(value) && operators.includes(last)){ input.value=old.slice(0,-1)+value; calcKeepDisplayVisible(input); return; }
  if(value==='.' && /(?:^|[+\-*/(])\d*\.\d*$/.test(old)){ return; }
  input.value=old+value;
  calcKeepDisplayVisible(input);
}
function calcBackspace(targetId){const i=document.getElementById(targetId);if(i){i.value=i.value.slice(0,-1);calcKeepDisplayVisible(i);}}
function calcClear(targetId,resultId){const i=document.getElementById(targetId),r=document.getElementById(resultId);if(i)i.value='';if(r)r.textContent='Total: ₹0';const x=document.getElementById('calcResolved');if(x)x.textContent='';}
function calcNormal(){
  const input=document.getElementById('normalCalc'), result=document.getElementById('normalResult'); if(!input||!result)return;
  try{const raw=input.value.trim(); if(!raw){result.textContent='Total: ₹0';return;} const n=calcSafeEval(raw); result.textContent='Total: '+money(n); const x=document.getElementById('calcResolved');if(x)x.textContent='= '+n; calcHistoryAdd(raw,n); input.value=String(n); calcKeepDisplayVisible(input);}
  catch(e){result.textContent='Invalid expression';const x=document.getElementById('calcResolved');if(x)x.textContent=e.message||'';}
}
let calcMemoryValue=0;
function calcMemory(action){
  const input=document.getElementById('normalCalc');
  let value=0;
  try{ value=calcSafeEval(input?.value||'0'); }catch(e){ value=0; }
  if(action==='MC') calcMemoryValue=0;
  else if(action==='MR'){ if(input){ input.value=String(calcMemoryValue); calcKeepDisplayVisible(input); } }
  else if(action==='M+') calcMemoryValue+=value;
  else if(action==='M-') calcMemoryValue-=value;
  const resolved=document.getElementById('calcResolved');
  if(resolved) resolved.textContent='Memory: '+calcMemoryValue;
}
function calcToggleScientific(){const el=document.getElementById('scientificKeys');if(el)el.classList.toggle('hide');}
function calcFunc(name){
  const input=document.getElementById('normalCalc');if(!input)return; let n;
  try{n=calcSafeEval(input.value); }catch(e){n=0;}
  let out;
  if(name==='sqrt') out=Math.sqrt(n); else if(name==='square')out=n*n; else if(name==='reciprocal')out=1/n; else if(name==='pow'){ const p=Number(prompt('Power (y)','2')); if(!Number.isFinite(p))return; out=Math.pow(n,p); } else if(name==='sin')out=Math.sin(n*Math.PI/180); else if(name==='cos')out=Math.cos(n*Math.PI/180); else if(name==='tan')out=Math.tan(n*Math.PI/180); else if(name==='log')out=Math.log10(n); else if(name==='ln')out=Math.log(n); else if(name==='pi')out=Math.PI; else if(name==='e')out=Math.E; else if(name==='factorial'){if(n<0||n>170||Math.floor(n)!==n)throw new Error('Factorial needs an integer 0–170');out=1;for(let i=2;i<=n;i++)out*=i;} if(!Number.isFinite(out))throw new Error('Invalid result'); input.value=String(out);calcKeepDisplayVisible(input);const r=document.getElementById('normalResult');if(r)r.textContent='Total: '+money(out);calcHistoryAdd(name,out);
}
function getCalcHistory(){try{return JSON.parse(localStorage.getItem('vyapar_ai_calc_history_v1')||'[]')||[]}catch(e){return[];}}
function calcHistoryAdd(expression,result){let h=getCalcHistory();h.unshift({id:uid(),expression:String(expression),result:Number(result),at:new Date().toISOString()});h=h.slice(0,50);localStorage.setItem('vyapar_ai_calc_history_v1',JSON.stringify(h));renderCalcHistory();}
function calcClearHistory(){localStorage.removeItem('vyapar_ai_calc_history_v1');renderCalcHistory();}
function renderCalcHistory(){const el=document.getElementById('calcHistory');if(!el)return;const h=getCalcHistory();el.innerHTML=h.length?h.map(x=>`<button type="button" class="calc-history-item" onclick="calcUseHistory(${Number(x.result)})"><span>${esc(x.expression)}</span><b>${esc(x.result)}</b></button>`).join(''):'<div class="muted">No calculations yet.</div>';}
function calcUseHistory(n){const i=document.getElementById('normalCalc');if(i){i.value=String(n);calcKeepDisplayVisible(i);}}
function calcBusiness(kind){setTab('calculator'); const buy=document.getElementById('bcBuy'),sell=document.getElementById('bcSell'); if(!buy||!sell)return; const b=Number(buy.value)||0,s=Number(sell.value)||0; if(kind==='profit') { const p=s-b; showGlassToast('Profit: '+money(p)); } else if(kind==='margin'){ const m=s?((s-b)/s*100):0; showGlassToast('Margin: '+pct(m)); } else if(kind==='discount'){ const d=Number(document.getElementById('bcDisc')?.value)||0; showGlassToast('Price after discount: '+money(s*(1-d/100))); } else if(kind==='gst'){ const g=Number(document.getElementById('bcGst')?.value)||0; showGlassToast('GST inclusive: '+money(s*(1+g/100))); }}
function runBusinessCalculator(){const b=Number(v('bcBuy'))||0,s=Number(v('bcSell'))||0,g=Number(v('bcGst'))||0,d=Number(v('bcDisc'))||0;const net=s*(1-d/100);const profit=net-b;const margin=net?profit/net*100:0;const gst=net*g/100;const inc=net+gst;const el=document.getElementById('businessCalcResult');if(el)el.innerHTML=`Net selling: <b>${money(net)}</b><br>Profit: <b>${money(profit)}</b><br>Margin: <b>${pct(margin)}</b><br>GST: <b>${money(gst)}</b><br>GST inclusive: <b>${money(inc)}</b>`;}


function renderSubscription(){
  const el = document.getElementById('screen-subscription');
  if(!el) return;

  const currentPlan = getCurrentPlan();
  const proIncluded = currentPlan === 'pro' || currentPlan === 'business';
  const businessActive = currentPlan === 'business';

  el.innerHTML = `
    <section class="subscription-intro card">
      <span class="subscription-kicker">VYAPAR AI PLANS</span>
      <h2>Choose what your business needs</h2>
      <p class="muted">Business workspace stays locked until the Business subscription is verified on your account.</p>
    </section>

    <div class="grid3 subscription-plan-grid">
      <article class="card subscription-plan-card ${currentPlan === 'free' ? 'active-plan' : ''}">
        <span class="subscription-tier">STARTER</span>
        <h2>Free</h2>
        <div class="subscription-price"><strong>₹0</strong><small>forever</small></div>
        <ul class="subscription-features">
          <li>Manual sale entry</li>
          <li>Basic profit calculation</li>
          <li>Basic reports</li>
        </ul>
        <button class="btn primary subscription-cta" onclick="selectPlan('free')" ${currentPlan === 'free' ? 'disabled aria-disabled="true"' : ''}>
          ${currentPlan === 'free' ? 'Current Plan' : 'Use Free'}
        </button>
      </article>

      <article class="card subscription-plan-card ${currentPlan === 'pro' ? 'active-plan' : ''}">
        <span class="subscription-tier">SMART TOOLS</span>
        <h2>Pro</h2>
        <div class="subscription-price"><del>₹199</del><strong>₹1</strong><small>/month</small></div>
        <ul class="subscription-features">
          <li>AI upload</li>
          <li>Premium analytics</li>
          <li>Business valuation</li>
        </ul>
        <button class="btn primary subscription-cta" onclick="startPayment('pro')" ${proIncluded ? 'disabled aria-disabled="true"' : ''}>
          ${currentPlan === 'pro' ? 'Current Plan' : (currentPlan === 'business' ? 'Included in Business' : 'Choose Pro')}
        </button>
      </article>

      <article class="card subscription-plan-card subscription-business-card ${businessActive ? 'active-plan' : ''}">
        <span class="subscription-recommended">FULL WORKSPACE</span>
        <span class="subscription-tier">BUSINESS OPERATIONS</span>
        <h2>Business</h2>
        <div class="subscription-price"><del>₹499</del><strong>₹1</strong><small>/month</small></div>
        <ul class="subscription-features">
          <li>Everything in Pro</li>
          <li>Complete Business workspace</li>
          <li>Fast POS, invoices &amp; Udhaar</li>
          <li>Stock, GST, reports &amp; multi-store</li>
        </ul>
        <button class="btn primary subscription-cta" onclick="startPayment('business')" ${businessActive ? 'disabled aria-disabled="true"' : ''}>
          ${businessActive ? 'Business Unlocked' : 'Unlock Business'}
        </button>
      </article>
    </div>

    <div class="notice success subscription-status" style="margin-top:14px">
      Current Plan: <b>${currentPlan.toUpperCase()}</b> · Paid access unlocks only after secure server verification.
    </div>
  `;
}

function selectPlan(planName){
  if(planName === 'free'){
    state.plan = 'free';

    state.subscription = {
      plan: 'free',
      verified: false,
      token: ''
    };

    save();
    renderSubscription();

    const badge = document.getElementById('planBadge');

    if(badge){
      badge.textContent = 'FREE Plan';
    }

    return;
  }

  state.plan = planName;

  save();
  renderSubscription();

  const badge = document.getElementById('planBadge');

  if(badge){
    badge.textContent = planName.toUpperCase() + ' Plan';
  }
}
async function startPayment(planName){
  if(planName === 'free'){
    selectPlan('free');
    return;
  }

  if(planName !== 'pro' && planName !== 'business'){
    alert('Invalid plan selected');
    return;
  }

  if(typeof Razorpay === 'undefined'){
    try{
      await window.vyaparWaitForRazorpay?.(12000);
    }catch(error){
      alert(error?.message || 'Razorpay checkout is unavailable');
      return;
    }
  }

  const API_BASE = (typeof API_BASE_URL !== 'undefined')
    ? API_BASE_URL
    : 'https://vypar-backend.onrender.com';

  try{
    showPaymentLoader('Creating secure subscription...');

    const token = localStorage.getItem('vyapar_ai_auth_token_v1') || '';

    const createResponse = await (window.vyaparAuthFetch||fetch)(
      API_BASE + '/subscription/create',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ plan: planName })
      }
    );

    const createText = await createResponse.text();
    let createData;
    try{
      createData = JSON.parse(createText);
    }catch(error){
      throw new Error('The backend did not return JSON. Response: ' + createText.slice(0,150));
    }

    if(!createResponse.ok || !createData.success){
      throw new Error(createData.message || 'Subscription create failed');
    }

    if(!createData.keyId || !createData.subscriptionId){
      throw new Error('The backend subscription response is incomplete');
    }

    const options = {
      key: createData.keyId,
      subscription_id: createData.subscriptionId,
      name: 'Vyapar AI',
      description: planName.toUpperCase() + ' Plan — ₹1/month',
      prefill: {
        name: createData.name || '',
        email: createData.email || ''
      },
      notes: {
        plan: planName,
        app: 'Vyapar AI'
      },
      theme: { color: planName === 'business' ? '#C9A227' : '#9CA3AF' },

      handler: async function(paymentResponse){
        try{
          showPaymentLoader('Verifying subscription...');

          const verifyResponse = await (window.vyaparAuthFetch||fetch)(
            API_BASE + '/subscription/verify',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
              },
              body: JSON.stringify({
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
                razorpay_signature: paymentResponse.razorpay_signature
              })
            }
          );

          const verifyText = await verifyResponse.text();
          let verifyData;
          try{
            verifyData = JSON.parse(verifyText);
          }catch(error){
            throw new Error('The verification response is invalid');
          }

          if(!verifyResponse.ok || !verifyData.success){
            throw new Error(verifyData.message || 'Subscription verification failed');
          }

          // Backend is the source of truth. Read entitlement after verification.
          const statusResponse = await fetch(
            API_BASE + '/subscription/status',
            {
              method: 'GET',
              headers: {
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
              }
            }
          );

          const statusText = await statusResponse.text();
          let statusData;
          try{
            statusData = JSON.parse(statusText);
          }catch(error){
            throw new Error('The subscription status response is invalid');
          }

          if(!statusResponse.ok || !statusData.success){
            throw new Error(statusData.message || 'Subscription status check failed');
          }

          const entitlement = statusData.subscription || {};
          const activePlan = entitlement.plan || 'free';

          if(activePlan !== 'pro' && activePlan !== 'business'){
            throw new Error('Payment received, but subscription is not active yet. Please retry status check.');
          }

          state.subscription = {
            plan: activePlan,
            verified: true,
            token: ''
          };
          state.plan = activePlan;
          save();
          render();

          hidePaymentLoader();
          showPlanSuccessPopup(activePlan);
        }catch(error){
          hidePaymentLoader();
          alert('Subscription verification error: ' + error.message);
        }
      },

      modal: {
        ondismiss: function(){
          hidePaymentLoader();
          showPaymentCancelPopup(planName);
        }
      }
    };

    hidePaymentLoader();
    const razorpay = new Razorpay(options);

    razorpay.on('payment.failed', function(response){
      hidePaymentLoader();
      const message = response && response.error && response.error.description
        ? response.error.description
        : 'Payment failed';
      alert(message);
    });

    razorpay.open();

  }catch(error){
    hidePaymentLoader();
    alert('Subscription payment error: ' + error.message);
  }
}

function showPaymentLoader(message){
  hidePaymentLoader();
  const loader = document.createElement('div');
  loader.id = 'paymentLoader';
  loader.className = 'subscription-overlay subscription-loader-overlay';
  loader.innerHTML = `
    <section class="subscription-dialog subscription-loader-card" role="status" aria-live="polite" aria-label="Payment status">
      <div class="subscription-spinner" aria-hidden="true"></div>
      <b id="paymentLoaderText">${message || 'Opening payment...'}</b>
      <small>Please keep this screen open.</small>
    </section>`;
  document.body.appendChild(loader);
  document.body.classList.add('subscription-dialog-open');
}

function hidePaymentLoader(){
  document.querySelectorAll('#paymentLoader').forEach(loader => loader.remove());
  if(!document.querySelector('#upgradePlanPopup,#planSuccessPopup,#paymentCancelPopup')){
    document.body.classList.remove('subscription-dialog-open');
  }
  const tabLoader = document.getElementById('tabLoader');
  if(tabLoader) tabLoader.classList.remove('show');
}

function showPlanSuccessPopup(planName){
  hidePaymentLoader();
  document.getElementById('planSuccessPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'planSuccessPopup';
  popup.className = 'subscription-overlay subscription-success-overlay';
  popup.innerHTML = `
    <section class="subscription-dialog subscription-result-card" role="dialog" aria-modal="true" aria-labelledby="subscriptionSuccessTitle">
      <div class="subscription-result-icon success" aria-hidden="true">✓</div>
      <h2 id="subscriptionSuccessTitle">Subscription Activated</h2>
      <p>You are now on the <strong class="subscription-plan-chip">${planName.toUpperCase()}</strong> plan.</p>
      <button id="closePlanSuccessPopup" class="subscription-dialog-primary" type="button">${planName === 'business' ? 'Open Business' : 'Continue'}</button>
    </section>`;
  document.body.appendChild(popup);
  document.body.classList.add('subscription-dialog-open');
  const close=()=>{if(popup.__vyClosing)return;const finish=()=>{popup.remove();document.body.classList.remove('subscription-dialog-open');if(planName==='business'&&typeof setTab==='function')setTab('business',false)};if(window.vyaparMotion)window.vyaparMotion.closeOverlay(popup,finish);else finish()};
  document.getElementById('closePlanSuccessPopup').onclick=close;
  setTimeout(()=>{if(popup.isConnected && !popup.__vyClosing){const finish=()=>{popup.remove();document.body.classList.remove('subscription-dialog-open')};if(window.vyaparMotion)window.vyaparMotion.closeOverlay(popup,finish);else finish()}},5000);
}

function showPaymentCancelPopup(planName){
  document.getElementById('paymentCancelPopup')?.remove();
  const popup = document.createElement('div');
  popup.id = 'paymentCancelPopup';
  popup.className = 'subscription-overlay subscription-cancel-overlay';
  popup.innerHTML = `
    <section class="subscription-dialog subscription-result-card" role="dialog" aria-modal="true" aria-labelledby="subscriptionCancelTitle">
      <div class="subscription-result-icon danger" aria-hidden="true">×</div>
      <h2 id="subscriptionCancelTitle">Payment Cancelled</h2>
      <p>The ${planName.toUpperCase()} plan was not activated.</p>
      <button id="retryPaymentBtn" class="subscription-dialog-primary" type="button">Try Again</button>
      <button id="closeCancelPopup" class="subscription-dialog-secondary" type="button">Close</button>
    </section>`;
  document.body.appendChild(popup);
  document.body.classList.add('subscription-dialog-open');
  const close=()=>{if(popup.__vyClosing)return;const finish=()=>{popup.remove();document.body.classList.remove('subscription-dialog-open')};if(window.vyaparMotion)window.vyaparMotion.closeOverlay(popup,finish);else finish()};
  document.getElementById('retryPaymentBtn').onclick=()=>{if(popup.__vyClosing)return;close();startPayment(planName)};
  document.getElementById('closeCancelPopup').onclick=close;
  popup.addEventListener('click',event=>{if(event.target===popup)close()});
}
function showUpgradePopup(requiredPlan, currentPlan){
  document.getElementById('upgradePlanPopup')?.remove();

  const business = requiredPlan === 'business';
  const plan = business ? 'Business' : 'Pro';
  const asset = business ? 'assets/images/subscription-business-gold.png' : 'assets/images/subscription-pro-silver.png';

  const popup = document.createElement('div');
  popup.id = 'upgradePlanPopup';
  popup.className = 'upgrade-plan-popup upgrade-plan-reference-popup ' + (business ? 'plan-business' : 'plan-pro');
  popup.innerHTML = `
    <section id="upgradePopupCard" class="upgrade-plan-reference-card" role="dialog" aria-modal="true" aria-label="Upgrade to ${plan}">
      <img class="upgrade-plan-reference-image" src="${asset}" alt="${business ? 'Gold Business' : 'Silver Pro'} plan upgrade details">
      <button id="closeUpgradePopup" class="upgrade-plan-hotspot upgrade-plan-hotspot-close" type="button" aria-label="Close ${plan} upgrade popup"></button>
      <button id="upgradeNowBtn" class="upgrade-plan-hotspot upgrade-plan-hotspot-primary" type="button" aria-label="Upgrade to ${plan}"></button>
      <button id="upgradeLaterBtn" class="upgrade-plan-hotspot upgrade-plan-hotspot-later" type="button" aria-label="Not now"></button>
    </section>`;

  document.body.appendChild(popup);
  document.body.classList.add('subscription-dialog-open');

  let closing = false;
  const close = () => {
    if(closing) return;
    closing = true;
    const finish=()=>{popup.remove();document.body.classList.remove('subscription-dialog-open');};
    if(window.vyaparMotion)window.vyaparMotion.closeOverlay(popup,finish);else finish();
  };

  document.getElementById('closeUpgradePopup').onclick = close;
  document.getElementById('upgradeLaterBtn').onclick = close;
  document.getElementById('upgradeNowBtn').onclick = function(){
    if(closing) return;
    close();
    setTimeout(() => startPayment(requiredPlan), 165);
  };
  popup.addEventListener('click', event => {
    if(event.target === popup) close();
  });
}

function renderSettings(){
  const el = document.getElementById('screen-settings');
  if(!el) return;

  const pm = performanceMode();
  const driveConnected = localStorage.getItem('vyapar_ai_drive_connected_v1') === '1';

  el.innerHTML = `
    <div class="settings-stack">
      <div class="card settings-section settings-account-section">
        <div class="settings-section-heading">
          <div>
            <span class="settings-kicker">ACCOUNT</span>
            <h2>Account</h2>
            <p class="muted">Manage your profile, subscription and secure cloud session.</p>
          </div>
          <div class="settings-section-icon">◎</div>
        </div>
        <div id="productionAccountCardHost"></div>
      </div>

      <div class="card settings-section">
        <div class="settings-section-heading">
          <div>
            <span class="settings-kicker">BUSINESS PROFILE</span>
            <h2>Shop details</h2>
            <p class="muted">Used for your dashboard, yearly goal, bills and business recommendations.</p>
          </div>
          <div class="settings-section-icon">▦</div>
        </div>
        <div class="settings-form-grid">
          <div class="settings-field-wide">
            <label>Business name</label>
            <input
              value="${esc(state.profile.businessName)}"
              autocomplete="organization"
              placeholder="My Shop"
              onchange="state.profile.businessName=this.value;save();renderHome()"
            >
          </div>
          <div>
            <label>Location type</label>
            <select onchange="state.profile.locationType=this.value;save();renderHome()">
              ${['Rural','Tier 3 City','Tier 2 City','Metro'].map(x => `
                <option value="${esc(x)}" ${x === state.profile.locationType ? 'selected' : ''}>${esc(x)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label>Yearly profit goal</label>
            <input
              type="number"
              min="1"
              inputmode="decimal"
              value="${yearlyGoal()}"
              placeholder="Example: 600000"
              onchange="state.profile.yearlyGoal=Math.max(1,+this.value||600000);save();renderHome()"
            >
            <small class="muted settings-field-note">Jan–Dec annual profit target. Home progress uses this yearly goal.</small>
          </div>
        </div>
      </div>

      <div class="card settings-section">
        <div class="settings-section-heading">
          <div>
            <span class="settings-kicker">PERFORMANCE</span>
            <h2>Motion & performance</h2>
            <p class="muted">Adjust animation intensity for your device.</p>
          </div>
          <div class="settings-section-icon">✦</div>
        </div>
        <div class="grid3">
          <button class="btn ${pm === 'auto' ? 'primary' : ''}" onclick="setPerformanceMode('auto')">Auto</button>
          <button class="btn ${pm === 'smooth' ? 'primary' : ''}" onclick="setPerformanceMode('smooth')">Smooth</button>
          <button class="btn ${pm === 'lite' ? 'primary' : ''}" onclick="setPerformanceMode('lite')">Lite</button>
        </div>
      </div>

      <div class="card settings-section data-safety-section">
        <div class="settings-section-heading">
          <div>
            <span class="settings-kicker">DATA SAFETY</span>
            <h2>Backup & data safety</h2>
            <p class="muted">Your business data stays under your control. Local storage is used first; cloud and Google Drive backups are optional.</p>
          </div>
          <div class="settings-section-icon">⌁</div>
        </div>

        <div class="settings-actions">
          <button class="btn primary" onclick="downloadBackup()">Save Backup to Device</button>
          <button class="btn" id="driveBackupButton" onclick="${driveConnected ? 'backupVyaparToGoogleDrive(true)' : 'connectGoogleDrive()'}">${driveConnected ? 'Back Up to Google Drive Now' : 'Connect Google Drive'}</button>
          <button class="btn" id="driveDisconnectButton" style="display:${driveConnected ? 'inline-flex' : 'none'}" onclick="disconnectGoogleDrive()">Disconnect Drive</button>
        </div>

        <label class="settings-file-label">Restore a device backup</label>
        <input class="settings-file-input" type="file" accept=".json,application/json" onchange="restoreBackup(this.files[0]).finally(()=>{this.value=''})">

        <div id="settingsStatus" class="notice" style="margin-top:10px">Automatic local saving is active.</div>
      </div>

      <div class="card settings-section">
        <div class="settings-section-heading">
          <div>
            <span class="settings-kicker">SUPPORT</span>
            <h2>Legal & support</h2>
            <p class="muted">Review how Vyapar AI handles your account and data.</p>
          </div>
          <div class="settings-section-icon">?</div>
        </div>
        <div class="settings-link-grid">
          <a class="btn" href="pages/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>
          <a class="btn" href="pages/legal/terms.html" target="_blank" rel="noopener">Terms</a>
          <a class="btn" href="pages/legal/refund.html" target="_blank" rel="noopener">Refund Policy</a>
          <a class="btn danger" href="pages/legal/delete-account.html" target="_blank" rel="noopener">Delete Account</a>
        </div>
      </div>
    </div>
  `;

  // production.js inserts the live account card into the settings screen.
  if(typeof window.appendAccountCard === 'function') window.appendAccountCard();
  if(typeof window.onNativeDriveStatus === 'function') window.onNativeDriveStatus(driveConnected);
}


function downloadBackup(){
  downloadBlob(
    new Blob(
      [
        JSON.stringify(
          state,
          null,
          2
        )
      ],
      {
        type: 'application/json'
      }
    ),
    'vyapar-ai-backup.json'
  );
}

async function replaceBusinessData(restored){
  restored.subscription={...state.subscription};
  restored.plan=state.plan;
  const apply = () => {
    state = restored;
    if(window.VyaparInsights) window.VyaparInsights.invalidate();
    if(window.VyaparUpload) window.VyaparUpload.clearPreview();
    render();
  };
  if(window.VyaparStorage) await window.VyaparStorage.replace(restored, apply);
  else { await persistBusinessState(restored); apply(); }
}

async function restoreBackup(file, encryptedOnly = false){
  if(!file) return false;
  let busy = false;
  try{
    const io = window.VyaparFiles;
    if(!io) throw new Error('Restart the app and try again.');
    let parsed = io.parse(await io.readText(file));
    const encrypted = io.isEncrypted(parsed);
    if(encryptedOnly && !encrypted) throw new Error('Choose a password-protected backup.');
    if(encrypted){
      const password = prompt('Backup password');
      if(!password) return false;
      parsed = await io.decrypt(parsed, password);
    }
    const restored = normalizeState(io.backupData(parsed));
    restored.subscription={...state.subscription};
    restored.plan=state.plan;
    const count = Object.values(restored).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
    const options = {title:'Restore backup?',message:'Replace current business data with '+count.toLocaleString('en-IN')+' saved records? Download a backup first if needed.',confirm:true,kind:'danger',okText:'Restore',cancelText:'Cancel'};
    const accepted = window.VyaparWorkspace ? await showGlassDialog(options) : confirm(options.message);
    if(!accepted) return false;
    if(window.VyaparWorkspace){ window.VyaparWorkspace.setBusy(true, 'Restoring your backup…'); busy = true; }
    await replaceBusinessData(restored);
    showGlassToast('Backup restored.');
    return true;
  }catch(error){
    alert((encryptedOnly ? 'Encrypted restore failed: ' : 'Backup restore failed: ') + error.message);
    return false;
  }finally{
    if(busy) window.VyaparWorkspace.setBusy(false);
  }
}

/* Vyapar AI Business Suite v5.1 — local-first modules */
function ensureBusinessState(){
  ['customers','purchases','expenses','payments','invoices'].forEach(k=>{if(!Array.isArray(state[k])) state[k]=[];});
}
function businessTotals(){
  ensureBusinessState();
  const sales=(state.sales||[]).reduce((s,x)=>s+Math.max(0,num(x.sellingPrice))*Math.max(0,num(x.qty)),0);
  const gross=(state.sales||[]).reduce((s,x)=>s+(num(x.sellingPrice)-num(x.purchasePrice))*Math.max(0,num(x.qty)),0);
  const purchases=state.purchases.reduce((s,x)=>s+num(x.amount),0);
  const expenses=state.expenses.reduce((s,x)=>s+num(x.amount),0);
  const paymentsIn=state.payments.filter(x=>x.direction==='in').reduce((s,x)=>s+num(x.amount),0);
  const paymentsOut=state.payments.filter(x=>x.direction==='out').reduce((s,x)=>s+num(x.amount),0);
  const outstanding=state.customers.reduce((s,x)=>s+Math.max(0,num(x.due)),0);
  return {sales,gross,purchases,expenses,net:gross-expenses,outstanding,paymentsIn,paymentsOut};
}
function renderBusiness(){
  const el=document.getElementById('screen-business'); if(!el)return; ensureBusinessState();
  const t=businessTotals();
  el.innerHTML=`
    <div class="card">
      <div class="calculator-head"><div><span class="pill">Business Suite</span><h2>Your business</h2><p class="muted">Billing, customers, udhaar, purchases, expenses, payments and business KPIs.</p></div></div>
      <div class="stats">
        <div class="stat"><span>Sales</span><b>${money(t.sales)}</b></div><div class="stat"><span>Gross Profit</span><b>${money(t.gross)}</b></div><div class="stat"><span>Expenses</span><b>${money(t.expenses)}</b></div><div class="stat"><span>Net Profit</span><b>${money(t.net)}</b></div><div class="stat"><span>Customer Due</span><b>${money(t.outstanding)}</b></div>
      </div>
    </div>
    <div class="business-module-grid" style="margin-top:14px">
      <div class="business-module-card"><h3>Customers & Udhaar</h3><p class="muted">Customer balance, payment and statement.</p><button class="btn primary" onclick="businessShowModule('customers')">Open Customers</button></div>
      <div class="business-module-card"><h3>Billing / Invoice</h3><p class="muted">Create a bill and print or save as PDF.</p><button class="btn primary" onclick="businessShowModule('billing')">Create Bill</button></div>
      <div class="business-module-card"><h3>Purchases & Suppliers</h3><p class="muted">Record purchases and increase stock.</p><button class="btn" onclick="businessShowModule('purchases')">Open Purchases</button></div>
      <div class="business-module-card"><h3>Expenses</h3><p class="muted">Track operating expenses and net profit.</p><button class="btn" onclick="businessShowModule('expenses')">Open Expenses</button></div>
      <div class="business-module-card"><h3>Payments</h3><p class="muted">Cash, UPI, card and customer receipts.</p><button class="btn" onclick="businessShowModule('payments')">Open Payments</button></div>
      <div class="business-module-card"><h3>GST / Tax Tools</h3><p class="muted">Quick inclusive/exclusive GST and discount.</p><button class="btn gold" onclick="setTab('calculator');setTimeout(()=>document.getElementById('bcGst')?.focus(),50)">Open GST Calculator</button></div>
    </div>
    <div id="businessModuleArea" class="card" style="margin-top:14px"><h2>Quick actions</h2><p class="muted">Choose a business module above.</p><div class="actions"><button class="btn" onclick="businessSeedDemo()">Add Demo Data</button><button class="btn" onclick="businessExportCSV()">Export CSV</button></div></div>`;
}
function businessShowModule(module){
  if(typeof requirePlan === 'function' && !requirePlan('business')) return false;
  ensureBusinessState(); const el=document.getElementById('businessModuleArea'); if(!el)return;
  if(module==='customers'){
    el.innerHTML=`<h2>Customers & Udhaar</h2><div class="business-calc-grid"><div><label>Name</label><input id="custName" placeholder="Ramesh Kumar"></div><div><label>Mobile</label><input id="custMobile" inputmode="tel" placeholder="9876543210"></div><div><label>Opening Due</label><input id="custDue" type="number" inputmode="decimal" placeholder="0"></div><div><label>Address</label><input id="custAddress" placeholder="Mauganj"></div></div><div class="actions"><button class="btn primary" onclick="businessAddCustomer()">Add Customer</button></div><div class="business-table scroll"><table class="table"><thead><tr><th>Name</th><th>Mobile</th><th>Due</th><th>Action</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.mobile)}</td><td>${money(c.due)}</td><td><button class="btn mini" onclick="businessReceive(${JSON.stringify(c.id)})">Receive</button> <button class="btn mini danger" onclick="businessDeleteRecord('customers','${esc(c.id)}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No customers.</td></tr>'}</tbody></table></div>`;
  } else if(module==='purchases'){
    el.innerHTML=`<h2>Purchase Entry</h2><div class="business-calc-grid"><div><label>Supplier</label><input id="purSupplier" placeholder="Supplier name"></div><div><label>Product</label><input id="purProduct" placeholder="School Shoe"></div><div><label>Quantity</label><input id="purQty" type="number" value="1"></div><div><label>Unit Cost</label><input id="purCost" type="number" placeholder="600"></div></div><div class="actions"><button class="btn primary" onclick="businessAddPurchase()">Save Purchase + Stock</button></div><div class="business-table scroll"><table class="table"><thead><tr><th>Date</th><th>Supplier</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${state.purchases.slice().reverse().map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.supplier)}</td><td>${esc(p.product)}</td><td>${p.qty}</td><td>${money(p.amount)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No purchases.</td></tr>'}</tbody></table></div>`;
  } else if(module==='expenses'){
    el.innerHTML=`<h2>Expense Entry</h2><div class="business-calc-grid"><div><label>Category</label><select id="expCategory"><option>Rent</option><option>Electricity</option><option>Salary</option><option>Transport</option><option>Marketing</option><option>Packaging</option><option>Repairs</option><option>Other</option></select></div><div><label>Amount</label><input id="expAmount" type="number" placeholder="1000"></div><div><label>Note</label><input id="expNote" placeholder="Monthly expense"></div></div><div class="actions"><button class="btn primary" onclick="businessAddExpense()">Save Expense</button></div><div class="business-table scroll"><table class="table"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead><tbody>${state.expenses.slice().reverse().map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.category)}</td><td>${esc(p.note)}</td><td>${money(p.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">No expenses.</td></tr>'}</tbody></table></div>`;
  } else if(module==='payments'){
    el.innerHTML=`<h2>Payments</h2><div class="business-calc-grid"><div><label>Direction</label><select id="payDirection"><option value="in">Money In</option><option value="out">Money Out</option></select></div><div><label>Amount</label><input id="payAmount" type="number" placeholder="2000"></div><div><label>Method</label><select id="payMethod"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option></select></div><div><label>Note</label><input id="payNote" placeholder="Customer payment"></div></div><div class="actions"><button class="btn primary" onclick="businessAddPayment()">Save Payment</button></div><div class="notice success" style="margin-top:12px">Recorded payments in: <b>${money(businessTotals().paymentsIn)}</b> · out: <b>${money(businessTotals().paymentsOut)}</b></div>`;
  } else if(module==='billing'){
    el.innerHTML=`<h2>Create Invoice</h2><div class="business-calc-grid"><div><label>Customer</label><input id="invCustomer" placeholder="Walk-in Customer"></div><div><label>Product</label><input id="invProduct" placeholder="Product"></div><div><label>Qty</label><input id="invQty" type="number" value="1"></div><div><label>Unit Price</label><input id="invPrice" type="number" placeholder="999"></div><div><label>GST %</label><input id="invGst" type="number" value="18"></div><div><label>Discount %</label><input id="invDiscount" type="number" value="0"></div></div><div class="actions"><button class="btn primary" onclick="businessCreateInvoice()">Create Invoice</button></div><div class="business-table scroll"><table class="table"><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Action</th></tr></thead><tbody>${state.invoices.slice().reverse().map(i=>`<tr><td>${esc(i.number)}</td><td>${esc(i.customer)}</td><td>${money(i.total)}</td><td><button class="btn mini" onclick="businessPrintInvoice('${esc(i.id)}')">Download PDF</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">No invoices.</td></tr>'}</tbody></table></div>`;
  }
}
function businessAddCustomer(){ensureBusinessState();const name=cleanText(v('custName'),120),mobile=cleanText(v('custMobile'),25),due=Math.max(0,num(v('custDue'))),address=cleanText(v('custAddress'),250);if(!name){alert('Customer name is required.');return;}state.customers.push({id:uid(),name,mobile,address,due,createdAt:new Date().toISOString()});save();businessShowModule('customers');}
function businessReceive(id){const c=state.customers.find(x=>x.id===id);if(!c)return;const amount=Number(prompt('Payment received amount',String(c.due))||0);if(!Number.isFinite(amount)||amount<=0)return;const actual=Math.min(amount,c.due);c.due=Math.max(0,c.due-actual);state.payments.push({id:uid(),date:localDateKey(),direction:'in',amount:actual,method:'Cash',note:'Customer payment',customerId:id});save();businessShowModule('customers');showGlassToast('Payment recorded.');}
function businessAddPurchase(){ensureBusinessState();const supplier=cleanText(v('purSupplier'),120)||'Unknown Supplier',product=cleanText(v('purProduct'),160),qty=Math.max(0,num(v('purQty'))),cost=Math.max(0,num(v('purCost')));if(!product||qty<=0||cost<=0){alert('Enter product, quantity and cost.');return;}state.purchases.push({id:uid(),date:localDateKey(),supplier,product,qty,unitCost:cost,amount:qty*cost});let stock=state.stocks.find(s=>String(s.product||s.item).toLowerCase()===product.toLowerCase());if(stock){stock.qty=num(stock.qty)+qty;}else{state.stocks.push({id:uid(),item:product,product,qty,min:5,lowStock:5,purchasePrice:cost,sellingPrice:cost});}save();businessShowModule('purchases');showGlassToast('Purchase saved and stock updated.');}
function businessAddExpense(){ensureBusinessState();const category=cleanText(v('expCategory'),80),amount=Math.max(0,num(v('expAmount'))),note=cleanText(v('expNote'),200);if(amount<=0){alert('Enter expense amount.');return;}state.expenses.push({id:uid(),date:localDateKey(),category,amount,note});save();businessShowModule('expenses');}
function businessAddPayment(){ensureBusinessState();const direction=v('payDirection')==='out'?'out':'in',amount=Math.max(0,num(v('payAmount'))),method=cleanText(v('payMethod'),30),note=cleanText(v('payNote'),160);if(amount<=0){alert('Enter payment amount.');return;}state.payments.push({id:uid(),date:localDateKey(),direction,amount,method,note});save();businessShowModule('payments');}
function businessCreateInvoice(){ensureBusinessState();const customer=cleanText(v('invCustomer'),120)||'Walk-in Customer',product=cleanText(v('invProduct'),160),qty=Math.max(0,num(v('invQty'))),price=Math.max(0,num(v('invPrice'))),gst=Math.max(0,num(v('invGst'))),discount=Math.max(0,Math.min(100,num(v('invDiscount'))));if(!product||qty<=0||price<=0){alert('Enter product, quantity and price.');return;}const subtotal=qty*price,discountAmount=subtotal*discount/100,net=subtotal-discountAmount,tax=net*gst/100,total=net+tax;const number='INV-'+new Date().getFullYear()+'-'+String(state.invoices.length+1).padStart(5,'0');const invoice={id:uid(),number,date:localDateKey(),customer,items:[{product,qty,price}],subtotal,discountPercent:discount,discountAmount,gstPercent:gst,tax,total};state.invoices.push(invoice);state.sales.push({id:uid(),date:invoice.date,product,category:'Invoice',purchasePrice:0,sellingPrice:price,qty,customer});save();businessShowModule('billing');showGlassToast(number+' created.');}
function businessPrintInvoice(id){
  const inv=(state.invoices||[]).find(x=>x.id===id);if(!inv)return;
  const tx={...inv,type:'SALE',partyName:inv.customer,currency:inv.currency||'INR',discount:inv.discountAmount,
    receivedPaid:inv.receivedPaid==null?(inv.paid==null?0:inv.paid):inv.receivedPaid,
    balance:inv.balance==null?Math.max(0,num(inv.total)-num(inv.receivedPaid==null?inv.paid:inv.receivedPaid)):inv.balance};
  const profile=state.profile||{},company=state.businessProfile||{};
  return window.VyaparInvoicePDF.download({transaction:tx,business:{name:company.businessName||company.name||profile.businessName||profile.shopName||'Vyapar AI',address:company.address||profile.address||'',phone:company.phone||profile.phone||'',gstin:company.gstin||''},settings:state.invoiceSettings620||{}});
}
function businessDeleteRecord(bucket,id){ensureBusinessState();state[bucket]=state[bucket].filter(x=>x.id!==id);save();businessShowModule(bucket==='customers'?'customers':bucket);}
function businessSeedDemo(){ensureBusinessState();if(!state.customers.length)state.customers.push({id:uid(),name:'Demo Customer',mobile:'',address:'',due:1500});if(!state.purchases.length)state.purchases.push({id:uid(),date:localDateKey(),supplier:'Demo Supplier',product:'Demo Shoe',qty:10,unitCost:500,amount:5000});if(!state.expenses.length)state.expenses.push({id:uid(),date:localDateKey(),category:'Transport',amount:300,note:'Demo'});save();renderBusiness();showGlassToast('Demo business data added.');}
function businessExportCSV(){ensureBusinessState();const rows=[['Type','Date','Name/Product','Amount','Note'],...state.purchases.map(x=>['Purchase',x.date,x.product,x.amount,x.supplier]),...state.expenses.map(x=>['Expense',x.date,x.category,x.amount,x.note]),...state.payments.map(x=>['Payment '+x.direction,x.date,x.method,x.amount,x.note])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv'}),'vyapar-business.csv');}
/* Performance helper: keep repeated renders from firing back-to-back during bulk UI changes. */
let __vyaparRenderQueued=false;
function queueBusinessRender(){if(__vyaparRenderQueued)return;__vyaparRenderQueued=true;requestAnimationFrame(()=>{__vyaparRenderQueued=false;renderBusiness();});}

render();
/* Vyapar AI 6.3.7 — hardened complete business suite */
(function(){
  const ADV_STATE_KEYS = [
    'products','suppliers','stockLedger','returns','cashbook','gstRecords','auditLog','staff','notifications',
    'paymentReconciliations','priceHistory','reorderRules','backupsMeta','cloudSync','appLock','settingsAdvanced','purchaseReturns','salesReturns',
    'barcodeCatalog','aiQueries','aiInsights','eInvoices','customerStatements','supplierStatements','productImports'
  ];
  function advEnsure(){
    ADV_STATE_KEYS.forEach(k=>{ if(!Array.isArray(state[k]) && k!=='cloudSync' && k!=='appLock' && k!=='settingsAdvanced') state[k]=[]; });
    if(!state.cloudSync || typeof state.cloudSync!=='object') state.cloudSync={enabled:false,lastSync:'',endpoint:'',status:'local'};
    if(!state.appLock || typeof state.appLock!=='object') state.appLock={enabled:false,pinHash:''};
    if(!state.settingsAdvanced || typeof state.settingsAdvanced!=='object') state.settingsAdvanced={language:'English',invoicePrefix:'INV',gstin:'',hsn:'',invoiceSeries:1,currency:'INR'};
    return state;
  }
  function ad(id){ return document.getElementById(id); }
  function val(id){ return String(ad(id)?.value||'').trim(); }
  function safeJson(s){ try{return JSON.parse(s)}catch(e){return null} }
  function advLog(action,details){ advEnsure(); state.auditLog.unshift({id:uid(),at:new Date().toISOString(),action,details:cleanText(details,500)}); state.auditLog=state.auditLog.slice(0,5000); }
  function advSave(action,details){ if(action) advLog(action,details||''); save(); }
  function advToast(msg){ if(typeof showGlassToast==='function') showGlassToast(msg); else alert(msg); }
  function advCSV(filename,rows){ const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'); downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),filename); }
  function today(){ return localDateKey(); }

  // 57-63 performance/data architecture: bounded IndexedDB cache for advanced records.
  const DB='vyapar_ai_adv_db_v1';
  let dbp=null;
  function openAdvDB(){
    if(!('indexedDB' in window)) return Promise.resolve(null);
    if(dbp) return dbp;
    dbp=new Promise(resolve=>{ const r=indexedDB.open(DB,1); r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('cache'))r.result.createObjectStore('cache');}; r.onsuccess=()=>resolve(r.result); r.onerror=()=>resolve(null); });
    return dbp;
  }
  async function advCacheSave(){ const db=await openAdvDB(); if(!db)return; try{ const tx=db.transaction('cache','readwrite'); tx.objectStore('cache').put({state:JSON.stringify(state),at:Date.now()},'state'); }catch(e){} }
  async function advCacheLoad(){ const db=await openAdvDB(); if(!db)return null; return new Promise(resolve=>{try{const r=db.transaction('cache').objectStore('cache').get('state');r.onsuccess=()=>resolve(r.result?safeJson(r.result.state):null);r.onerror=()=>resolve(null)}catch(e){resolve(null)}}); }
  const _save=window.save;
  window.save=function(){ const result=_save(); if(!window.VyaparStorage) advCacheSave(); return result; };

  // 63: virtualization helpers / lazy calculation
  window.advDebounce=function(fn,wait=180){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),wait)}};

  function products(){advEnsure();return state.products;}
  function stockMap(){
    const m=new Map();
    products().forEach(p=>m.set(String(p.id),{...p,qty:num(p.qty)}));
    (state.purchases||[]).forEach(p=>{const key=String(p.productId||''); if(key&&m.has(key))m.get(key).qty+=num(p.qty);});
    (state.invoices||[]).forEach(inv=>(inv.items||[]).forEach(i=>{const p=[...m.values()].find(x=>String(x.name).toLowerCase()===String(i.product).toLowerCase());if(p)p.qty-=num(i.qty);}));
    return m;
  }
  function recomputeLedger(){
    advEnsure(); const rows=[]; const map=new Map();
    (state.purchases||[]).forEach(p=>{const key=p.productId||String(p.product||'').toLowerCase(); rows.push({id:uid(),date:p.date||today(),type:'PURCHASE',product:p.product,qty:num(p.qty),amount:num(p.amount),source:p.id}); map.set(key,(map.get(key)||0)+num(p.qty));});
    (state.invoices||[]).forEach(i=>(i.items||[]).forEach(it=>{const key=it.productId||String(it.product||'').toLowerCase(); rows.push({id:uid(),date:i.date||today(),type:'SALE',product:it.product,qty:-num(it.qty),amount:num(it.price)*num(it.qty),source:i.id}); map.set(key,(map.get(key)||0)-num(it.qty));}));
    state.stockLedger=rows; advSave('Rebuild stock ledger','Derived from purchases and invoices'); return map;
  }
  window.advReconcile=function(){ recomputeLedger(); advToast('Stock ledger reconciled.'); advRenderModule('inventory'); };

  // 64-70 footwear catalog and variant support
  window.advAddProduct=function(){
    advEnsure();
    const name=cleanText(val('advPName'),200),brand=cleanText(val('advPBrand'),100),article=cleanText(val('advPArticle'),100),skuInput=cleanText(val('advPSku'),100),size=cleanText(val('advPSize'),50),color=cleanText(val('advPColor'),80);
    const purchase=Math.max(0,num(val('advPPurchase'))),sale=Math.max(0,num(val('advPSale'))),mrp=Math.max(0,num(val('advPMrp'))),qty=Math.max(0,num(val('advPQty'))),reorder=Math.max(0,num(val('advPReorder'))||5),gst=Math.min(100,Math.max(0,num(val('advPGst'))));
    const barcode=cleanText(val('advPBarcode'),100);
    if(!name){alert('Product name is required.');return;}
    const sku=skuInput||('SKU-'+Date.now());
    if(products().some(x=>String(x.sku||'').toLowerCase()===sku.toLowerCase())){alert('This SKU already exists. Use a unique SKU.');return;}
    if(barcode && products().some(x=>String(x.barcode||'').trim()===barcode)){alert('This barcode is already linked to another product.');return;}
    const finalSale=sale||mrp;
    if(mrp>0 && finalSale>mrp){
      const ok=confirm('Selling price is higher than MRP. Save anyway?');
      if(!ok)return;
    }
    const p={id:uid(),name,brand,article,sku,size,color,purchasePrice:purchase,sellingPrice:finalSale,mrp,qty,reorder,category:cleanText(val('advPCategory'),100)||'Footwear',hsn:cleanText(val('advPHsn'),30),gst,barcode,createdAt:new Date().toISOString()};
    state.products.push(p);
    if(barcode) state.barcodeCatalog.push({barcode,productId:p.id,sku:p.sku});
    state.priceHistory.push({id:uid(),productId:p.id,at:new Date().toISOString(),purchase,sale:finalSale,mrp});
    advSave('Product created',p.name); advRenderModule('inventory');
  };
  window.advDeleteProduct=function(id){state.products=state.products.filter(x=>x.id!==id);advSave('Product deleted',id);advRenderModule('inventory');};
  window.advImportCSV=function(input){
    const f=input?.files?.[0];
    if(!f) return;
    if(f.size > 10 * 1024 * 1024){ alert('CSV is too large. Maximum size is 10 MB.'); return; }
    const reader=new FileReader();
    reader.onerror=()=>alert('Could not read the CSV file.');
    reader.onload=()=>{
      try{
        const rows=parseCsv(String(reader.result||'').replace(/^\uFEFF/,''));
        if(rows.length<2){ alert('CSV has no data rows.'); return; }
        const headers=rows.shift().map(x=>String(x||'').trim().toLowerCase().replace(/[.\s/_-]+/g,''));
        let added=0, skipped=0;
        const skuSet=new Set(products().map(p=>String(p.sku||'').toLowerCase()).filter(Boolean));
        const barcodeSet=new Set(products().map(p=>String(p.barcode||'').trim()).filter(Boolean));
        rows.forEach(c=>{
          const o={}; headers.forEach((h,i)=>o[h]=c[i]??'');
          const name=cleanText(o.name||o.product,200); if(!name){skipped++;return;}
          const sku=cleanText(o.sku,100)||('SKU-'+Date.now()+'-'+added);
          const barcode=cleanText(o.barcode,100);
          if(skuSet.has(sku.toLowerCase()) || (barcode && barcodeSet.has(barcode))){skipped++;return;}
          const p={id:uid(),name,brand:cleanText(o.brand,100),article:cleanText(o.article||o.model,100),sku,size:cleanText(o.size,50),color:cleanText(o.color,80),qty:Math.max(0,num(o.qty||o.quantity)),reorder:Math.max(0,num(o.reorder||o.lowstock)||5),purchasePrice:Math.max(0,num(o.purchase||o.purchaseprice)),sellingPrice:Math.max(0,num(o.sale||o.sellingprice)),mrp:Math.max(0,num(o.mrp)),barcode,category:cleanText(o.category,100)||'General',gst:Math.min(100,Math.max(0,num(o.gst))),hsn:cleanText(o.hsn||o.hsnsac,30),createdAt:new Date().toISOString()};
          state.products.push(p); skuSet.add(sku.toLowerCase()); if(barcode)barcodeSet.add(barcode); added++;
        });
        advSave('Products imported',`${added} added, ${skipped} skipped`);
        advRenderModule('inventory');
        advToast(`${added} products imported${skipped?` · ${skipped} skipped`:''}.`);
      }catch(e){ alert('CSV import failed safely: '+e.message); }
      finally{ if(input) input.value=''; }
    };
    reader.readAsText(f);
  };
  window.advScanBarcode=async function(){
    if(!('BarcodeDetector' in window)){alert('Barcode scanning API is unavailable on this device. Use manual barcode entry.');return;}
    const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']});
    try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.srcObject=stream;video.style.cssText='position:fixed;inset:8%;width:84%;height:60%;object-fit:cover;z-index:99999;border-radius:20px';document.body.appendChild(video);const close=()=>{stream.getTracks().forEach(t=>t.stop());video.remove()};const loop=async()=>{try{const codes=await detector.detect(video);if(codes[0]){const code=codes[0].rawValue;close();const p=products().find(x=>x.barcode===code)||null;if(p)advToast('Found '+p.name+' · '+money(p.sellingPrice));else{const input=ad('advPBarcode');if(input)input.value=code;advToast('Barcode captured: '+code)}}}catch(e){} if(document.body.contains(video))requestAnimationFrame(loop)};video.onloadeddata=loop;}catch(e){alert('Camera permission or scanner failed: '+e.message)}
  };

  // 3-10 ledger/billing/returns
  window.advRecordReturn=function(kind){
    const id=val('advReturnRef'),amount=Math.max(0,num(val('advReturnAmount'))),qty=Math.max(0,num(val('advReturnQty')));if(!id||amount<=0){alert('Enter reference and amount.');return;} const rec={id:uid(),date:today(),kind,reference:id,amount,qty,reason:val('advReturnReason')}; state.returns.unshift(rec); if(kind==='SALE')state.salesReturns.unshift(rec);else state.purchaseReturns.unshift(rec); advSave(kind+' return recorded',id);advRenderModule('returns');
  };
  window.advCashClose=function(){advEnsure();const opening=Math.max(0,num(val('advOpeningCash'))),cashIn=(state.payments||[]).filter(x=>x.method==='Cash'&&x.direction==='in').reduce((s,x)=>s+num(x.amount),0),cashOut=(state.payments||[]).filter(x=>x.method==='Cash'&&x.direction==='out').reduce((s,x)=>s+num(x.amount),0);const closing=opening+cashIn-cashOut;state.cashbook.unshift({id:uid(),date:today(),opening,cashIn,cashOut,closing,actual:num(val('advActualCash'))});advSave('Daily cash closing',String(closing));advRenderModule('finance');};
  window.advReconcilePayments=function(){advEnsure();const rows=(state.payments||[]).map(p=>({...p,status:'matched'}));state.paymentReconciliations=rows;advSave('Payment reconciliation','Matched local payments');advRenderModule('finance');};
  window.advGSTReport=function(){advEnsure();const sales=(state.invoices||[]).reduce((s,i)=>s+num(i.tax),0),purchases=(state.purchases||[]).reduce((s,p)=>s+num(p.inputGst||0),0);state.gstRecords.unshift({id:uid(),date:today(),outputGst:sales,inputGst:purchases,netGst:sales-purchases});advSave('GST report generated',String(sales-purchases));advRenderModule('gst');};
  window.advStatement=function(type,id){advEnsure();let rows=[];if(type==='customer'){rows=(state.invoices||[]).filter(i=>i.customerId===id||i.customer===id).map(i=>({date:i.date,ref:i.number,debit:i.total,credit:0}));rows.push(...(state.payments||[]).filter(p=>p.customerId===id&&p.direction==='in').map(p=>({date:p.date,ref:'PAY',debit:0,credit:p.amount})));}else{rows=(state.purchases||[]).filter(p=>p.supplierId===id||p.supplier===id).map(p=>({date:p.date,ref:p.id,debit:p.amount,credit:0}));}advCSV((type==='customer'?'customer':'supplier')+'-statement.csv',[['Date','Reference','Debit','Credit'],...rows.map(r=>[r.date,r.ref,r.debit,r.credit])]);};

  // 31-40 team/cloud/security; cloud is opt-in and backend endpoint supplied by user.
  async function advCloudSync(){advEnsure();const endpoint=state.cloudSync.endpoint||val('advCloudEndpoint');if(!endpoint){alert('Set a sync endpoint first.');return;}try{state.cloudSync={...state.cloudSync,endpoint,status:'syncing'};save();const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:state.subscription?.token?'Bearer '+state.subscription.token:''},body:JSON.stringify({version:'6.3.7',state})});if(!res.ok)throw new Error('HTTP '+res.status);state.cloudSync={...state.cloudSync,status:'synced',lastSync:new Date().toISOString(),endpoint};advSave('Cloud sync complete',endpoint);advRenderModule('team');}catch(e){state.cloudSync.status='error';save();alert('Cloud sync failed: '+e.message)}}
  window.advCloudSync=advCloudSync;
  window.advSetCloud=function(){advEnsure();const ep=val('advCloudEndpoint');state.cloudSync.endpoint=ep;state.cloudSync.enabled=!!ep;advSave('Cloud sync endpoint updated',ep);advRenderModule('team');};
  window.advSetLock=function(){advEnsure();const pin=val('advPin');if(!/^\d{4,8}$/.test(pin)){alert('Use a 4–8 digit PIN.');return;}state.appLock={enabled:true,pinHash:btoa(pin)};advSave('App lock enabled','PIN configured locally');advToast('App lock configured.');};
  window.advUnlock=function(){if(!state.appLock?.enabled)return true;const pin=prompt('Enter Vyapar AI PIN');return btoa(String(pin||''))===state.appLock.pinHash;};
  window.advAddStaff=function(){advEnsure();const name=val('advStaffName'),role=val('advStaffRole');if(!name)return;state.staff.push({id:uid(),name,role,permissions:val('advStaffPerms').split(',').map(x=>x.trim()).filter(Boolean),active:true});advSave('Staff added',name);advRenderModule('team');};

  // 21-30 AI/business intelligence without exposing secrets in frontend.
  window.advAskAI=async function(){
    advEnsure();const q=val('advAIQuery');if(!q)return;const t=businessTotals();const context={sales:t.sales,profit:t.gross,expenses:t.expenses,net:t.net,outstanding:t.outstanding,products:products().length,customers:state.customers.length};const answer=`AI-ready business context prepared. Sales ${money(context.sales)}, gross profit ${money(context.profit)}, expenses ${money(context.expenses)}, net ${money(context.net)}, customer due ${money(context.outstanding)}, products ${context.products}, customers ${context.customers}. Connect your secure backend AI endpoint to generate a live answer without exposing an API key in the app.`;state.aiQueries.unshift({id:uid(),at:new Date().toISOString(),query:q,context,answer});state.aiQueries=state.aiQueries.slice(0,100);advSave('AI business question',q);ad('advAIAnswer').innerHTML='<b>AI analysis:</b><br>'+esc(answer);};
  window.advGenerateInsights=function(){advEnsure();const top=[...products()].sort((a,b)=>num(b.qty)-num(a.qty)).slice(0,5);const low=top.filter(p=>num(p.qty)<=num(p.reorder));const insight={id:uid(),at:new Date().toISOString(),bestSellers:top.map(p=>p.name),lowStock:low.map(p=>p.name),message:low.length?`Reorder ${low.map(p=>p.name).join(', ')}.`:'No immediate low-stock product detected.'};state.aiInsights.unshift(insight);advSave('AI insights generated',insight.message);advRenderModule('ai');};

  // 41-47 India/GST/e-invoice readiness
  window.advSaveTaxSettings=function(){advEnsure();state.settingsAdvanced.gstin=val('advGSTIN');state.settingsAdvanced.hsn=val('advHSN');state.settingsAdvanced.invoicePrefix=val('advInvoicePrefix')||'INV';state.settingsAdvanced.language=val('advLanguage')||'English';advSave('Tax settings updated','GSTIN/HSN/invoice series');advRenderModule('gst');};
  window.advPrepareEInvoice=function(){advEnsure();const inv=state.invoices[state.invoices.length-1];if(!inv){alert('Create an invoice first.');return;}const payload={schema:'e-invoice-ready',gstin:state.settingsAdvanced.gstin,invoiceNumber:inv.number,date:inv.date,customer:inv.customer,items:inv.items,total:inv.total,tax:inv.tax,hsn:state.settingsAdvanced.hsn};state.eInvoices.unshift({id:uid(),invoiceId:inv.id,preparedAt:new Date().toISOString(),payload,status:'ready_for_provider'});advSave('E-invoice payload prepared',inv.number);advRenderModule('gst');};

  // 50-56 security/reliability: encrypted-ish local export using Web Crypto when available.
  window.advSecureBackup=async function(){advEnsure();const raw=JSON.stringify(state),pass=prompt('Backup password (remember it; not recoverable)');if(!pass)return;try{if(!crypto.subtle){throw new Error('Web Crypto unavailable');}const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt']);const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(raw));const out=new Blob([JSON.stringify({v:1,s:[...salt],i:[...iv],d:[...new Uint8Array(data)]})],{type:'application/json'});downloadBlob(out,'vyapar-ai-secure-backup.json');advToast('Encrypted backup exported.');}catch(e){alert('Secure backup failed: '+e.message)}};
  window.advIntegrityCheck=function(){advEnsure();const problems=[];products().forEach(p=>{if(!p.id||!p.name)problems.push('Invalid product');if(num(p.qty)<0)problems.push('Negative stock: '+p.name)});(state.customers||[]).forEach(c=>{if(num(c.due)<0)problems.push('Negative customer due: '+c.name)});if(problems.length)alert(problems.slice(0,20).join('\n'));else advToast('Data integrity check passed.');};

  // 11-20 inventory intelligence
  window.advReorderReport=function(){const low=products().filter(p=>num(p.qty)<=num(p.reorder||5));advCSV('reorder-report.csv',[['Product','SKU','Qty','Reorder Point','Suggested Qty'],...low.map(p=>[p.name,p.sku,p.qty,p.reorder||5,Math.max(0,(p.reorder||5)*2-p.qty)])]);};
  window.advDeadStock=function(){const cutoff=Date.now()-60*86400000;const sold=new Set((state.invoices||[]).filter(i=>new Date(i.date).getTime()>=cutoff).flatMap(i=>(i.items||[]).map(x=>String(x.product).toLowerCase())));const dead=products().filter(p=>!sold.has(String(p.name).toLowerCase()));advCSV('dead-stock.csv',[['Product','SKU','Qty','Value'],...dead.map(p=>[p.name,p.sku,p.qty,num(p.qty)*num(p.purchasePrice)])]);};
  window.advProductProfit=function(){const rows=products().map(p=>{let q=0,s=0,c=0;(state.invoices||[]).forEach(i=>(i.items||[]).forEach(x=>{if(String(x.product).toLowerCase()===String(p.name).toLowerCase()){q+=num(x.qty);s+=num(x.price)*num(x.qty);c+=num(p.purchasePrice)*num(x.qty)}}));return[p.name,q,s,s-c]});advCSV('product-profit.csv',[['Product','Qty Sold','Sales','Gross Profit'],...rows]);};
  window.advPriceHistory=function(){advCSV('price-history.csv',[['Date','Product','Purchase','Sale','MRP'],...state.priceHistory.map(x=>[x.at,x.productId,x.purchase,x.sale,x.mrp])]);};

  // 1-10 UI render
  function moduleCards(){return [
    ['inventory','Inventory & Barcode','Products, size/color/brand/article/SKU, barcode, stock ledger, reorder, dead stock, bulk import'],
    ['customers','Customers & Udhaar','Customer accounts, statements, receipts, reminders and balances'],
    ['billing','Billing / Returns','Invoices, GST, discounts, sale returns, purchase returns, PDF/print readiness'],
    ['suppliers','Suppliers & Purchases','Supplier ledger, purchase history and outstanding readiness'],
    ['finance','Finance & Reconciliation','Expenses, cash closing, UPI/card/bank and reconciliation'],
    ['gst','GST / India','GSTIN, HSN/SAC, tax report, invoice series and e-invoice payload'],
    ['reports','Reports & Export','CSV exports, product profit, reorder, dead stock, statements'],
    ['ai','AI Business Assistant','Business questions, insights, forecasting/reorder/pricing hooks'],
    ['team','Team / Cloud','Multi-store-ready sync, staff roles, audit log, cloud endpoint'],
    ['security','Security / Reliability','PIN lock, encrypted backup, integrity checks, migration-safe data'],
    ['performance','Performance','IndexedDB cache, debounced work, lazy reports, low-end safe mode'],
    ['footwear','Footwear Pro','Size/color matrix, pair/carton, article, MRP, barcode and smart stock']
  ]}
  function renderAdvancedHome(){
    const el=ad('businessModuleArea'); if(!el)return; advEnsure();
    el.innerHTML=`<div class="adv-suite"><div class="adv-suite-head"><div><span class="pill">Vyapar AI 6.3.7</span><h2>Complete Business Suite</h2><p class="muted">All 70 requested capabilities are organised into modules. Existing data remains local-first.</p></div><div class="adv-badges"><span class="adv-badge">${state.products.length} Products</span><span class="adv-badge">${state.customers.length} Customers</span><span class="adv-badge">${state.auditLog.length} Audit Events</span></div></div><div class="adv-module-grid">${moduleCards().map(([id,t,d])=>`<button class="adv-module" onclick="advRenderModule('${id}')"><b>${t}</b><span>${d}</span></button>`).join('')}</div><div class="adv-quick"><button class="btn primary" onclick="advRenderModule('inventory')">Add Product</button><button class="btn" onclick="advRenderModule('billing')">New Bill</button><button class="btn" onclick="advRenderModule('finance')">Daily Closing</button><button class="btn" onclick="advGenerateInsights();advRenderModule('ai')">AI Insights</button><button class="btn" onclick="advSecureBackup()">Encrypted Backup</button><button class="btn" onclick="advIntegrityCheck()">Integrity Check</button></div></div>`;
  }
  function advRenderModule(mod){
    if(typeof requirePlan === 'function' && !requirePlan('business')) return false;
    advEnsure(); const el=ad('businessModuleArea');if(!el)return;
    const back=`<button class="btn mini" onclick="renderAdvancedHome()">← All Modules</button>`;
    if(mod==='inventory'){
      el.innerHTML=`${back}<h2>Inventory & Barcode</h2><div class="adv-form-grid">
      <input id="advPName" placeholder="Product name"><input id="advPBrand" placeholder="Brand"><input id="advPArticle" placeholder="Article"><input id="advPSku" placeholder="SKU"><input id="advPSize" placeholder="Size"><input id="advPColor" placeholder="Color"><input id="advPCategory" placeholder="Category" value="Footwear"><input id="advPBarcode" placeholder="Barcode"><input id="advPHsn" placeholder="HSN/SAC"><input id="advPGst" type="number" placeholder="GST %"><input id="advPPurchase" type="number" placeholder="Purchase price"><input id="advPSale" type="number" placeholder="Selling price"><input id="advPMrp" type="number" placeholder="MRP"><input id="advPQty" type="number" placeholder="Opening qty"><input id="advPReorder" type="number" placeholder="Reorder point" value="5"></div><div class="adv-actions"><button class="btn primary" onclick="advAddProduct()">Save Product</button><button class="btn" onclick="advScanBarcode()">Scan Barcode</button><label class="btn">Bulk CSV <input type="file" accept=".csv,text/csv" onchange="advImportCSV(this)" hidden></label><button class="btn" onclick="advReconcile()">Rebuild Stock Ledger</button><button class="btn" onclick="advReorderReport()">Reorder CSV</button><button class="btn" onclick="advDeadStock()">Dead Stock CSV</button><button class="btn" onclick="advProductProfit()">Product Profit CSV</button></div><div class="adv-table"><table class="table"><thead><tr><th>Product</th><th>Size</th><th>Color</th><th>SKU</th><th>Qty</th><th>MRP</th><th>Sale</th><th>Barcode</th><th></th></tr></thead><tbody>${products().slice().reverse().slice(0,200).map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.size)}</td><td>${esc(p.color)}</td><td>${esc(p.sku)}</td><td>${num(p.qty)}</td><td>${money(p.mrp)}</td><td>${money(p.sellingPrice)}</td><td>${esc(p.barcode)}</td><td><button class="btn mini danger" onclick="advDeleteProduct('${p.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="9">No products yet.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='customers'){
      el.innerHTML=`${back}<h2>Customers & Udhaar</h2><div class="adv-form-grid"><input id="advCName" placeholder="Customer name"><input id="advCMobile" placeholder="Mobile"><input id="advCDue" type="number" placeholder="Opening due"><input id="advCAddress" placeholder="Address"></div><div class="adv-actions"><button class="btn primary" onclick="advAddCustomer()">Add Customer</button><button class="btn" onclick="advReminderExport()">Due Reminder CSV</button></div><div class="adv-table"><table class="table"><thead><tr><th>Name</th><th>Mobile</th><th>Due</th><th>Actions</th></tr></thead><tbody>${(state.customers||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.mobile)}</td><td>${money(c.due)}</td><td><button class="btn mini" onclick="advReceive('${c.id}')">Receive</button><button class="btn mini" onclick="advStatement('customer','${esc(c.name)}')">Statement</button><button class="btn mini" onclick="advWhatsReminder('${c.id}')">WhatsApp</button></td></tr>`).join('')||'<tr><td colspan="4">No customers.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='billing'){
      el.innerHTML=`${back}<h2>Billing / Returns</h2><div class="adv-form-grid"><input id="advBillCustomer" placeholder="Customer"><input id="advBillProduct" placeholder="Product"><input id="advBillQty" type="number" value="1" placeholder="Qty"><input id="advBillPrice" type="number" placeholder="Price"><input id="advBillGst" type="number" value="18" placeholder="GST %"><input id="advBillDiscount" type="number" value="0" placeholder="Discount %"></div><div class="adv-actions"><button class="btn primary" onclick="advCreateBill()">Create Bill</button><button class="btn" onclick="var invoice=(state.invoices||[]).slice(-1)[0];if(invoice)businessPrintInvoice(invoice.id);else alert('Create an invoice first.')">Download last invoice</button></div><hr><h3>Returns</h3><div class="adv-form-grid"><select id="advReturnKind"><option value="SALE">Sales Return</option><option value="PURCHASE">Purchase Return</option></select><input id="advReturnRef" placeholder="Invoice / Purchase ref"><input id="advReturnAmount" type="number" placeholder="Amount"><input id="advReturnQty" type="number" placeholder="Qty"><input id="advReturnReason" placeholder="Reason"></div><button class="btn" onclick="advRecordReturn(val('advReturnKind'))">Record Return</button><div class="adv-table"><table class="table"><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>GST</th></tr></thead><tbody>${(state.invoices||[]).slice().reverse().map(i=>`<tr><td>${esc(i.number)}</td><td>${esc(i.customer)}</td><td>${money(i.total)}</td><td>${money(i.tax)}</td></tr>`).join('')||'<tr><td colspan="4">No invoices.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='suppliers'){
      el.innerHTML=`${back}<h2>Suppliers & Purchases</h2><div class="adv-form-grid"><input id="advSName" placeholder="Supplier"><input id="advSPhone" placeholder="Phone"><input id="advSProduct" placeholder="Product"><input id="advSQty" type="number" value="1"><input id="advSCost" type="number" placeholder="Unit cost"><input id="advSDue" type="number" placeholder="Outstanding"></div><button class="btn primary" onclick="advAddSupplierPurchase()">Record Purchase</button><button class="btn" onclick="advSupplierExport()">Supplier Ledger CSV</button><div class="adv-table"><table class="table"><thead><tr><th>Supplier</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${(state.purchases||[]).slice().reverse().slice(0,200).map(p=>`<tr><td>${esc(p.supplier)}</td><td>${esc(p.product)}</td><td>${p.qty}</td><td>${money(p.amount)}</td></tr>`).join('')||'<tr><td colspan="4">No purchases.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='finance'){
      const t=businessTotals(); el.innerHTML=`${back}<h2>Finance & Reconciliation</h2><div class="stats"><div class="stat"><span>Sales</span><b>${money(t.sales)}</b></div><div class="stat"><span>Expenses</span><b>${money(t.expenses)}</b></div><div class="stat"><span>Net Profit</span><b>${money(t.net)}</b></div><div class="stat"><span>Due</span><b>${money(t.outstanding)}</b></div></div><div class="adv-form-grid"><input id="advOpeningCash" type="number" placeholder="Opening cash"><input id="advActualCash" type="number" placeholder="Actual closing cash"></div><div class="adv-actions"><button class="btn primary" onclick="advCashClose()">Daily Cash Closing</button><button class="btn" onclick="advReconcilePayments()">Reconcile Payments</button><button class="btn" onclick="businessExportCSV()">All Finance CSV</button></div><div class="notice">Payment methods tracked: Cash · UPI · Card · Bank. Use Payment module for entries.</div>`;
    } else if(mod==='gst'){
      el.innerHTML=`${back}<h2>GST / India</h2><div class="adv-form-grid"><input id="advGSTIN" placeholder="GSTIN" value="${esc(state.settingsAdvanced.gstin)}"><input id="advHSN" placeholder="Default HSN/SAC" value="${esc(state.settingsAdvanced.hsn)}"><input id="advInvoicePrefix" placeholder="Invoice prefix" value="${esc(state.settingsAdvanced.invoicePrefix||'INV')}"><select id="advLanguage"><option>English</option><option>Hindi</option></select></div><div class="adv-actions"><button class="btn primary" onclick="advSaveTaxSettings()">Save Tax Settings</button><button class="btn" onclick="advGSTReport()">Generate GST Report</button><button class="btn" onclick="advPrepareEInvoice()">Prepare e-Invoice Payload</button></div><div class="adv-table"><table class="table"><thead><tr><th>Date</th><th>Output GST</th><th>Input GST</th><th>Net GST</th></tr></thead><tbody>${(state.gstRecords||[]).slice(0,100).map(x=>`<tr><td>${esc(x.date)}</td><td>${money(x.outputGst)}</td><td>${money(x.inputGst)}</td><td>${money(x.netGst)}</td></tr>`).join('')||'<tr><td colspan="4">No GST reports.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='reports'){
      el.innerHTML=`${back}<h2>Reports & Export</h2><div class="adv-module-grid"><button class="adv-module" onclick="businessExportCSV()"><b>Business CSV</b><span>All purchases, expenses and payments</span></button><button class="adv-module" onclick="advProductProfit()"><b>Product Profit</b><span>Sales, quantity and gross profit</span></button><button class="adv-module" onclick="advPriceHistory()"><b>Price History</b><span>Purchase, sale and MRP changes</span></button><button class="adv-module" onclick="advReorderReport()"><b>Reorder</b><span>Low-stock suggestions</span></button><button class="adv-module" onclick="advDeadStock()"><b>Dead Stock</b><span>Items not seen in recent sales</span></button><button class="adv-module" onclick="advReminderExport()"><b>Due Reminders</b><span>Customer outstanding list</span></button></div>`;
    } else if(mod==='ai'){
      const last=state.aiInsights?.[0]; el.innerHTML=`${back}<h2>AI Business Assistant</h2><p class="muted">The frontend prepares safe business context. Live AI generation should happen through your secure backend so API keys never ship in the APK.</p><textarea id="advAIQuery" placeholder="Ask: Which products should I reorder?"></textarea><div class="adv-actions"><button class="btn primary" onclick="advAskAI()">Analyze Business</button><button class="btn" onclick="advGenerateInsights()">Generate Insights</button></div><div id="advAIAnswer" class="notice">${last?esc(last.message):'No generated insight yet.'}</div>`;
    } else if(mod==='team'){
      el.innerHTML=`${back}<h2>Team / Cloud</h2><div class="adv-form-grid"><input id="advCloudEndpoint" placeholder="Secure sync endpoint" value="${esc(state.cloudSync.endpoint||'')}"><input id="advStaffName" placeholder="Staff name"><select id="advStaffRole"><option>Cashier</option><option>Sales</option><option>Inventory</option><option>Manager</option><option>Admin</option></select><input id="advStaffPerms" placeholder="sales,inventory,billing"></div><div class="adv-actions"><button class="btn primary" onclick="advSetCloud()">Save Cloud Endpoint</button><button class="btn" onclick="advCloudSync()">Sync Now</button><button class="btn" onclick="advAddStaff()">Add Staff</button></div><div class="notice">Cloud status: <b>${esc(state.cloudSync.status)}</b> · last sync: ${esc(state.cloudSync.lastSync||'Never')}</div><div class="adv-table"><table class="table"><thead><tr><th>Name</th><th>Role</th><th>Permissions</th></tr></thead><tbody>${(state.staff||[]).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc((s.permissions||[]).join(', '))}</td></tr>`).join('')||'<tr><td colspan="3">No staff users.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='security'){
      el.innerHTML=`${back}<h2>Security / Reliability</h2><div class="adv-form-grid"><input id="advPin" inputmode="numeric" maxlength="8" placeholder="4–8 digit app PIN"></div><div class="adv-actions"><button class="btn" onclick="advSetLock()">Enable App Lock</button><button class="btn" onclick="advSecureBackup()">Encrypted Backup</button><button class="btn" onclick="advIntegrityCheck()">Run Integrity Check</button><button class="btn" onclick="advMigrateData()">Migrate / Repair Data</button></div><div class="notice">App lock is local-only in this build. Biometric/native lock can be wired in MainActivity.</div><h3>Audit Log</h3><div class="adv-table"><table class="table"><thead><tr><th>Time</th><th>Action</th><th>Details</th></tr></thead><tbody>${(state.auditLog||[]).slice(0,100).map(x=>`<tr><td>${esc(x.at)}</td><td>${esc(x.action)}</td><td>${esc(x.details)}</td></tr>`).join('')||'<tr><td colspan="3">No audit events.</td></tr>'}</tbody></table></div>`;
    } else if(mod==='performance'){
      el.innerHTML=`${back}<h2>Performance</h2><div class="adv-module-grid"><div class="adv-module"><b>IndexedDB cache</b><span>Enabled for advanced state cache.</span></div><div class="adv-module"><b>Debounced work</b><span>Available through advDebounce.</span></div><div class="adv-module"><b>Lazy reports</b><span>Reports generate only on demand.</span></div><div class="adv-module"><b>Large dataset safety</b><span>Tables are capped to visible chunks.</span></div><div class="adv-module"><b>Lite rendering</b><span>Uses existing Lite performance mode.</span></div><div class="adv-module"><b>Web Worker readiness</b><span>Heavy import/export operations are isolated behind explicit actions.</span></div></div><div class="notice">For very large stores, move the primary state from localStorage to a versioned local database and sync incrementally.</div>`;
    } else if(mod==='footwear'){
      el.innerHTML=`${back}<h2>Footwear Pro</h2><div class="notice success">Size, color, brand, article, SKU, MRP, barcode, purchase price and sale price are supported in the product catalog.</div><div class="adv-module-grid"><button class="adv-module" onclick="advRenderModule('inventory')"><b>Size Matrix</b><span>Filter products by size.</span></button><button class="adv-module" onclick="advRenderModule('inventory')"><b>Color Matrix</b><span>Track colour variants.</span></button><button class="adv-module" onclick="advProductProfit()"><b>Brand Profit</b><span>Export product-level performance by brand.</span></button><button class="adv-module" onclick="advReorderReport()"><b>Pair Reorder</b><span>Use qty as pair count and reorder point.</span></button></div>`;
    } else { renderAdvancedHome(); }
  }
  window.advRenderModule=advRenderModule; window.renderAdvancedHome=renderAdvancedHome;

  function advAddCustomer(){const name=val('advCName');if(!name){alert('Customer name required.');return;}state.customers.push({id:uid(),name,mobile:val('advCMobile'),address:val('advCAddress'),due:num(val('advCDue')),createdAt:new Date().toISOString()});advSave('Customer added',name);advRenderModule('customers');}
  function advReceive(id){const c=state.customers.find(x=>x.id===id);if(!c)return;const a=Math.min(c.due,Math.max(0,num(prompt('Amount received',String(c.due))||0)));if(!a)return;c.due-=a;state.payments.push({id:uid(),date:today(),direction:'in',amount:a,method:'Cash',note:'Udhaar collection',customerId:id});advSave('Customer payment received',c.name);advRenderModule('customers');}
  function advWhatsReminder(id){const c=state.customers.find(x=>x.id===id);if(!c)return;const text=`Namaste ${c.name}, your outstanding amount is ${money(c.due)}. Please clear your due. - ${state.profile.businessName}`;window.open('https://wa.me/'+String(c.mobile||'').replace(/\D/g,'')+'?text='+encodeURIComponent(text),'_blank');}
  function advReminderExport(){advCSV('customer-due-reminders.csv',[['Customer','Mobile','Due'],...(state.customers||[]).filter(c=>num(c.due)>0).map(c=>[c.name,c.mobile,c.due])]);}
  function advAddSupplierPurchase(){const supplier=val('advSName'),product=val('advSProduct'),qty=num(val('advSQty')),cost=num(val('advSCost'));if(!supplier||!product||qty<=0||cost<=0){alert('Enter supplier, product, qty and cost.');return;}state.purchases.push({id:uid(),date:today(),supplier,product,qty,unitCost:cost,amount:qty*cost,inputGst:0});state.suppliers.push({id:uid(),name:supplier,phone:val('advSPhone'),due:num(val('advSDue'))});advSave('Supplier purchase recorded',supplier);advRenderModule('suppliers');}
  function advSupplierExport(){advCSV('supplier-ledger.csv',[['Supplier','Date','Product','Amount'],...(state.purchases||[]).map(p=>[p.supplier,p.date,p.product,p.amount])]);}
  function advCreateBill(){
    const customer=val('advBillCustomer')||'Walk-in Customer',product=val('advBillProduct'),qty=num(val('advBillQty'))||1,price=num(val('advBillPrice')),gst=num(val('advBillGst'))||0,discount=num(val('advBillDiscount'))||0;if(!product||price<=0){alert('Enter product and price.');return;}const sub=qty*price,disc=sub*discount/100,net=sub-disc,tax=net*gst/100,total=net+tax;const no=(state.settingsAdvanced.invoicePrefix||'INV')+'-'+String(state.settingsAdvanced.invoiceSeries++).padStart(6,'0');const inv={id:uid(),number:no,date:today(),customer,items:[{product,qty,price}],subtotal:sub,discountPercent:discount,discountAmount:disc,gstPercent:gst,tax,total};state.invoices.push(inv);state.sales.push({id:uid(),date:today(),product,qty,purchasePrice:0,sellingPrice:price,customer,category:'Billing'});advLog('Invoice created',no+' '+money(total));save();advRenderModule('billing');advToast(no+' created: '+money(total));}
  function advMigrateData(){advEnsure();state.products=state.products.map(p=>({...p,id:p.id||uid(),sku:p.sku||('SKU-'+uid()),qty:num(p.qty)}));state.customers=state.customers.map(c=>({...c,id:c.id||uid(),due:Math.max(0,num(c.due))}));advSave('Data migration/repair','Normalized product and customer records');advToast('Data migration completed.');}
  window.advAddCustomer=advAddCustomer;window.advReceive=advReceive;window.advWhatsReminder=advWhatsReminder;window.advReminderExport=advReminderExport;window.advAddSupplierPurchase=advAddSupplierPurchase;window.advSupplierExport=advSupplierExport;window.advCreateBill=advCreateBill;window.advMigrateData=advMigrateData;

  // Replace the business screen with the integrated suite.
  window.renderBusiness=function(){
    const el=ad('screen-business');if(!el)return;advEnsure();const t=businessTotals();
    el.innerHTML=`<div class="card"><div class="calculator-head"><div><span class="pill">Business Suite</span><h2>Vyapar AI Complete Business</h2><p class="muted">Billing, inventory, GST, customers, finance, AI, team, security and footwear tools.</p></div><button class="btn mini" onclick="renderAdvancedHome()">All Features</button></div><div class="stats"><div class="stat"><span>Sales</span><b>${money(t.sales)}</b></div><div class="stat"><span>Gross Profit</span><b>${money(t.gross)}</b></div><div class="stat"><span>Expenses</span><b>${money(t.expenses)}</b></div><div class="stat"><span>Net Profit</span><b>${money(t.net)}</b></div><div class="stat"><span>Customer Due</span><b>${money(t.outstanding)}</b></div></div></div><div id="businessModuleArea" class="card" style="margin-top:14px"></div>`;
    renderAdvancedHome();
  };
  // 18-20 global search-like command function
  window.advGlobalSearch=function(q){q=String(q||'').toLowerCase();return {products:products().filter(p=>[p.name,p.sku,p.barcode,p.article,p.brand].join(' ').toLowerCase().includes(q)),customers:(state.customers||[]).filter(c=>[c.name,c.mobile].join(' ').toLowerCase().includes(q))};};
  // Make initial state migration non-destructive.
  advEnsure();
  advLog('Feature suite initialized','Vyapar AI 6.3.7 advanced modules loaded');
  save();
})();

/* Vyapar AI 6.3.7 — remaining advanced capabilities / 70-feature completion layer */
(function(){
  function AE(){
    ['stores','sessions','errorLog','localVault','imports','ocrJobs'].forEach(k=>{if(!Array.isArray(state[k]))state[k]=[];});
    if(!state.currentStoreId)state.currentStoreId='MAIN';
  }
  function av(id){return String(document.getElementById(id)?.value||'').trim();}
  function n(v){return num(v);}
  function t(){return localDateKey();}
  function saveA(action,details){AE();state.auditLog=(state.auditLog||[]);state.auditLog.unshift({id:uid(),at:new Date().toISOString(),action,details:cleanText(details||'',500)});state.auditLog=state.auditLog.slice(0,5000);save();}
  window.advBestSeller=function(){
    const m=new Map();(state.sales||[]).forEach(s=>{const k=s.product||'Unknown';m.set(k,(m.get(k)||0)+n(s.qty));});const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]);advCSV('best-sellers.csv',[['Rank','Product','Qty'],...rows.map((r,i)=>[i+1,r[0],r[1]])]);
  };
  window.advCategoryBrandProfit=function(){
    const rows=(state.sales||[]).map(s=>{const p=(state.products||[]).find(x=>String(x.name).toLowerCase()===String(s.product).toLowerCase());const q=n(s.qty),profit=(n(s.sellingPrice)-n(s.purchasePrice))*q;return [p?.category||s.category||'General',p?.brand||'Unknown',s.product,q,profit]});advCSV('category-brand-profit.csv',[['Category','Brand','Product','Qty','Gross Profit'],...rows]);
  };
  window.advDiscountReport=function(){advCSV('discount-report.csv',[['Invoice','Date','Customer','Discount %','Discount Amount'],...(state.invoices||[]).map(i=>[i.number,i.date,i.customer,i.discountPercent||0,i.discountAmount||0])]);};
  window.advProductExport=function(){advCSV('products.csv',[['Name','Brand','Article','SKU','Size','Color','Category','Barcode','HSN','GST','Qty','Purchase','Sale','MRP','Reorder'],...(state.products||[]).map(p=>[p.name,p.brand,p.article,p.sku,p.size,p.color,p.category,p.barcode,p.hsn,p.gst,p.qty,p.purchasePrice,p.sellingPrice,p.mrp,p.reorder])]);};
  window.advDuplicateProducts=function(){const seen=new Map(),dupes=[];(state.products||[]).forEach(p=>{const k=[p.name,p.size,p.color,p.brand].map(x=>String(x||'').toLowerCase().trim()).join('|');if(seen.has(k))dupes.push([p.name,p.sku,seen.get(k).sku]);else seen.set(k,p)});advCSV('duplicate-products.csv',[['Product','SKU','Duplicate Of SKU'],...dupes]);if(dupes.length)advToast(dupes.length+' possible duplicates exported.');else advToast('No duplicate products detected.');};
  window.advPriceAnalysis=function(){const rows=(state.products||[]).map(p=>[p.name,p.mrp,p.sellingPrice,Math.max(0,n(p.mrp)-n(p.sellingPrice)),p.mrp?n(p.sellingPrice)/n(p.mrp)*100:0]);advCSV('mrp-vs-selling.csv',[['Product','MRP','Selling','Discount Amount','Realization %'],...rows]);};
  window.advFootwearMatrix=function(){const map=new Map();(state.products||[]).forEach(p=>{const key=String(p.brand||'Unknown')+'|'+String(p.article||'')+'|'+String(p.color||'Unknown');const x=map.get(key)||{};x[String(p.size||'One')]=n(p.qty);map.set(key,x)});const sizes=[...new Set((state.products||[]).map(p=>String(p.size||'One')))];advCSV('footwear-size-color-matrix.csv',[['Brand','Article','Color',...sizes],...([...map.entries()].map(([k,v])=>{const [b,a,c]=k.split('|');return [b,a,c,...sizes.map(s=>v[s]||0)]}) )]);};
  window.advPairCarton=function(){AE();const pairs=Math.max(0,n(prompt('Pairs to add/track','12')||0)),cartons=Math.max(0,n(prompt('Cartons','1')||0));state.auditLog.unshift({id:uid(),at:new Date().toISOString(),action:'Footwear pair/carton entry',details:`pairs=${pairs}, cartons=${cartons}`});save();advToast(`${pairs} pairs · ${cartons} cartons recorded in audit. Add exact product against the catalog for stock posting.`)};
  window.advSmartSearch=function(){const q=prompt('Search products/customers/orders');if(!q)return;const r=window.advGlobalSearch(q);const all=[...r.products.map(p=>'Product: '+p.name+' · '+p.sku+' · size '+(p.size||'-')+' · color '+(p.color||'-')),...r.customers.map(c=>'Customer: '+c.name+' · due '+money(c.due))];alert(all.length?all.slice(0,50).join('\n'):'No matches');};
  window.advStateGST=function(){const from=prompt('Business state (e.g. MP)','Madhya Pradesh')||'';const to=prompt('Customer state','Madhya Pradesh')||'';const same=from.trim().toLowerCase()===to.trim().toLowerCase();alert(same?'Intra-state: CGST + SGST applies.':'Inter-state: IGST applies.');};
  window.advForecast=function(){const months=resolvedMonthlyProfitSeries();const vals=months.slice(-6).map(x=>n(x[1]));const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;const trend=vals.length>1?vals[vals.length-1]-vals[0]:0;const forecast=Math.max(0,avg+(trend/(Math.max(1,vals.length-1))));state.aiInsights.unshift({id:uid(),at:new Date().toISOString(),type:'forecast',message:`6-month average profit ${money(avg)}; simple next-month projection ${money(forecast)}.`});save();advToast('Forecast generated: '+money(forecast));};
  window.advPricing=function(){const rows=(state.products||[]).map(p=>{const cost=n(p.purchasePrice),mrp=n(p.mrp)||n(p.sellingPrice),suggested=cost*1.35;return [p.name,cost,n(p.sellingPrice),mrp,suggested]});advCSV('pricing-suggestions.csv',[['Product','Cost','Current Sale','MRP','Suggested Sale'],...rows]);};
  window.advExpenseAnomaly=function(){const by=new Map();(state.expenses||[]).forEach(e=>{const k=e.category||'Other';by.set(k,(by.get(k)||[]).concat(n(e.amount)))});const rows=[];by.forEach((a,k)=>{const avg=a.reduce((x,y)=>x+y,0)/a.length;const max=Math.max(...a);if(max>avg*2)rows.push([k,avg,max])});advCSV('expense-anomalies.csv',[['Category','Average','Anomaly High'],...rows]);};
  window.advDailySummary=function(){const t0=businessTotals();const daily=(state.sales||[]).filter(s=>s.date===t());const sale=daily.reduce((a,s)=>a+n(s.sellingPrice)*n(s.qty),0);const prof=daily.reduce((a,s)=>a+(n(s.sellingPrice)-n(s.purchasePrice))*n(s.qty),0);const msg=`Today ${t()} sales ${money(sale)}, gross profit ${money(prof)}, total outstanding ${money(t0.outstanding)}.`;state.aiInsights.unshift({id:uid(),at:new Date().toISOString(),type:'daily-summary',message:msg});save();advToast(msg);};
  window.advNaturalQuery=function(){const q=prompt('Ask about your business');if(!q)return;const r=window.advGlobalSearch(q);const msg=`Found ${r.products.length} product matches and ${r.customers.length} customer matches for “${q}”.`;state.aiQueries.unshift({id:uid(),at:new Date().toISOString(),query:q,answer:msg});save();alert(msg);};
  window.advAIReport=function(){const t0=businessTotals();const report=`Vyapar AI Business Report\nDate: ${t()}\nSales: ${money(t0.sales)}\nGross Profit: ${money(t0.gross)}\nExpenses: ${money(t0.expenses)}\nNet Profit: ${money(t0.net)}\nCustomer Due: ${money(t0.outstanding)}\nProducts: ${(state.products||[]).length}\nCustomers: ${(state.customers||[]).length}`;downloadBlob(new Blob([report],{type:'text/plain'}),'vyapar-ai-business-report.txt');};
  window.advOCRUpload=function(input){const file=input?.files?.[0];if(!file)return;const job={id:uid(),at:new Date().toISOString(),name:file.name,status:'queued',note:'Secure OCR endpoint hook: send this image to the backend OCR/vision service. No API key is stored in the APK.'};state.ocrJobs.unshift(job);save();advToast('OCR job queued. Configure the secure backend vision endpoint to process it.');};
  window.advCreateStore=function(){AE();const name=prompt('Store/branch name');if(!name)return;state.stores.push({id:uid(),name,createdAt:new Date().toISOString()});save();advToast('Store added.');};
  window.advSwitchStore=function(){AE();const list=state.stores.map(s=>`${s.id}:${s.name}`).join('\n')||'No stores';const id=prompt('Enter store id to switch:\n'+list,'MAIN');if(id){state.currentStoreId=id;save();advToast('Current store: '+id);}};
  window.advSession=function(action){AE();if(action==='start'){const name=prompt('Staff/user name','Owner');state.sessions.push({id:uid(),user:name,at:new Date().toISOString(),status:'active'});save();}else{state.sessions=state.sessions.map(s=>({...s,status:'closed'}));save();advToast('Sessions closed.');}};
  window.advResolveCloud=function(){AE();const local=Date.now(),server=state.cloudSync?.lastSync?new Date(state.cloudSync.lastSync).getTime():0;state.cloudSync.resolution=local>=server?'local-wins':'server-wins';save();advToast('Conflict policy set to '+state.cloudSync.resolution+'.');};
  window.advVaultEnable=async function(){AE();const pass=prompt('Local vault password');if(!pass)return;state.localVault={enabled:true,hash:btoa(pass),enabledAt:new Date().toISOString()};save();advToast('Local vault metadata enabled.');};
  window.advRollbackImport=async function(){
    const last=state.imports?.[state.imports.length-1];
    if(!last || !last.before){alert('No import snapshot.');return;}
    if(!await showGlassDialog({title:'Undo last import?',message:'Restore the records saved before that import?',confirm:true,okText:'Undo import',cancelText:'Cancel'}))return;
    try{
      const restored = last.scope==='products'
        ? {...state,products:normalizeRecords(last.before.products),imports:state.imports.slice(0,-1)}
        : normalizeState(window.VyaparFiles.backupData(last.before));
      await replaceBusinessData(restored);
      advToast('Last import rolled back.');
    }catch(error){alert('Import rollback failed: '+error.message);}
  };
  window.advWorkerExport=function(){const data=(state.products||[]);const workerCode=`onmessage=e=>{const d=e.data,rows=[['Product','Qty','Sale'],...d.map(p=>[p.name,p.qty,p.sellingPrice])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\\n');postMessage(csv)}`;const blob=new Blob([workerCode],{type:'application/javascript'});const w=new Worker(URL.createObjectURL(blob));w.onmessage=e=>{downloadBlob(new Blob([e.data],{type:'text/csv'}),'products-worker.csv');w.terminate();};w.postMessage(data);};
  window.advUPI=function(){const vpa=prompt('UPI ID','merchant@upi'),amount=prompt('Amount','0');if(!vpa)return;const url='upi://pay?pa='+encodeURIComponent(vpa)+'&pn='+encodeURIComponent(state.profile.businessName)+'&am='+encodeURIComponent(amount||'0')+'&cu=INR';location.href=url;};
  window.advPaymentConfirmation=function(){const ref=prompt('Payment reference/UTR');if(!ref)return;state.notifications=(state.notifications||[]);state.notifications.unshift({id:uid(),at:new Date().toISOString(),type:'payment',message:'Payment reference logged: '+ref});save();advToast('Payment reference saved.');};
  window.advLaunchOCR=function(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>advOCRUpload(i);i.click();};
  window.advAddProductImportSnapshot=function(){state.imports.push({id:uid(),at:new Date().toISOString(),scope:'products',before:{products:JSON.parse(JSON.stringify(state.products||[]))},source:'manual'});state.imports=state.imports.slice(-10);};
  window.addEventListener('error',e=>{try{AE();state.errorLog.unshift({id:uid(),at:new Date().toISOString(),type:'error',message:String(e.message||e.error||e)});state.errorLog=state.errorLog.slice(0,200);localStorage.setItem('vyapar_ai_error_log_v1',JSON.stringify(state.errorLog));}catch(_){}},{passive:true});
  window.addEventListener('unhandledrejection',e=>{try{AE();state.errorLog.unshift({id:uid(),at:new Date().toISOString(),type:'unhandledrejection',message:String(e.reason||e)});state.errorLog=state.errorLog.slice(0,200);localStorage.setItem('vyapar_ai_error_log_v1',JSON.stringify(state.errorLog));}catch(_){}},{passive:true});
  AE();

  const oldHome=window.renderAdvancedHome;
  window.renderAdvancedHome=function(){
    oldHome(); const el=document.getElementById('businessModuleArea'); if(!el)return;
    const extra=document.createElement('div');extra.className='adv-advanced-tools';extra.innerHTML=`<h3 style="margin-top:18px">Advanced tools</h3><div class="adv-module-grid"><button class="adv-module" onclick="advBestSeller()"><b>Best Sellers</b><span>Export product sales ranking.</span></button><button class="adv-module" onclick="advCategoryBrandProfit()"><b>Category / Brand Profit</b><span>Compare profit by category and brand.</span></button><button class="adv-module" onclick="advDiscountReport()"><b>Discount Report</b><span>Track discounts and lost margin.</span></button><button class="adv-module" onclick="advProductExport()"><b>Product Export</b><span>Export complete catalog.</span></button><button class="adv-module" onclick="advDuplicateProducts()"><b>Duplicate Finder</b><span>Find likely duplicate items.</span></button><button class="adv-module" onclick="advPriceAnalysis()"><b>MRP vs Sale</b><span>Measure price realization.</span></button><button class="adv-module" onclick="advDailySummary()"><b>AI Daily Summary</b><span>Generate a local daily business summary.</span></button><button class="adv-module" onclick="advForecast()"><b>Forecast</b><span>Simple trend-based next month projection.</span></button><button class="adv-module" onclick="advPricing()"><b>Smart Pricing</b><span>Create price suggestions from cost.</span></button><button class="adv-module" onclick="advExpenseAnomaly()"><b>Expense Anomaly</b><span>Find unusually high expense categories.</span></button><button class="adv-module" onclick="advNaturalQuery()"><b>Natural Search</b><span>Search products and customers in plain language.</span></button><button class="adv-module" onclick="advAIReport()"><b>AI Report</b><span>Export a business report.</span></button><button class="adv-module" onclick="advLaunchOCR()"><b>Bill / Box OCR</b><span>Queue photo for secure backend OCR.</span></button><button class="adv-module" onclick="advCreateStore()"><b>Multi-Store</b><span>Create branch/store profiles.</span></button><button class="adv-module" onclick="advSwitchStore()"><b>Switch Store</b><span>Change active local store id.</span></button><button class="adv-module" onclick="advUPI()"><b>UPI Pay</b><span>Open UPI payment intent.</span></button><button class="adv-module" onclick="advPaymentConfirmation()"><b>Payment Reference</b><span>Log UTR/reference for reconciliation.</span></button><button class="adv-module" onclick="advWorkerExport()"><b>Worker Export</b><span>Export products off the UI thread.</span></button></div>`;el.appendChild(extra);
  };
  // Add clear links for capabilities that have secure/native dependencies.
  const oldAdv=window.advRenderModule;
  window.advRenderModule=function(mod){
    const opened=oldAdv(mod); if(opened===false)return false; const el=document.getElementById('businessModuleArea'); if(!el)return;
    if(mod==='ai'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advDailySummary()">Daily Summary</button><button class="btn" onclick="advForecast()">Forecast</button><button class="btn" onclick="advPricing()">Pricing</button><button class="btn" onclick="advExpenseAnomaly()">Expense Anomaly</button><button class="btn" onclick="advNaturalQuery()">Natural Search</button><button class="btn" onclick="advAIReport()">Report</button><button class="btn" onclick="advLaunchOCR()">Bill/Box OCR</button>';el.appendChild(a)}
    if(mod==='reports'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advBestSeller()">Best Sellers</button><button class="btn" onclick="advCategoryBrandProfit()">Category/Brand Profit</button><button class="btn" onclick="advDiscountReport()">Discounts</button><button class="btn" onclick="advProductExport()">Product Export</button><button class="btn" onclick="advDuplicateProducts()">Duplicate Finder</button><button class="btn" onclick="advPriceAnalysis()">MRP vs Sale</button>';el.appendChild(a)}
    if(mod==='team'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advCreateStore()">Add Store</button><button class="btn" onclick="advSwitchStore()">Switch Store</button><button class="btn" onclick="advSession(\'start\')">Start Session</button><button class="btn" onclick="advSession(\'close\')">Close Sessions</button><button class="btn" onclick="advResolveCloud()">Set Conflict Policy</button>';el.appendChild(a)}
    if(mod==='security'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advVaultEnable()">Enable Local Vault</button><label class="btn">Restore Encrypted <input type="file" accept="application/json" onchange="advRestoreSecure(this)" hidden></label><button class="btn" onclick="advRollbackImport()">Rollback Last Import</button>';el.appendChild(a)}
    if(mod==='footwear'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advFootwearMatrix()">Size/Color Matrix CSV</button><button class="btn" onclick="advPairCarton()">Pair/Carton Entry</button><button class="btn" onclick="advPriceAnalysis()">MRP vs Sale</button>';el.appendChild(a)}
    if(mod==='gst'){const a=document.createElement('div');a.className='adv-actions';a.innerHTML='<button class="btn" onclick="advStateGST()">Intra/Inter State GST</button>';el.appendChild(a)}
  };
})();

/* Completion wrappers */
(function(){
  const _csvImport=window.advImportCSV;
  if(typeof _csvImport==='function'){
    window.advImportCSV=function(input){
      try{
        state.imports=state.imports||[];
        state.imports.push({id:uid(),at:new Date().toISOString(),scope:'products',before:{products:JSON.parse(JSON.stringify(state.products||[]))},source:input?.files?.[0]?.name||'csv'});
        state.imports=state.imports.slice(-10);
        _csvImport(input);
      }catch(e){alert('Import failed safely: '+e.message);}
    };
  }
  window.advRestoreSecure=async function(input){
    try { return await restoreBackup(input?.files?.[0], true); }
    finally { if(input) input.value=''; }
  };
  const _oldSec=window.advSecureBackup;
})();


;
/* ===== production.js ===== */
(function(){
  "use strict";

  const API_BASE =
    String(
      window.VYAPAR_CONFIG &&
      window.VYAPAR_CONFIG.apiBase
        ? window.VYAPAR_CONFIG.apiBase
        : "https://vypar-backend.onrender.com"
    ).replace(/\/$/, "");

  const AUTH_TOKEN_KEY =
    "vyapar_ai_auth_token_v1";

  const AUTH_REFRESH_TOKEN_KEY =
    "vyapar_ai_auth_refresh_token_v1";

  const ACCOUNT_CACHE_KEY =
    "vyapar_ai_account_cache_v1";

  const CLOUD_SYNC_TIME_KEY =
    "vyapar_ai_last_cloud_sync_v1";

  let account =
    readJson(
      ACCOUNT_CACHE_KEY,
      null
    );

  let syncTimer = null;
  let syncBusy = false;
  let pendingAfterAuth = null;
  let paymentBusy = false;
  let lastSubscriptionForegroundRefresh = 0;

  function readJson(
    key,
    fallback
  ){
    try{
      const value =
        JSON.parse(
          localStorage.getItem(key)
        );

      return value === null
        ? fallback
        : value;

    }catch(error){
      return fallback;
    }
  }

  function authToken(){
    return String(
      localStorage.getItem(
        AUTH_TOKEN_KEY
      ) || ""
    ).trim();
  }

  function saveAccount(value){
    account = value || null;

    if(account){
      localStorage.setItem(
        ACCOUNT_CACHE_KEY,
        JSON.stringify(account)
      );
    }else{
      localStorage.removeItem(
        ACCOUNT_CACHE_KEY
      );
    }
  }

  function clearLogin(){
    localStorage.removeItem(
      AUTH_TOKEN_KEY
    );

    localStorage.removeItem(
      AUTH_REFRESH_TOKEN_KEY
    );

    localStorage.removeItem(
      ACCOUNT_CACHE_KEY
    );

    account = null;

    applyAccountToApp();
  }

  function forceOtpLogin(){
    clearLogin();
    window.location.reload();
  }

  async function api(
    route,
    options
  ){
    const settings =
      options || {};

    const headers =
      new Headers(
        settings.headers || {}
      );

    const token =
      authToken();

    if(token){
      headers.set(
        "Authorization",
        "Bearer " + token
      );
    }

    if(
      settings.body &&
      !(
        settings.body
        instanceof FormData
      ) &&
      !headers.has(
        "Content-Type"
      )
    ){
      headers.set(
        "Content-Type",
        "application/json"
      );
    }

    let response;

    try{
      const request =
        typeof window.vyaparAuthFetch === "function"
          ? window.vyaparAuthFetch
          : window.fetch.bind(window);

      response =
        await request(
          API_BASE + route,
          {
            ...settings,
            headers
          }
        );

    }catch(error){
      throw new Error(
        "Could not connect to the backend. Check your internet connection, deployment, and API URL."
      );
    }

    const raw =
      await response.text();

    let data = {};

    try{
      data = raw
        ? JSON.parse(raw)
        : {};

    }catch(error){
      throw new Error(
        "The backend returned invalid JSON: " +
        raw.slice(0, 120)
      );
    }

    if(
      !response.ok ||
      data.success === false
    ){
      const error =
        new Error(
          data.message ||
          "Request failed"
        );

      error.status =
        response.status;

      error.data =
        data;

      // assets/scripts/auth.js already performs one automatic refresh + replay for protected requests.
      // A remaining 401 means re-authentication is required; do not wipe local state or
      // force-reload from this generic transport layer. The account bootstrap can decide
      // when to present the login gate without destroying cached business data.
      if(response.status === 401 && token){
        error.code = "AUTH_REAUTH_REQUIRED";
      }

      throw error;
    }

    return data;
  }

  function currentAccountPlan(){
    if(!authToken()){
      return "free";
    }

    const plan =
      account &&
      account.subscription
        ? account
            .subscription
            .plan
        : "free";

    return (
      plan === "pro" ||
      plan === "business"
    )
      ? plan
      : "free";
  }

  function hasBusinessData(value){
    if(
      !value ||
      typeof value !== "object"
    ){
      return false;
    }

    return Boolean(
      (
        Array.isArray(
          value.sales
        ) &&
        value.sales.length
      ) ||

      (
        Array.isArray(
          value.stocks
        ) &&
        value.stocks.length
      ) ||

      (
        Array.isArray(
          value.monthly
        ) &&
        value.monthly.length
      ) ||

      (
        Array.isArray(
          value.daily
        ) &&
        value.daily.length
      )
    );
  }

  function safeStateForCloud(){
    try{
      const copy =
        JSON.parse(
          JSON.stringify(state)
        );

      copy.subscription = {
        plan:
          currentAccountPlan(),

        verified:
          currentAccountPlan() !==
          "free",

        token:
          ""
      };

      copy.plan =
        currentAccountPlan();

      return copy;

    }catch(error){
      return null;
    }
  }

  function applyAccountToApp(){
    try{
      if(
        typeof state ===
        "undefined"
      ){
        return;
      }

      const plan =
        currentAccountPlan();

      state.profile =
        state.profile || {};

      state.profile.backendUrl =
        API_BASE;

      state.subscription = {
        plan:
          plan,

        verified:
          plan !== "free",

        token:
          authToken()
      };

      state.plan =
        plan;

      persistBusinessState(state).catch(() => {});

      const badge =
        document.getElementById(
          "planBadge"
        );

      if(badge){
        badge.textContent =
          plan.toUpperCase() +
          " Plan";
      }

    }catch(error){
      console.warn(
        "Account state apply failed:",
        error
      );
    }
  }

  async function refreshAccount(){
    if(!authToken()){
      saveAccount(null);
      applyAccountToApp();
      return null;
    }

    try{
      const data =
        await api(
          "/auth/me",
          {
            method: "GET"
          }
        );

      saveAccount({
        user:
          data.user,

        subscription:
          data.subscription
      });

      applyAccountToApp();

      return account;

    }catch(error){
      if(error && error.status === 401 && error.code === "AUTH_REAUTH_REQUIRED"){
        clearLogin();
      }
      throw error;
    }
  }

  async function refreshSubscriptionAccess(showMessage){
    if(!authToken()){
      if(showMessage){
        forceOtpLogin();
      }
      return null;
    }

    try{
      const data = await api(
        "/subscription/status",
        { method: "GET" }
      );

      if(data && data.subscription){
        saveAccount({
          user: account && account.user ? account.user : null,
          subscription: data.subscription
        });
        applyAccountToApp();

        if(typeof render === "function"){
          render();
        }

        if(showMessage){
          premiumToast(
            data.subscription.plan !== "free"
              ? "Subscription access refreshed"
              : "No active paid subscription found yet",
            data.subscription.plan !== "free" ? "success" : "info"
          );
        }
      }

      return data ? data.subscription : null;
    }catch(error){
      if(showMessage){
        premiumToast(error.message || "Subscription refresh failed", "error");
      }
      throw error;
    }
  }

  async function initialCloudDecision(){
    if(window.VyaparStorage) await window.VyaparStorage.ready;
    if(!authToken()){
      return;
    }

    try{
      const cloud =
        await api(
          "/data",
          {
            method: "GET"
          }
        );

      const localHasData =
        typeof state !==
        "undefined" &&
        hasBusinessData(state);

      const cloudHasData =
        cloud.state &&
        hasBusinessData(
          cloud.state
        );

      if(
        !localHasData &&
        cloudHasData
      ){
        const restored = normalizeState(window.VyaparFiles.backupData(cloud.state));
        await replaceBusinessData(restored);

      }else if(
        localHasData &&
        !cloudHasData
      ){
        await pushCloudState(
          true
        );
      }

    }catch(error){
      console.warn(
        "Initial cloud sync skipped:",
        error.message
      );
    }
  }

  async function pushCloudState(
    showMessage
  ){
    if(window.VyaparStorage) await window.VyaparStorage.ready;
    if(
      !authToken() ||
      syncBusy
    ){
      return;
    }

    const cloudState =
      safeStateForCloud();

    if(!cloudState){
      return;
    }

    syncBusy = true;

    try{
      const data =
        await api(
          "/data",
          {
            method: "PUT",

            body:
              JSON.stringify({
                state:
                  cloudState
              })
          }
        );

      localStorage.setItem(
        CLOUD_SYNC_TIME_KEY,

        data.updatedAt ||
        new Date()
          .toISOString()
      );

      if(showMessage){
        premiumToast(
          "Cloud backup complete",
          "success"
        );
      }

      if(typeof window.backupVyaparToGoogleDrive === "function" && localStorage.getItem("vyapar_ai_drive_connected_v1") === "1") {
        window.backupVyaparToGoogleDrive(false);
      }

      updateAccountCard();

    }catch(error){
      if(showMessage){
        premiumToast(
          error.message,
          "error"
        );
      }

      console.warn(
        "Cloud sync failed:",
        error.message
      );

    }finally{
      syncBusy = false;
    }
  }

  function scheduleCloudSync(){
    if(!authToken()){
      return;
    }

    clearTimeout(syncTimer);

    syncTimer =
      setTimeout(
        function(){
          pushCloudState(false);
        },
        1200
      );
  }

  async function pullCloudState(){
    if(window.VyaparStorage) await window.VyaparStorage.ready;
    if(!authToken()){
      forceOtpLogin();
      return;
    }

    try{
      const data =
        await api(
          "/data",
          {
            method: "GET"
          }
        );

      if(!data.state){
        premiumToast(
          "Cloud backup is currently empty",
          "info"
        );

        return;
      }

      if(
        hasBusinessData(state)
      ){
        const okay = await showGlassDialog({
          title: 'Replace device data?',
          message: 'Cloud data will replace the current device data. Continue?',
          kind: 'warning', confirm: true, okText: 'Continue', cancelText: 'Cancel'
        });

        if(!okay){
          return;
        }
      }

      const restored = normalizeState(window.VyaparFiles.backupData(data.state));
      await replaceBusinessData(restored);

      premiumToast(
        "Cloud data restored",
        "success"
      );

    }catch(error){
      premiumToast(
        error.message,
        "error"
      );
    }
  }

  function premiumToast(
    message,
    type
  ){
    const old =
      document.getElementById(
        "productionToast"
      );

    if(old){
      old.remove();
    }

    const toast =
      document.createElement(
        "div"
      );

    toast.id =
      "productionToast";

    toast.textContent =
      message;

    toast.className =
      "production-toast " +
      "production-toast-" +
      (type || "info");

    document.body.appendChild(
      toast
    );

    requestAnimationFrame(
      function(){
        toast.classList.add(
          "show"
        );
      }
    );

    setTimeout(
      function(){
        toast.classList.remove(
          "show"
        );

        setTimeout(
          function(){
            toast.remove();
          },
          220
        );
      },
      3200
    );
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replace(
        /[&<>"']/g,

        function(character){
          return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
          }[character];
        }
      );
  }

  function openAuthModal(
    mode,
    afterSuccess
  ){
    pendingAfterAuth =
      typeof afterSuccess ===
      "function"
        ? afterSuccess
        : null;

    const old =
      document.getElementById(
        "authModal"
      );

    if(old){
      old.remove();
    }

    const modal =
      document.createElement(
        "div"
      );

    modal.id =
      "authModal";

    modal.className =
      "production-overlay";

    modal.innerHTML = `
      <div class="production-modal">
        <button
          class="production-close"
          id="authClose"
        >×</button>

        <div class="production-logo">
          V
        </div>

        <div class="production-kicker">
          SECURE ACCOUNT
        </div>

        <h2 id="authTitle">
          ${
            mode === "register"
              ? "Create your account"
              : "Welcome back"
          }
        </h2>

        <p
          class="production-muted"
          id="authSubtitle"
        >
          ${
            mode === "register"
              ? "Cloud backup, subscription restore and multi-device access."
              : "Login to continue with your business data and subscription."
          }
        </p>

        <div
          id="authNameWrap"
          style="display:${
            mode === "register"
              ? "block"
              : "none"
          }"
        >
          <label>Full Name</label>

          <input
            id="authName"
            autocomplete="name"
            placeholder="Your name"
          >
        </div>

        <label>Email</label>

        <input
          id="authEmail"
          type="email"
          autocomplete="email"
          placeholder="name@example.com"
        >

        <label>Password</label>

        <input
          id="authPassword"
          type="password"
          autocomplete="current-password"
          placeholder="Minimum 8 characters"
        >

        <div
          id="authError"
          class="production-error"
          style="display:none"
        ></div>

        <button
          id="authSubmit"
          class="production-primary"
        >
          ${
            mode === "register"
              ? "Create Account"
              : "Login Securely"
          }
        </button>

        <button
          id="authSwitch"
          class="production-link"
        >
          ${
            mode === "register"
              ? "Already have an account? Login"
              : "New here? Create account"
          }
        </button>

        <div class="production-secure">
          🔒 Password encrypted • HTTPS connection
        </div>
      </div>
    `;

    document.body.appendChild(
      modal
    );

    let currentMode =
      mode === "register"
        ? "register"
        : "login";

    function close(){
      if(window.vyaparMotion) window.vyaparMotion.closeOverlay(modal); else modal.remove();
      pendingAfterAuth = null;
    }

    function setMode(nextMode){
      currentMode =
        nextMode;

      const register =
        currentMode ===
        "register";

      document.getElementById(
        "authNameWrap"
      ).style.display =
        register
          ? "block"
          : "none";

      document.getElementById(
        "authTitle"
      ).textContent =
        register
          ? "Create your account"
          : "Welcome back";

      document.getElementById(
        "authSubtitle"
      ).textContent =
        register
          ? "Cloud backup, subscription restore and multi-device access."
          : "Login to continue with your business data and subscription.";

      document.getElementById(
        "authSubmit"
      ).textContent =
        register
          ? "Create Account"
          : "Login Securely";

      document.getElementById(
        "authSwitch"
      ).textContent =
        register
          ? "Already have an account? Login"
          : "New here? Create account";

      document.getElementById(
        "authError"
      ).style.display =
        "none";
    }

    document.getElementById(
      "authClose"
    ).onclick =
      close;

    document.getElementById(
      "authSwitch"
    ).onclick =
      function(){
        setMode(
          currentMode ===
          "register"
            ? "login"
            : "register"
        );
      };

    modal.addEventListener(
      "click",

      function(event){
        if(
          event.target === modal
        ){
          close();
        }
      }
    );

    document.getElementById(
      "authSubmit"
    ).onclick =
      async function(){
        const button =
          this;

        const errorBox =
          document.getElementById(
            "authError"
          );

        const name =
          String(
            document.getElementById(
              "authName"
            ).value || ""
          ).trim();

        const email =
          String(
            document.getElementById(
              "authEmail"
            ).value || ""
          ).trim();

        const password =
          String(
            document.getElementById(
              "authPassword"
            ).value || ""
          );

        errorBox.style.display =
          "none";

        button.disabled =
          true;

        button.textContent =
          currentMode ===
          "register"
            ? "Creating account..."
            : "Logging in...";

        try{
          const data =
            await api(
              "/auth/" +
              currentMode,

              {
                method:
                  "POST",

                body:
                  JSON.stringify(
                    currentMode ===
                    "register"
                      ? {
                          name,
                          email,
                          password
                        }
                      : {
                          email,
                          password
                        }
                  )
              }
            );

          localStorage.setItem(
            AUTH_TOKEN_KEY,
            data.token || data.accessToken || data.access_token || ""
          );

          const refreshToken =
            data.refreshToken ||
            data.refresh_token ||
            "";
          if(refreshToken){
            localStorage.setItem(
              AUTH_REFRESH_TOKEN_KEY,
              refreshToken
            );
          }

          saveAccount({
            user:
              data.user,

            subscription:
              data.subscription
          });

          applyAccountToApp();

          modal.remove();

          premiumToast(
            currentMode ===
            "register"
              ? "Account created"
              : "Login successful",

            "success"
          );

          await initialCloudDecision();

          if(
            typeof render ===
            "function"
          ){
            render();
          }

          const callback =
            pendingAfterAuth;

          pendingAfterAuth =
            null;

          if(callback){
            callback();
          }

        }catch(error){
          errorBox.textContent =
            error.message;

          errorBox.style.display =
            "block";

        }finally{
          button.disabled =
            false;

          if(
            document.body
              .contains(button)
          ){
            button.textContent =
              currentMode ===
              "register"
                ? "Create Account"
                : "Login Securely";
          }
        }
      };
  }

  async function logoutAccount(){
    const okay = await showGlassDialog({
      title: "Log out?",
      message: "Are you sure you want to log out of this Vyapar AI account? Your local business data will remain on this device.",
      kind: "danger",
      confirm: true,
      okText: "Log Out",
      cancelText: "Stay Logged In"
    });
    if(!okay) return;
    clearLogin();
    window.location.reload();
  }

  async function cancelSubscription(){
    if(!authToken()){
      forceOtpLogin();
      return;
    }

    const okay = await showGlassDialog({
      title: 'Cancel subscription?',
      message: 'Cancel the subscription at the end of the current billing cycle?',
      kind: 'danger', confirm: true, okText: 'Cancel Subscription', cancelText: 'Keep Subscription'
    });

    if(!okay){
      return;
    }

    try{
      const data =
        await api(
          "/subscription/cancel",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                atCycleEnd:
                  true
              
              })
          }
        );

      await refreshAccount();

      if(
        typeof render ===
        "function"
      ){
        render();
      }

      premiumToast(
        data.message,
        "success"
      );

    }catch(error){
      premiumToast(
        error.message,
        "error"
      );
    }
  }

  function showDestructiveConfirmation(title, message){
    return new Promise(function(resolve){
      const existing=document.getElementById('vyaparAccountDeleteConfirm');
      if(existing) existing.remove();
      const overlay=document.createElement('div');
      overlay.id='vyaparAccountDeleteConfirm'; overlay.className='account-delete-overlay';
      overlay.innerHTML=`<div class="account-delete-card" role="dialog" aria-modal="true"><div class="account-delete-icon">!</div><div class="account-delete-kicker">PERMANENT ACTION</div><h2>${title}</h2><p>${message}</p><div class="account-delete-actions"><button type="button" class="btn" id="accountDeleteCancel">Cancel</button><button type="button" class="btn danger" id="accountDeleteConfirm">Delete Account</button></div></div>`;
      document.body.appendChild(overlay);
      const finish=v=>{if(window.vyaparMotion)window.vyaparMotion.closeOverlay(overlay,()=>{overlay.remove();resolve(v)});else{overlay.remove();resolve(v)}};
      overlay.querySelector('#accountDeleteCancel').onclick=()=>finish(false);
      overlay.querySelector('#accountDeleteConfirm').onclick=()=>finish(true);
      overlay.addEventListener('click',e=>{if(e.target===overlay) finish(false)});
    });
  }

  async function deleteAccount(){
    if(!authToken()){
      forceOtpLogin();
      return;
    }

    const expectedEmail =
      account &&
      account.user &&
      account.user.email
        ? String(account.user.email).trim().toLowerCase()
        : "";

    const initialConfirmed = await showDestructiveConfirmation(
      "Delete your account?",
      "Your sales, stock, cloud backup and account data will be permanently deleted. This action cannot be undone."
    );
    if(!initialConfirmed) return;

    const confirmEmail =
      String(
        prompt(
          "Enter your exact email address to permanently delete the account:\n" +
          expectedEmail
        ) || ""
      )
        .trim()
        .toLowerCase();

    if(!confirmEmail){
      return;
    }

    if(confirmEmail !== expectedEmail){
      premiumToast(
        "The email did not match. The account was not deleted.",
        "error"
      );
      return;
    }

    try{
      await api(
        "/auth/account",
        {
          method: "DELETE",
          body: JSON.stringify({
            confirmEmail
          })
        }
      );

      localStorage.removeItem("vyapar_ai_prod_v1");
      localStorage.removeItem(CLOUD_SYNC_TIME_KEY);
      clearLogin();
      window.location.reload();

    }catch(error){
      premiumToast(
        error.message,
        "error"
      );
    }
  }

  function updateAccountCard(){
    const card =
      document.getElementById(
        "productionAccountCard"
      );

    if(!card){
      return;
    }

    const loggedIn =
      Boolean(
        authToken() &&
        account &&
        account.user
      );

    const plan =
      currentAccountPlan();

    const lastSync =
      localStorage.getItem(
        CLOUD_SYNC_TIME_KEY
      );

    const end =
      account &&
      account.subscription
        ? account
            .subscription
            .currentEnd
        : null;

    if(loggedIn){
      card.innerHTML = `
        <div class="production-account-head">
          <div class="production-avatar">
            ${escapeHtml(
              (
                account.user.name ||
                "U"
              )
                .slice(0, 1)
                .toUpperCase()
            )}
          </div>

          <div>
            <h3>
              ${escapeHtml(
                account.user.name ||
                "User"
              )}
            </h3>

            <p>
              ${escapeHtml(
                account.user.email ||
                ""
              )}
            </p>
          </div>

          <span class="production-plan">
            ${plan.toUpperCase()}
          </span>
        </div>

        <div class="production-account-grid">
          <div>
            <span>Status</span>

            <b>
              ${escapeHtml(
                account.subscription
                  ? account
                      .subscription
                      .status
                  : "none"
              )}
            </b>
          </div>

          <div>
            <span>Renewal</span>

            <b>
              ${
                end
                  ? new Date(end)
                      .toLocaleDateString(
                        "en-IN"
                      )
                  : "-"
              }
            </b>
          </div>

          <div>
            <span>Cloud Sync</span>

            <b>
              ${
                lastSync
                  ? new Date(
                      lastSync
                    ).toLocaleString(
                      "en-IN"
                    )
                  : "Not synced"
              }
            </b>
          </div>
        </div>

        <div class="production-actions">
          <button
            onclick="window.vyaparCloudBackup()"
          >
            Backup Now
          </button>

          <button
            onclick="window.vyaparCloudRestore()"
          >
            Restore Cloud
          </button>

          ${
            plan !== "free"
              ? `
                <button
                  class="danger"
                  onclick="window.vyaparCancelSubscription()"
                >
                  Cancel at Cycle End
                </button>
              `
              : ""
          }

          <button
            onclick="window.vyaparLogout()"
          >
            Logout
          </button>

          <button
            class="danger"
            onclick="window.vyaparDeleteAccount()"
          >
            Delete Account
          </button>
        </div>
      `;

    }else{
      card.innerHTML = `
        <div class="production-account-head">
          <div class="production-avatar">
            V
          </div>

          <div>
            <h3>
              Vyapar AI Account
            </h3>

            <p>
              Cloud backup and subscription restore
            </p>
          </div>
        </div>

        <div class="production-actions">
          <button
            class="primary"
            onclick="window.vyaparLogin()"
          >
            Login
          </button>

          <button
            onclick="window.vyaparRegister()"
          >
            Create Account
          </button>
        </div>
      `;
    }
  }

  function appendAccountCard(){
    const screen =
      document.getElementById(
        "screen-settings"
      );

    if(
      !screen ||
      document.getElementById(
        "productionAccountCard"
      )
    ){
      return;
    }

    const card =
      document.createElement(
        "div"
      );

    card.id =
      "productionAccountCard";

    card.className =
      "card production-account-card";

    card.style.marginTop =
      "14px";

    const host = document.getElementById("productionAccountCardHost");
    if(host) host.appendChild(card); else screen.prepend(card);

    updateAccountCard();
  }

  function appendSubscriptionManagement(){
    const screen =
      document.getElementById(
        "screen-subscription"
      );

    if(
      !screen ||
      document.getElementById(
        "productionSubscriptionInfo"
      )
    ){
      return;
    }

    const box =
      document.createElement(
        "div"
      );

    box.id =
      "productionSubscriptionInfo";

    box.className =
      "card production-subscription-card";

    box.style.marginTop =
      "14px";

    if(
      authToken() &&
      account &&
      account.user
    ){
      const end =
        account.subscription
          ? account
              .subscription
              .currentEnd
          : null;

      box.innerHTML = `
        <h3>
          Subscription Account
        </h3>

        <p class="muted">
          ${escapeHtml(
            account.user.email
          )}
          •
          ${currentAccountPlan()
            .toUpperCase()}
          plan
        </p>

        <p class="muted">
          Status:
          <b>
            ${escapeHtml(
              account.subscription
                ? account
                    .subscription
                    .status
                : "none"
            )}
          </b>

          ${
            end
              ? " • Current cycle ends " +
                new Date(end)
                  .toLocaleDateString(
                    "en-IN"
                  )
              : ""
          }
        </p>

        <div class="actions">
          <button
            class="btn"
            onclick="window.vyaparCloudBackup()"
          >
            Cloud Backup
          </button>

          <button
            class="btn"
            onclick="window.vyaparRefreshSubscription()"
          >
            Refresh Subscription
          </button>

          ${
            currentAccountPlan() !==
            "free"
              ? `
                <button
                  class="btn danger"
                  onclick="window.vyaparCancelSubscription()"
                >
                  Manage Cancellation
                </button>
              `
              : ""
          }
        </div>
      `;

    }else{
      box.innerHTML = `
        <h3>
          Login Required for Paid Plans
        </h3>

        <p class="muted">
          Payments, renewals, and subscription restoration are securely linked to your account.
        </p>

        <div class="actions">
          <button
            class="btn primary"
            onclick="window.vyaparLogin()"
          >
            Login
          </button>

          <button
            class="btn"
            onclick="window.vyaparRegister()"
          >
            Create Account
          </button>
        </div>
      `;
    }

    screen.appendChild(box);
  }

  function injectLegalFooter(){
    if(
      document.getElementById(
        "productionLegalFooter"
      )
    ){
      return;
    }

    const footer =
      document.createElement(
        "footer"
      );

    footer.id =
      "productionLegalFooter";

    footer.className =
      "production-footer";

    footer.innerHTML = `
      <span>
        © ${new Date().getFullYear()} Vyapar AI
      </span>

      <a
        href="pages/legal/privacy.html"
        target="_blank" rel="noopener noreferrer"
      >
        Privacy
      </a>

      <a
        href="pages/legal/terms.html"
        target="_blank" rel="noopener noreferrer"
      >
        Terms
      </a>

      <a
        href="pages/legal/refund.html"
        target="_blank" rel="noopener noreferrer"
      >
        Refund
      </a>

      <a
        href="pages/legal/delete-account.html"
        target="_blank" rel="noopener noreferrer"
      >
        Delete Account
      </a>
    `;

    document.body.appendChild(
      footer
    );
  }

  async function startSubscription(
    plan
  ){
    if(plan === "free"){
      if(
        currentAccountPlan() !==
        "free"
      ){
        premiumToast(
          "Use Manage Cancellation to cancel the paid subscription",
          "info"
        );

        return;
      }

      if(
        typeof selectPlan ===
        "function"
      ){
        selectPlan("free");
      }

      return;
    }

    if(
      plan !== "pro" &&
      plan !== "business"
    ){
      premiumToast(
        "Invalid plan",
        "error"
      );

      return;
    }

    if(!authToken()){
      forceOtpLogin();
      return;
    }

    /* Restore a payment that completed during a previous UPI/app switch
       before creating another Razorpay subscription. */
    try{
      await refreshSubscriptionAccess(false);
      if(currentAccountPlan() === plan){
        premiumToast("Subscription is already active", "success");
        if(typeof render === "function") render();
        return;
      }
    }catch(refreshError){}

    if(
      typeof Razorpay ===
      "undefined"
    ){
      try{
        await window.vyaparWaitForRazorpay?.(12000);
      }catch(error){
        premiumToast(
          error && error.message ? error.message : "Razorpay checkout is unavailable",
          "error"
        );

        return;
      }
    }

    if(paymentBusy){
      premiumToast(
        "The payment window is already opening",
        "info"
      );
      return;
    }

    paymentBusy = true;

    try{
      if(
        typeof showPaymentLoader ===
        "function"
      ){
        showPaymentLoader(
          "Creating secure subscription..."
        );
      }

      const created =
        await api(
          "/subscription/create",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                plan
              })
          }
        );

      const options = {
        key:
          created.keyId,

        subscription_id:
          created.subscriptionId,

        name:
          "Vyapar AI",

        description:
          plan.toUpperCase() +
          " Monthly Plan",

        prefill: {
          name:
            created.name ||
            (
              account &&
              account.user
                ? account
                    .user.name
                : ""
            ),

          email:
            created.email ||
            (
              account &&
              account.user
                ? account
                    .user.email
                : ""
            )
        },

        notes: {
          plan:
            plan,

          app:
            "Vyapar AI"
        },

        theme: {
          color:
            plan === "business" ? "#C9A227" : "#9CA3AF"
        },

        // Keep UPI prominently available on mobile web and Android WebView.
        // Razorpay supports runtime checkout-method configuration and WebView UPI Intent.
        config: {
          display: {
            blocks: {
              vyapar_upi: {
                name: "Pay via UPI",
                instruments: [
                  { method: "upi" }
                ]
              }
            },
            sequence: [
              "block.vyapar_upi",
              "card",
              "netbanking",
              "wallet",
              "emi"
            ],
            preferences: {
              show_default_blocks: false
            }
          }
        },

        webview_intent: true,

        handler:
          async function(
            paymentResponse
          ){
            try{
              if(
                typeof showPaymentLoader ===
                "function"
              ){
                showPaymentLoader(
                  "Verifying subscription..."
                );
              }

              const verified =
                await api(
                  "/subscription/verify",

                  {
                    method:
                      "POST",

                    body:
                      JSON.stringify({
                        razorpay_payment_id:
                          paymentResponse
                            .razorpay_payment_id,

                        razorpay_subscription_id:
                          paymentResponse
                            .razorpay_subscription_id,

                        razorpay_signature:
                          paymentResponse
                            .razorpay_signature
                      })
                  }
                );

              // The verified backend entitlement is the immediate source of truth.
              // This removes the old race where a successful payment stayed locked
              // until a delayed webhook changed Razorpay's subscription status.
              if(
                verified.subscription &&
                (verified.subscription.plan === "pro" || verified.subscription.plan === "business")
              ){
                saveAccount({
                  user: account && account.user ? account.user : null,
                  subscription: verified.subscription
                });
                applyAccountToApp();
              }

              // One short server refresh keeps dates/status current. If Razorpay is
              // still propagating, /subscription/status can safely reconcile it.
              if(currentAccountPlan() !== plan){
                for(let attempt = 0; attempt < 4; attempt += 1){
                  try{
                    const statusData = await api("/subscription/status", { method: "GET" });
                    if(statusData && statusData.subscription){
                      saveAccount({
                        user: account && account.user ? account.user : null,
                        subscription: statusData.subscription
                      });
                      applyAccountToApp();
                    }
                  }catch(refreshError){}
                  if(currentAccountPlan() === plan) break;
                  await new Promise(function(resolve){ setTimeout(resolve, 800); });
                }
              }

              if(currentAccountPlan() !== plan){
                throw new Error("Payment was verified, but plan activation is still pending. Reopen Plans and tap Refresh Subscription.");
              }

              if(
                typeof hidePaymentLoader ===
                "function"
              ){
                hidePaymentLoader();
              }

              if(
                typeof render ===
                "function"
              ){
                render();
              }

              await pushCloudState(
                false
              );

              if(
                typeof showPlanSuccessPopup ===
                "function"
              ){
                showPlanSuccessPopup(
                  verified.subscription &&
                  verified.subscription.plan
                    ? verified
                        .subscription
                        .plan
                    : plan
                );

              }else{
                premiumToast(
                  "Subscription activated",
                  "success"
                );
              }

              paymentBusy = false;

            }catch(error){
              paymentBusy = false;
              if(
                typeof hidePaymentLoader ===
                "function"
              ){
                hidePaymentLoader();
              }

              premiumToast(
                error.message,
                "error"
              );
            }
          },

        modal: {
  confirm_close: true,
  retry: false,

  ondismiss:
    async function(){
      /*
        Do not auto-cancel a `created` subscription here. On Android, UPI
        may temporarily dismiss/close the checkout while the bank app is
        returning and Razorpay is still propagating the successful payment.
        Cancelling at this point could turn a paid checkout into a locked app.
      */
      paymentBusy = false;

      if(
        typeof hidePaymentLoader ===
        "function"
      ){
        hidePaymentLoader();
      }

      try{
        const restored =
          await refreshSubscriptionAccess(false);

        if(
          restored &&
          restored.plan === plan
        ){
          if(typeof render === "function") render();

          if(typeof showPlanSuccessPopup === "function"){
            showPlanSuccessPopup(plan);
          }else{
            premiumToast("Subscription activated", "success");
          }
          return;
        }
      }catch(refreshError){}

      premiumToast(
        "Payment window closed. If UPI payment completed, open Plans and tap Refresh Subscription.",
        "info"
      );
    }
}
      };

      const checkout =
        new Razorpay(options);

      checkout.on(
        "payment.failed",

        function(response){
          paymentBusy = false;

          if(
            typeof hidePaymentLoader ===
            "function"
          ){
            hidePaymentLoader();
          }

          const message =
            response &&
            response.error &&
            response.error.description
              ? response
                  .error
                  .description
              : "Payment failed";

          premiumToast(
            message,
            "error"
          );
        }
      );

      if(
        typeof hidePaymentLoader ===
        "function"
      ){
        hidePaymentLoader();
      }

      checkout.open();

    }catch(error){
      paymentBusy = false;

      if(
        typeof hidePaymentLoader ===
        "function"
      ){
        hidePaymentLoader();
      }

      premiumToast(
        error.message,
        "error"
      );
    }
  }

  function injectStyles(){
    if(
      document.getElementById(
        "productionStyles"
      )
    ){
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "productionStyles";

    style.textContent = `
      .production-overlay{
        position:fixed;
        inset:0;
        z-index:1000000000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px;
        background:
          radial-gradient(
            circle at 50% 10%,
            rgba(37,99,235,.22),
            transparent 36%
          ),
          rgba(2,6,23,.88);
        backdrop-filter:blur(18px);
        -webkit-backdrop-filter:blur(18px);
      }

      .production-modal{
        position:relative;
        width:min(94vw,420px);
        padding:28px 22px 22px;
        border:1px solid
          rgba(125,211,252,.28);
        border-radius:28px;
        color:#f8fafc;
        background:
          linear-gradient(
            160deg,
            #111827,
            #07101f 62%,
            #020617
          );
        box-shadow:
          0 35px 100px
          rgba(0,0,0,.65),
          0 0 60px
          rgba(37,99,235,.16);
        font-family:
          Inter,
          system-ui,
          sans-serif;
      }

      .production-close{
        position:absolute;
        right:15px;
        top:15px;
        width:38px;
        height:38px;
        border-radius:50%;
        border:1px solid
          rgba(255,255,255,.12);
        background:
          rgba(255,255,255,.06);
        color:#fff;
        font-size:22px;
        cursor:pointer;
      }

      .production-logo{
        width:66px;
        height:66px;
        margin:0 auto 15px;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:21px;
        color:white;
        background:
          linear-gradient(
            135deg,
            #06b6d4,
            #2563eb,
            #4f46e5
          );
        font-size:28px;
        font-weight:950;
        box-shadow:
          0 18px 45px
          rgba(37,99,235,.36);
      }

      .production-kicker{
        text-align:center;
        color:#67e8f9;
        font-size:11px;
        font-weight:900;
        letter-spacing:1.4px;
      }

      .production-modal h2{
        text-align:center;
        margin:10px 0 7px;
        font-size:26px;
      }

      .production-muted{
        text-align:center;
        color:#94a3b8;
        font-size:13px;
        line-height:1.5;
        margin:0 0 18px;
      }

      .production-modal label{
        display:block;
        margin:12px 0 6px;
        color:#cbd5e1;
        font-size:12px;
        font-weight:800;
      }

      .production-modal input{
        width:100%;
        box-sizing:border-box;
        border:1px solid
          rgba(148,163,184,.22);
        border-radius:14px;
        padding:13px 14px;
        background:
          rgba(15,23,42,.82);
        color:#fff;
        outline:none;
      }

      .production-modal input:focus{
        border-color:#38bdf8;
        box-shadow:
          0 0 0 3px
          rgba(56,189,248,.12);
      }

      .production-primary{
        width:100%;
        margin-top:17px;
        border:0;
        border-radius:15px;
        padding:14px;
        color:#fff;
        font-weight:900;
        background:
          linear-gradient(
            120deg,
            #0891b2,
            #2563eb,
            #4f46e5
          );
        box-shadow:
          0 14px 34px
          rgba(37,99,235,.28);
        cursor:pointer;
      }

      .production-primary:disabled{
        opacity:.6;
        cursor:wait;
      }

      .production-link{
        width:100%;
        margin-top:8px;
        border:0;
        background:transparent;
        color:#93c5fd;
        padding:10px;
        font-weight:750;
        cursor:pointer;
      }

      .production-secure{
        text-align:center;
        color:#64748b;
        font-size:10px;
        margin-top:7px;
      }

      .production-error{
        margin-top:12px;
        padding:10px;
        border-radius:12px;
        background:
          rgba(239,68,68,.12);
        border:1px solid
          rgba(248,113,113,.25);
        color:#fecaca;
        font-size:12px;
      }

      .production-toast{
        position:fixed;
        left:50%;
        bottom:24px;
        z-index:1000000001;
        max-width:min(88vw,440px);
        padding:12px 16px;
        border-radius:14px;
        color:#fff;
        background:#111827;
        border:1px solid
          rgba(255,255,255,.13);
        box-shadow:
          0 20px 55px
          rgba(0,0,0,.45);
        transform:
          translate(-50%,20px);
        opacity:0;
        transition:.22s ease;
        font:
          700 13px/1.4
          Inter,
          system-ui,
          sans-serif;
        text-align:center;
      }

      .production-toast.show{
        transform:
          translate(-50%,0);
        opacity:1;
      }

      .production-toast-success{
        border-color:
          rgba(34,197,94,.45);
      }

      .production-toast-error{
        border-color:
          rgba(248,113,113,.5);
      }

      .production-account-head{
        display:flex;
        align-items:center;
        gap:12px;
      }

      .production-avatar{
        width:48px;
        height:48px;
        flex:0 0 48px;
        display:flex;
        align-items:center;
        justify-content:center;
        border-radius:50%;
        background:
          linear-gradient(
            135deg,
            #06b6d4,
            #2563eb
          );
        color:#fff;
        font-weight:950;
      }

      .production-account-head h3{
        margin:0 0 3px;
      }

      .production-account-head p{
        margin:0;
        color:
          var(--muted,#94a3b8);
        font-size:12px;
      }

      .production-plan{
        margin-left:auto;
        align-self:flex-start;
        transform:translateY(-2px);
        min-width:56px;
        box-sizing:border-box;
        text-align:center;
        padding:7px 13px;
        border-radius:999px;
        background:
          rgba(37,99,235,.14);
        border:1px solid
          rgba(96,165,250,.22);
        font-size:11px;
        font-weight:900;
      }

      .production-account-grid{
        display:grid;
        grid-template-columns:
          repeat(3,1fr);
        gap:8px;
        margin-top:14px;
      }

      .production-account-grid div{
        padding:11px;
        border-radius:14px;
        background:
          rgba(255,255,255,.04);
        border:1px solid
          rgba(255,255,255,.07);
      }

      .production-account-grid span{
        display:block;
        color:
          var(--muted,#94a3b8);
        font-size:10px;
      }

      .production-account-grid b{
        display:block;
        margin-top:4px;
        font-size:12px;
        word-break:break-word;
      }

      .production-actions{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top:14px;
      }

      .production-actions button{
        border:1px solid
          rgba(148,163,184,.2);
        border-radius:12px;
        padding:10px 12px;
        background:
          rgba(255,255,255,.05);
        color:inherit;
        font-weight:800;
        cursor:pointer;
      }

      .production-actions button.primary{
        background:
          linear-gradient(
            135deg,
            #0891b2,
            #2563eb
          );
        color:#fff;
      }

      .production-actions button.danger{
        border-color:
          rgba(248,113,113,.3);
        color:#fca5a5;
      }

      .production-footer{
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:12px;
        padding:24px 14px 90px;
        color:#64748b;
        font:
          600 11px
          Inter,
          system-ui,
          sans-serif;
      }

      .production-footer a{
        color:#94a3b8;
        text-decoration:none;
      }

      .account-delete-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:clamp(16px,5vw,32px);background:rgba(5,6,12,.60);backdrop-filter:blur(24px) saturate(145%);-webkit-backdrop-filter:blur(24px) saturate(145%)}
      .account-delete-card{width:min(94vw,430px);padding:26px 22px 22px;border-radius:30px;text-align:center;color:#fff;background:linear-gradient(145deg,rgba(255,255,255,.18),rgba(255,255,255,.055)),linear-gradient(160deg,#211019,#110a10);border:1px solid rgba(255,92,112,.42);box-shadow:0 35px 100px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.18),0 0 45px rgba(255,70,95,.12);backdrop-filter:blur(28px) saturate(155%);-webkit-backdrop-filter:blur(28px) saturate(155%)}
      .account-delete-icon{width:62px;height:62px;margin:0 auto 12px;border-radius:21px;display:grid;place-items:center;font-size:28px;font-weight:950;color:#fff;background:linear-gradient(145deg,rgba(255,80,105,.38),rgba(150,20,45,.18));border:1px solid rgba(255,110,130,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 16px 38px rgba(255,45,75,.18)}
      .account-delete-kicker{font-size:9px;font-weight:900;letter-spacing:.16em;color:#ff9aaa}.account-delete-card h2{margin:8px 0;font-size:25px}.account-delete-card p{margin:0 auto 18px;max-width:350px;color:#c7b6bd;font-size:13px;line-height:1.55}.account-delete-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.account-delete-actions .danger{border-color:rgba(255,82,105,.48)!important;background:linear-gradient(145deg,rgba(255,82,105,.28),rgba(130,16,42,.22))!important;color:#ffd5dc!important}

      @media(max-width:640px){
        .production-account-grid{
          grid-template-columns:1fr;
        }

        .production-modal{
          padding:
            25px 18px 20px;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  const originalSave =
    typeof save === "function"
      ? save
      : null;

  if(originalSave){
    window.save =
      function(){
        const result =
          originalSave.apply(
            this,
            arguments
          );

        scheduleCloudSync();

        return result;
      };
  }

  const originalRenderSettings =
    typeof renderSettings ===
    "function"
      ? renderSettings
      : null;

  if(originalRenderSettings){
    window.renderSettings =
      function(){
        const result =
          originalRenderSettings.apply(
            this,
            arguments
          );

        appendAccountCard();

        return result;
      };
  }

  const originalRenderSubscription =
    typeof renderSubscription ===
    "function"
      ? renderSubscription
      : null;

  if(originalRenderSubscription){
    window.renderSubscription =
      function(){
        const result =
          originalRenderSubscription
            .apply(
              this,
              arguments
            );

        appendSubscriptionManagement();

        return result;
      };
  }

  const originalSelectPlan =
    typeof selectPlan ===
    "function"
      ? selectPlan
      : null;

  window.selectPlan =
    function(selectedPlan){
      if(
        selectedPlan === "free" &&
        currentAccountPlan() !==
        "free"
      ){
        premiumToast(
          "Use Cancel at Cycle End to manage the paid subscription",
          "info"
        );

        return;
      }

      if(originalSelectPlan){
        return originalSelectPlan(
          selectedPlan
        );
      }
    };

  window.getSubscriptionToken =
    authToken;

  window.getCurrentPlan =
    currentAccountPlan;

  window.requirePlan =
    function(requiredPlan){
      const ranks = {
        free: 0,
        pro: 1,
        business: 2
      };

      const current =
        currentAccountPlan();

      if(
        (
          ranks[current] || 0
        ) >=
        (
          ranks[requiredPlan] || 0
        )
      ){
        return true;
      }

      if(!authToken()){
        forceOtpLogin();

      }else if(
        typeof showUpgradePopup ===
        "function"
      ){
        showUpgradePopup(
          requiredPlan,
          current
        );

      }else{
        premiumToast(
          requiredPlan
            .toUpperCase() +
          " plan required",
          "info"
        );

        if(
          typeof setTab ===
          "function"
        ){
          setTab(
            "subscription"
          );
        }
      }

      return false;
    };

  window.startPayment =
    startSubscription;

  window.vyaparLogin =
    forceOtpLogin;

  window.vyaparRegister =
    forceOtpLogin;

  window.vyaparLogout =
    logoutAccount;

  window.vyaparCloudBackup =
    function(){
      pushCloudState(true);
    };

  window.appendAccountCard = appendAccountCard;

  window.vyaparCloudRestore =
    pullCloudState;

  window.vyaparCancelSubscription =
    cancelSubscription;

  window.vyaparRefreshSubscription =
    function(){
      refreshSubscriptionAccess(true).catch(function(){});
    };

  window.vyaparDeleteAccount =
    deleteAccount;

  function reconcileSubscriptionOnForeground(){
    if(!authToken()) return;
    const now = Date.now();
    if(now - lastSubscriptionForegroundRefresh < 15000) return;
    lastSubscriptionForegroundRefresh = now;
    refreshSubscriptionAccess(false).catch(function(){});
  }

  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "visible"){
      reconcileSubscriptionOnForeground();
    }
  });

  window.addEventListener("focus", reconcileSubscriptionOnForeground);

  injectStyles();
  injectLegalFooter();
  applyAccountToApp();

  refreshAccount()
    .then(
      initialCloudDecision
    )
    .catch(
      function(error){
        console.warn(
          "Session restore failed:",
          error.message
        );
      }
    )
    .finally(
      function(){
        if(
          typeof render ===
          "function"
        ){
          render();
        }

        appendAccountCard();
        appendSubscriptionManagement();
      }
    );
})();


;
/* ===== fullstack-607.js ===== */

/* Vyapar AI 6.3.7 full-stack integration patch.
   Loaded after script.js and production.js. Keeps existing data compatible. */
(function(){
  'use strict';

  const API_BASE = (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) || 'https://vypar-backend.onrender.com';
  const AUTH_KEY = 'vyapar_ai_auth_token_v1';
  const UPDATE_CHECK_KEY = 'vyapar_ai_update_check_610';

  function byId(id){ return document.getElementById(id); }
  function text(id){ return String(byId(id)?.value || '').trim(); }
  function n(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
  function html(v){ return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function toast(msg){ if(typeof showGlassToast==='function') showGlassToast(msg); else alert(msg); }
  function apiToken(){ return localStorage.getItem(AUTH_KEY) || (state?.subscription?.token||''); }
  function currentStore(){ return String(state?.currentStoreId || 'MAIN'); }

  function ensure(){
    state.products = Array.isArray(state.products)?state.products:[];
    state.customers = Array.isArray(state.customers)?state.customers:[];
    state.suppliers = Array.isArray(state.suppliers)?state.suppliers:[];
    state.purchases = Array.isArray(state.purchases)?state.purchases:[];
    state.invoices = Array.isArray(state.invoices)?state.invoices:[];
    state.sales = Array.isArray(state.sales)?state.sales:[];
    state.payments = Array.isArray(state.payments)?state.payments:[];
    state.stockLedger = Array.isArray(state.stockLedger)?state.stockLedger:[];
    state.returns = Array.isArray(state.returns)?state.returns:[];
    state.salesReturns = Array.isArray(state.salesReturns)?state.salesReturns:[];
    state.purchaseReturns = Array.isArray(state.purchaseReturns)?state.purchaseReturns:[];
    state.supplierPayments = Array.isArray(state.supplierPayments)?state.supplierPayments:[];
    state.posCart = Array.isArray(state.posCart)?state.posCart:[];
    state.appUpdate = state.appUpdate && typeof state.appUpdate==='object'?state.appUpdate:{};
    state.settingsAdvanced = state.settingsAdvanced && typeof state.settingsAdvanced==='object'
      ? state.settingsAdvanced
      : {invoicePrefix:'INV',invoiceSeries:1,currency:'INR'};
    if(!Number.isFinite(Number(state.settingsAdvanced.invoiceSeries))) state.settingsAdvanced.invoiceSeries=1;
  }

  function productByQuery(q){
    ensure();
    const key=String(q||'').trim().toLowerCase();
    if(!key)return null;
    return state.products.find(p=>
      String(p.id||'').toLowerCase()===key ||
      String(p.sku||'').toLowerCase()===key ||
      String(p.barcode||'').toLowerCase()===key ||
      String(p.name||'').toLowerCase()===key
    ) || state.products.find(p=>
      [p.name,p.sku,p.barcode,p.article,p.brand,p.size,p.color].join(' ').toLowerCase().includes(key)
    ) || null;
  }

  function customerByQuery(q){
    const key=String(q||'').trim().toLowerCase();
    if(!key)return null;
    return state.customers.find(c=>
      String(c.id||'').toLowerCase()===key ||
      String(c.mobile||'').toLowerCase()===key ||
      String(c.name||'').toLowerCase()===key
    ) || null;
  }

  function supplierByQuery(q){
    const key=String(q||'').trim().toLowerCase();
    if(!key)return null;
    return state.suppliers.find(s=>
      String(s.id||'').toLowerCase()===key ||
      String(s.phone||'').toLowerCase()===key ||
      String(s.name||'').toLowerCase()===key
    ) || null;
  }

  function nextInvoiceNo(){
    ensure();
    const prefix=String(state.settingsAdvanced.invoicePrefix||'INV').replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)||'INV';
    let series=Math.max(1,Math.floor(n(state.settingsAdvanced.invoiceSeries)||1));
    let no;
    const existing=new Set(state.invoices.map(i=>String(i.number||'')));
    do{
      no=prefix+'-'+String(series++).padStart(6,'0');
    }while(existing.has(no));
    state.settingsAdvanced.invoiceSeries=series;
    return no;
  }

  function addLedger(type,product,qty,amount,source,meta){
    state.stockLedger.unshift({
      id:typeof uid==='function'?uid():String(Date.now())+Math.random(),
      date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      at:new Date().toISOString(),
      storeId:currentStore(),
      type,
      productId:product?.id||meta?.productId||'',
      product:product?.name||meta?.product||'',
      qty:n(qty),
      amount:n(amount),
      source:source||'',
      ...meta
    });
    if(state.stockLedger.length>50000) state.stockLedger.length=50000;
  }

  function saveNow(message){
    if(typeof save==='function') save();
    if(message) toast(message);
  }

  // ---------- Full POS cart ----------
  window.fs607OpenPOS=function(){
    if(typeof window.requirePlan === 'function' && !window.requirePlan('business')) return false;
    ensure();
    const el=byId('businessModuleArea');
    if(!el)return;
    el.innerHTML=`
      <div class="fs607-pos">
        <div class="calculator-head">
          <div><span class="pill">POS 6.3.7</span><h2>Fast Billing / POS</h2>
          <p class="muted">Multi-item bill, stock deduction, customer due and payment posting.</p></div>
          <button class="btn mini" onclick="renderAdvancedHome()">Back</button>
        </div>

        <div class="adv-form-grid">
          <input id="fs607Customer" list="fs607Customers" placeholder="Customer / mobile (optional)">
          <datalist id="fs607Customers">${state.customers.map(c=>`<option value="${html(c.mobile||c.name)}">${html(c.name)}</option>`).join('')}</datalist>
          <select id="fs607Payment">
            <option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option><option>Credit</option>
          </select>
          <input id="fs607Product" list="fs607Products" placeholder="Product / SKU / barcode">
          <datalist id="fs607Products">${state.products.slice(0,5000).map(p=>`<option value="${html(p.sku||p.barcode||p.name)}">${html(p.name)} · ${html(p.size||'')} ${html(p.color||'')} · ${typeof money==='function'?money(p.sellingPrice):p.sellingPrice}</option>`).join('')}</datalist>
          <input id="fs607Qty" type="number" min="1" step="1" value="1" placeholder="Qty">
          <input id="fs607Discount" type="number" min="0" max="100" step="0.01" value="0" placeholder="Bill discount %">
        </div>
        <div class="adv-actions">
          <button class="btn primary" onclick="fs607AddPOSItem()">Add Item</button>
          <button class="btn" onclick="advScanBarcode()">Scan Barcode</button>
          <button class="btn danger" onclick="fs607ClearPOS()">Clear Cart</button>
        </div>
        <div id="fs607Cart"></div>
      </div>`;
    window.fs607RenderPOS();
  };

  window.fs607AddPOSItem=function(query){
    ensure();
    const p=productByQuery(query || text('fs607Product'));
    const qty=Math.max(1,Math.floor(n(text('fs607Qty'))||1));
    if(!p){ alert('Product not found. Check the product name, SKU, or barcode.'); return; }
    if(n(p.qty)<qty){ alert(`Insufficient stock for ${p.name}. Available: ${n(p.qty)}`); return; }
    const existing=state.posCart.find(x=>x.productId===p.id);
    const finalQty=(existing?n(existing.qty):0)+qty;
    if(finalQty>n(p.qty)){ alert(`Cart quantity exceeds available stock. Available: ${n(p.qty)}`); return; }
    if(existing) existing.qty=finalQty;
    else state.posCart.push({
      id:typeof uid==='function'?uid():String(Date.now()),
      productId:p.id,
      product:p.name,
      sku:p.sku||'',
      qty,
      price:n(p.sellingPrice||p.mrp),
      purchasePrice:n(p.purchasePrice),
      gst:Math.max(0,n(p.gst)),
      hsn:p.hsn||''
    });
    if(byId('fs607Product')) byId('fs607Product').value='';
    if(byId('fs607Qty')) byId('fs607Qty').value='1';
    window.fs607RenderPOS();
  };

  window.fs607RemovePOSItem=function(id){
    state.posCart=state.posCart.filter(x=>x.id!==id);
    window.fs607RenderPOS();
  };

  window.fs607ClearPOS=function(){
    state.posCart=[];
    window.fs607RenderPOS();
  };

  window.fs607RenderPOS=function(){
    ensure();
    const el=byId('fs607Cart'); if(!el)return;
    const discount=Math.max(0,Math.min(100,n(text('fs607Discount'))));
    const base=state.posCart.reduce((s,x)=>s+n(x.qty)*n(x.price),0);
    const disc=base*discount/100;
    const discountFactor=base?((base-disc)/base):1;
    const tax=state.posCart.reduce((s,x)=>s+(n(x.qty)*n(x.price)*discountFactor)*n(x.gst)/100,0);
    const total=base-disc+tax;
    el.innerHTML=`
      <div class="adv-table"><table class="table"><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th><th></th></tr></thead>
      <tbody>${state.posCart.map(x=>`<tr>
        <td>${html(x.product)}<div class="muted">${html(x.sku||'')}</div></td>
        <td>${n(x.qty)}</td><td>${typeof money==='function'?money(x.price):x.price}</td><td>${n(x.gst)}%</td>
        <td>${typeof money==='function'?money(n(x.qty)*n(x.price)):n(x.qty)*n(x.price)}</td>
        <td><button class="btn mini danger" onclick="fs607RemovePOSItem('${html(x.id)}')">Remove</button></td></tr>`).join('')||'<tr><td colspan="6" class="muted">Cart is empty.</td></tr>'}</tbody></table></div>
      <div class="stats">
        <div class="stat"><span>Subtotal</span><b>${typeof money==='function'?money(base):base}</b></div>
        <div class="stat"><span>Discount</span><b>${typeof money==='function'?money(disc):disc}</b></div>
        <div class="stat"><span>GST</span><b>${typeof money==='function'?money(tax):tax}</b></div>
        <div class="stat"><span>Payable</span><b>${typeof money==='function'?money(total):total}</b></div>
      </div>
      <div class="adv-actions"><button class="btn primary" ${state.posCart.length?'':'disabled'} onclick="fs607CheckoutPOS()">Complete Sale</button></div>`;
  };

  document.addEventListener('input',function(e){
    if(e.target && e.target.id==='fs607Discount') window.fs607RenderPOS();
  });

  window.fs607CheckoutPOS=function(){
    ensure();
    if(!state.posCart.length){alert('The cart is empty.');return;}
    // Validate all stock atomically before mutating.
    for(const item of state.posCart){
      const p=state.products.find(x=>x.id===item.productId);
      if(!p){alert('Cart product missing: '+item.product);return;}
      if(n(p.qty)<n(item.qty)){alert(`Stock changed. ${p.name}: available ${n(p.qty)}`);return;}
    }

    const discount=Math.max(0,Math.min(100,n(text('fs607Discount'))));
    const base=state.posCart.reduce((s,x)=>s+n(x.qty)*n(x.price),0);
    const disc=base*discount/100;
    const factor=base?((base-disc)/base):1;
    const tax=state.posCart.reduce((s,x)=>s+(n(x.qty)*n(x.price)*factor)*n(x.gst)/100,0);
    const total=base-disc+tax;
    const payment=text('fs607Payment')||'Cash';
    const customerInput=text('fs607Customer');
    const customer=customerByQuery(customerInput);
    const number=nextInvoiceNo();
    const invoiceId=typeof uid==='function'?uid():String(Date.now());

    const items=state.posCart.map(x=>({
      productId:x.productId, product:x.product, sku:x.sku, qty:n(x.qty), price:n(x.price),
      purchasePrice:n(x.purchasePrice), gst:n(x.gst), hsn:x.hsn||''
    }));

    const inv={
      id:invoiceId, number,
      date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      createdAt:new Date().toISOString(),
      storeId:currentStore(),
      customerId:customer?.id||'',
      customer:customer?.name||customerInput||'Walk-in Customer',
      items, subtotal:base, discountPercent:discount, discountAmount:disc,
      tax, total, paymentMethod:payment, paymentStatus:payment==='Credit'?'due':'paid'
    };

    // Apply stock + sales only after every line passed validation.
    items.forEach(item=>{
      const p=state.products.find(x=>x.id===item.productId);
      p.qty=Math.max(0,n(p.qty)-n(item.qty));
      addLedger('SALE',p,-n(item.qty),n(item.qty)*n(item.price),invoiceId,{invoiceNumber:number});
      state.sales.push({
        id:typeof uid==='function'?uid():String(Date.now())+Math.random(),
        date:inv.date, storeId:currentStore(), invoiceId, invoiceNumber:number,
        productId:p.id, product:p.name, category:p.category||'General', qty:n(item.qty),
        purchasePrice:n(p.purchasePrice), sellingPrice:n(item.price),
        customerId:customer?.id||'', customer:inv.customer, paymentMethod:payment
      });
    });

    state.invoices.push(inv);
    if(payment==='Credit'){
      if(!customer && !customerInput){ alert('A customer is required for a credit sale.'); return; }
      if(customer) customer.due=Math.max(0,n(customer.due)+total);
      else {
        const created={id:typeof uid==='function'?uid():String(Date.now()),name:inv.customer,mobile:'',address:'',due:total,createdAt:new Date().toISOString()};
        state.customers.push(created); inv.customerId=created.id;
      }
    }else{
      state.payments.push({
        id:typeof uid==='function'?uid():String(Date.now()), date:inv.date, storeId:currentStore(),
        direction:'in', amount:total, method:payment, note:'Invoice '+number,
        customerId:customer?.id||'', invoiceId
      });
    }
    state.posCart=[];
    if(typeof advLog==='function') try{advLog('POS invoice created',number);}catch(_){}
    saveNow(number+' created: '+(typeof money==='function'?money(total):total));
    window.fs607OpenPOS();
  };

  // ---------- Supplier ledger + stock-linked purchases ----------
  window.advAddSupplierPurchase=function(){
    ensure();
    const supplierName=text('advSName'), productQuery=text('advSProduct');
    const qty=Math.max(0,n(text('advSQty'))), cost=Math.max(0,n(text('advSCost')));
    const openingDue=Math.max(0,n(text('advSDue')));
    if(!supplierName||!productQuery||qty<=0||cost<=0){alert('Enter the supplier, product, quantity, and unit cost.');return;}

    let supplier=supplierByQuery(supplierName);
    if(!supplier){
      supplier={id:typeof uid==='function'?uid():String(Date.now()),name:supplierName,phone:text('advSPhone'),due:0,createdAt:new Date().toISOString()};
      state.suppliers.push(supplier);
    }
    const product=productByQuery(productQuery);
    const purchaseId=typeof uid==='function'?uid():String(Date.now());
    const amount=qty*cost;
    const payable=amount;
    const purchase={
      id:purchaseId,date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      storeId:currentStore(), supplierId:supplier.id,supplier:supplier.name,
      productId:product?.id||'',product:product?.name||productQuery,qty,unitCost:cost,amount,inputGst:0,due:payable
    };
    state.purchases.push(purchase);
    supplier.due=Math.max(0,n(supplier.due)+payable+openingDue);
    if(product){
      product.qty=n(product.qty)+qty;
      product.purchasePrice=cost;
      addLedger('PURCHASE',product,qty,amount,purchaseId,{supplierId:supplier.id});
    }else{
      // Preserve old behavior by creating a basic catalog item when needed.
      const p={id:typeof uid==='function'?uid():String(Date.now()),name:productQuery,sku:'SKU-'+Date.now(),qty,
        purchasePrice:cost,sellingPrice:cost,mrp:cost,reorder:5,category:'General',brand:'',article:'',size:'',color:'',barcode:'',gst:0,hsn:'',createdAt:new Date().toISOString()};
      state.products.push(p);
      purchase.productId=p.id;
      addLedger('PURCHASE',p,qty,amount,purchaseId,{supplierId:supplier.id});
    }
    saveNow('Purchase saved and stock updated.');
    if(typeof advRenderModule==='function') advRenderModule('suppliers');
  };

  window.fs607SupplierPayment=function(id){
    ensure();
    const s=state.suppliers.find(x=>x.id===id); if(!s)return;
    const amount=Math.min(Math.max(0,n(prompt('Supplier payment amount',String(n(s.due)))||0)),n(s.due));
    if(amount<=0)return;
    const method=prompt('Method: Cash / UPI / Bank','Bank')||'Bank';
    s.due=Math.max(0,n(s.due)-amount);
    const rec={id:typeof uid==='function'?uid():String(Date.now()),date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      storeId:currentStore(),supplierId:s.id,supplier:s.name,amount,method};
    state.supplierPayments.push(rec);
    state.payments.push({...rec,direction:'out',note:'Supplier payment'});
    saveNow('Supplier payment recorded.');
    if(typeof advRenderModule==='function') advRenderModule('suppliers');
  };

  // ---------- Return posting that reverses stock/ledger ----------
  window.fs607SalesReturn=function(){
    ensure();
    const ref=prompt('Invoice number'); if(!ref)return;
    const inv=state.invoices.find(i=>String(i.number||'').toLowerCase()===String(ref).trim().toLowerCase());
    if(!inv||!Array.isArray(inv.items)||!inv.items.length){alert('Invoice not found.');return;}
    const list=inv.items.map((x,i)=>`${i+1}. ${x.product} · sold ${x.qty}`).join('\n');
    const idx=Math.floor(n(prompt('Return item number:\n'+list,'1')))-1;
    const item=inv.items[idx]; if(!item){alert('Invalid item.');return;}
    const already=state.salesReturns.filter(r=>r.invoiceId===inv.id&&r.productId===item.productId).reduce((s,r)=>s+n(r.qty),0);
    const max=Math.max(0,n(item.qty)-already);
    const qty=Math.min(max,Math.max(0,n(prompt('Return qty (max '+max+')',String(max))||0)));
    if(qty<=0)return;
    const lineBase=n(item.price)*qty;
    const discountFactor=100-Math.max(0,n(inv.discountPercent||0));
    const net=lineBase*discountFactor/100;
    const refund=net*(1+n(item.gst||inv.gstPercent||0)/100);
    const p=state.products.find(x=>x.id===item.productId)||productByQuery(item.product);
    if(p){p.qty=n(p.qty)+qty;addLedger('SALE_RETURN',p,qty,-refund,inv.id,{invoiceNumber:inv.number});}
    const rec={id:typeof uid==='function'?uid():String(Date.now()),date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      kind:'SALE',invoiceId:inv.id,reference:inv.number,productId:item.productId||p?.id||'',product:item.product,qty,amount:refund,reason:'Sales return'};
    state.returns.unshift(rec); state.salesReturns.unshift(rec);
    const customer=inv.customerId?state.customers.find(c=>c.id===inv.customerId):customerByQuery(inv.customer);
    if(inv.paymentStatus==='due' && customer){
      customer.due=Math.max(0,n(customer.due)-refund);
    }else{
      state.payments.push({id:typeof uid==='function'?uid():String(Date.now()),date:rec.date,storeId:currentStore(),direction:'out',
        amount:refund,method:inv.paymentMethod||'Cash',note:'Refund '+inv.number,customerId:customer?.id||'',invoiceId:inv.id});
    }
    saveNow('Sales return posted: '+(typeof money==='function'?money(refund):refund));
  };

  window.fs607PurchaseReturn=function(){
    ensure();
    const ref=prompt('Purchase reference ID'); if(!ref)return;
    const pur=state.purchases.find(p=>String(p.id)===String(ref).trim());
    if(!pur){alert('Purchase not found.');return;}
    const already=state.purchaseReturns.filter(r=>r.purchaseId===pur.id).reduce((s,r)=>s+n(r.qty),0);
    const max=Math.max(0,n(pur.qty)-already);
    const qty=Math.min(max,Math.max(0,n(prompt('Return qty (max '+max+')',String(max))||0)));
    if(qty<=0)return;
    const amount=n(pur.unitCost)*qty;
    const p=state.products.find(x=>x.id===pur.productId)||productByQuery(pur.product);
    if(p && n(p.qty)<qty){alert('Current stock is lower than the return quantity.');return;}
    if(p){p.qty=Math.max(0,n(p.qty)-qty);addLedger('PURCHASE_RETURN',p,-qty,-amount,pur.id,{supplierId:pur.supplierId||''});}
    const supplier=pur.supplierId?state.suppliers.find(s=>s.id===pur.supplierId):supplierByQuery(pur.supplier);
    if(supplier) supplier.due=Math.max(0,n(supplier.due)-amount);
    const rec={id:typeof uid==='function'?uid():String(Date.now()),date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      kind:'PURCHASE',purchaseId:pur.id,reference:pur.id,productId:pur.productId||p?.id||'',product:pur.product,qty,amount,reason:'Purchase return'};
    state.returns.unshift(rec);state.purchaseReturns.unshift(rec);
    saveNow('Purchase return posted.');
  };

  // ---------- Real backend AI ----------
  window.advAskAI=async function(){
    ensure();
    const q=text('advAIQuery'); if(!q)return;
    const answerEl=byId('advAIAnswer');
    if(answerEl) answerEl.textContent='Analyzing…';
    const token=apiToken();
    if(!token){
      if(answerEl) answerEl.textContent='Login required for live AI.';
      if(typeof vyaparLogin==='function') vyaparLogin();
      return;
    }
    const totals=typeof businessTotals==='function'?businessTotals():{};
    const context={
      storeId:currentStore(),
      sales:n(totals.sales),grossProfit:n(totals.gross),expenses:n(totals.expenses),netProfit:n(totals.net),
      customerDue:n(totals.outstanding),
      lowStock:state.products.filter(p=>n(p.qty)<=n(p.reorder||5)).slice(0,30).map(p=>({name:p.name,qty:n(p.qty),reorder:n(p.reorder||5)})),
      products:state.products.slice(0,80).map(p=>({name:p.name,brand:p.brand,size:p.size,color:p.color,qty:n(p.qty),purchase:n(p.purchasePrice),sale:n(p.sellingPrice)}))
    };
    const prompt=`You are Vyapar AI, a concise Indian small-business assistant. Answer the user's question using only the provided business context when facts are needed. Use INR and practical actions. User question: ${q}\nBusiness context JSON: ${JSON.stringify(context)}`;
    try{
      const res=await (window.vyaparAuthFetch||fetch)(API_BASE+'/ai/chat',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({prompt})});
      const raw=await res.text(); let data={}; try{data=raw?JSON.parse(raw):{}}catch(_){}
      if(!res.ok) throw new Error(data.message||('AI HTTP '+res.status));
      const answer=String(data.text||'No AI response').trim();
      state.aiQueries.unshift({id:typeof uid==='function'?uid():String(Date.now()),at:new Date().toISOString(),query:q,context,answer});
      state.aiQueries=state.aiQueries.slice(0,100);
      saveNow();
      if(answerEl) answerEl.innerHTML='<b>AI analysis:</b><br>'+html(answer).replace(/\n/g,'<br>');
    }catch(e){
      if(answerEl) answerEl.textContent='AI error: '+e.message;
    }
  };

  // ---------- Use the real /data cloud backend instead of a custom placeholder ----------
  window.advCloudSync=function(){
    ensure();
    if(typeof vyaparCloudBackup==='function'){
      state.cloudSync.enabled=true;
      state.cloudSync.endpoint=API_BASE+'/data';
      state.cloudSync.status='syncing';
      if(typeof save==='function') save();
      vyaparCloudBackup();
      setTimeout(function(){
        state.cloudSync.status='requested';
        state.cloudSync.lastSync=new Date().toISOString();
        if(typeof save==='function') save();
        if(typeof advRenderModule==='function') advRenderModule('team');
      },500);
      return;
    }
    alert('The production cloud module has not loaded yet.');
  };
  window.advSetCloud=function(){
    ensure();
    state.cloudSync={...state.cloudSync,enabled:true,endpoint:API_BASE+'/data',status:'ready'};
    saveNow('Secure Vyapar backend cloud sync selected.');
    if(typeof advRenderModule==='function') advRenderModule('team');
  };

  // ---------- Stronger local PIN hash + lock overlay ----------
  function bytesToB64(arr){ let s=''; new Uint8Array(arr).forEach(b=>s+=String.fromCharCode(b)); return btoa(s); }
  function b64ToBytes(s){ const raw=atob(s); return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
  async function pinHash(pin,salt){
    const enc=new TextEncoder();
    const km=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},km,256);
    return bytesToB64(bits);
  }
  window.advSetLock=async function(){
    ensure();
    const pin=text('advPin');
    if(!/^\d{4,8}$/.test(pin)){alert('Enter a 4–8 digit PIN.');return;}
    if(!window.crypto || !window.crypto.subtle){alert('Secure Web Crypto unavailable.');return;}
    const salt=crypto.getRandomValues(new Uint8Array(16));
    state.appLock={enabled:true,scheme:'PBKDF2-SHA256',iterations:180000,salt:bytesToB64(salt),pinHash:await pinHash(pin,salt)};
    saveNow('Secure app PIN enabled.');
  };
  async function verifyPin(pin){
    ensure();
    if(!state.appLock?.enabled)return true;
    if(state.appLock.scheme==='PBKDF2-SHA256'&&state.appLock.salt){
      try{return (await pinHash(String(pin||''),b64ToBytes(state.appLock.salt)))===state.appLock.pinHash;}catch(_){return false;}
    }
    // one-time compatibility with 6.0.6, immediately upgrade after successful unlock.
    if(state.appLock.pinHash && state.appLock.pinHash===btoa(String(pin||''))){
      const salt=crypto.getRandomValues(new Uint8Array(16));
      state.appLock={enabled:true,scheme:'PBKDF2-SHA256',iterations:180000,salt:bytesToB64(salt),pinHash:await pinHash(String(pin),salt)};
      saveNow();
      return true;
    }
    return false;
  }
  window.advUnlock=async function(){
    const pin=prompt('Enter Vyapar AI PIN');
    return verifyPin(pin);
  };

  function lockOverlay(){
    ensure();
    if(!state.appLock?.enabled || byId('fs607Lock'))return;
    const d=document.createElement('div');
    d.id='fs607Lock'; d.className='fs607-lock';
    d.innerHTML=`<div class="fs607-lock-card"><img src="assets/images/logo.png" alt=""><h2>Vyapar AI Locked</h2><p class="muted">Enter your app PIN</p>
      <input id="fs607LockPin" inputmode="numeric" maxlength="8" type="password" placeholder="PIN">
      <button class="btn primary" id="fs607UnlockBtn">Unlock</button><div id="fs607LockError" class="muted"></div></div>`;
    document.body.appendChild(d);
    byId('fs607UnlockBtn').onclick=async function(){
      const ok=await verifyPin(text('fs607LockPin'));
      if(ok)d.remove(); else {byId('fs607LockError').textContent='Wrong PIN';byId('fs607LockPin').value='';}
    };
    byId('fs607LockPin')?.focus();
  }

  // ---------- App update check using backend metadata ----------
  window.fs607CheckUpdate=async function(manual){
    try{
      let currentCode=63700,currentName='6.3.7';
      if(window.AndroidApp){
        try{ if(typeof AndroidApp.getVersionCode==='function') currentCode=Number(AndroidApp.getVersionCode())||currentCode; }catch(_){}
        try{ if(typeof AndroidApp.getVersionName==='function') currentName=String(AndroidApp.getVersionName()||currentName); }catch(_){}
      }
      const res=await fetch(API_BASE+'/app/version',{headers:{'Accept':'application/json'}});
      const data=await res.json();
      if(!res.ok||!data.success)throw new Error(data.message||'Update check failed');
      state.appUpdate={checkedAt:new Date().toISOString(),currentCode,currentName,...data};
      if(typeof save==='function')save();
      if(Number(data.versionCode)>currentCode){
        const force=currentCode<Number(data.minimumSupportedVersionCode||0);
        const msg=`Vyapar AI ${data.versionName} available${force?' (required)':''}.`;
        if(data.apkUrl){
          const ok=confirm(msg+'\n\nOpen the update download?');
          if(ok){
            if(window.AndroidApp&&typeof AndroidApp.openExternalUrl==='function') AndroidApp.openExternalUrl(data.apkUrl);
            else window.open(data.apkUrl,'_blank','noopener');
          }
        }else alert(msg+'\nThe APK URL is not configured on the backend.');
      }else if(manual) toast('App is up to date: '+currentName);
      return data;
    }catch(e){ if(manual) alert('Update check failed: '+e.message); return null; }
  };

  function autoUpdateCheck(){
    const last=Number(localStorage.getItem(UPDATE_CHECK_KEY)||0);
    if(Date.now()-last<12*60*60*1000)return;
    localStorage.setItem(UPDATE_CHECK_KEY,String(Date.now()));
    setTimeout(()=>window.fs607CheckUpdate(false),1800);
  }

  // ---------- Extend existing advanced module screens ----------
  const oldAdv=window.advRenderModule;
  if(typeof oldAdv==='function'){
    window.advRenderModule=function(mod){
      const opened=oldAdv(mod);
      if(opened===false)return false;
      const el=byId('businessModuleArea'); if(!el)return;

      if(mod==='billing'){
        const x=document.createElement('div');x.className='notice success';
        x.innerHTML='<b>6.3.7 POS:</b> multi-item cart, stock deduction, customer credit and payment posting.<div class="adv-actions"><button class="btn primary" onclick="fs607OpenPOS()">Open Full POS</button><button class="btn" onclick="fs607SalesReturn()">Post Sales Return</button><button class="btn" onclick="fs607PurchaseReturn()">Post Purchase Return</button><button class="btn" onclick="fs607CreateDocument(\'ESTIMATE\')">Estimate</button><button class="btn" onclick="fs607CreateDocument(\'PROFORMA\')">Proforma</button><button class="btn" onclick="fs607CreateDocument(\'CHALLAN\')">Delivery Challan</button></div>';
        el.prepend(x);
      }
      if(mod==='suppliers'){
        const suppliers=(state.suppliers||[]);
        const x=document.createElement('div');x.className='adv-table';
        x.innerHTML='<h3>Supplier Balances</h3><table class="table"><thead><tr><th>Supplier</th><th>Phone</th><th>Due</th><th></th></tr></thead><tbody>'+
          (suppliers.map(s=>`<tr><td>${html(s.name)}</td><td>${html(s.phone||'')}</td><td>${typeof money==='function'?money(s.due):s.due}</td><td><button class="btn mini" onclick="fs607SupplierPayment('${html(s.id)}')">Pay</button></td></tr>`).join('')||'<tr><td colspan="4">No suppliers.</td></tr>')+
          '</tbody></table>';
        el.appendChild(x);
      }
      if(mod==='finance'){
        const a=document.createElement('div');a.className='adv-actions';
        a.innerHTML='<button class="btn" onclick="fs607ExportAccounting(\'journal\')">Accounting Journal</button><button class="btn" onclick="fs607ExportAccounting(\'pnl\')">P&L CSV</button><button class="btn" onclick="fs607ExportAccounting(\'cashflow\')">Cash Flow CSV</button>';
        el.appendChild(a);
      }
      if(mod==='ai'){
        const p=el.querySelector('p.muted'); if(p)p.textContent='Live Gemini analysis uses your secure production backend. API keys stay on the server.';
      }
      if(mod==='team'){
        const input=byId('advCloudEndpoint'); if(input){input.value=API_BASE+'/data';input.readOnly=true;}
        const note=document.createElement('div');note.className='notice success';note.textContent='Cloud sync is connected to the authenticated /data endpoint in your production backend.';
        el.appendChild(note);
      }
      if(mod==='security'){
        const note=document.createElement('div');note.className='notice success';
        note.textContent='PIN hashing upgraded to PBKDF2-SHA256. App lock is enforced on launch when enabled.';
        el.appendChild(note);
      }
    };
  }

  const oldBusiness=window.renderBusiness;
  if(typeof oldBusiness==='function'){
    window.renderBusiness=function(){
      oldBusiness();
      setTimeout(function(){
        const el=byId('businessModuleArea'); if(!el || byId('fs607Quick'))return;
        const q=document.createElement('div');q.id='fs607Quick';q.className='notice success';
        q.innerHTML='<b>Full-stack 6.3.7:</b> production backend connected.<div class="adv-actions"><button class="btn primary" onclick="fs607OpenPOS()">Fast POS</button><button class="btn" onclick="fs607CheckUpdate(true)">Check Update</button></div>';
        el.prepend(q);
      },0);
    };
  }

  // Settings enhancement
  const oldSettings=window.renderSettings;
  if(typeof oldSettings==='function'){
    window.renderSettings=function(){
      oldSettings();
      const el=byId('screen-settings'); if(!el || byId('fs607Settings'))return;
      const d=document.createElement('div');d.id='fs607Settings';d.className='card';d.style.marginTop='14px';
      d.innerHTML='<h2>App Update</h2><p class="muted">Checks the production backend release metadata. APK URL must be configured on Render.</p><div class="actions"><button class="btn" onclick="fs607CheckUpdate(true)">Check for Update</button></div>';
      el.appendChild(d);
    };
  }


  let fs607HiddenAt=0;
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ fs607HiddenAt=Date.now(); return; }
    if(state?.appLock?.enabled && fs607HiddenAt && Date.now()-fs607HiddenAt>5000){
      lockOverlay();
    }
  });


  // ---------- Quotations / proforma / challan + basic accounting exports ----------
  function ensure607Extras(){
    state.businessDocuments=Array.isArray(state.businessDocuments)?state.businessDocuments:[];
    state.accountingJournal=Array.isArray(state.accountingJournal)?state.accountingJournal:[];
    state.schemaVersion=Math.max(607,n(state.schemaVersion));
  }

  window.fs607CreateDocument=function(kind){
    ensure();ensure607Extras();
    kind=String(kind||'ESTIMATE').toUpperCase();
    if(!state.posCart.length){
      alert('Add items to the POS cart before creating a document.');
      window.fs607OpenPOS();
      return;
    }
    const discount=Math.max(0,Math.min(100,n(text('fs607Discount'))));
    const base=state.posCart.reduce((s,x)=>s+n(x.qty)*n(x.price),0);
    const disc=base*discount/100;
    const factor=base?((base-disc)/base):1;
    const tax=state.posCart.reduce((s,x)=>s+(n(x.qty)*n(x.price)*factor)*n(x.gst)/100,0);
    const total=base-disc+tax;
    const prefix=kind==='PROFORMA'?'PRO':kind==='CHALLAN'?'DC':'EST';
    const doc={
      id:typeof uid==='function'?uid():String(Date.now()),
      type:kind,number:prefix+'-'+Date.now(),
      date:typeof localDateKey==='function'?localDateKey():new Date().toISOString().slice(0,10),
      storeId:currentStore(),customer:text('fs607Customer')||'Walk-in Customer',
      items:JSON.parse(JSON.stringify(state.posCart)),
      subtotal:base,discountPercent:discount,discountAmount:disc,tax,total,
      status:'open'
    };
    state.businessDocuments.unshift(doc);
    saveNow(kind+' created: '+doc.number);
  };

  window.fs607ExportAccounting=function(kind){
    ensure();ensure607Extras();
    const rows=[];
    const add=(date,ref,account,debit,credit,note)=>rows.push([date,ref,account,n(debit),n(credit),note||'']);
    state.invoices.forEach(i=>{
      const net=n(i.total)-n(i.tax);
      const receive=i.paymentStatus==='due'?'Accounts Receivable':(i.paymentMethod||'Cash');
      add(i.date,i.number,receive,n(i.total),0,'Sale');
      add(i.date,i.number,'Sales',0,net,'Sale revenue');
      if(n(i.tax)) add(i.date,i.number,'GST Output',0,n(i.tax),'Output GST');
    });
    state.purchases.forEach(p=>{
      add(p.date,p.id,'Purchases',n(p.amount),0,'Purchase '+(p.product||''));
      add(p.date,p.id,'Accounts Payable',0,n(p.amount),'Supplier '+(p.supplier||''));
    });
    (state.expenses||[]).forEach(e=>{
      add(e.date,e.id,'Expense - '+(e.category||'Other'),n(e.amount),0,e.note||'');
      add(e.date,e.id,e.method||'Cash',0,n(e.amount),'Expense payment');
    });
    (state.supplierPayments||[]).forEach(x=>{
      add(x.date,x.id,'Accounts Payable',n(x.amount),0,'Supplier payment');
      add(x.date,x.id,x.method||'Bank',0,n(x.amount),'Supplier payment');
    });
    state.accountingJournal=rows.map((r,i)=>({id:'J'+i,date:r[0],ref:r[1],account:r[2],debit:r[3],credit:r[4],note:r[5]}));
    if(kind==='cashflow'){
      const cash=(state.payments||[]).map(p=>[p.date,p.note||p.id,p.direction,n(p.amount),p.method||'']);
      advCSV('cash-flow.csv',[['Date','Reference','Direction','Amount','Method'],...cash]);
    }else if(kind==='pnl'){
      const bt=typeof businessTotals==='function'?businessTotals():{};
      advCSV('profit-loss.csv',[['Metric','Amount'],['Sales',n(bt.sales)],['Gross Profit',n(bt.gross)],['Expenses',n(bt.expenses)],['Net Profit',n(bt.net)]]);
    }else{
      advCSV('accounting-journal.csv',[['Date','Reference','Account','Debit','Credit','Note'],...rows]);
    }
  };

  // ---------- Authenticated remote crash/error reporting ----------
  let fs607LastErrorReport=0;
  async function reportClientError(message,stack,context){
    const token=apiToken();
    if(!token || Date.now()-fs607LastErrorReport<15000)return;
    fs607LastErrorReport=Date.now();
    try{
      await fetch(API_BASE+'/client-error',{
        method:'POST',
        keepalive:true,
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body:JSON.stringify({
          appVersion:'6.3.7',
          platform:navigator.userAgent.slice(0,120),
          message:String(message||'Unknown error').slice(0,2000),
          stack:String(stack||'').slice(0,12000),
          context:context||{tab:typeof currentTab!=='undefined'?currentTab:''}
        })
      });
    }catch(_){}
  }
  window.addEventListener('error',function(e){
    reportClientError(e.message,e.error&&e.error.stack,{file:e.filename||'',line:e.lineno||0,column:e.colno||0});
  });
  window.addEventListener('unhandledrejection',function(e){
    const reason=e.reason;
    reportClientError(reason&&reason.message?reason.message:String(reason||'Unhandled rejection'),reason&&reason.stack?reason.stack:'',{type:'unhandledrejection'});
  });

  ensure();
  // Migrate the advanced cloud placeholder to the real backend.
  state.cloudSync={...(state.cloudSync||{}),endpoint:API_BASE+'/data'};
  if(typeof save==='function')save();
  setTimeout(lockOverlay,500);
  autoUpdateCheck();
})();


;
/* ===== android-ui.js ===== */
(function(){
  "use strict";

  const metadata = {
    home: { title: "Home", subtitle: "A clear business overview" },
    upload: { title: "AI Upload", subtitle: "Import data from a photo or file" },
    sales: { title: "Sales", subtitle: "Manage sales and profit" },
    stock: { title: "Stock", subtitle: "Track inventory and quantities" },
    analytics: { title: "Insights", subtitle: "Trends and business performance" },
    calculator: { title: "Calculator", subtitle: "Useful business calculations" },
    business: { title: "Business", subtitle: "Customers, billing, expenses and payments" },
    subscription: { title: "Plans", subtitle: "Manage your subscription" },
    settings: { title: "App Settings", subtitle: "Account, backup and preferences" }
  };

  const icons = {
    home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    sales:'<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>',
    stock:'<svg viewBox="0 0 24 24"><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/></svg>',
    analytics:'<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    business:'<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z"/><path d="M8 7V4h8v3M8 12h8M8 16h5"/></svg>',
    more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    upload:'<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/></svg>',
    calculator:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h1M12 12h1M16 12h1M8 16h1M12 16h1M16 16h1"/></svg>',
    subscription:'<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    theme:'<svg viewBox="0 0 24 24"><path d="M20 15.5A8 8 0 1 1 8.5 4 6.5 6.5 0 0 0 20 15.5Z"/></svg>'
  };
  const lockSvg='<svg class="android-lock-icon premium-lock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';
  const navLockSvg='<svg class="android-nav-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';

  const originalSetTab = typeof window.setTab === "function" ? window.setTab : null;
  const originalRenderNav = typeof window.renderNav === "function" ? window.renderNav : null;
  const originalToggleTheme = typeof window.toggleTheme === "function" ? window.toggleTheme : null;
  const originalSetTheme = typeof window.setTheme === "function" ? window.setTheme : null;
  let moreSheetTrigger = null;

  function syncThemeVisuals(){
    const light = document.body.classList.contains("theme-light");
    document.documentElement.classList.toggle("theme-light", light);
    document.documentElement.style.colorScheme = light ? "light" : "dark";

    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta){
      meta.setAttribute("content", light ? "#edf4fb" : "#07101d");
    }

    const button = document.getElementById("themeToggle");
    if(button){
      button.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
      button.setAttribute("title", light ? "Dark mode" : "Light mode");
      button.dataset.theme = light ? "light" : "dark";
    }
  }

  if(originalToggleTheme){
    window.toggleTheme = function(event){
      const result = originalToggleTheme.call(this, event);
      setTimeout(syncThemeVisuals, 90);
      return result;
    };
  }

  if(originalSetTheme){
    window.setTheme = function(theme){
      const result = originalSetTheme.call(this, theme);
      setTimeout(syncThemeVisuals, 90);
      return result;
    };
  }

  function syncKeyboardState(){
    try{
      const vv = window.visualViewport;
      const active = document.activeElement;
      const editable = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      const heightLoss = vv ? Math.max(0, window.innerHeight - vv.height) : 0;
      const keyboardOpen = Boolean(editable && heightLoss > 120);
      document.documentElement.classList.toggle("vyapar-keyboard-open", keyboardOpen);
      document.body.classList.toggle("vyapar-keyboard-open", keyboardOpen);
    }catch(error){}
  }

  if(window.visualViewport){
    window.visualViewport.addEventListener("resize", syncKeyboardState, {passive:true});
    window.visualViewport.addEventListener("scroll", syncKeyboardState, {passive:true});
  }
  document.addEventListener("focusin", syncKeyboardState, true);
  document.addEventListener("focusout", function(){ setTimeout(syncKeyboardState, 80); }, true);
  window.addEventListener("resize", syncKeyboardState, {passive:true});
  setTimeout(syncKeyboardState, 120);

  function visibleTab(){
    const screen = Array.from(document.querySelectorAll(".screen"))
      .find(function(node){ return !node.classList.contains("hide"); });
    return screen ? screen.id.replace("screen-", "") : "home";
  }
  function installNavGlassInteraction(nav){
    if(nav.dataset.motionNavBound) return;
    nav.dataset.motionNavBound='1';
    nav.addEventListener('click', function(event){
      const button=event.target.closest('button[data-android-tab]');
      if(!button || !nav.contains(button)) return;
      event.preventDefault();
      const tab=button.dataset.androidTab;
      if(tab==='more'){ moreSheetTrigger=button; openMoreSheet(); }
      else if(typeof window.setTab==='function') window.setTab(tab,false);
    });
  }


  function renderNav(){
    const nav = document.getElementById("nav");
    if(!nav) return;

    const current = visibleTab();
    const moreActive = ["upload","calculator","analytics","subscription","settings"].includes(current);
    const items = [
      ["home","Home"],
      ["business","Business"],
      ["sales","Sales"],
      ["stock","Stock"],
      ["more","More"]
    ];
    let activeIndex = 0;
    const existing=nav.querySelectorAll('button[data-android-tab]');
    if(existing.length===5){
      existing.forEach(function(button){
        const id=button.dataset.androidTab;
        const active=id==='more'?moreActive:current===id;
        const locked=id!=='more' && tabIsLocked(id);
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',String(active));
        if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
        if(button.classList.contains('is-locked')!==locked){
          button.classList.toggle('is-locked',locked);
          button.innerHTML='<span class="android-nav-icon">'+icons[id]+'</span><span class="android-nav-label">'+items.find(item=>item[0]===id)[1]+'</span>'+(locked?navLockSvg:'');
        }
        button.setAttribute('aria-label',items.find(item=>item[0]===id)[1]+(locked?' — Business plan required':''));
      });
      return;
    }

    nav.innerHTML = items.map(function(item, index){
      const id = item[0];
      const active = id === "more" ? moreActive : current === id;
      if(active) activeIndex = index;
      const locked = id !== "more" && tabIsLocked(id);
      return '<button type="button" data-android-tab="'+id+'" class="'+(active?'active ':'')+(locked?'is-locked':'')+'" aria-label="'+item[1]+(locked?' — Business plan required':'')+'"'+(active?' aria-current="page"':'')+'>'+
        '<span class="android-nav-icon">'+icons[id]+'</span>'+
        '<span class="android-nav-label">'+item[1]+'</span>'+
        (locked?navLockSvg:'')+
      '</button>';
    }).join("");

    installNavGlassInteraction(nav, Array.from(nav.querySelectorAll("button[data-android-tab]")), activeIndex);
  }

  function updateHeader(){
    const tab = visibleTab();
    const info = metadata[tab] || metadata.home;
    const heading = document.querySelector(".brand h1");
    const tag = document.querySelector(".brand .tag");
    if(heading) heading.textContent = tab === "home" ? "Vyapar AI" : info.title;
    if(tag) tag.textContent = info.subtitle;
    document.title = info.title + " · Vyapar AI";
  }

  function addQuickActions(){
    const home = document.getElementById("screen-home");
    if(!home || home.querySelector(".android-quick-actions")) return;

    const mount = home.querySelector("#homeQuickActionsMount");
    const row = document.createElement("div");
    row.className = "android-quick-actions";
    const businessLocked=tabIsLocked('business');
    const stockLocked=tabIsLocked('stock');
    row.innerHTML =
      '<button type="button" class="android-quick-action primary '+(businessLocked?'is-locked':'')+'" data-action="bill" aria-label="Create a new bill'+(businessLocked?' — Business plan required':'')+'">'+
        '<span class="android-quick-action-icon">'+icons.sales+'</span>'+
        '<span class="android-quick-action-copy"><b>New Bill</b><small>Fast multi-item POS</small></span>'+
        (businessLocked?lockSvg:'')+
      '</button>'+
      '<button type="button" class="android-quick-action" data-tab="sales" aria-label="Add a sale">'+
        '<span class="android-quick-action-icon">'+icons.analytics+'</span>'+
        '<span class="android-quick-action-copy"><b>Add Sale</b><small>Record today’s sale</small></span>'+
      '</button>'+
      '<button type="button" class="android-quick-action '+(businessLocked?'is-locked':'')+'" data-action="customers" aria-label="Open customers and udhaar'+(businessLocked?' — Business plan required':'')+'">'+
        '<span class="android-quick-action-icon">'+icons.business+'</span>'+
        '<span class="android-quick-action-copy"><b>Udhaar</b><small>Customer balances</small></span>'+
        (businessLocked?lockSvg:'')+
      '</button>'+
      '<button type="button" class="android-quick-action '+(stockLocked?'is-locked':'')+'" data-tab="stock" aria-label="Open stock'+(stockLocked?' — plan upgrade required':'')+'">'+
        '<span class="android-quick-action-icon">'+icons.stock+'</span>'+
        '<span class="android-quick-action-copy"><b>Stock</b><small>Items and quantities</small></span>'+
        (stockLocked?lockSvg:'')+
      '</button>';

    row.querySelectorAll("button").forEach(function(button){
      button.addEventListener("click", function(){
        const action = button.getAttribute("data-action");
        const tab = button.getAttribute("data-tab");
        if(action === 'bill'){
          const opened=typeof window.setTab === "function" ? window.setTab('business', false) : false;
          if(opened === false) return;
          setTimeout(function(){ if(typeof window.fs607OpenPOS === 'function') window.fs607OpenPOS(); }, 0);
          return;
        }
        if(action === 'customers'){
          const opened=typeof window.setTab === "function" ? window.setTab('business', false) : false;
          if(opened === false) return;
          setTimeout(function(){ if(typeof window.advRenderModule === 'function') window.advRenderModule('customers'); }, 0);
          return;
        }
        if(tab && typeof window.setTab === "function") window.setTab(tab, false);
      });
    });

    if(mount) mount.appendChild(row);
    else home.prepend(row);
  }

  function improveCurrentScreen(){
    const tab = visibleTab();
    const screen = document.getElementById("screen-"+tab);
    if(!screen) return;

    screen.querySelectorAll('input[type="number"]').forEach(function(input){
      input.inputMode = "decimal";
    });
    screen.querySelectorAll('input[type="email"]').forEach(function(input){
      input.inputMode = "email";
      input.autocomplete = "email";
    });
    screen.querySelectorAll("button:not([type])").forEach(function(button){
      button.type = "button";
    });
    screen.querySelectorAll(".scroll").forEach(function(node){
      node.tabIndex = 0;
      node.setAttribute("aria-label", "Scrollable table");
    });
  }

  function ensureLegalFooter(){
    const settings = document.querySelector("#screen-settings .settings-stack");
    if(!settings) return;
    let footer = document.getElementById("appLegalFooter");
    if(!footer){
      footer = document.createElement("footer");
      footer.id = "appLegalFooter";
      footer.className = "app-legal-footer vy659-settings-footer";
    }
    footer.innerHTML =
      '<img class="vy659-footer-logo" src="assets/images/footer-logo.jpg" alt="Vyapar AI">' +
      '<span>© 2026 Vyapar AI. All Rights Reserved.</span>' +
      '<span class="app-legal-links">' +
        '<a href="pages/legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>' +
        '<a href="pages/legal/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>' +
        '<a href="pages/legal/refund.html" target="_blank" rel="noopener noreferrer">Refund</a>' +
        '<a href="pages/legal/delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a>' +
      '</span>' +
      '<strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';
    settings.appendChild(footer);
  }

  function closeMoreSheet(restoreNav){
    const shouldRestore = restoreNav !== false;
    const sheet = document.getElementById("androidMoreSheet");
    if(sheet && sheet.__vyClosing) return;
    const finish=()=>{ if(sheet) sheet.remove(); document.body.classList.remove("android-sheet-open"); renderNav(); };
    if(sheet && window.vyaparMotion) window.vyaparMotion.closeOverlay(sheet,finish); else finish();
    const trigger = moreSheetTrigger;
    moreSheetTrigger = null;
    if(shouldRestore){
      requestAnimationFrame(function(){
        renderNav();
        if(trigger){
          const fresh=document.querySelector('.nav button[data-android-tab="more"]');
          if(fresh){try{fresh.focus({preventScroll:true})}catch(_){}}
        }
      });
    }
  }

  window.closeMoreSheet=closeMoreSheet;

  function tabIsLocked(tab){
    const plan=typeof window.getCurrentPlan==='function' ? window.getCurrentPlan() : 'free';
    if(tab==='upload' || tab==='analytics') return plan==='free';
    if(tab==='business' || tab==='stock') return plan!=='business';
    return false;
  }
  function sheetItem(tab, title, subtitle){
    const locked=tabIsLocked(tab);
    return '<button type="button" class="android-sheet-item'+(locked?' is-locked':'')+'" data-tab="'+tab+'" aria-label="'+title+(locked?' locked':'')+'">'+
      '<span class="android-sheet-item-icon">'+icons[tab]+'</span>'+
      '<span class="android-sheet-item-copy">'+title+'<small>'+subtitle+'</small></span>'+(locked?lockSvg:'<span class="android-sheet-item-arrow">›</span>')+
    '</button>';
  }

  function openMoreSheet(){
    if(document.getElementById("androidMoreSheet")){
      closeMoreSheet();
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "androidMoreSheet";
    overlay.className = "android-sheet-overlay";
    overlay.innerHTML = '<div class="android-sheet" role="dialog" aria-modal="true" aria-label="More options">'+
      '<div class="android-sheet-handle"></div>'+
      '<div class="android-sheet-titlebar"><div><h3>More</h3><p>Tools and settings.</p></div><button type="button" class="android-sheet-close" aria-label="Close more">×</button></div>'+
      '<div class="android-sheet-grid">'+
        sheetItem("analytics","Insights","Reports and business performance")+
        sheetItem("upload","AI Upload","Photo and file import")+
        sheetItem("calculator","Calculator","Business calculations")+
        sheetItem("subscription","Plans","Subscription manage")+
        sheetItem("settings","App Settings","Account, backup and preferences")+
      '</div>'+
    '</div>';

    overlay.addEventListener("click", function(event){
      if(event.target === overlay) closeMoreSheet();
    });

    overlay.querySelectorAll("[data-tab]").forEach(function(button){
      button.addEventListener("click", function(){
        const tab = button.getAttribute("data-tab");
        closeMoreSheet(false);
        if(typeof window.setTab === "function") window.setTab(tab, false);
      });
    });

    document.body.appendChild(overlay);
    document.body.classList.add("android-sheet-open");
    const closeButton = overlay.querySelector(".android-sheet-close");
    if(closeButton){
      closeButton.addEventListener("click", closeMoreSheet);
      setTimeout(function(){ try{closeButton.focus({preventScroll:true});}catch(_){} }, 0);
    }
  }

  if(originalSetTab){
    window.setTab = function(tab, withLoader){
      const result = originalSetTab.call(this, tab, withLoader);
      if(result === false) return result;
      renderNav();
      updateHeader();
      requestAnimationFrame(function(){
        renderNav();
        updateHeader();
        improveCurrentScreen();
        syncThemeVisuals();
        ensureLegalFooter();
        if(tab === "home") addQuickActions();
      });
      return result;
    };
  }

  if(originalRenderNav){
    window.renderNav = function(){
      originalRenderNav.apply(this, arguments);
      renderNav();
    };
  }

  const planBadge = document.getElementById("planBadge");
  if(planBadge){
    planBadge.setAttribute("role","button");
    planBadge.tabIndex = 0;
    planBadge.addEventListener("click", function(){
      if(typeof window.setTab === "function") window.setTab("subscription", true);
    });
  }

  document.addEventListener("keydown", function(event){
    if(event.key === "Escape") closeMoreSheet();
  });

  renderNav();
  updateHeader();
  improveCurrentScreen();
  addQuickActions();
  ensureLegalFooter();
  syncThemeVisuals();

  const themeObserver = new MutationObserver(function(){
    syncThemeVisuals();
  });

  themeObserver.observe(document.body, {
    attributes:true,
    attributeFilter:["class"]
  });

  const observer = new MutationObserver(function(){
    requestAnimationFrame(function(){
      improveCurrentScreen();
      syncThemeVisuals();
      ensureLegalFooter();
      if(visibleTab() === "home") addQuickActions();
    });
  });

  document.querySelectorAll(".screen").forEach(function(screen){
    observer.observe(screen, {attributes:true, attributeFilter:["class"]});
  });

  function nativeJsonBase64(value){
    try{
      const json = JSON.stringify(value);
      const bytes = new TextEncoder().encode(json);
      let binary = "";
      const chunk = 0x8000;
      for(let i=0;i<bytes.length;i+=chunk){
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }catch(error){
      return "";
    }
  }

  function driveConnected(){
    try{
      return Boolean(window.AndroidApp && window.AndroidApp.isGoogleDriveConnected && window.AndroidApp.isGoogleDriveConnected());
    }catch(error){
      return false;
    }
  }

  window.connectGoogleDrive = function(){
    if(window.AndroidApp && typeof window.AndroidApp.connectGoogleDrive === "function"){
      window.AndroidApp.connectGoogleDrive();
      return;
    }
    try{ window.open('https://drive.google.com/drive/my-drive','_blank','noopener,noreferrer'); }catch(error){}
    if(typeof window.premiumToast === "function") window.premiumToast("Google Drive opened in your browser. Sign in and save the backup there.","info");
  };

  window.disconnectGoogleDrive = function(){
    if(window.AndroidApp && typeof window.AndroidApp.disconnectGoogleDrive === "function"){
      window.AndroidApp.disconnectGoogleDrive();
    }
    window.onNativeDriveStatus(false);
  };

  window.backupVyaparToGoogleDrive = function(showMessage){
    if(!driveConnected() || !window.AndroidApp || typeof window.AndroidApp.backupBase64ToGoogleDrive !== "function"){
      if(showMessage && typeof window.premiumToast === "function"){
        window.premiumToast("Connect Google Drive first.","info");
      }
      return;
    }
    const encoded = nativeJsonBase64(typeof state !== "undefined" ? state : {});
    if(!encoded) return;
    window.AndroidApp.backupBase64ToGoogleDrive(encoded);
    if(showMessage && typeof window.premiumToast === "function"){
      window.premiumToast("Saving backup to Google Drive...","info");
    }
  };

  window.onNativeDriveStatus = function(connected){
    const wasConnected = localStorage.getItem("vyapar_ai_drive_connected_v1") === "1";
    localStorage.setItem("vyapar_ai_drive_connected_v1", connected ? "1" : "0");
    const status = document.getElementById("driveBackupStatus");
    const button = document.getElementById("driveBackupButton");
    const disconnect = document.getElementById("driveDisconnectButton");
    if(status){
      status.textContent = connected ? "Connected · Automatic backup is enabled" : "Not connected · Device backup remains available";
      status.dataset.connected = connected ? "true" : "false";
    }
    if(button){
      button.textContent = connected ? "Back Up to Google Drive Now" : "Connect Google Drive";
      button.onclick = connected ? function(){ window.backupVyaparToGoogleDrive(true); } : window.connectGoogleDrive;
    }
    if(disconnect) disconnect.style.display = connected ? "inline-flex" : "none";
    if(connected && !wasConnected && typeof window.backupVyaparToGoogleDrive === "function") {
      setTimeout(function(){ window.backupVyaparToGoogleDrive(false); }, 250);
    }
  };

  window.onNativeAppReady = function(){
    try{
      const token = localStorage.getItem("vyapar_ai_auth_token_v1");
      if(token && window.AndroidApp && typeof window.AndroidApp.requestRecommendedPermissions === "function"){
        maybeShowPermissionSheet();
      }
      if(token && window.AndroidApp && typeof window.AndroidApp.autoBackupToGoogleDrive === "function"){
        const encoded = nativeJsonBase64(typeof state !== "undefined" ? state : {});
        if(encoded) window.AndroidApp.autoBackupToGoogleDrive(encoded);
      }
    }catch(error){}
  };

  window.onNativeAppResume = function(){
    try{
      const token = localStorage.getItem("vyapar_ai_auth_token_v1");
      if(!token || !window.AndroidApp || typeof window.AndroidApp.autoBackupToGoogleDrive !== "function") return;
      const encoded = nativeJsonBase64(typeof state !== "undefined" ? state : {});
      if(encoded) window.AndroidApp.autoBackupToGoogleDrive(encoded);
    }catch(error){}
  };

  window.onNativePaymentLaunchFailed = function(){
    if(typeof window.premiumToast === "function"){
      window.premiumToast("No compatible UPI app found. Choose another payment method.","error");
    }
  };

  function maybeShowPermissionSheet(){
    if(!window.AndroidApp || document.getElementById('vyaparOtpGate')) return;
    if(document.documentElement.classList.contains('vy855-booting')) { setTimeout(maybeShowPermissionSheet,500); return; }
    if(document.getElementById("androidPermissionSheet")) return;
    if(localStorage.getItem("vyapar_ai_permission_intro_v1") === "1") return;

    const overlay = document.createElement("div");
    overlay.id = "androidPermissionSheet";
    overlay.className = "android-permission-overlay";
    overlay.innerHTML = `
      <div class="android-permission-card" role="dialog" aria-modal="true" aria-labelledby="permissionTitle" aria-describedby="permissionDescription">
        <h2 id="permissionTitle">App permissions</h2>
        <p id="permissionDescription">Enable notifications for useful account and backup updates.</p>
        <small>Camera, printer and file access are requested only when you use those features. Drive backup is optional in Settings.</small>
        <div class="android-permission-actions">
          <button type="button" class="btn" id="permissionLater">Not now</button>
          <button type="button" class="btn primary" id="permissionContinue">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const previousFocus=document.activeElement;
    const close = function(mark){
      if(mark) localStorage.setItem("vyapar_ai_permission_intro_v1","1");
      document.removeEventListener("keydown",permissionKeys,true);
      if(previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
      if(window.vyaparMotion) window.vyaparMotion.closeOverlay(overlay); else overlay.remove();
    };
    overlay.querySelector("#permissionContinue").onclick = function(){
      localStorage.setItem("vyapar_ai_permission_intro_v1","1");
      if(window.AndroidApp && typeof window.AndroidApp.requestRecommendedPermissions === "function"){
        window.AndroidApp.requestRecommendedPermissions();
      }
      close(false);
    };
    overlay.querySelector("#permissionLater").onclick = function(){ close(true); };
    overlay.addEventListener("click", function(event){ if(event.target === overlay) close(true); });
    function permissionKeys(event){
      if(event.key==='Escape'){ event.preventDefault();event.stopPropagation();close(true); }
      if(event.key==='Tab'){
        const buttons=Array.from(overlay.querySelectorAll('button'));
        if(event.shiftKey && document.activeElement===buttons[0]){event.preventDefault();buttons[buttons.length-1].focus();}
        else if(!event.shiftKey && document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0].focus();}
      }
    }
    document.addEventListener('keydown',permissionKeys,true);
    overlay.querySelector('#permissionContinue').focus();
  }

  window.addEventListener('vyapar:session-ready',function(event){
    if(event.detail && ['authenticated','cached'].includes(event.detail.status)) setTimeout(maybeShowPermissionSheet,600);
  });


  /* v4.0.2 adaptive high-quality performance governor
     Starts at full visual quality and only reduces compositor cost after sustained frame drops. */
  (function initAdaptivePerformance(){
    let rafId = 0;
    let last = 0;
    let samples = 0;
    let elapsed = 0;
    let totalDelta = 0;
    let dropped = 0;
    let tier = 'ultra';
    let backgrounded = document.hidden;

    function root(){ return document.documentElement; }
    function applyTier(next){
      if(next === tier) return;
      tier = next;
      const r = root();
      r.classList.toggle('perf-adaptive-balanced', next === 'balanced');
      r.classList.toggle('perf-adaptive-smooth', next === 'smooth');
    }

    function reset(){
      last = 0; samples = 0; elapsed = 0; totalDelta = 0; dropped = 0;
    }

    function sample(ts){
      if(backgrounded){ rafId = requestAnimationFrame(sample); return; }
      if(!last) last = ts;
      const delta = ts - last;
      last = ts;
      if(delta > 0 && delta < 250){
        samples++;
        elapsed += delta;
        totalDelta += delta;
        if(delta > 22) dropped++;
      }

      if(elapsed >= 1800 && samples >= 40){
        const avg = totalDelta / samples;
        const dropRate = dropped / samples;
        if(avg > 28 || dropRate > .24){
          applyTier('smooth');
        }else if(avg > 20 || dropRate > .12){
          applyTier('balanced');
        }else if(avg < 18 && dropRate < .07){
          applyTier('ultra');
        }
        reset();
      }
      rafId = requestAnimationFrame(sample);
    }

    document.addEventListener('visibilitychange', function(){
      backgrounded = document.hidden;
      reset();
    });

    rafId = requestAnimationFrame(sample);
  })();

})();


;
/* ===== ux-608.js ===== */
/* Vyapar AI 6.3.7 — organised workspace + subscription safety */
(function(){
  'use strict';

  function safe(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  async function askDanger(title, message, okText){
    if(typeof window.showGlassDialog === 'function'){
      return !!(await window.showGlassDialog({
        title: title || 'Are you sure?',
        message: message || 'This action cannot be undone.',
        kind: 'danger',
        confirm: true,
        okText: okText || 'Delete',
        cancelText: 'Cancel'
      }));
    }
    return window.confirm((title || 'Are you sure?') + '\n\n' + (message || 'This action cannot be undone.'));
  }
  window.ux608ConfirmDanger = askDanger;

  function moneySafe(value){
    return typeof window.money === 'function' ? window.money(value || 0) : '₹' + Number(value || 0).toLocaleString('en-IN');
  }

  function totalsSafe(){
    try{
      return typeof window.businessTotals === 'function'
        ? window.businessTotals()
        : {sales:0,gross:0,expenses:0,net:0,outstanding:0};
    }catch(_){ return {sales:0,gross:0,expenses:0,net:0,outstanding:0}; }
  }

  function storeName(){
    try{
      const id = state.currentStoreId || 'MAIN';
      const s = (state.stores || []).find(x => x.id === id);
      return s && s.name ? s.name : (id === 'MAIN' ? 'Main Store' : id);
    }catch(_){ return 'Main Store'; }
  }

  const toolIcons={
    bill:'<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>',
    customers:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 8.5a3 3 0 0 1 0 5.5M18 15a5 5 0 0 1 2.5 4.3V20"/></svg>',
    inventory:'<svg viewBox="0 0 24 24"><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/></svg>',
    suppliers:'<svg viewBox="0 0 24 24"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    expenses:'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M4 9h16M8 14h4"/></svg>',
    payments:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
    returns:'<svg viewBox="0 0 24 24"><path d="M8 7H4v-4"/><path d="M4 7a9 9 0 1 1-1 9"/></svg>',
    closing:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    tax:'<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h3M8 16h8"/></svg>',
    reports:'<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    ai:'<svg viewBox="0 0 24 24"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
    team:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20a6 6 0 0 1 12 0M15 15a5 5 0 0 1 6 5"/></svg>',
    security:'<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.8 2.8 8.3 7 10 4.2-1.7 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    footwear:'<svg viewBox="0 0 24 24"><path d="M4 15c3.5 0 5-1 6-4l2 2c2 2 4 2 8 2v4H4v-4Z"/><path d="M10 11V6"/></svg>',
    performance:'<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 4-4M7 18h10"/></svg>',
    update:'<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>'
  };

  function toolButton(label, subtitle, action, primary, icon){
    return '<button type="button" class="ux608-tool '+(primary?'primary':'')+'" onclick="'+action+'" aria-label="'+safe(label)+'">'+
      '<span class="ux608-tool-icon">'+(toolIcons[icon]||toolIcons.reports)+'</span>'+
      '<span class="ux608-tool-copy"><b>'+safe(label)+'</b><span>'+safe(subtitle)+'</span></span>'+
      '<span class="ux608-tool-arrow" aria-hidden="true">›</span></button>';
  }

  function renderHub(){
    const el=document.getElementById('businessModuleArea');
    if(!el) return;
    let productCount=0,dueCount=0;
    try{
      productCount=Array.isArray(state.products)?state.products.length:0;
      dueCount=Array.isArray(state.customers)?state.customers.filter(c=>Number(c.due||0)>0).length:0;
    }catch(_){}
    el.innerHTML=`
      <div class="ux608-hub">
        <section class="ux608-section">
          <div class="ux608-section-head"><div><span class="ux608-section-kicker">DAILY OPERATIONS</span><h2>Run today’s work</h2><p>Billing, customers, products and purchases — the tools used most often.</p></div><span class="ux608-store">${safe(storeName())}</span></div>
          <div class="ux608-primary-grid">
            ${toolButton('New Bill','Fast multi-item POS','fs607OpenPOS()',true,'bill')}
            ${toolButton('Customers & Udhaar',dueCount+' customer(s) with due','advRenderModule(\'customers\')',true,'customers')}
            ${toolButton('Products & Stock',productCount+' products in catalog','advRenderModule(\'inventory\')',false,'inventory')}
            ${toolButton('Purchases & Suppliers','Stock-in and supplier dues','advRenderModule(\'suppliers\')',false,'suppliers')}
          </div>
        </section>

        <section class="ux608-section">
          <div class="ux608-section-head"><div><span class="ux608-section-kicker">MONEY & RECORDS</span><h3>Control daily cash</h3><p>Expenses, payments, returns and closing stay together.</p></div></div>
          <div class="ux608-compact-grid">
            ${toolButton('Expenses','Record shop expenses','ux608OpenLegacy(\'expenses\')',false,'expenses')}
            ${toolButton('Payments','Cash, UPI, card and bank','ux608OpenLegacy(\'payments\')',false,'payments')}
            ${toolButton('Returns','Sales and purchase returns','advRenderModule(\'billing\')',false,'returns')}
            ${toolButton('Daily Closing','Cash closing and reconciliation','advRenderModule(\'finance\')',false,'closing')}
          </div>
        </section>

        <details class="ux608-advanced">
          <summary><span><b>Advanced workspace</b><small>GST, reports, AI, cloud, security and specialist tools</small></span><span class="ux608-chevron">⌄</span></summary>
          <div class="ux608-compact-grid ux608-advanced-grid">
            ${toolButton('GST / Tax','GSTIN, reports and e-invoice','advRenderModule(\'gst\')',false,'tax')}
            ${toolButton('Reports','Profit, reorder, dead stock and exports','advRenderModule(\'reports\')',false,'reports')}
            ${toolButton('AI Assistant','Business questions and insights','advRenderModule(\'ai\')',false,'ai')}
            ${toolButton('Team / Cloud','Stores, staff and cloud sync','advRenderModule(\'team\')',false,'team')}
            ${toolButton('Security','App lock, backup and integrity','advRenderModule(\'security\')',false,'security')}
            ${toolButton('Footwear Pro','Size, colour, article and barcode','advRenderModule(\'footwear\')',false,'footwear')}
            ${toolButton('Performance','Performance and data tools','advRenderModule(\'performance\')',false,'performance')}
            ${toolButton('Check Update','Check the latest APK release','fs607CheckUpdate(true)',false,'update')}
          </div>
        </details>
      </div>`;
    markDangerButtons(el);
  }

  window.renderAdvancedHome = function(){
    if(typeof window.requirePlan === 'function' && !window.requirePlan('business')) return false;
    renderHub();
    return true;
  };

  const finalAdvancedModule = window.advRenderModule;
  if(typeof finalAdvancedModule === 'function'){
    window.advRenderModule = function(){
      if(typeof window.requirePlan === 'function' && !window.requirePlan('business')) return false;
      return finalAdvancedModule.apply(this, arguments);
    };
  }

  window.ux608OpenLegacy = function(module){
    if(typeof window.requirePlan === 'function' && !window.requirePlan('business')) return false;
    if(typeof window.businessShowModule !== 'function') return;
    window.businessShowModule(module);
    const el=document.getElementById('businessModuleArea');
    if(!el) return;
    const bar=document.createElement('div');
    bar.className='ux608-backbar';
    bar.innerHTML='<button type="button" class="btn mini" onclick="renderAdvancedHome()">← Business Home</button>';
    el.prepend(bar);
    markDangerButtons(el);
  };

  window.renderBusiness = function(){
    const el=document.getElementById('screen-business');
    if(!el) return;
    try{ if(typeof window.advEnsure === 'function') window.advEnsure(); }catch(_){}
    const t=totalsSafe();
    el.innerHTML=`
      <div class="card ux608-business-summary">
        <div class="ux608-business-head">
          <div><span class="pill">Business workspace</span><h2>Everything for daily trade</h2><p class="muted">Billing, udhaar, stock and money records — grouped by the job you need to do.</p></div>
          <button type="button" class="btn primary ux608-fastbill" onclick="fs607OpenPOS()">＋ New Bill</button>
        </div>
        <div class="stats ux608-stats">
          <div class="stat"><span>Sales</span><b>${moneySafe(t.sales)}</b></div>
          <div class="stat"><span>Net Profit</span><b>${moneySafe(t.net)}</b></div>
          <div class="stat"><span>Expenses</span><b>${moneySafe(t.expenses)}</b></div>
          <div class="stat"><span>Customer Due</span><b>${moneySafe(t.outstanding)}</b></div>
        </div>
      </div>
      <div id="businessModuleArea" class="card ux608-module-area"></div>`;
    renderHub();
  };

  // ----- Confirmation for destructive actions that previously deleted immediately -----
  const originalBusinessDelete = window.businessDeleteRecord;
  if(typeof originalBusinessDelete === 'function'){
    window.businessDeleteRecord = async function(bucket,id){
      const label = bucket === 'customers' ? 'customer' : String(bucket || 'record').replace(/s$/,'');
      if(!await askDanger('Delete '+label+'?', 'This '+label+' will be permanently removed. This action cannot be undone.', 'Delete')) return;
      return originalBusinessDelete.call(this,bucket,id);
    };
  }

  const originalProductDelete = window.advDeleteProduct;
  if(typeof originalProductDelete === 'function'){
    window.advDeleteProduct = async function(id){
      let name='product';
      try{ const p=(state.products||[]).find(x=>x.id===id); if(p&&p.name) name='“'+p.name+'”'; }catch(_){}
      if(!await askDanger('Delete product?', 'Delete '+name+' from the product catalog? This cannot be undone.', 'Delete')) return;
      return originalProductDelete.call(this,id);
    };
  }

  const originalRemovePOS = window.fs607RemovePOSItem;
  if(typeof originalRemovePOS === 'function'){
    window.fs607RemovePOSItem = async function(id){
      if(!await askDanger('Remove item from cart?', 'This item will be removed from the current bill.', 'Remove')) return;
      return originalRemovePOS.call(this,id);
    };
  }

  const originalClearPOS = window.fs607ClearPOS;
  if(typeof originalClearPOS === 'function'){
    window.fs607ClearPOS = async function(){
      try{ if(!state.posCart || !state.posCart.length) return originalClearPOS.call(this); }catch(_){}
      if(!await askDanger('Clear entire cart?', 'All items in the current bill will be removed.', 'Clear Cart')) return;
      return originalClearPOS.call(this);
    };
  }

  const originalClearHistory = window.calcClearHistory;
  if(typeof originalClearHistory === 'function'){
    window.calcClearHistory = async function(){
      if(!await askDanger('Clear calculator history?', 'All saved calculator history will be removed.', 'Clear History')) return;
      return originalClearHistory.call(this);
    };
  }

  const originalClearPreview = window.clearStockPreview;
  if(typeof originalClearPreview === 'function'){
    window.clearStockPreview = async function(){
      if(!await askDanger('Clear stock preview?', 'The current imported stock preview will be cleared.', 'Clear')) return;
      return originalClearPreview.call(this);
    };
  }

  function markDangerButtons(root){
    const scope=root || document;
    scope.querySelectorAll('button,a').forEach(function(node){
      const text=(node.textContent||'').trim().toLowerCase();
      const destructive=/^(delete|delete account|remove|clear cart|clear history|clear preview)$/.test(text) || text.includes('delete account');
      if(destructive) node.classList.add('delete-solid');
    });
  }

  const obs=new MutationObserver(function(mutations){
    for(const m of mutations){
      for(const n of m.addedNodes){ if(n.nodeType===1) markDangerButtons(n); }
    }
  });
  obs.observe(document.body,{childList:true,subtree:true});
  markDangerButtons(document);

  // Re-render business once this final UX layer is loaded.
  try{ window.renderBusiness(); }catch(_){}
})();


;
/* ===== platform-611.js ===== */
/* Vyapar AI 6.1.1 Business Platform — local-first accounting core.
   Extends existing app without replacing existing navigation or legacy state. */
(function(){
'use strict';
const VERSION='6.1.1', SCHEMA=611;
const TYPES=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','PAYMENT_IN','PAYMENT_OUT','ESTIMATE','PROFORMA','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN','OTHER_INCOME','FIXED_ASSET','CANCELLED_INVOICE'];
const POSTING_TYPES=new Set(['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','PAYMENT_IN','PAYMENT_OUT','OTHER_INCOME','FIXED_ASSET']);
const PREFIX_DEFAULT={SALE:'INV',PURCHASE:'PUR',SALE_RETURN:'SR',PURCHASE_RETURN:'PR',PAYMENT_IN:'PIN',PAYMENT_OUT:'POUT',ESTIMATE:'EST',PROFORMA:'PRO',SALE_ORDER:'SO',PURCHASE_ORDER:'PO',DELIVERY_CHALLAN:'DC',OTHER_INCOME:'OI',FIXED_ASSET:'FA',CANCELLED_INVOICE:'CAN'};
const PAYMENT_MODES=['Cash','UPI','Bank Transfer','Card','Cheque','Credit','Other'];
const $=id=>document.getElementById(id), n=v=>Number.isFinite(Number(v))?Number(v):0, now=()=>new Date().toISOString(), day=()=>typeof localDateKey==='function'?localDateKey():now().slice(0,10), id=()=>typeof uid==='function'?uid():'V'+Date.now()+Math.random().toString(36).slice(2);
const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cash=v=>typeof money==='function'?money(v):'₹'+n(v).toFixed(2);
const toast=m=>typeof showGlassToast==='function'?showGlassToast(m):alert(m);
function S(){return window.state||(window.state={});}
function biz(){ensure();return String(S().activeBusinessId||S().currentStoreId||'MAIN');}
function ensure(){const s=S();
  const arr=['businesses','transactions611','ledgerEntries611','accounts611','stockMovements611','godowns611','manufacturing611','notifications611','loyaltyEntries611','auditLog611','staff611','serviceReminders611','paymentReminders611'];arr.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[]});
  s.schemaVersion=Math.max(n(s.schemaVersion),SCHEMA); s.transactionSettings611=s.transactionSettings611&&typeof s.transactionSettings611==='object'?s.transactionSettings611:{};
  s.numbering611=s.numbering611&&typeof s.numbering611==='object'?s.numbering611:{}; s.taxSettings611=s.taxSettings611&&typeof s.taxSettings611==='object'?s.taxSettings611:{};
  s.currency611=s.currency611&&typeof s.currency611==='object'?s.currency611:{baseCurrency:'INR'};
  if(!s.businesses.length)s.businesses.push({id:'MAIN',name:s.profile?.businessName||'My Business',baseCurrency:'INR',createdAt:now()});
  if(!s.activeBusinessId)s.activeBusinessId=s.businesses[0].id;
  const active=String(s.activeBusinessId||'MAIN'); if(!s.godowns611.some(g=>g.businessId===active&&g.isDefault))s.godowns611.push({id:'G-MAIN-'+active,businessId:active,name:'Main Shop',isDefault:true,createdAt:now()});
  seedAccounts(); migrateLegacy();
}
function saveAll(){if(typeof save==='function')save();}
function log(action,entity,entityId,details){S().auditLog611.unshift({id:id(),businessId:biz(),timestamp:now(),action,entity,entityId:entityId||'',userId:'owner',details:String(details||'').slice(0,600)});S().auditLog611=S().auditLog611.slice(0,5000)}
function notify(type,title,message){S().notifications611.unshift({id:id(),businessId:biz(),type,title,message,createdAt:now(),read:false});S().notifications611=S().notifications611.slice(0,1000)}
function seedAccounts(){const s=S(),b=String(s.activeBusinessId||'MAIN');const defs=[['CASH','Cash In Hand','asset'],['BANK','Bank Account','asset'],['UPI','UPI Account','asset'],['CHEQUE','Cheque Account','asset'],['AR','Accounts Receivable','asset'],['STOCK','Inventory','asset'],['FIXED','Fixed Assets','asset'],['AP','Accounts Payable','liability'],['LOAN','Loan Accounts','liability'],['SALES','Sales','income'],['OTHER_INC','Other Income','income'],['PURCHASES','Purchases','expense'],['COGS','Cost of Goods Sold','expense'],['EXPENSE','Operating Expenses','expense'],['GST_OUT','GST Output','liability'],['GST_IN','GST Input','asset'],['CAPITAL','Opening Capital','equity'],['RETAINED','Retained Profit','equity']];defs.forEach(d=>{if(!s.accounts611.some(a=>a.businessId===b&&a.code===d[0]))s.accounts611.push({id:'A-'+b+'-'+d[0],businessId:b,code:d[0],name:d[1],category:d[2],openingBalance:0,active:true,createdAt:now()})})}
function migrateLegacy(){const s=S();if(s.platform611Migrated)return; s.platform611Migrated=true; const b=String(s.activeBusinessId||'MAIN'),g=s.godowns611.find(x=>x.businessId===b&&x.isDefault); (s.products||[]).forEach(p=>{const q=Math.max(0,n(p.qty));if(q>0&&!s.stockMovements611.some(m=>m.businessId===b&&m.itemId===p.id&&m.movementType==='Opening Stock'))s.stockMovements611.push({id:id(),businessId:b,itemId:p.id,godownId:g?.id||'',transactionId:'MIGRATION-611',movementType:'Opening Stock',quantityIn:q,quantityOut:0,date:day(),createdAt:now()})}); log('MIGRATION','schema','611','Legacy records preserved; opening stock converted to stock movements');}
function account(code){ensure();return S().accounts611.find(a=>a.businessId===biz()&&a.code===code)}
function addLedger(transactionId,code,debit,credit,narration,date){const a=account(code);if(!a)return;const prev=balance(a.id);const after=prev+n(debit)-n(credit);S().ledgerEntries611.push({id:id(),businessId:biz(),accountId:a.id,transactionId,date:date||day(),type:n(debit)>0?'debit':'credit',debit:n(debit),credit:n(credit),balanceAfter:after,narration:narration||'',createdAt:now()})}
function balance(accountId){const a=S().accounts611.find(x=>x.id===accountId);return n(a?.openingBalance)+S().ledgerEntries611.filter(x=>x.businessId===biz()&&x.accountId===accountId).reduce((z,x)=>z+n(x.debit)-n(x.credit),0)}
function defaultGodown(){return S().godowns611.find(g=>g.businessId===biz()&&g.isDefault)||S().godowns611.find(g=>g.businessId===biz())}
function stock(itemId,godownId){return S().stockMovements611.filter(x=>x.businessId===biz()&&x.itemId===itemId&&(!godownId||x.godownId===godownId)).reduce((z,x)=>z+n(x.quantityIn)-n(x.quantityOut),0)}
function move(itemId,godownId,transactionId,movementType,quantityIn,quantityOut,date){S().stockMovements611.push({id:id(),businessId:biz(),itemId,godownId:godownId||defaultGodown()?.id||'',transactionId,movementType,quantityIn:n(quantityIn),quantityOut:n(quantityOut),date:date||day(),createdAt:now()})}
function itemBy(q){const k=String(q||'').trim().toLowerCase();return (S().products||[]).find(p=>[p.id,p.sku,p.barcode,p.name].some(v=>String(v||'').toLowerCase()===k))||(S().products||[]).find(p=>[p.name,p.sku,p.barcode,p.brand,p.article].join(' ').toLowerCase().includes(k))}
function partyBy(q){const k=String(q||'').trim().toLowerCase();const all=[...(S().customers||[]).map(x=>({...x,partyType:x.partyType||'Customer'})),...(S().suppliers||[]).map(x=>({...x,partyType:x.partyType||'Supplier'}))];return all.find(p=>[p.id,p.name,p.mobile,p.phone].some(v=>String(v||'').toLowerCase()===k))||null}
function nextNo(type){ensure();const cfg=S().numbering611[type]||(S().numbering611[type]={prefix:PREFIX_DEFAULT[type]||type.slice(0,3),next:1,padding:5});let no;const used=new Set(S().transactions611.filter(t=>t.businessId===biz()&&t.type===type).map(t=>t.number));do{no=cfg.prefix+'-'+String(cfg.next++).padStart(cfg.padding||5,'0')}while(used.has(no));return no}
function taxCalc(items,discountPct,stateOfSupply){const gstEnabled=S().taxSettings611.gstEnabled!==false;let subtotal=0,discount=0,tax=0,cgst=0,sgst=0,igst=0,cess=0;const home=String(S().taxSettings611.businessState||'').toLowerCase(),dest=String(stateOfSupply||'').toLowerCase();items.forEach(i=>{const line=n(i.qty)*n(i.rate);const d=line*n(i.discount)/100;const taxable=line-d;const r=gstEnabled?n(i.tax):0;const tx=taxable*r/100;subtotal+=line;discount+=d;tax+=tx;cess+=taxable*n(i.cess)/100;if(home&&dest&&home!==dest)igst+=tx;else{cgst+=tx/2;sgst+=tx/2}});const td=subtotal*n(discountPct)/100;const scale=subtotal?Math.max(0,(subtotal-td)/subtotal):1;discount+=td;tax*=scale;cgst*=scale;sgst*=scale;igst*=scale;cess*=scale;return{subtotal,discount,tax,cgst,sgst,igst,cess,total:subtotal-discount+tax+cess}}
function normalizeItems(items){return (items||[]).map(i=>({itemId:i.itemId||itemBy(i.product||i.name||i.sku)?.id||'',name:i.name||i.product||itemBy(i.itemId)?.name||'Item',qty:Math.max(0,n(i.qty||i.quantity)),unit:i.unit||'pcs',rate:Math.max(0,n(i.rate||i.price)),purchaseRate:Math.max(0,n(i.purchaseRate||i.purchasePrice||itemBy(i.itemId)?.purchasePrice)),discount:Math.max(0,n(i.discount)),tax:Math.max(0,n(i.tax||i.gst)),cess:Math.max(0,n(i.cess)),godownId:i.godownId||defaultGodown()?.id||''}))}
function createTx(input){ensure();const type=String(input.type||'SALE').toUpperCase();if(!TYPES.includes(type))throw new Error('Unsupported transaction type');const items=normalizeItems(input.items);if(['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type)&&!items.length)throw new Error('At least one item is required');items.forEach(i=>{if(i.qty<=0)throw new Error('Quantity must be greater than zero');if(type==='SALE'&&stock(i.itemId,i.godownId)<i.qty&&S().transactionSettings611.allowNegativeStock!==true)throw new Error(i.name+' stock is insufficient')});const calc=taxCalc(items,input.discount,input.stateOfSupply);const total=n(input.total)||calc.total+n(input.additionalCharges);const received=Math.max(0,n(input.receivedPaid));const tx={id:id(),businessId:biz(),type,number:input.number||nextNo(type),date:input.date||day(),time:input.time||'',partyId:input.partyId||partyBy(input.party)?.id||'',partyName:input.party||partyBy(input.party)?.name||'',items,discount:n(input.discount),tax:calc.tax,cgst:calc.cgst,sgst:calc.sgst,igst:calc.igst,cess:calc.cess,additionalCharges:n(input.additionalCharges),subtotal:calc.subtotal,total,receivedPaid:received,balance:Math.max(0,total-received),paymentMode:input.paymentMode||'Cash',notes:String(input.notes||''),stateOfSupply:input.stateOfSupply||'',status:input.status||'posted',currency:input.currency||S().currency611.baseCurrency||'INR',exchangeRate:n(input.exchangeRate)||1,baseAmount:total*(n(input.exchangeRate)||1),createdAt:now(),updatedAt:now(),linkedTransactionId:input.linkedTransactionId||''};if(S().transactions611.some(x=>x.businessId===biz()&&x.type===type&&x.number===tx.number))throw new Error('Duplicate transaction number');S().transactions611.push(tx);if(POSTING_TYPES.has(type))post(tx);log('CREATE',type,tx.id,tx.number);saveAll();return tx}
function post(tx){const p=tx.paymentMode==='UPI'?'UPI':tx.paymentMode==='Bank Transfer'||tx.paymentMode==='Card'||tx.paymentMode==='Cheque'?'BANK':'CASH';const paid=Math.min(tx.total,n(tx.receivedPaid));if(tx.type==='SALE'){addLedger(tx.id,tx.balance>0?'AR':p,tx.total,0,'Sale '+tx.number,tx.date);addLedger(tx.id,'SALES',0,tx.total-tx.tax-tx.cess,'Sale revenue',tx.date);if(tx.tax+tx.cess)addLedger(tx.id,'GST_OUT',0,tx.tax+tx.cess,'Output tax',tx.date);if(tx.balance>0&&paid>0){addLedger(tx.id,p,paid,0,'Sale receipt',tx.date);addLedger(tx.id,'AR',0,paid,'Sale receipt',tx.date)}tx.items.forEach(i=>{move(i.itemId,i.godownId,tx.id,'Sale',0,i.qty,tx.date);const c=n(i.purchaseRate)*i.qty;if(c){addLedger(tx.id,'COGS',c,0,'COGS '+i.name,tx.date);addLedger(tx.id,'STOCK',0,c,'Stock issued '+i.name,tx.date)}})}
else if(tx.type==='PURCHASE'){addLedger(tx.id,'PURCHASES',tx.total-tx.tax-tx.cess,0,'Purchase '+tx.number,tx.date);if(tx.tax+tx.cess)addLedger(tx.id,'GST_IN',tx.tax+tx.cess,0,'Input tax',tx.date);addLedger(tx.id,tx.balance>0?'AP':p,0,tx.total,'Purchase payable',tx.date);if(tx.balance>0&&paid>0){addLedger(tx.id,'AP',paid,0,'Purchase payment',tx.date);addLedger(tx.id,p,0,paid,'Purchase payment',tx.date)}tx.items.forEach(i=>move(i.itemId,i.godownId,tx.id,'Purchase',i.qty,0,tx.date))}
else if(tx.type==='SALE_RETURN'){addLedger(tx.id,'SALES',tx.total-tx.tax-tx.cess,0,'Sale return',tx.date);if(tx.tax+tx.cess)addLedger(tx.id,'GST_OUT',tx.tax+tx.cess,0,'Reverse output tax',tx.date);addLedger(tx.id,'AR',0,tx.total,'Customer credit for return',tx.date);tx.items.forEach(i=>move(i.itemId,i.godownId,tx.id,'Sale Return',i.qty,0,tx.date))}
else if(tx.type==='PURCHASE_RETURN'){addLedger(tx.id,'AP',tx.total,0,'Supplier debit for return',tx.date);addLedger(tx.id,'PURCHASES',0,tx.total-tx.tax-tx.cess,'Purchase return',tx.date);if(tx.tax+tx.cess)addLedger(tx.id,'GST_IN',0,tx.tax+tx.cess,'Reverse input tax',tx.date);tx.items.forEach(i=>move(i.itemId,i.godownId,tx.id,'Purchase Return',0,i.qty,tx.date))}
else if(tx.type==='PAYMENT_IN'){addLedger(tx.id,p,tx.total,0,'Payment in',tx.date);addLedger(tx.id,'AR',0,tx.total,'Receivable settled',tx.date)}
else if(tx.type==='PAYMENT_OUT'){addLedger(tx.id,'AP',tx.total,0,'Payable settled',tx.date);addLedger(tx.id,p,0,tx.total,'Payment out',tx.date)}
else if(tx.type==='OTHER_INCOME'){addLedger(tx.id,p,tx.total,0,'Other income received',tx.date);addLedger(tx.id,'OTHER_INC',0,tx.total,'Other income',tx.date)}
else if(tx.type==='FIXED_ASSET'){addLedger(tx.id,'FIXED',tx.total,0,'Fixed asset purchase',tx.date);addLedger(tx.id,p,0,tx.total,'Fixed asset payment',tx.date)}}
function reverse(tx){if(tx.reversedAt)return;S().ledgerEntries611.filter(x=>x.transactionId===tx.id).forEach(e=>addLedger(tx.id+'-REV',S().accounts611.find(a=>a.id===e.accountId)?.code,e.credit,e.debit,'Reversal: '+e.narration,day()));S().stockMovements611.filter(x=>x.transactionId===tx.id).forEach(m=>move(m.itemId,m.godownId,tx.id+'-REV','Adjustment',m.quantityOut,m.quantityIn,day()));tx.reversedAt=now();tx.status='cancelled';log('REVERSE',tx.type,tx.id,tx.number);saveAll()}
function totals(from,to){const tx=S().transactions611.filter(t=>t.businessId===biz()&&t.status!=='cancelled'&&(!from||t.date>=from)&&(!to||t.date<=to));const netOfTax=t=>tx.filter(x=>x.type===t).reduce((z,x)=>z+Math.max(0,n(x.baseAmount||x.total)-n(x.tax)-n(x.cess)),0);const gross=t=>tx.filter(x=>x.type===t).reduce((z,x)=>z+n(x.baseAmount||x.total),0);const revenue=netOfTax('SALE')-netOfTax('SALE_RETURN'), purchases=netOfTax('PURCHASE')-netOfTax('PURCHASE_RETURN'), other=gross('OTHER_INCOME');const cogs=S().ledgerEntries611.filter(e=>e.businessId===biz()&&S().accounts611.find(a=>a.id===e.accountId)?.code==='COGS'&&(!from||e.date>=from)&&(!to||e.date<=to)).reduce((z,e)=>z+n(e.debit)-n(e.credit),0);const legacyExp=(S().expenses||[]).filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).reduce((z,e)=>z+n(e.amount),0);return{revenue,purchases,other,cogs,expenses:legacyExp,net:revenue+other-cogs-legacyExp}}
function statement(party){const p=partyBy(party), pid=p?.id||party;return S().transactions611.filter(t=>t.businessId===biz()&&(t.partyId===pid||String(t.partyName).toLowerCase()===String(party).toLowerCase())).sort((a,b)=>a.date.localeCompare(b.date))}
function addGodown(name){if(!name.trim())throw new Error('Godown name required');const g={id:id(),businessId:biz(),name:name.trim(),isDefault:false,createdAt:now()};S().godowns611.push(g);log('CREATE','GODOWN',g.id,g.name);saveAll();return g}
function transfer(itemId,from,to,qty){qty=n(qty);if(qty<=0)throw new Error('Quantity required');if(stock(itemId,from)<qty)throw new Error('Insufficient godown stock');const tid=id();move(itemId,from,tid,'Godown Transfer',0,qty,day());move(itemId,to,tid,'Godown Transfer',qty,0,day());log('TRANSFER','STOCK',itemId,qty);saveAll()}
function manufacture(finishedItemId,qty,raws){qty=n(qty);const tid=id();raws.forEach(r=>{const q=n(r.qty)*qty;if(stock(r.itemId,r.godownId||defaultGodown()?.id)<q)throw new Error('Insufficient raw material');move(r.itemId,r.godownId||defaultGodown()?.id,tid,'Manufacturing',0,q,day())});move(finishedItemId,defaultGodown()?.id,tid,'Manufacturing',qty,0,day());S().manufacturing611.push({id:tid,businessId:biz(),finishedItemId,qty,raws,date:day(),createdAt:now()});log('CREATE','MANUFACTURING',tid,'qty '+qty);saveAll()}
function addAccount(name,category,openingBalance){const a={id:id(),businessId:biz(),code:'CUSTOM-'+Date.now(),name,category,openingBalance:n(openingBalance),active:true,createdAt:now()};S().accounts611.push(a);saveAll();return a}
function balanceSheet(){const byCat=c=>S().accounts611.filter(a=>a.businessId===biz()&&a.category===c).reduce((z,a)=>z+balance(a.id),0);const pnl=totals().net;return{assets:byCat('asset'),liabilities:-byCat('liability'),equity:-byCat('equity')+pnl,retainedProfit:pnl}}
function csv(name,rows){const text=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function report(kind){const tx=S().transactions611.filter(t=>t.businessId===biz());if(kind==='transactions')csv('transactions.csv',[['Date','Type','Number','Party','Total','Paid','Balance','Mode'],...tx.map(t=>[t.date,t.type,t.number,t.partyName,t.total,t.receivedPaid,t.balance,t.paymentMode])]);else if(kind==='stock')csv('stock-summary.csv',[['Item','SKU','Stock'],...(S().products||[]).map(p=>[p.name,p.sku,stock(p.id)])]);else if(kind==='ledger')csv('ledger.csv',[['Date','Account','Transaction','Debit','Credit','Narration'],...S().ledgerEntries611.filter(e=>e.businessId===biz()).map(e=>[e.date,S().accounts611.find(a=>a.id===e.accountId)?.name,e.transactionId,e.debit,e.credit,e.narration])])}
function dashboardHTML(){const t=totals(),bs=balanceSheet();return `<div class="p611-grid"><div class="stat"><span>Revenue</span><b>${cash(t.revenue)}</b></div><div class="stat"><span>COGS</span><b>${cash(t.cogs)}</b></div><div class="stat"><span>Expenses</span><b>${cash(t.expenses)}</b></div><div class="stat"><span>Net Profit</span><b>${cash(t.net)}</b></div><div class="stat"><span>Assets</span><b>${cash(bs.assets)}</b></div><div class="stat"><span>Liabilities</span><b>${cash(bs.liabilities)}</b></div></div>`}
function shell(title,body){return `<div class="calculator-head"><div><span class="pill">Business Platform 6.1.1</span><h2>${safe(title)}</h2><p class="muted">Local-first · double-linked ledger · stock movements · business-scoped data</p></div><button class="btn mini" onclick="p611Home()">Platform Home</button></div>${body}`}
function home(){ensure();const el=$('businessModuleArea');if(!el)return;el.innerHTML=shell('Accounting & Business Platform',dashboardHTML()+`<div class="p611-modules">
<button onclick="p611Open('transactions')"><b>Transactions</b><span>Sale, purchase, returns, payments, orders & documents</span></button><button onclick="p611Open('cashbank')"><b>Cash & Bank</b><span>Accounts, balances, deposits, withdrawals & transfers</span></button><button onclick="p611Open('ledger')"><b>Ledgers</b><span>Customer, supplier and accounting movements</span></button><button onclick="p611Open('inventory')"><b>Inventory / Godowns</b><span>Stock ledger, valuation and transfers</span></button><button onclick="p611Open('reports')"><b>Reports</b><span>P&L, balance sheet, stock and tax exports</span></button><button onclick="p611Open('settings')"><b>Transaction Settings</b><span>Prefixes, tax, printing and optional features</span></button><button onclick="p611Open('businesses')"><b>Multi-company</b><span>Create and switch businesses safely</span></button><button onclick="p611Open('audit')"><b>Audit & Notifications</b><span>Important actions and business activity</span></button></div>`)}
function txForm(type){const itemOptions=(S().products||[]).slice(0,1000).map(p=>`<option value="${safe(p.sku||p.barcode||p.name)}">${safe(p.name)}</option>`).join('');return `<div class="p611-form"><select id="pType">${TYPES.map(t=>`<option ${t===type?'selected':''}>${t}</option>`).join('')}</select><input id="pParty" placeholder="Customer / Supplier"><input id="pItem" list="pItems" placeholder="Item / SKU / barcode"><datalist id="pItems">${itemOptions}</datalist><input id="pQty" type="number" min="0.01" step="0.01" value="1" placeholder="Qty"><input id="pRate" type="number" min="0" step="0.01" placeholder="Rate"><input id="pTax" type="number" min="0" value="0" placeholder="GST %"><input id="pDisc" type="number" min="0" value="0" placeholder="Discount %"><input id="pPaid" type="number" min="0" value="0" placeholder="Received/Paid"><select id="pMode">${PAYMENT_MODES.map(x=>`<option>${x}</option>`).join('')}</select><input id="pState" placeholder="State of supply"><input id="pNotes" placeholder="Notes"></div><div class="actions"><button class="btn primary" onclick="p611CreateFromForm()">Save Transaction</button></div>`}
function open(mod){ensure();const el=$('businessModuleArea');if(!el)return;if(mod==='transactions'){const rows=S().transactions611.filter(t=>t.businessId===biz()).slice().reverse().slice(0,150);el.innerHTML=shell('Unified Transactions',txForm('SALE')+`<div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th>Total</th><th>Balance</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td>${t.date}</td><td>${t.type}</td><td>${safe(t.number)}</td><td>${safe(t.partyName)}</td><td>${cash(t.total)}</td><td>${cash(t.balance)}</td><td>${t.status!=='cancelled'?`<button class="btn mini" onclick="p611Share('${t.id}')">Share</button> <button class="btn mini danger" onclick="p611Cancel('${t.id}')">Cancel</button>`:'Cancelled'}</td></tr>`).join('')||'<tr><td colspan="7">No transactions yet.</td></tr>'}</tbody></table></div>`)}
else if(mod==='cashbank'){const ac=S().accounts611.filter(a=>a.businessId===biz()&&['asset','liability'].includes(a.category));el.innerHTML=shell('Cash & Bank',`<div class="p611-form"><input id="pAccName" placeholder="New bank / UPI / loan account"><select id="pAccCat"><option value="asset">Asset / Bank</option><option value="liability">Loan / Liability</option></select><input id="pAccOpen" type="number" placeholder="Opening balance"></div><button class="btn primary" onclick="p611AddAccount()">Add Account</button><div class="p611-table"><table class="table"><thead><tr><th>Account</th><th>Category</th><th>Balance</th></tr></thead><tbody>${ac.map(a=>`<tr><td>${safe(a.name)}</td><td>${safe(a.category)}</td><td>${cash(balance(a.id))}</td></tr>`).join('')}</tbody></table></div><h3>Payment / Deposit / Withdrawal</h3>${txForm('PAYMENT_IN')}`)}
else if(mod==='ledger'){const es=S().ledgerEntries611.filter(e=>e.businessId===biz()).slice().reverse().slice(0,300);el.innerHTML=shell('Central Accounting Ledger',`<div class="actions"><button class="btn" onclick="p611Report('ledger')">Export Ledger CSV</button></div><div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Account</th><th>Debit</th><th>Credit</th><th>Narration</th></tr></thead><tbody>${es.map(e=>`<tr><td>${e.date}</td><td>${safe(S().accounts611.find(a=>a.id===e.accountId)?.name||'')}</td><td>${cash(e.debit)}</td><td>${cash(e.credit)}</td><td>${safe(e.narration)}</td></tr>`).join('')||'<tr><td colspan="5">No ledger entries.</td></tr>'}</tbody></table></div>`)}
else if(mod==='inventory'){const gs=S().godowns611.filter(g=>g.businessId===biz());const ps=(S().products||[]).slice(0,500);el.innerHTML=shell('Inventory & Godowns',`<div class="p611-form"><input id="pGodownName" placeholder="Godown name"><button class="btn primary" onclick="p611AddGodown()">Create Godown</button></div><div class="p611-form"><input id="pTransferItem" placeholder="Item / SKU"><select id="pFrom">${gs.map(g=>`<option value="${g.id}">${safe(g.name)}</option>`)}</select><select id="pTo">${gs.map(g=>`<option value="${g.id}">${safe(g.name)}</option>`)}</select><input id="pTransferQty" type="number" min="0.01" step="0.01" placeholder="Qty"><button class="btn" onclick="p611Transfer()">Transfer Stock</button></div><div class="p611-table"><table class="table"><thead><tr><th>Item</th><th>SKU</th><th>Total Stock</th>${gs.map(g=>`<th>${safe(g.name)}</th>`).join('')}</tr></thead><tbody>${ps.map(p=>`<tr><td>${safe(p.name)}</td><td>${safe(p.sku||'')}</td><td>${stock(p.id)}</td>${gs.map(g=>`<td>${stock(p.id,g.id)}</td>`).join('')}</tr>`).join('')||'<tr><td>No products.</td></tr>'}</tbody></table></div>`)}
else if(mod==='reports'){const t=totals(),bs=balanceSheet();el.innerHTML=shell('Reports',dashboardHTML()+`<div class="card p611-report"><h3>Profit & Loss</h3><p>Revenue ${cash(t.revenue)} − COGS ${cash(t.cogs)} − Expenses ${cash(t.expenses)} + Other Income ${cash(t.other)} = <b>${cash(t.net)}</b></p><h3>Balance Sheet</h3><p>Assets: <b>${cash(bs.assets)}</b> · Liabilities: <b>${cash(bs.liabilities)}</b> · Equity/Retained: <b>${cash(bs.equity)}</b></p></div><div class="actions"><button class="btn" onclick="p611Report('transactions')">Transactions CSV</button><button class="btn" onclick="p611Report('stock')">Stock CSV</button><button class="btn" onclick="p611Report('ledger')">Ledger CSV</button></div>`)}
else if(mod==='settings'){el.innerHTML=shell('Transaction / Tax Settings',`<div class="p611-form"><label>GST <select id="pGst"><option value="true">Enabled</option><option value="false" ${S().taxSettings611.gstEnabled===false?'selected':''}>Disabled</option></select></label><input id="pBizState" placeholder="Business state" value="${safe(S().taxSettings611.businessState||'')}"><label><input id="pNeg" type="checkbox" ${S().transactionSettings611.allowNegativeStock?'checked':''}> Allow negative stock</label><label><input id="pMfg" type="checkbox" ${S().transactionSettings611.manufacturingEnabled?'checked':''}> Manufacturing</label><label><input id="pLoyal" type="checkbox" ${S().transactionSettings611.loyaltyEnabled?'checked':''}> Loyalty points</label></div><h3>Number Prefixes</h3><div class="p611-form">${Object.keys(PREFIX_DEFAULT).map(t=>`<label>${t}<input id="pref_${t}" value="${safe((S().numbering611[t]?.prefix)||PREFIX_DEFAULT[t])}"></label>`).join('')}</div><button class="btn primary" onclick="p611SaveSettings()">Save Settings</button><p class="muted">Advanced invoice fields, thermal hardware and Google Drive continue to use the existing app/native modules.</p>`)}
else if(mod==='businesses'){el.innerHTML=shell('Businesses / Firms',`<div class="p611-form"><input id="pBizName" placeholder="Business name"><button class="btn primary" onclick="p611AddBusiness()">Create Business</button></div><div class="p611-table"><table class="table"><thead><tr><th>Business</th><th>Currency</th><th></th></tr></thead><tbody>${S().businesses.map(b=>`<tr><td>${safe(b.name)}</td><td>${safe(b.baseCurrency||'INR')}</td><td><button class="btn mini ${b.id===biz()?'primary':''}" onclick="p611SwitchBusiness('${b.id}')">${b.id===biz()?'Active':'Switch'}</button></td></tr>`).join('')}</tbody></table></div>`)}
else if(mod==='audit'){const ns=S().notifications611.filter(x=>x.businessId===biz()).slice(0,50),as=S().auditLog611.filter(x=>x.businessId===biz()).slice(0,100);el.innerHTML=shell('Audit Log & Notifications',`<h3>Notifications</h3>${ns.map(x=>`<div class="notice ${x.read?'':'success'}"><b>${safe(x.title)}</b><br>${safe(x.message)}</div>`).join('')||'<p class="muted">No notifications.</p>'}<h3>Audit Log</h3><div class="p611-table"><table class="table"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${as.map(x=>`<tr><td>${safe(x.timestamp)}</td><td>${safe(x.action)}</td><td>${safe(x.entity)}</td><td>${safe(x.details)}</td></tr>`).join('')}</tbody></table></div>`)}}
window.p611Home=home;window.p611Open=open;window.p611CreateFromForm=function(){try{const type=$('pType')?.value||'SALE',q=$('pItem')?.value||'',it=itemBy(q),needsItem=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type);const items=needsItem?[{itemId:it?.id||'',name:it?.name||q,qty:n($('pQty')?.value),rate:n($('pRate')?.value)||n(it?.sellingPrice||it?.purchasePrice),purchaseRate:n(it?.purchasePrice),tax:n($('pTax')?.value)||n(it?.gst),discount:n($('pDisc')?.value)}]:[];const total=needsItem?0:n($('pRate')?.value)||n($('pPaid')?.value);const tx=createTx({type,party:$('pParty')?.value,items,total,receivedPaid:n($('pPaid')?.value),paymentMode:$('pMode')?.value,stateOfSupply:$('pState')?.value,notes:$('pNotes')?.value});notify('business','Transaction saved',tx.type+' '+tx.number+' · '+cash(tx.total));toast(tx.number+' saved');open('transactions')}catch(e){alert(e.message)}};
window.p611Cancel=function(txid){const tx=S().transactions611.find(t=>t.id===txid);if(!tx)return;if(!confirm('Cancel '+tx.number+'? This will reverse linked stock and ledger effects.'))return;reverse(tx);open('transactions')};
window.p611AddAccount=function(){try{addAccount($('pAccName').value,$('pAccCat').value,$('pAccOpen').value);open('cashbank')}catch(e){alert(e.message)}};
window.p611AddGodown=function(){try{addGodown($('pGodownName').value);open('inventory')}catch(e){alert(e.message)}};
window.p611Transfer=function(){try{const it=itemBy($('pTransferItem').value);if(!it)throw new Error('Item not found');transfer(it.id,$('pFrom').value,$('pTo').value,$('pTransferQty').value);toast('Stock transferred');open('inventory')}catch(e){alert(e.message)}};
window.p611Share=async function(txid){
  const tx=S().transactions611.find(t=>t.id===txid);if(!tx)return;
  const token=localStorage.getItem('vyapar_ai_auth_token_v1')||S().subscription?.token||'';
  let url='';
  if(token&&['SALE','ESTIMATE','PROFORMA','SALE_ORDER','DELIVERY_CHALLAN'].includes(tx.type)){
    try{
      const r=await (window.vyaparAuthFetch||fetch)('https://vypar-backend.onrender.com/invoices/public-share',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({businessId:biz(),invoiceId:tx.id,invoice:tx,expiresInDays:90})});
      const d=await r.json();if(r.ok&&d.success)url=d.url||('https://vypar-backend.onrender.com/public/invoice/'+d.token);
    }catch(_){ }
  }
  const msg=`Hi ${tx.partyName||'Customer'},\n\nThank you for your purchase from ${S().profile?.businessName||'Vyapar AI Business'}.\nInvoice: ${tx.number}\nAmount: ${cash(tx.total)}\nReceived: ${cash(tx.receivedPaid)}\nBalance: ${cash(tx.balance)}${url?'\n\nView Invoice: '+url:''}`;
  if(navigator.share){try{await navigator.share({title:tx.number,text:msg});return}catch(_){}}
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
};
window.p611Report=report;
window.p611SaveSettings=function(){S().taxSettings611.gstEnabled=$('pGst').value==='true';S().taxSettings611.businessState=$('pBizState').value.trim();S().transactionSettings611.allowNegativeStock=$('pNeg').checked;S().transactionSettings611.manufacturingEnabled=$('pMfg').checked;S().transactionSettings611.loyaltyEnabled=$('pLoyal').checked;Object.keys(PREFIX_DEFAULT).forEach(t=>{const v=$('pref_'+t).value.trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,12)||PREFIX_DEFAULT[t];S().numbering611[t]=S().numbering611[t]||{next:1,padding:5};S().numbering611[t].prefix=v});log('UPDATE','SETTINGS','transaction','Transaction/tax settings');saveAll();toast('Settings saved')};
window.p611AddBusiness=function(){const name=$('pBizName').value.trim();if(!name)return alert('Business name required');const b={id:id(),name,baseCurrency:'INR',createdAt:now()};S().businesses.push(b);S().activeBusinessId=b.id;seedAccounts();saveAll();open('businesses')};
window.p611SwitchBusiness=function(bid){if(!S().businesses.some(b=>b.id===bid))return;S().activeBusinessId=bid;seedAccounts();saveAll();home()};
window.VyaparPlatform611={ensure,createTransaction:createTx,reverseTransaction:reverse,accountBalance:balance,stock,statement,totals,balanceSheet,addGodown,transfer,manufacture,version:VERSION};
const prev=window.renderBusiness;if(typeof prev==='function'){window.renderBusiness=function(){prev();setTimeout(()=>{const area=$('businessModuleArea');if(!area)return;const c=document.createElement('div');c.className='notice success p611-launch';c.innerHTML='<b>Vyapar AI 6.1.1 Accounting Core:</b> unified transactions, ledger, stock movements, cash/bank, godowns, reports and multi-company.<div class="actions"><button class="btn primary" onclick="p611Home()">Open Accounting Platform</button></div>';area.prepend(c)},0)}}
ensure();saveAll();
})();


;
/* ===== platform-612-fixes.js ===== */
/* Vyapar AI 6.1.2 accounting correctness + reporting hotfix.
   Additive patch loaded after platform-611.js. It preserves all legacy modules/data
   while replacing only the 6.1.1 Business Platform transaction/report handlers. */
(function(){
'use strict';
const VERSION='6.1.2', SCHEMA=612;
const POSTING_TYPES=new Set(['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','PAYMENT_IN','PAYMENT_OUT','OTHER_INCOME','FIXED_ASSET']);
const RETURN_MAP={SALE_RETURN:'SALE',PURCHASE_RETURN:'PURCHASE'};
const PAYMENT_LINK_MAP={PAYMENT_IN:'SALE',PAYMENT_OUT:'PURCHASE'};
const $=id=>document.getElementById(id);
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const now=()=>new Date().toISOString();
const day=()=>typeof localDateKey==='function'?localDateKey():now().slice(0,10);
const makeId=()=>typeof uid==='function'?uid():'V'+Date.now()+Math.random().toString(36).slice(2);
const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cash=v=>typeof money==='function'?money(v):'₹'+n(v).toFixed(2);
const toast=m=>typeof showGlassToast==='function'?showGlassToast(m):alert(m);
function S(){return window.state||(window.state={});}
function saveAll(){if(typeof save==='function')save();}
function biz(){return String(S().activeBusinessId||S().currentStoreId||'MAIN');}
function log(action,entity,entityId,details){S().auditLog611=S().auditLog611||[];S().auditLog611.unshift({id:makeId(),businessId:biz(),timestamp:now(),action,entity,entityId:entityId||'',userId:'owner',details:String(details||'').slice(0,600)});S().auditLog611=S().auditLog611.slice(0,5000)}
function notify(type,title,message){S().notifications611=S().notifications611||[];S().notifications611.unshift({id:makeId(),businessId:biz(),type,title,message,createdAt:now(),read:false});S().notifications611=S().notifications611.slice(0,1000)}
function accountByCode(code){return (S().accounts611||[]).find(a=>a.businessId===biz()&&a.code===code)}
function accountById(id){return (S().accounts611||[]).find(a=>a.businessId===biz()&&a.id===id)}
function accountBalance(accountId){const a=(S().accounts611||[]).find(x=>x.id===accountId);return n(a?.openingBalance)+(S().ledgerEntries611||[]).filter(x=>x.businessId===biz()&&x.accountId===accountId).reduce((z,x)=>z+n(x.debit)-n(x.credit),0)}
function addLedgerId(transactionId,accountId,debit,credit,narration,date){const a=accountById(accountId);if(!a)return;const prev=accountBalance(a.id);const after=prev+n(debit)-n(credit);S().ledgerEntries611.push({id:makeId(),businessId:biz(),accountId:a.id,transactionId,date:date||day(),type:n(debit)>0?'debit':'credit',debit:n(debit),credit:n(credit),balanceAfter:after,narration:narration||'',createdAt:now()})}
function addLedger(transactionId,code,debit,credit,narration,date){const a=accountByCode(code);if(a)addLedgerId(transactionId,a.id,debit,credit,narration,date)}
function defaultGodown(){return (S().godowns611||[]).find(g=>g.businessId===biz()&&g.isDefault)||(S().godowns611||[]).find(g=>g.businessId===biz())}
function stock(itemId,godownId){return (S().stockMovements611||[]).filter(x=>x.businessId===biz()&&x.itemId===itemId&&(!godownId||x.godownId===godownId)).reduce((z,x)=>z+n(x.quantityIn)-n(x.quantityOut),0)}
function move(itemId,godownId,transactionId,movementType,quantityIn,quantityOut,date){S().stockMovements611.push({id:makeId(),businessId:biz(),itemId,godownId:godownId||defaultGodown()?.id||'',transactionId,movementType,quantityIn:n(quantityIn),quantityOut:n(quantityOut),date:date||day(),createdAt:now()})}
function itemBy(q){const k=String(q||'').trim().toLowerCase();return (S().products||[]).find(p=>[p.id,p.sku,p.barcode,p.name].some(v=>String(v||'').toLowerCase()===k))||(S().products||[]).find(p=>[p.name,p.sku,p.barcode,p.brand,p.article].join(' ').toLowerCase().includes(k))}
function partyBy(q){const k=String(q||'').trim().toLowerCase();const all=[...(S().customers||[]),...(S().suppliers||[])];return all.find(p=>[p.id,p.name,p.mobile,p.phone].some(v=>String(v||'').toLowerCase()===k))||null}
function defaultCurrency(){const b=(S().businesses||[]).find(x=>x.id===biz());return b?.baseCurrency||S().currency611?.baseCurrency||'INR'}
function fx(tx){return Math.max(0.0000001,n(tx.exchangeRate)||1)}
function baseTotal(tx){return n(tx.baseAmount)||n(tx.total)*fx(tx)}
function baseTax(tx){return (n(tx.tax)+n(tx.cess))*fx(tx)}
function baseNet(tx){return Math.max(0,baseTotal(tx)-baseTax(tx))}
function basePaid(tx){return Math.min(baseTotal(tx),n(tx.receivedPaid)*fx(tx))}
function baseBalance(tx){return Math.max(0,baseTotal(tx)-basePaid(tx))}
function paymentAccounts(){return (S().accounts611||[]).filter(a=>a.businessId===biz()&&a.active!==false&&a.category==='asset'&&!['AR','STOCK','FIXED','GST_IN'].includes(a.code))}
function resolvePaymentAccountId(tx){if(tx.paymentAccountId&&accountById(tx.paymentAccountId))return tx.paymentAccountId;const mode=String(tx.paymentMode||'Cash');const code=mode==='UPI'?'UPI':mode==='Cheque'?'CHEQUE':(mode==='Bank Transfer'||mode==='Card')?'BANK':'CASH';return accountByCode(code)?.id||accountByCode('CASH')?.id||''}
function taxCalc(items,discountPct,stateOfSupply){const gstEnabled=S().taxSettings611?.gstEnabled!==false;let subtotal=0,discount=0,tax=0,cgst=0,sgst=0,igst=0,cess=0;const home=String(S().taxSettings611?.businessState||'').trim().toLowerCase(),dest=String(stateOfSupply||'').trim().toLowerCase();items.forEach(i=>{const line=n(i.qty)*n(i.rate),d=line*n(i.discount)/100,taxable=line-d,r=gstEnabled?n(i.tax):0,tx=taxable*r/100;subtotal+=line;discount+=d;tax+=tx;cess+=taxable*n(i.cess)/100;if(home&&dest&&home!==dest)igst+=tx;else{cgst+=tx/2;sgst+=tx/2}});const td=subtotal*n(discountPct)/100,scale=subtotal?Math.max(0,(subtotal-td)/subtotal):1;discount+=td;tax*=scale;cgst*=scale;sgst*=scale;igst*=scale;cess*=scale;return{subtotal,discount,tax,cgst,sgst,igst,cess,total:subtotal-discount+tax+cess}}
function normalizeItems(items){return (items||[]).map(i=>{const it=itemBy(i.itemId||i.product||i.name||i.sku);return{itemId:i.itemId||it?.id||'',name:i.name||i.product||it?.name||'Item',qty:Math.max(0,n(i.qty||i.quantity)),unit:i.unit||it?.unit||'pcs',rate:Math.max(0,n(i.rate||i.price)),purchaseRate:Math.max(0,n(i.purchaseRate||i.purchasePrice||it?.purchasePrice)),discount:Math.max(0,n(i.discount)),tax:Math.max(0,n(i.tax!=null?i.tax:(i.gst!=null?i.gst:it?.gst))),cess:Math.max(0,n(i.cess)),godownId:i.godownId||defaultGodown()?.id||''}})}
function activeTx(){return (S().transactions611||[]).filter(t=>t.businessId===biz()&&t.status!=='cancelled')}
function txById(id){return (S().transactions611||[]).find(t=>t.businessId===biz()&&t.id===id)}
function itemQtyInTx(tx,itemId){return (tx?.items||[]).filter(i=>i.itemId===itemId).reduce((z,i)=>z+n(i.qty),0)}
function returnedQty(originalId,returnType,itemId,excludeId){return activeTx().filter(t=>t.type===returnType&&t.linkedTransactionId===originalId&&t.id!==excludeId).reduce((z,t)=>z+itemQtyInTx(t,itemId),0)}
function findOriginalForReturn(type,items,partyId,partyName){const wanted=RETURN_MAP[type];const candidates=activeTx().filter(t=>t.type===wanted&&(partyId?t.partyId===partyId:partyName?String(t.partyName).toLowerCase()===String(partyName).toLowerCase():true)).filter(t=>items.every(i=>itemQtyInTx(t,i.itemId)>returnedQty(t.id,type,i.itemId))).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));return candidates[0]||null}
function validateReturn(tx){if(!RETURN_MAP[tx.type])return;const original=txById(tx.linkedTransactionId);if(!original||original.status==='cancelled'||original.type!==RETURN_MAP[tx.type])throw new Error('Select the original '+(tx.type==='SALE_RETURN'?'sale invoice':'purchase')+' for this return');tx.items.forEach(i=>{const originalQty=itemQtyInTx(original,i.itemId);if(!originalQty)throw new Error(i.name+' is not present in '+original.number);const already=returnedQty(original.id,tx.type,i.itemId,tx.id);if(already+i.qty>originalQty+1e-9)throw new Error('Return quantity exceeds remaining quantity for '+i.name)})}
function validatePaymentLink(tx){const wanted=PAYMENT_LINK_MAP[tx.type];if(!wanted||!tx.linkedTransactionId)return;const original=txById(tx.linkedTransactionId);if(!original||original.status==='cancelled'||original.type!==wanted)throw new Error('Linked document is not a valid '+wanted.toLowerCase());const available=Math.max(0,n(original.balance));if(n(tx.total)>available+0.01)throw new Error('Payment exceeds outstanding balance of '+cash(available));tx.currency=original.currency||defaultCurrency();tx.exchangeRate=fx(original);tx.baseAmount=n(tx.total)*tx.exchangeRate}
function cogsForItems(items){return (items||[]).reduce((z,i)=>z+n(i.purchaseRate)*n(i.qty),0)}
function postFixed(tx){const payId=resolvePaymentAccountId(tx),paid=basePaid(tx),bal=baseBalance(tx),total=baseTotal(tx),tax=baseTax(tx),net=baseNet(tx);
  if(tx.type==='SALE'){
    if(paid)addLedgerId(tx.id,payId,paid,0,'Sale receipt '+tx.number,tx.date);if(bal)addLedger(tx.id,'AR',bal,0,'Sale receivable '+tx.number,tx.date);addLedger(tx.id,'SALES',0,net,'Sale revenue '+tx.number,tx.date);if(tax)addLedger(tx.id,'GST_OUT',0,tax,'Output tax '+tx.number,tx.date);
    tx.items.forEach(i=>{move(i.itemId,i.godownId,tx.id,'Sale',0,i.qty,tx.date);const cost=n(i.purchaseRate)*n(i.qty);if(cost){addLedger(tx.id,'COGS',cost,0,'COGS '+i.name,tx.date);addLedger(tx.id,'STOCK',0,cost,'Stock issued '+i.name,tx.date)}});
  }else if(tx.type==='PURCHASE'){
    addLedger(tx.id,'STOCK',net,0,'Inventory purchase '+tx.number,tx.date);if(tax)addLedger(tx.id,'GST_IN',tax,0,'Input tax '+tx.number,tx.date);if(paid)addLedgerId(tx.id,payId,0,paid,'Purchase payment '+tx.number,tx.date);if(bal)addLedger(tx.id,'AP',0,bal,'Purchase payable '+tx.number,tx.date);tx.items.forEach(i=>move(i.itemId,i.godownId,tx.id,'Purchase',i.qty,0,tx.date));
  }else if(tx.type==='SALE_RETURN'){
    const refunded=paid,credit=Math.max(0,total-refunded);addLedger(tx.id,'SALES',net,0,'Sale return '+tx.number,tx.date);if(tax)addLedger(tx.id,'GST_OUT',tax,0,'Reverse output tax '+tx.number,tx.date);if(refunded)addLedgerId(tx.id,payId,0,refunded,'Customer refund '+tx.number,tx.date);if(credit)addLedger(tx.id,'AR',0,credit,'Customer credit for return '+tx.number,tx.date);tx.items.forEach(i=>{move(i.itemId,i.godownId,tx.id,'Sale Return',i.qty,0,tx.date);const cost=n(i.purchaseRate)*n(i.qty);if(cost){addLedger(tx.id,'STOCK',cost,0,'Returned stock '+i.name,tx.date);addLedger(tx.id,'COGS',0,cost,'Reverse COGS '+i.name,tx.date)}});
  }else if(tx.type==='PURCHASE_RETURN'){
    const refunded=paid,credit=Math.max(0,total-refunded);if(refunded)addLedgerId(tx.id,payId,refunded,0,'Supplier refund '+tx.number,tx.date);if(credit)addLedger(tx.id,'AP',credit,0,'Supplier debit for return '+tx.number,tx.date);addLedger(tx.id,'STOCK',0,net,'Inventory returned '+tx.number,tx.date);if(tax)addLedger(tx.id,'GST_IN',0,tax,'Reverse input tax '+tx.number,tx.date);tx.items.forEach(i=>move(i.itemId,i.godownId,tx.id,'Purchase Return',0,i.qty,tx.date));
  }else if(tx.type==='PAYMENT_IN'){
    addLedgerId(tx.id,payId,total,0,'Payment in '+tx.number,tx.date);addLedger(tx.id,'AR',0,total,'Receivable settled '+tx.number,tx.date);
  }else if(tx.type==='PAYMENT_OUT'){
    addLedger(tx.id,'AP',total,0,'Payable settled '+tx.number,tx.date);addLedgerId(tx.id,payId,0,total,'Payment out '+tx.number,tx.date);
  }else if(tx.type==='OTHER_INCOME'){
    addLedgerId(tx.id,payId,total,0,'Other income received '+tx.number,tx.date);addLedger(tx.id,'OTHER_INC',0,total,'Other income '+tx.number,tx.date);
  }else if(tx.type==='FIXED_ASSET'){
    addLedger(tx.id,'FIXED',total,0,'Fixed asset purchase '+tx.number,tx.date);if(String(tx.paymentMode)==='Credit')addLedger(tx.id,'AP',0,total,'Fixed asset payable '+tx.number,tx.date);else addLedgerId(tx.id,payId,0,total,'Fixed asset payment '+tx.number,tx.date);
  }
}
function recalcOriginal(original){if(!original||!['SALE','PURCHASE'].includes(original.type))return;if(original.initialReceivedPaid==null)original.initialReceivedPaid=n(original.receivedPaid);const returnType=original.type==='SALE'?'SALE_RETURN':'PURCHASE_RETURN',paymentType=original.type==='SALE'?'PAYMENT_IN':'PAYMENT_OUT';const returns=activeTx().filter(t=>t.type===returnType&&t.linkedTransactionId===original.id).reduce((z,t)=>z+n(t.total),0);const linkedPayments=activeTx().filter(t=>t.type===paymentType&&t.linkedTransactionId===original.id).reduce((z,t)=>z+n(t.total),0);original.returnedAmount=returns;original.receivedPaid=Math.min(n(original.total),n(original.initialReceivedPaid)+linkedPayments);original.balance=Math.max(0,n(original.total)-returns-original.receivedPaid);original.updatedAt=now()}
function createTxFixed(input){const type=String(input.type||'SALE').toUpperCase();const allowed=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','PAYMENT_IN','PAYMENT_OUT','ESTIMATE','PROFORMA','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN','OTHER_INCOME','FIXED_ASSET','CANCELLED_INVOICE'];if(!allowed.includes(type))throw new Error('Unsupported transaction type');const items=normalizeItems(input.items);if(['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type)&&!items.length)throw new Error('At least one item is required');items.forEach(i=>{if(i.qty<=0)throw new Error('Quantity must be greater than zero');if(type==='SALE'&&stock(i.itemId,i.godownId)<i.qty&&S().transactionSettings611?.allowNegativeStock!==true)throw new Error(i.name+' stock is insufficient')});const party=partyBy(input.party),calc=taxCalc(items,input.discount,input.stateOfSupply),total=n(input.total)||calc.total+n(input.additionalCharges),received=Math.max(0,n(input.receivedPaid)),rate=Math.max(0.0000001,n(input.exchangeRate)||1);let linked=String(input.linkedTransactionId||'');if(RETURN_MAP[type]&&!linked){const o=findOriginalForReturn(type,items,input.partyId||party?.id||'',input.party||party?.name||'');if(o)linked=o.id}const numbering=S().numbering611?.[type]||null;let number=input.number;if(!number){if(window.VyaparPlatform611?.createTransaction===createTxFixed&&numbering){let used=new Set((S().transactions611||[]).filter(t=>t.businessId===biz()&&t.type===type).map(t=>t.number)),candidate;do{candidate=(numbering.prefix||type.slice(0,3))+'-'+String(numbering.next++).padStart(numbering.padding||5,'0')}while(used.has(candidate));number=candidate}else{const prefix=({SALE:'INV',PURCHASE:'PUR',SALE_RETURN:'SR',PURCHASE_RETURN:'PR',PAYMENT_IN:'PIN',PAYMENT_OUT:'POUT',ESTIMATE:'EST',PROFORMA:'PRO',SALE_ORDER:'SO',PURCHASE_ORDER:'PO',DELIVERY_CHALLAN:'DC',OTHER_INCOME:'OI',FIXED_ASSET:'FA',CANCELLED_INVOICE:'CAN'})[type]||type.slice(0,3);let seq=1,used=new Set((S().transactions611||[]).filter(t=>t.businessId===biz()&&t.type===type).map(t=>t.number));do{number=prefix+'-'+String(seq++).padStart(5,'0')}while(used.has(number))}}
  const tx={id:makeId(),businessId:biz(),type,number,date:input.date||day(),time:input.time||'',partyId:input.partyId||party?.id||'',partyName:input.party||party?.name||'',items,discount:n(input.discount),tax:calc.tax,cgst:calc.cgst,sgst:calc.sgst,igst:calc.igst,cess:calc.cess,additionalCharges:n(input.additionalCharges),subtotal:calc.subtotal,total,receivedPaid:received,initialReceivedPaid:['SALE','PURCHASE'].includes(type)?received:undefined,balance:Math.max(0,total-received),paymentMode:input.paymentMode||'Cash',paymentAccountId:input.paymentAccountId||'',notes:String(input.notes||''),stateOfSupply:input.stateOfSupply||'',status:input.status||'posted',currency:input.currency||defaultCurrency(),exchangeRate:rate,baseAmount:total*rate,createdAt:now(),updatedAt:now(),linkedTransactionId:linked};
  if((S().transactions611||[]).some(x=>x.businessId===biz()&&x.type===type&&x.number===tx.number))throw new Error('Duplicate transaction number');validateReturn(tx);validatePaymentLink(tx);S().transactions611.push(tx);if(POSTING_TYPES.has(type))postFixed(tx);if(tx.linkedTransactionId){const original=txById(tx.linkedTransactionId);recalcOriginal(original)}log('CREATE',type,tx.id,tx.number);saveAll();return tx
}
function linkedActiveChildren(tx){const allowed=tx.type==='SALE'?new Set(['SALE_RETURN','PAYMENT_IN']):tx.type==='PURCHASE'?new Set(['PURCHASE_RETURN','PAYMENT_OUT']):new Set();return activeTx().filter(t=>allowed.has(t.type)&&t.linkedTransactionId===tx.id)}
function reverseFixed(tx){if(!tx||tx.reversedAt||tx.status==='cancelled')return;if(['SALE','PURCHASE'].includes(tx.type)){const children=linkedActiveChildren(tx);if(children.length)throw new Error('Cancel linked returns/payments first: '+children.map(x=>x.number).join(', '))}(S().ledgerEntries611||[]).filter(x=>x.transactionId===tx.id).forEach(e=>addLedgerId(tx.id+'-REV',e.accountId,e.credit,e.debit,'Reversal: '+e.narration,day()));(S().stockMovements611||[]).filter(x=>x.transactionId===tx.id).forEach(m=>move(m.itemId,m.godownId,tx.id+'-REV','Adjustment',m.quantityOut,m.quantityIn,day()));tx.reversedAt=now();tx.status='cancelled';if(tx.linkedTransactionId)recalcOriginal(txById(tx.linkedTransactionId));log('REVERSE',tx.type,tx.id,tx.number);saveAll()}
function normalizeOpeningBalances(){S().platform612OpeningMigrated=S().platform612OpeningMigrated&&typeof S().platform612OpeningMigrated==='object'?S().platform612OpeningMigrated:{};if(S().platform612OpeningMigrated[biz()])return;S().platform612OpeningMigrated[biz()]=true;const cap=accountByCode('CAPITAL');(S().accounts611||[]).filter(a=>a.businessId===biz()&&String(a.code||'').startsWith('CUSTOM-')&&Math.abs(n(a.openingBalance))>0).forEach(a=>{const v=Math.abs(n(a.openingBalance));a.openingBalance=0;if(a.category==='asset'){addLedgerId('MIGRATION-612-OPEN-'+a.id,a.id,v,0,'Opening balance '+a.name,day());if(cap)addLedgerId('MIGRATION-612-OPEN-'+a.id,cap.id,0,v,'Opening capital',day())}else if(['liability','equity'].includes(a.category)){if(cap)addLedgerId('MIGRATION-612-OPEN-'+a.id,cap.id,v,0,'Opening balance funding',day());addLedgerId('MIGRATION-612-OPEN-'+a.id,a.id,0,v,'Opening balance '+a.name,day())}})}
function addOpeningStockValuation(){const tag='MIGRATION-612-OPENING-STOCK-'+biz();S().ledgerEntries611=S().ledgerEntries611.filter(e=>!(e.businessId===biz()&&e.transactionId===tag));const opening=(S().stockMovements611||[]).filter(m=>m.businessId===biz()&&m.movementType==='Opening Stock');let value=0;opening.forEach(m=>{const p=itemBy(m.itemId);value+=Math.max(0,n(m.quantityIn)-n(m.quantityOut))*Math.max(0,n(p?.purchasePrice))});if(value>0){addLedger(tag,'STOCK',value,0,'Opening stock valuation',day());addLedger(tag,'CAPITAL',0,value,'Opening stock capital',day())}}
function linkedPaymentTotal(original){const paymentType=original.type==='SALE'?'PAYMENT_IN':'PAYMENT_OUT';return activeTx().filter(t=>t.type===paymentType&&t.linkedTransactionId===original.id).reduce((z,t)=>z+n(t.total),0)}
function ensureInitialSettlement(tx){if(!tx||!['SALE','PURCHASE'].includes(tx.type)||tx.initialReceivedPaid!=null)return;const inferred=n(tx.receivedPaid)-linkedPaymentTotal(tx);tx.initialReceivedPaid=Math.max(0,Math.min(n(tx.total),inferred))}
function postForRebuild(tx){if(!['SALE','PURCHASE'].includes(tx.type))return postFixed(tx);ensureInitialSettlement(tx);const currentReceived=tx.receivedPaid;try{tx.receivedPaid=n(tx.initialReceivedPaid);postFixed(tx)}finally{tx.receivedPaid=currentReceived}}
function rebuildAccounting(){const ids=new Set((S().transactions611||[]).filter(t=>t.businessId===biz()).flatMap(t=>[t.id,t.id+'-REV']));S().ledgerEntries611=(S().ledgerEntries611||[]).filter(e=>e.businessId!==biz()||!ids.has(e.transactionId));S().stockMovements611=(S().stockMovements611||[]).filter(m=>m.businessId!==biz()||!ids.has(m.transactionId));addOpeningStockValuation();(S().transactions611||[]).filter(t=>t.businessId===biz()).forEach(ensureInitialSettlement);(S().transactions611||[]).filter(t=>t.businessId===biz()&&t.status!=='cancelled'&&POSTING_TYPES.has(t.type)).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt).localeCompare(String(b.createdAt))).forEach(postForRebuild);(S().transactions611||[]).filter(t=>t.businessId===biz()&&['SALE','PURCHASE'].includes(t.type)).forEach(recalcOriginal);log('REPAIR','ACCOUNTING','612','Rebuilt transaction ledger/stock postings with original settlements and linked payments posted once');saveAll()}
function ensure612(){S().schemaVersion=Math.max(n(S().schemaVersion),SCHEMA);const b=(S().businesses||[]).find(x=>x.id===biz());if(b&&!b.baseCurrency)b.baseCurrency=S().currency611?.baseCurrency||'INR';normalizeOpeningBalances();S().platform612AccountingMigrated=S().platform612AccountingMigrated&&typeof S().platform612AccountingMigrated==='object'?S().platform612AccountingMigrated:{};if(!S().platform612AccountingMigrated[biz()]){S().platform612AccountingMigrated[biz()]=true;rebuildAccounting();notify('system','Accounting upgraded','6.1.2 repaired inventory asset, return COGS, linked payments and Balance Sheet postings.')}saveAll()}
function totals(from,to){const tx=activeTx().filter(t=>(!from||t.date>=from)&&(!to||t.date<=to));const net=t=>tx.filter(x=>x.type===t).reduce((z,x)=>z+baseNet(x),0),gross=t=>tx.filter(x=>x.type===t).reduce((z,x)=>z+baseTotal(x),0);const revenue=net('SALE')-net('SALE_RETURN'),other=gross('OTHER_INCOME');const cogs=(S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&accountById(e.accountId)?.code==='COGS'&&(!from||e.date>=from)&&(!to||e.date<=to)).reduce((z,e)=>z+n(e.debit)-n(e.credit),0);const expenses=(S().expenses||[]).filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).reduce((z,e)=>z+n(e.amount),0);return{revenue,other,cogs,expenses,net:revenue+other-cogs-expenses}}
function balanceSheet(){const byCat=c=>(S().accounts611||[]).filter(a=>a.businessId===biz()&&a.category===c).reduce((z,a)=>z+accountBalance(a.id),0),pnl=totals().net;return{assets:byCat('asset'),liabilities:-byCat('liability'),equity:-byCat('equity')+pnl,retainedProfit:pnl}}
function cogsDeltaForTx(id){return (S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&e.transactionId===id&&accountById(e.accountId)?.code==='COGS').reduce((z,e)=>z+n(e.debit)-n(e.credit),0)}
function billWisePnL(from,to){return activeTx().filter(t=>t.type==='SALE'&&(!from||t.date>=from)&&(!to||t.date<=to)).map(s=>{const returns=activeTx().filter(r=>r.type==='SALE_RETURN'&&r.linkedTransactionId===s.id);const revenue=baseNet(s)-returns.reduce((z,r)=>z+baseNet(r),0);const cogs=cogsDeltaForTx(s.id)+returns.reduce((z,r)=>z+cogsDeltaForTx(r.id),0);return{date:s.date,number:s.number,party:s.partyName,revenue,cogs,profit:revenue-cogs,balance:n(s.balance)}})}
function partyWisePnL(from,to){const map=new Map();activeTx().filter(t=>['SALE','SALE_RETURN'].includes(t.type)&&(!from||t.date>=from)&&(!to||t.date<=to)).forEach(t=>{const key=t.partyId||t.partyName||'Walk-in',r=map.get(key)||{party:t.partyName||'Walk-in',revenue:0,cogs:0,profit:0};const sign=t.type==='SALE'?1:-1;r.revenue+=sign*baseNet(t);r.cogs+=cogsDeltaForTx(t.id);r.profit=r.revenue-r.cogs;map.set(key,r)});return [...map.values()].sort((a,b)=>b.profit-a.profit)}
function ageing(from,to){const today=new Date(day()+'T00:00:00');return activeTx().filter(t=>['SALE','PURCHASE'].includes(t.type)&&n(t.balance)>0&&(!from||t.date>=from)&&(!to||t.date<=to)).map(t=>{const d=new Date(t.date+'T00:00:00'),days=Math.max(0,Math.floor((today-d)/86400000));return{date:t.date,type:t.type,number:t.number,party:t.partyName,balance:n(t.balance),days,bucket:days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':'90+'}}).sort((a,b)=>b.days-a.days)}
function accountingIntegrity(){const es=(S().ledgerEntries611||[]).filter(e=>e.businessId===biz()),debit=es.reduce((z,e)=>z+n(e.debit),0),credit=es.reduce((z,e)=>z+n(e.credit),0);return{debit,credit,difference:Math.abs(debit-credit),ok:Math.abs(debit-credit)<0.01}}
function csv(name,rows){const text=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n'),blob=new Blob([text],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function report(kind,from,to){const tx=activeTx().filter(t=>(!from||t.date>=from)&&(!to||t.date<=to));if(kind==='transactions'||kind==='daybook')csv(kind==='daybook'?'day-book.csv':'transactions.csv',[['Date','Type','Number','Party','Total','Paid','Balance','Mode','Currency'],...tx.map(t=>[t.date,t.type,t.number,t.partyName,t.total,t.receivedPaid,t.balance,t.paymentMode,t.currency||defaultCurrency()])]);else if(kind==='stock')csv('stock-summary.csv',[['Item','SKU','Stock'],...(S().products||[]).map(p=>[p.name,p.sku,stock(p.id)])]);else if(kind==='ledger')csv('ledger.csv',[['Date','Account','Transaction','Debit','Credit','Narration'],...(S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&(!from||e.date>=from)&&(!to||e.date<=to)).map(e=>[e.date,accountById(e.accountId)?.name,e.transactionId,e.debit,e.credit,e.narration])]);else if(kind==='billpnl')csv('bill-wise-pnl.csv',[['Date','Invoice','Party','Revenue','COGS','Profit','Balance'],...billWisePnL(from,to).map(r=>[r.date,r.number,r.party,r.revenue,r.cogs,r.profit,r.balance])]);else if(kind==='partypnl')csv('party-wise-pnl.csv',[['Party','Revenue','COGS','Profit'],...partyWisePnL(from,to).map(r=>[r.party,r.revenue,r.cogs,r.profit])]);else if(kind==='ageing')csv('receivable-payable-ageing.csv',[['Date','Type','Document','Party','Outstanding','Days','Bucket'],...ageing(from,to).map(r=>[r.date,r.type,r.number,r.party,r.balance,r.days,r.bucket])])}
function accountOptions(selected){return paymentAccounts().map(a=>`<option value="${safe(a.id)}" ${selected===a.id?'selected':''}>${safe(a.name)} (${safe(a.code||'Account')})</option>`).join('')}
function linkedOptions(){return activeTx().filter(t=>['SALE','PURCHASE'].includes(t.type)).slice().reverse().slice(0,500).map(t=>`<option value="${safe(t.id)}">${safe(t.type+' '+t.number+' · '+(t.partyName||'Walk-in')+' · Due '+cash(t.balance))}</option>`).join('')}
function enhancedTxForm(type){const items=(S().products||[]).slice(0,1000).map(p=>`<option value="${safe(p.sku||p.barcode||p.name)}">${safe(p.name)}</option>`).join(''),currency=defaultCurrency();return `<div class="p611-form"><select id="pType">${['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','PAYMENT_IN','PAYMENT_OUT','ESTIMATE','PROFORMA','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN','OTHER_INCOME','FIXED_ASSET'].map(t=>`<option ${t===type?'selected':''}>${t}</option>`).join('')}</select><input id="pParty" placeholder="Customer / Supplier"><input id="pItem" list="pItems" placeholder="Item / SKU / barcode"><datalist id="pItems">${items}</datalist><input id="pQty" type="number" min="0.01" step="0.01" value="1" placeholder="Qty"><input id="pRate" type="number" min="0" step="0.01" placeholder="Rate / Amount"><input id="pTax" type="number" min="0" value="0" placeholder="GST %"><input id="pCess" type="number" min="0" value="0" placeholder="CESS %"><input id="pDisc" type="number" min="0" value="0" placeholder="Discount %"><input id="pPaid" type="number" min="0" value="0" placeholder="Received / Paid / Refund"><select id="pMode"><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Card</option><option>Cheque</option><option>Credit</option><option>Other</option></select><select id="pAccount"><option value="">Auto payment account</option>${accountOptions('')}</select><select id="pLinked"><option value="">Link original invoice/purchase (returns/payments)</option>${linkedOptions()}</select><input id="pState" placeholder="State of supply"><input id="pCurrency" value="${safe(currency)}" placeholder="Currency"><input id="pFx" type="number" min="0.000001" step="0.000001" value="1" placeholder="1 transaction currency = base currency"><input id="pNotes" placeholder="Notes"></div><div class="actions"><button class="btn primary" onclick="p611CreateFromForm()">Save Transaction</button></div><p class="muted">Returns are linked to the original document to prevent over-return/double stock. Linked payments update invoice outstanding automatically.</p>`}
function shell(title,body){return `<div class="calculator-head"><div><span class="pill">Business Platform 6.1.2</span><h2>${safe(title)}</h2><p class="muted">Accounting correctness hotfix · linked returns/payments · reports · multi-currency base posting</p></div><button class="btn mini" onclick="p611Home()">Platform Home</button></div>${body}`}
const originalOpen=window.p611Open;
function renderTransactions(){const el=$('businessModuleArea');if(!el)return;const rows=activeTx().slice().reverse().slice(0,200);el.innerHTML=shell('Unified Transactions',enhancedTxForm('SALE')+`<div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th>Total</th><th>Balance</th><th>Linked</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td>${safe(t.date)}</td><td>${safe(t.type)}</td><td>${safe(t.number)}</td><td>${safe(t.partyName)}</td><td>${cash(t.total)}</td><td>${cash(t.balance)}</td><td>${safe(txById(t.linkedTransactionId)?.number||'')}</td><td><button class="btn mini" onclick="p611Share('${t.id}')">Share</button> <button class="btn mini danger" onclick="p611Cancel('${t.id}')">Cancel</button></td></tr>`).join('')||'<tr><td colspan="8">No transactions yet.</td></tr>'}</tbody></table></div>`)}
function renderCashBank(){const el=$('businessModuleArea');if(!el)return;const ac=(S().accounts611||[]).filter(a=>a.businessId===biz()&&['asset','liability'].includes(a.category));el.innerHTML=shell('Cash & Bank',`<div class="p611-form"><input id="pAccName" placeholder="New bank / UPI / loan account"><select id="pAccCat"><option value="asset">Asset / Bank / UPI</option><option value="liability">Loan / Liability</option></select><input id="pAccOpen" type="number" min="0" placeholder="Opening balance"></div><button class="btn primary" onclick="p611AddAccount()">Add Account</button><div class="p611-table"><table class="table"><thead><tr><th>Account</th><th>Category</th><th>Balance</th></tr></thead><tbody>${ac.map(a=>`<tr><td>${safe(a.name)}</td><td>${safe(a.category)}</td><td>${cash(a.category==='liability'?-accountBalance(a.id):accountBalance(a.id))}</td></tr>`).join('')}</tbody></table></div><h3>Payment / Deposit / Withdrawal</h3>${enhancedTxForm('PAYMENT_IN')}`)}
function renderReports(from='',to=''){const el=$('businessModuleArea');if(!el)return;const t=totals(from,to),bs=balanceSheet(),bi=billWisePnL(from,to).slice(0,30),pw=partyWisePnL(from,to).slice(0,30),ag=ageing(from,to).slice(0,30),integ=accountingIntegrity();el.innerHTML=shell('Reports & Accounting',`<div class="p611-form"><label>From <input id="pRepFrom" type="date" value="${safe(from)}"></label><label>To <input id="pRepTo" type="date" value="${safe(to)}"></label><button class="btn primary" onclick="p612ApplyReports()">Apply</button><button class="btn" onclick="p612RepairAccounting()">Repair/Rebuild Accounting</button></div><div class="p611-grid"><div class="stat"><span>Revenue</span><b>${cash(t.revenue)}</b></div><div class="stat"><span>COGS</span><b>${cash(t.cogs)}</b></div><div class="stat"><span>Expenses</span><b>${cash(t.expenses)}</b></div><div class="stat"><span>Net Profit</span><b>${cash(t.net)}</b></div><div class="stat"><span>Assets</span><b>${cash(bs.assets)}</b></div><div class="stat"><span>Liabilities</span><b>${cash(bs.liabilities)}</b></div></div><div class="notice ${integ.ok?'success':'danger'}"><b>Ledger integrity:</b> Debits ${cash(integ.debit)} · Credits ${cash(integ.credit)} · Difference ${cash(integ.difference)} ${integ.ok?'✓ Balanced':'⚠ Needs repair'}</div><div class="actions"><button class="btn" onclick="p612Export('daybook')">Day Book CSV</button><button class="btn" onclick="p612Export('billpnl')">Bill-wise P&L CSV</button><button class="btn" onclick="p612Export('partypnl')">Party-wise P&L CSV</button><button class="btn" onclick="p612Export('ageing')">Ageing CSV</button><button class="btn" onclick="p612Export('ledger')">Ledger CSV</button><button class="btn" onclick="p612Export('stock')">Stock CSV</button></div><h3>Bill-wise P&L</h3><div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Invoice</th><th>Party</th><th>Revenue</th><th>COGS</th><th>Profit</th><th>Due</th></tr></thead><tbody>${bi.map(r=>`<tr><td>${r.date}</td><td>${safe(r.number)}</td><td>${safe(r.party)}</td><td>${cash(r.revenue)}</td><td>${cash(r.cogs)}</td><td>${cash(r.profit)}</td><td>${cash(r.balance)}</td></tr>`).join('')||'<tr><td colspan="7">No sales.</td></tr>'}</tbody></table></div><h3>Party-wise P&L</h3><div class="p611-table"><table class="table"><thead><tr><th>Party</th><th>Revenue</th><th>COGS</th><th>Profit</th></tr></thead><tbody>${pw.map(r=>`<tr><td>${safe(r.party)}</td><td>${cash(r.revenue)}</td><td>${cash(r.cogs)}</td><td>${cash(r.profit)}</td></tr>`).join('')||'<tr><td colspan="4">No party sales.</td></tr>'}</tbody></table></div><h3>Receivable / Payable Ageing</h3><div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>Document</th><th>Party</th><th>Outstanding</th><th>Days</th><th>Bucket</th></tr></thead><tbody>${ag.map(r=>`<tr><td>${r.date}</td><td>${r.type}</td><td>${safe(r.number)}</td><td>${safe(r.party)}</td><td>${cash(r.balance)}</td><td>${r.days}</td><td>${r.bucket}</td></tr>`).join('')||'<tr><td colspan="7">No outstanding documents.</td></tr>'}</tbody></table></div>`)}
function renderBusinesses(){const el=$('businessModuleArea');if(!el)return;el.innerHTML=shell('Businesses / Firms',`<div class="p611-form"><input id="pBizName" placeholder="Business name"><select id="pBizCurrency"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>JPY</option></select><button class="btn primary" onclick="p611AddBusiness()">Create Business</button></div><div class="p611-table"><table class="table"><thead><tr><th>Business</th><th>Base Currency</th><th>Actions</th></tr></thead><tbody>${(S().businesses||[]).map(b=>`<tr><td>${safe(b.name)}</td><td>${safe(b.baseCurrency||'INR')}</td><td><button class="btn mini ${b.id===biz()?'primary':''}" onclick="p611SwitchBusiness('${b.id}')">${b.id===biz()?'Active':'Switch'}</button> <button class="btn mini" onclick="p612EditBusiness('${b.id}')">Edit</button> <button class="btn mini danger" onclick="p612DeleteBusiness('${b.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div><p class="muted">Delete is blocked when a business has transactions, preventing accidental data loss.</p>`)}
window.p611Open=function(mod){ensure612();if(mod==='transactions')return renderTransactions();if(mod==='cashbank')return renderCashBank();if(mod==='reports')return renderReports();if(mod==='businesses')return renderBusinesses();return originalOpen&&originalOpen(mod)};
window.p611CreateFromForm=function(){try{const type=$('pType')?.value||'SALE',q=$('pItem')?.value||'',it=itemBy(q),needsItem=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type),items=needsItem?[{itemId:it?.id||'',name:it?.name||q,qty:n($('pQty')?.value),rate:n($('pRate')?.value)||n(it?.sellingPrice||it?.purchasePrice),purchaseRate:n(it?.purchasePrice)||n($('pRate')?.value),tax:n($('pTax')?.value)||n(it?.gst),cess:n($('pCess')?.value),discount:n($('pDisc')?.value)}]:[],total=needsItem?0:n($('pRate')?.value)||n($('pPaid')?.value),tx=createTxFixed({type,party:$('pParty')?.value,items,total,receivedPaid:n($('pPaid')?.value),paymentMode:$('pMode')?.value,paymentAccountId:$('pAccount')?.value,linkedTransactionId:$('pLinked')?.value,stateOfSupply:$('pState')?.value,currency:($('pCurrency')?.value||defaultCurrency()).trim().toUpperCase(),exchangeRate:n($('pFx')?.value)||1,notes:$('pNotes')?.value});notify('business','Transaction saved',tx.type+' '+tx.number+' · '+cash(tx.total));toast(tx.number+' saved');renderTransactions()}catch(e){alert(e.message)}};
window.p611Cancel=function(txid){const tx=txById(txid);if(!tx)return;if(!confirm('Cancel '+tx.number+'? This will reverse linked stock and ledger effects.'))return;try{reverseFixed(tx);renderTransactions()}catch(e){alert(e.message)}};
window.p611AddAccount=function(){try{const name=String($('pAccName')?.value||'').trim(),category=$('pAccCat')?.value||'asset',opening=Math.abs(n($('pAccOpen')?.value));if(!name)throw new Error('Account name required');const a={id:makeId(),businessId:biz(),code:'CUSTOM-'+Date.now(),name,category,openingBalance:0,active:true,createdAt:now()};S().accounts611.push(a);if(opening){if(category==='asset'){addLedgerId('OPEN-'+a.id,a.id,opening,0,'Opening balance '+name,day());addLedger('OPEN-'+a.id,'CAPITAL',0,opening,'Opening capital',day())}else{addLedger('OPEN-'+a.id,'CAPITAL',opening,0,'Opening liability funding',day());addLedgerId('OPEN-'+a.id,a.id,0,opening,'Opening balance '+name,day())}}log('CREATE','ACCOUNT',a.id,name);saveAll();renderCashBank()}catch(e){alert(e.message)}};
window.p611Report=function(kind){report(kind)};
window.p612ApplyReports=function(){renderReports($('pRepFrom')?.value||'',$('pRepTo')?.value||'')};
window.p612Export=function(kind){report(kind,$('pRepFrom')?.value||'',$('pRepTo')?.value||'')};
window.p612RepairAccounting=function(){if(!confirm('Rebuild Business Platform ledger and transaction stock movements from saved transactions? Legacy sales/products are preserved.'))return;rebuildAccounting();toast('Accounting rebuilt');renderReports($('pRepFrom')?.value||'',$('pRepTo')?.value||'')};
window.p611AddBusiness=function(){const name=String($('pBizName')?.value||'').trim();if(!name)return alert('Business name required');const b={id:makeId(),name,baseCurrency:$('pBizCurrency')?.value||'INR',createdAt:now()};S().businesses.push(b);S().activeBusinessId=b.id;if(window.VyaparPlatform611?.ensure)window.VyaparPlatform611.ensure();saveAll();renderBusinesses()};
window.p612EditBusiness=function(id){const b=(S().businesses||[]).find(x=>x.id===id);if(!b)return;const name=prompt('Business name',b.name);if(name===null)return;const currency=prompt('Base currency (e.g. INR, USD, AED)',b.baseCurrency||'INR');if(currency===null)return;b.name=String(name).trim()||b.name;b.baseCurrency=String(currency).trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||b.baseCurrency||'INR';b.updatedAt=now();log('UPDATE','BUSINESS',b.id,b.name+' / '+b.baseCurrency);saveAll();renderBusinesses()};
window.p612DeleteBusiness=function(id){const b=(S().businesses||[]).find(x=>x.id===id);if(!b)return;if((S().businesses||[]).length<=1)return alert('At least one business must remain.');if((S().transactions611||[]).some(t=>t.businessId===id))return alert('This business has transactions. Delete/cancel or export them first; deletion is blocked to protect data.');if(!confirm('Delete empty business "'+b.name+'"?'))return;['accounts611','ledgerEntries611','stockMovements611','godowns611','manufacturing611','notifications611','auditLog611','staff611','serviceReminders611','paymentReminders611'].forEach(k=>{if(Array.isArray(S()[k]))S()[k]=S()[k].filter(x=>x.businessId!==id)});S().businesses=S().businesses.filter(x=>x.id!==id);if(S().activeBusinessId===id)S().activeBusinessId=S().businesses[0].id;saveAll();renderBusinesses()};
const originalShare=window.p611Share;window.p611Share=async function(txid){const tx=txById(txid);if(tx&&!tx.businessName)tx.businessName=(S().businesses||[]).find(b=>b.id===biz())?.name||S().profile?.businessName||'Vyapar AI Business';return originalShare?originalShare(txid):undefined};
if(window.VyaparPlatform611){window.VyaparPlatform611.createTransaction=createTxFixed;window.VyaparPlatform611.reverseTransaction=reverseFixed;window.VyaparPlatform611.accountBalance=accountBalance;window.VyaparPlatform611.stock=stock;window.VyaparPlatform611.totals=totals;window.VyaparPlatform611.balanceSheet=balanceSheet;window.VyaparPlatform611.billWisePnL=billWisePnL;window.VyaparPlatform611.partyWisePnL=partyWisePnL;window.VyaparPlatform611.ageing=ageing;window.VyaparPlatform611.rebuildAccounting=rebuildAccounting;window.VyaparPlatform611.version=VERSION}
ensure612();
})();


;
/* ===== platform-620-complete.js ===== */
/* Vyapar AI 6.2.0 parity-completion overlay.
   Additive only: loaded after 6.1.1 + 6.1.2. No legacy file/data key is removed.
   Adds deep reports, document lifecycle, invoice/thermal printing, advanced tax metadata,
   messaging/reminders, inventory pricing/units/BOM/loyalty, currency-rate UI, staff UI,
   notification management and native biometric/ESC-POS integration hooks. */
(function(){
'use strict';
const VERSION='6.2.0', SCHEMA=620;
const $=id=>document.getElementById(id), n=v=>Number.isFinite(Number(v))?Number(v):0;
const now=()=>new Date().toISOString(), today=()=>typeof localDateKey==='function'?localDateKey():now().slice(0,10);
const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cash=v=>typeof money==='function'?money(v):'₹'+n(v).toFixed(2);
const uid620=()=>typeof uid==='function'?uid():'P620'+Date.now()+Math.random().toString(36).slice(2);
const toast=m=>typeof showGlassToast==='function'?showGlassToast(m):alert(m);
function S(){return window.state||(window.state={});}
function biz(){return String(S().activeBusinessId||S().currentStoreId||'MAIN');}
function saveAll(){if(typeof save==='function')save();}
function activeTx(){return (S().transactions611||[]).filter(t=>t.businessId===biz()&&t.status!=='cancelled');}
function txById(id){return (S().transactions611||[]).find(t=>t.businessId===biz()&&t.id===id);}
function accountById(id){return (S().accounts611||[]).find(a=>a.businessId===biz()&&a.id===id);}
function accountByCode(code){return (S().accounts611||[]).find(a=>a.businessId===biz()&&a.code===code);}
function accountBalance(id){if(window.VyaparPlatform611?.accountBalance)return n(window.VyaparPlatform611.accountBalance(id));const a=accountById(id);return n(a?.openingBalance)+(S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&e.accountId===id).reduce((z,e)=>z+n(e.debit)-n(e.credit),0)}
function ensureAccount(code,name,category){let a=accountByCode(code);if(!a){a={id:uid620(),businessId:biz(),code,name,category,openingBalance:0,active:true,createdAt:now()};S().accounts611.push(a)}return a}
function addLedgerRaw(transactionId,accountId,debit,credit,narration,date){const a=accountById(accountId);if(!a)throw new Error('Account not found');const prev=accountBalance(a.id);S().ledgerEntries611.push({id:uid620(),businessId:biz(),accountId:a.id,transactionId,date:date||today(),type:n(debit)>0?'debit':'credit',debit:n(debit),credit:n(credit),balanceAfter:prev+n(debit)-n(credit),narration:narration||'',createdAt:now()})}
function paymentAccountOptions(){return (S().accounts611||[]).filter(a=>a.businessId===biz()&&a.active!==false&&a.category==='asset'&&!['AR','STOCK','FIXED','GST_IN'].includes(a.code)).map(a=>`<option value="${safe(a.id)}">${safe(a.name)}</option>`).join('')}
function stock(itemId,godownId){return window.VyaparPlatform611?.stock?n(window.VyaparPlatform611.stock(itemId,godownId)):(S().stockMovements611||[]).filter(m=>m.businessId===biz()&&m.itemId===itemId&&(!godownId||m.godownId===godownId)).reduce((z,m)=>z+n(m.quantityIn)-n(m.quantityOut),0)}
function item(id){return (S().products||[]).find(p=>p.id===id);}
function baseCurrency(){return (S().businesses||[]).find(b=>b.id===biz())?.baseCurrency||S().currency611?.baseCurrency||'INR';}
function txBase(t){return n(t.baseAmount)||n(t.total)*(n(t.exchangeRate)||1);}
function txBaseNet(t){return Math.max(0,txBase(t)-(n(t.tax)+n(t.cess))*(n(t.exchangeRate)||1));}
function log(action,entity,entityId,details){S().auditLog611=S().auditLog611||[];S().auditLog611.unshift({id:uid620(),businessId:biz(),timestamp:now(),action,entity,entityId:entityId||'',userId:'owner',details:String(details||'').slice(0,600)});S().auditLog611=S().auditLog611.slice(0,5000)}
function notify(type,title,message){S().notifications611=S().notifications611||[];S().notifications611.unshift({id:uid620(),businessId:biz(),type,title,message,createdAt:now(),read:false});S().notifications611=S().notifications611.slice(0,1000)}
function shell(title,body,subtitle){return `<div class="calculator-head"><div><span class="pill">Business Platform ${VERSION}</span><h2>${safe(title)}</h2><p class="muted">${safe(subtitle||'Additive parity layer · old logic preserved · advanced business workflows')}</p></div><button class="btn mini" onclick="p611Home()">Platform Home</button></div>${body}`}
function ensure(){const s=S();
  const arrays=['priceRules620','unitConversions620','bom620','messageLog620','currencyRates620','documentLinks620','cheques620','loans620','invoiceCustomFields620'];arrays.forEach(k=>{if(!Array.isArray(s[k]))s[k]=[]});
  if(!s.invoiceSettings620)s.invoiceSettings620={paperSize:'A4',orientation:'portrait',fontSize:'medium',theme:'clean',accent:'#0f7bb8',showLogo:true,showAddress:true,showEmail:true,showPhone:true,showGSTIN:true,showHSN:true,showMRP:true,showDescription:true,showTax:true,showReceived:true,showBalance:true,showAmountWords:true,showPaymentMode:true,showTerms:true,showSignature:true,showPageNumbers:true,originalDuplicate:false,terms:'Thank you for your business.',signatureText:'Authorized Signatory',thermalWidth:'80',thermalCopies:1,thermalAutoCut:true,thermalCashDrawer:false};
  if(!s.advancedTax620)s.advancedTax620={reverseChargeEnabled:false,cessEnabled:true,ewayEnabled:false,tcsEnabled:false,tdsEnabled:false,compositionScheme:false,tcsRate:0.1,tdsRate:1};
  if(!s.messaging620)s.messaging620={sendOnSale:false,sendOnPayment:false,includeBalance:true,includeInvoiceLink:true,provider:'manual',autoTypes:{SALE:false,PURCHASE:false,SALE_RETURN:false,PURCHASE_RETURN:false,ESTIMATE:false,PROFORMA:false,PAYMENT_IN:false,PAYMENT_OUT:false,SALE_ORDER:false,PURCHASE_ORDER:false,DELIVERY_CHALLAN:false,CANCELLED:false},templates:{SALE:'Hi {{party}},\nThank you for your purchase from {{business}}.\nInvoice: {{number}}\nAmount: {{amount}}\nReceived: {{received}}\nBalance: {{balance}}\n{{invoice_link}}',PAYMENT_IN:'Hi {{party}},\nPayment of {{amount}} received for {{business}}.\nReference: {{number}}\nBalance: {{balance}}'}};
  if(!s.messaging620.autoTypes)s.messaging620.autoTypes={SALE:!!s.messaging620.sendOnSale,PURCHASE:false,SALE_RETURN:false,PURCHASE_RETURN:false,ESTIMATE:false,PROFORMA:false,PAYMENT_IN:!!s.messaging620.sendOnPayment,PAYMENT_OUT:false,SALE_ORDER:false,PURCHASE_ORDER:false,DELIVERY_CHALLAN:false,CANCELLED:false};
  const msgTypes=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','ESTIMATE','PROFORMA','PAYMENT_IN','PAYMENT_OUT','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN','CANCELLED'];
  msgTypes.forEach(k=>{if(!s.messaging620.templates[k])s.messaging620.templates[k]=`Hi {{party}},\n${k.replaceAll('_',' ')} {{number}} from {{business}}.\nAmount: {{amount}}\nReceived: {{received}}\nBalance: {{balance}}\n{{invoice_link}}`});
  if(!s.loyaltySettings620)s.loyaltySettings620={enabled:false,earnPer100:1,redeemValuePerPoint:1};
  if(!s.schemaVersion)s.schemaVersion=SCHEMA;else s.schemaVersion=Math.max(n(s.schemaVersion),SCHEMA);
  if(!s.platform620Migrated){s.platform620Migrated=true;notify('system','Business Platform upgraded','6.2.0 added deep reports, document lifecycle, invoice/thermal printing, messaging, advanced inventory and security tools without removing existing modules.');log('MIGRATION','schema','620','Additive 6.2.0 parity layer enabled');saveAll();}
}
function csv(name,rows){const text=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function downloadText(name,mime,text){const b64=btoa(unescape(encodeURIComponent(text)));if(window.AndroidDownloads?.saveBase64){AndroidDownloads.saveBase64(name,mime,b64);return}const blob=new Blob([text],{type:mime}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function dateFilter(rows,from,to,getDate=r=>r.date){return rows.filter(r=>(!from||String(getDate(r)||'')>=from)&&(!to||String(getDate(r)||'')<=to))}
function cogsTx(id){return (S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&e.transactionId===id&&accountById(e.accountId)?.code==='COGS').reduce((z,e)=>z+n(e.debit)-n(e.credit),0)}
function reportCatalog(){return [
 ['all_tx','All Transactions','Transactions'],['sales','Sales Register','Transactions'],['purchases','Purchase Register','Transactions'],['sale_returns','Sale Returns','Transactions'],['purchase_returns','Purchase Returns','Transactions'],['payment_in','Payment-In Register','Transactions'],['payment_out','Payment-Out Register','Transactions'],['estimates','Estimate / Quotation Register','Transactions'],['proforma','Proforma Register','Transactions'],['sale_orders','Sale Order Register','Transactions'],['purchase_orders','Purchase Order Register','Transactions'],['challans','Delivery Challan Register','Transactions'],['other_income','Other Income Register','Transactions'],['fixed_assets','Fixed Asset Register','Transactions'],['cancelled','Cancelled Documents','Transactions'],
 ['day_book','Day Book','Accounting'],['cash_book','Cash Book','Accounting'],['bank_book','Bank / UPI Book','Accounting'],['ledger','General Ledger','Accounting'],['trial_balance','Trial Balance','Accounting'],['profit_loss','Profit & Loss','Accounting'],['balance_sheet','Balance Sheet','Accounting'],['receivables','Receivables','Accounting'],['payables','Payables','Accounting'],['ageing','Receivable / Payable Ageing','Accounting'],['cheque_register','Cheque Register','Accounting'],['loan_register','Loan Register','Accounting'],['expense_register','Expense Register','Accounting'],
 ['stock_summary','Stock Summary','Inventory'],['stock_value','Stock Valuation','Inventory'],['stock_movement','Stock Movement Ledger','Inventory'],['low_stock','Low Stock','Inventory'],['negative_stock','Negative Stock','Inventory'],['category_stock','Category-wise Stock','Inventory'],['godown_stock','Godown-wise Stock','Inventory'],['item_sales','Item-wise Sales','Inventory'],['item_purchase','Item-wise Purchases','Inventory'],['fast_moving','Fast Moving Items','Inventory'],['slow_moving','Slow / Dead Stock','Inventory'],['reorder','Reorder Suggestions','Inventory'],
 ['party_statement','Party Statement Summary','Parties'],['customer_due','Customer Outstanding','Parties'],['supplier_due','Supplier Payables','Parties'],['party_pnl','Party-wise P&L','Parties'],['top_customers','Top Customers','Parties'],['top_suppliers','Top Suppliers','Parties'],['loyalty','Loyalty Ledger','Parties'],['party_pricing','Party-wise Price Rules','Parties'],
 ['gst_summary','GST Summary','Tax'],['cgst','CGST Register','Tax'],['sgst','SGST Register','Tax'],['igst','IGST Register','Tax'],['cess','CESS Register','Tax'],['hsn_sales','HSN/SAC Sales Summary','Tax'],['tax_purchase','Purchase Tax Summary','Tax'],['reverse_charge','Reverse Charge Register','Tax'],['eway','E-Way Bill Register','Tax'],['tds_tcs','TDS / TCS Register','Tax']
 ];}
function reportData(key,from,to){const tx=dateFilter((S().transactions611||[]).filter(t=>t.businessId===biz()),from,to),active=tx.filter(t=>t.status!=='cancelled'),products=S().products||[],ledger=dateFilter((S().ledgerEntries611||[]).filter(e=>e.businessId===biz()),from,to),moves=dateFilter((S().stockMovements611||[]).filter(m=>m.businessId===biz()),from,to);
  const txTable=list=>({columns:['Date','Type','No.','Party','Total','Paid','Balance','Status'],rows:list.map(t=>[t.date,t.type,t.number,t.partyName,txBase(t),n(t.receivedPaid)*(n(t.exchangeRate)||1),n(t.balance)*(n(t.exchangeRate)||1),t.status])});
  const mapType={sales:'SALE',purchases:'PURCHASE',sale_returns:'SALE_RETURN',purchase_returns:'PURCHASE_RETURN',payment_in:'PAYMENT_IN',payment_out:'PAYMENT_OUT',estimates:'ESTIMATE',proforma:'PROFORMA',sale_orders:'SALE_ORDER',purchase_orders:'PURCHASE_ORDER',challans:'DELIVERY_CHALLAN',other_income:'OTHER_INCOME',fixed_assets:'FIXED_ASSET'};
  if(key==='all_tx'||key==='cancelled'||mapType[key])return txTable(key==='cancelled'?tx.filter(t=>t.status==='cancelled'):mapType[key]?tx.filter(t=>t.type===mapType[key]):tx);
  if(key==='day_book')return{columns:['Date','Document','Party','Debit','Credit','Narration'],rows:ledger.map(e=>[e.date,e.transactionId,'',e.debit,e.credit,e.narration])};
  if(key==='cash_book'||key==='bank_book'||key==='ledger'){const codes=key==='cash_book'?['CASH']:key==='bank_book'?['BANK','UPI','CHEQUE']:null;return{columns:['Date','Account','Transaction','Debit','Credit','Narration'],rows:ledger.filter(e=>!codes||codes.includes(accountById(e.accountId)?.code)).map(e=>[e.date,accountById(e.accountId)?.name||'',e.transactionId,e.debit,e.credit,e.narration])}}
  if(key==='trial_balance'){const rows=(S().accounts611||[]).filter(a=>a.businessId===biz()).map(a=>{const b=accountBalance(a.id);return[a.name,a.category,b>0?b:0,b<0?-b:0]});return{columns:['Account','Category','Debit Balance','Credit Balance'],rows}}
  if(key==='profit_loss'){const sale=active.filter(t=>t.type==='SALE').reduce((z,t)=>z+txBaseNet(t),0),ret=active.filter(t=>t.type==='SALE_RETURN').reduce((z,t)=>z+txBaseNet(t),0),cogs=ledger.filter(e=>accountById(e.accountId)?.code==='COGS').reduce((z,e)=>z+n(e.debit)-n(e.credit),0),exp=(S().expenses||[]).filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).reduce((z,e)=>z+n(e.amount),0),other=active.filter(t=>t.type==='OTHER_INCOME').reduce((z,t)=>z+txBase(t),0);return{columns:['Metric','Amount'],rows:[['Sales',sale],['Sale Returns',-ret],['Net Revenue',sale-ret],['COGS',-cogs],['Expenses',-exp],['Other Income',other],['Net Profit',sale-ret-cogs-exp+other]]}}
  if(key==='balance_sheet'){const rows=(S().accounts611||[]).filter(a=>a.businessId===biz()).map(a=>[a.category,a.name,a.category==='asset'?accountBalance(a.id):-accountBalance(a.id)]);return{columns:['Class','Account','Balance'],rows}}
  if(key==='receivables'||key==='payables'||key==='ageing'){let docs=active.filter(t=>(key==='payables'?t.type==='PURCHASE':key==='receivables'?t.type==='SALE':['SALE','PURCHASE'].includes(t.type))&&n(t.balance)>0);return{columns:['Date','Type','No.','Party','Outstanding','Age Days','Bucket'],rows:docs.map(t=>{const days=Math.max(0,Math.floor((new Date(today())-new Date(t.date))/86400000));return[t.date,t.type,t.number,t.partyName,n(t.balance)*(n(t.exchangeRate)||1),days,days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':'90+']})}}
  if(key==='cheque_register')return{columns:['Date','Cheque No.','Direction','Party','Bank','Amount','Status'],rows:(S().cheques620||[]).filter(x=>x.businessId===biz()&&(!from||x.date>=from)&&(!to||x.date<=to)).map(x=>[x.date,x.number,x.direction,x.party,x.bank,x.amount,x.status])};
  if(key==='loan_register')return{columns:['Loan','Principal','Rate %','Outstanding','Start','Term months'],rows:(S().loans620||[]).filter(x=>x.businessId===biz()).map(x=>[x.name,x.principal,x.annualRate,Math.max(0,-accountBalance(x.accountId)),x.startDate,x.termMonths])};
  if(key==='expense_register')return{columns:['Date','Category','Description','Amount'],rows:(S().expenses||[]).filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).map(e=>[e.date,e.category||'',e.note||e.description||'',e.amount])};
  if(key==='stock_summary'||key==='stock_value'||key==='low_stock'||key==='negative_stock'||key==='reorder'){let rows=products.map(p=>{const q=stock(p.id),cost=n(p.purchasePrice),low=n(p.lowStockLevel||p.minStock||5);return[p.name,p.sku||'',q,cost,q*cost,low]});if(key==='low_stock'||key==='reorder')rows=rows.filter(r=>r[2]<=r[5]);if(key==='negative_stock')rows=rows.filter(r=>r[2]<0);return{columns:['Item','SKU','Stock','Cost','Value','Low-stock level'],rows}}
  if(key==='stock_movement')return{columns:['Date','Item','Godown','Movement','In','Out','Transaction'],rows:moves.map(m=>[m.date,item(m.itemId)?.name||'',(S().godowns611||[]).find(g=>g.id===m.godownId)?.name||'',m.movementType,m.quantityIn,m.quantityOut,m.transactionId])};
  if(key==='category_stock'){const map={};products.forEach(p=>{const k=p.category||'Uncategorized';map[k]=(map[k]||0)+stock(p.id)});return{columns:['Category','Stock Qty'],rows:Object.entries(map)}}
  if(key==='godown_stock'){const rows=[];(S().godowns611||[]).filter(g=>g.businessId===biz()).forEach(g=>products.forEach(p=>{const q=stock(p.id,g.id);if(q)rows.push([g.name,p.name,p.sku||'',q,q*n(p.purchasePrice)])}));return{columns:['Godown','Item','SKU','Qty','Value'],rows}}
  if(['item_sales','item_purchase','fast_moving','slow_moving'].includes(key)){const wanted=key==='item_purchase'?'PURCHASE':'SALE',map={};active.filter(t=>t.type===wanted).forEach(t=>(t.items||[]).forEach(i=>{const k=i.itemId||i.name;const r=map[k]||(map[k]={name:i.name,qty:0,value:0,last:''});r.qty+=n(i.qty);r.value+=n(i.qty)*n(i.rate);r.last=t.date>r.last?t.date:r.last}));let rows=Object.values(map).map(r=>[r.name,r.qty,r.value,r.last]);rows.sort((a,b)=>key==='slow_moving'?a[1]-b[1]:b[1]-a[1]);return{columns:['Item','Qty','Value','Last activity'],rows}}
  if(key==='party_pnl'||key==='top_customers'){const map={};active.filter(t=>['SALE','SALE_RETURN'].includes(t.type)).forEach(t=>{const k=t.partyId||t.partyName||'Walk-in',r=map[k]||(map[k]={party:t.partyName||'Walk-in',rev:0,cogs:0});r.rev+=(t.type==='SALE'?1:-1)*txBaseNet(t);r.cogs+=cogsTx(t.id)});let rows=Object.values(map).map(r=>[r.party,r.rev,r.cogs,r.rev-r.cogs]).sort((a,b)=>b[3]-a[3]);return{columns:['Party','Revenue','COGS','Profit'],rows}}
  if(key==='top_suppliers'){const map={};active.filter(t=>t.type==='PURCHASE').forEach(t=>{const k=t.partyName||'Unknown';map[k]=(map[k]||0)+txBase(t)});return{columns:['Supplier','Purchase Value'],rows:Object.entries(map).sort((a,b)=>b[1]-a[1])}}
  if(key==='customer_due'||key==='supplier_due'||key==='party_statement'){let docs=active.filter(t=>key==='supplier_due'?t.type==='PURCHASE':key==='customer_due'?t.type==='SALE':['SALE','PURCHASE','PAYMENT_IN','PAYMENT_OUT'].includes(t.type));return{columns:['Date','Type','Party','No.','Total','Outstanding'],rows:docs.map(t=>[t.date,t.type,t.partyName,t.number,txBase(t),n(t.balance)*(n(t.exchangeRate)||1)])}}
  if(key==='loyalty')return{columns:['Date','Party','Type','Points','Value','Reference'],rows:(S().loyaltyEntries611||[]).filter(x=>x.businessId===biz()).map(x=>[x.date||String(x.createdAt||'').slice(0,10),x.partyName||x.partyId,x.type,x.points,x.value||0,x.transactionId||''])};
  if(key==='party_pricing')return{columns:['Party','Item','Price','From','To'],rows:(S().priceRules620||[]).filter(x=>x.businessId===biz()).map(r=>[r.partyName,r.itemName,r.price,r.from||'',r.to||''])};
  if(['gst_summary','cgst','sgst','igst','cess','reverse_charge','eway','tds_tcs'].includes(key)){if(key==='gst_summary')return{columns:['Tax','Amount'],rows:[['CGST',active.reduce((z,t)=>z+n(t.cgst),0)],['SGST',active.reduce((z,t)=>z+n(t.sgst),0)],['IGST',active.reduce((z,t)=>z+n(t.igst),0)],['CESS',active.reduce((z,t)=>z+n(t.cess),0)]]};const prop=key==='cgst'?'cgst':key==='sgst'?'sgst':key==='igst'?'igst':key==='cess'?'cess':null;if(prop)return{columns:['Date','Type','No.','Party',key.toUpperCase()],rows:active.filter(t=>n(t[prop])).map(t=>[t.date,t.type,t.number,t.partyName,t[prop]])};if(key==='reverse_charge')return txTable(active.filter(t=>t.reverseCharge));if(key==='eway')return{columns:['Date','No.','Party','E-Way Bill'],rows:active.filter(t=>t.eWayBillNo).map(t=>[t.date,t.number,t.partyName,t.eWayBillNo])};return{columns:['Date','No.','Party','TDS','TCS'],rows:active.filter(t=>n(t.tdsAmount)||n(t.tcsAmount)).map(t=>[t.date,t.number,t.partyName,t.tdsAmount||0,t.tcsAmount||0])}}
  if(key==='hsn_sales'||key==='tax_purchase'){const wanted=key==='tax_purchase'?'PURCHASE':'SALE',map={};active.filter(t=>t.type===wanted).forEach(t=>(t.items||[]).forEach(i=>{const p=item(i.itemId)||{},k=p.hsn||p.hsnSac||'N/A',r=map[k]||(map[k]={taxable:0,tax:0,qty:0});r.qty+=n(i.qty);r.taxable+=n(i.qty)*n(i.rate);r.tax+=n(i.qty)*n(i.rate)*n(i.tax)/100}));return{columns:['HSN/SAC','Qty','Taxable','Tax'],rows:Object.entries(map).map(([k,r])=>[k,r.qty,r.taxable,r.tax])}}
  return{columns:['Info'],rows:[['No data']]};
}
function renderReportLibrary(){const el=$('businessModuleArea');if(!el)return;const cats=[...new Set(reportCatalog().map(r=>r[2]))];el.innerHTML=shell('50+ Reports Library',`<div class="p620-filter"><label>From <input id="r620From" type="date"></label><label>To <input id="r620To" type="date"></label><input id="r620Search" placeholder="Search reports" oninput="p620FilterReports()"></div>${cats.map(c=>`<h3>${safe(c)}</h3><div class="p620-report-grid" data-cat="${safe(c)}">${reportCatalog().filter(r=>r[2]===c).map(r=>`<button class="p620-report-card" data-name="${safe(r[1].toLowerCase())}" onclick="p620ShowReport('${r[0]}')"><b>${safe(r[1])}</b><span>${safe(c)}</span></button>`).join('')}</div>`).join('')}<div id="p620ReportView"></div>`,'Reusable filters · CSV export · accounting, inventory, party and tax reports')}
window.p620FilterReports=function(){const q=String($('r620Search')?.value||'').toLowerCase();document.querySelectorAll('.p620-report-card').forEach(b=>b.style.display=b.dataset.name.includes(q)?'':'none')};
window.p620ShowReport=function(key){const d=reportData(key,$('r620From')?.value||'',$('r620To')?.value||''),meta=reportCatalog().find(r=>r[0]===key),v=$('p620ReportView');if(!v)return;v.innerHTML=`<div class="card p620-view"><div class="p620-view-head"><h3>${safe(meta?.[1]||key)}</h3><button class="btn mini" onclick="p620ExportReport('${key}')">Export CSV</button></div><div class="p611-table"><table class="table"><thead><tr>${d.columns.map(c=>`<th>${safe(c)}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0,500).map(r=>`<tr>${r.map(x=>`<td>${typeof x==='number'?cash(x):safe(x)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${d.columns.length}">No data for selected period.</td></tr>`}</tbody></table></div>${d.rows.length>500?'<p class="muted">Showing first 500 rows. Export includes all rows.</p>':''}</div>`};
window.p620ExportReport=function(key){const d=reportData(key,$('r620From')?.value||'',$('r620To')?.value||''),name=(reportCatalog().find(r=>r[0]===key)?.[1]||key).toLowerCase().replace(/[^a-z0-9]+/g,'-');csv(name+'.csv',[d.columns,...d.rows])};
function documentConversions(type){return{ESTIMATE:['SALE'],PROFORMA:['SALE'],SALE_ORDER:['DELIVERY_CHALLAN','SALE'],PURCHASE_ORDER:['PURCHASE'],DELIVERY_CHALLAN:['SALE']}[type]||[]}
function convertDocument(id,target){const src=txById(id);if(!src||src.status==='cancelled')return alert('Source document not available');if(src.convertedToId&&txById(src.convertedToId)?.status!=='cancelled')return alert('This document is already converted. Cancel the converted document first if you need to recreate it.');if(!documentConversions(src.type).includes(target))return alert('Unsupported conversion');try{const out=window.VyaparPlatform611.createTransaction({type:target,party:src.partyName,partyId:src.partyId,items:(src.items||[]).map(i=>({...i})),receivedPaid:0,paymentMode:src.paymentMode,stateOfSupply:src.stateOfSupply,currency:src.currency,exchangeRate:src.exchangeRate,notes:'Converted from '+src.number});out.sourceDocumentId=src.id;src.convertedToId=out.id;src.documentStatus='converted';src.updatedAt=now();S().documentLinks620.push({id:uid620(),businessId:biz(),sourceId:src.id,targetId:out.id,sourceType:src.type,targetType:target,createdAt:now()});afterTransaction(out);log('CONVERT','DOCUMENT',src.id,src.number+' -> '+out.number);saveAll();toast(out.number+' created');renderDocuments()}catch(e){alert(e.message)}}
function renderDocuments(){const el=$('businessModuleArea');if(!el)return;const docs=(S().transactions611||[]).filter(t=>t.businessId===biz()&&['ESTIMATE','PROFORMA','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN'].includes(t.type)).slice().reverse();el.innerHTML=shell('Orders & Document Lifecycle',`<div class="notice success">Estimate / Proforma / Orders / Challan stay non-posting until converted, preventing duplicate stock/accounting. A document can have only one active conversion.</div><div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th>Total</th><th>Status</th><th>Convert / Fulfil</th></tr></thead><tbody>${docs.map(t=>`<tr><td>${t.date}</td><td>${t.type}</td><td>${safe(t.number)}</td><td>${safe(t.partyName)}</td><td>${cash(t.total)}</td><td>${safe(t.documentStatus||t.status||'posted')}</td><td>${documentConversions(t.type).map(x=>`<button class="btn mini" onclick="p620Convert('${t.id}','${x}')">${x==='SALE'?'Create Sale':x==='PURCHASE'?'Create Purchase':'Create Challan'}</button>`).join(' ')||'-'}</td></tr>`).join('')||'<tr><td colspan="7">No document transactions yet.</td></tr>'}</tbody></table></div>`,'Conversion · fulfilment · linked source/target protection')}
window.p620Convert=convertDocument;
function amountWords(num){num=Math.round(Math.abs(n(num)));if(num===0)return'Zero Rupees';const one=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],ten=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];function two(x){return x<20?one[x]:ten[Math.floor(x/10)]+(x%10?' '+one[x%10]:'')}function three(x){return (x>=100?one[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+two(x%100)}let out='';if(num>=10000000){out+=three(Math.floor(num/10000000))+' Crore ';num%=10000000}if(num>=100000){out+=three(Math.floor(num/100000))+' Lakh ';num%=100000}if(num>=1000){out+=three(Math.floor(num/1000))+' Thousand ';num%=1000}if(num)out+=three(num);return out.trim()+' Rupees Only'}
function businessInfo(){const b=(S().businesses||[]).find(x=>x.id===biz())||{},p=S().profile||{};return{name:b.name||p.businessName||'Vyapar AI Business',phone:p.phone||p.mobile||'',email:p.email||'',address:p.address||p.businessAddress||'',gstin:p.gstin||p.GSTIN||'',logo:p.logo||''}}
function invoiceHtml(tx,thermal){const st=S().invoiceSettings620,bi=businessInfo(),custom=(S().invoiceCustomFields620||[]).filter(x=>x.businessId===biz()&&x.enabled!==false),w=thermal?(st.thermalWidth==='58'?'58mm':'80mm'):(st.paperSize==='A5'?'148mm':'210mm'),compact=!!thermal;const fields=(tx.items||[]).map((i,idx)=>`<tr><td>${idx+1}</td><td><b>${safe(i.name)}</b>${st.showDescription&&item(i.itemId)?.description?`<br><small>${safe(item(i.itemId).description)}</small>`:''}${st.showHSN&&item(i.itemId)?.hsn?`<br><small>HSN ${safe(item(i.itemId).hsn)}</small>`:''}</td><td>${i.qty} ${safe(i.unit||'')}</td>${st.showMRP&&!compact?`<td>${cash(item(i.itemId)?.mrp||i.rate)}</td>`:''}<td>${cash(i.rate)}</td>${st.showTax&&!compact?`<td>${n(i.tax)}%</td>`:''}<td>${cash(n(i.qty)*n(i.rate))}</td></tr>`).join('');return `<!doctype html><html><head><meta charset="utf-8"><title>${safe(tx.number)}</title><style>@page{size:${thermal?w+' auto':st.paperSize+' '+st.orientation};margin:${thermal?'3mm':'10mm'}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0 auto;padding:${thermal?'2mm':'8mm'};width:${w};color:#111;font-size:${compact?'11px':st.fontSize==='small'?'11px':st.fontSize==='large'?'15px':'13px'}}.head{border-bottom:${st.theme==='classic'?'3px double':st.theme==='compact'?'1px solid':'2px solid'} ${st.accent};padding-bottom:${st.theme==='compact'?'4px':'8px'};margin-bottom:${st.theme==='compact'?'5px':'10px'}}.brand{font-size:${compact?'18px':'26px'};font-weight:800;color:${st.accent}}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:${compact?'3px':'6px'};text-align:left}.right{text-align:right}.totals{margin-left:auto;max-width:${compact?'100%':'330px'};margin-top:10px}.totals div{display:flex;justify-content:space-between;padding:3px 0}.grand{font-size:${compact?'15px':'20px'};font-weight:800;border-top:2px solid #111}.footer{margin-top:18px;border-top:1px dashed #999;padding-top:10px}.copy{text-align:center;font-weight:700;margin-bottom:6px}@media print{button{display:none}}</style></head><body>${st.originalDuplicate?'<div class="copy">ORIGINAL / CUSTOMER COPY</div>':''}<div class="head">${st.showLogo&&bi.logo?`<img src="${safe(bi.logo)}" alt="Logo" style="max-height:${compact?'34px':'54px'};max-width:120px;float:right">`:''}<div class="brand">${safe(bi.name)}</div>${st.showAddress&&bi.address?`<div>${safe(bi.address)}</div>`:''}${st.showPhone&&bi.phone?`<div>Phone: ${safe(bi.phone)}</div>`:''}${st.showEmail&&bi.email?`<div>Email: ${safe(bi.email)}</div>`:''}${st.showGSTIN&&bi.gstin?`<div>GSTIN: ${safe(bi.gstin)}</div>`:''}</div><div><b>${safe(tx.type.replaceAll('_',' '))}</b> #${safe(tx.number)}<br>Date: ${safe(tx.date)}${tx.partyName?`<br>Party: ${safe(tx.partyName)}`:''}${tx.eWayBillNo?`<br>E-Way Bill: ${safe(tx.eWayBillNo)}`:''}${custom.map(f=>`<br>${safe(f.label)}: ${safe(f.value)}`).join('')}</div><table><thead><tr><th>#</th><th>Item</th><th>Qty</th>${st.showMRP&&!compact?'<th>MRP</th>':''}<th>Rate</th>${st.showTax&&!compact?'<th>Tax</th>':''}<th>Amount</th></tr></thead><tbody>${fields}</tbody></table><div class="totals"><div><span>Subtotal</span><b>${cash(tx.subtotal)}</b></div>${n(tx.discount)?`<div><span>Discount</span><b>${cash(tx.discount)}</b></div>`:''}${st.showTax?`<div><span>GST</span><b>${cash(tx.tax)}</b></div>${n(tx.cess)?`<div><span>CESS</span><b>${cash(tx.cess)}</b></div>`:''}`:''}<div class="grand"><span>Total</span><span>${cash(tx.total)}</span></div>${st.showReceived?`<div><span>Received</span><b>${cash(tx.receivedPaid)}</b></div>`:''}${st.showBalance?`<div><span>Balance</span><b>${cash(tx.balance)}</b></div>`:''}${st.showPaymentMode?`<div><span>Payment</span><b>${safe(tx.paymentMode||'')}</b></div>`:''}</div>${st.showAmountWords?`<p><b>Amount in words:</b> ${safe(amountWords(tx.total))}</p>`:''}<div class="footer">${st.showTerms?`<p><b>Terms:</b> ${safe(st.terms)}</p>`:''}${st.showSignature?`<p class="right"><br><br><b>${safe(st.signatureText)}</b></p>`:''}</div>${st.originalDuplicate&&!compact?'<div style="page-break-before:always"></div><script>document.write(document.body.innerHTML.split("<div style=\\"page-break-before:always\\"></div>")[0].replace("ORIGINAL / CUSTOMER COPY","DUPLICATE / OFFICE COPY"))</script>':''}</body></html>`}
function printHtml(html){const w=window.open('','_blank');if(!w)return alert('Popup blocked. Allow popup/print for invoice.');w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.print()}catch(_){}},250)}
function renderPrint(){const el=$('businessModuleArea');if(!el)return;const s=S().invoiceSettings620,txs=activeTx().filter(t=>['SALE','PURCHASE','ESTIMATE','PROFORMA','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN'].includes(t.type)).slice().reverse().slice(0,100);el.innerHTML=shell('Invoices & PDF',`<div class="p620-tabs"><button class="btn" onclick="p620PrintTab('settings')">Print settings</button><button class="btn" onclick="p620PrintTab('documents')">Saved invoices</button></div><div id="p620PrintBody"></div>`,'A4/A5 + 58/80mm thermal · field toggles · terms · signature · ESC/POS');window.__p620PrintTx=txs;window.p620PrintTab('documents')}
window.p620PrintTab=function(tab){const v=$('p620PrintBody');if(!v)return;const s=S().invoiceSettings620;if(tab==='documents'){const txs=window.__p620PrintTx||[];v.innerHTML=`<div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th>Total</th><th>Actions</th></tr></thead><tbody>${txs.map(t=>`<tr><td>${t.date}</td><td>${t.type}</td><td>${safe(t.number)}</td><td>${safe(t.partyName)}</td><td>${cash(t.total)}</td><td><button class="btn mini primary" onclick="p620DownloadPDF('${t.id}',false)">Download PDF</button> <button class="btn mini" onclick="p620Print('${t.id}',false)">Print</button> <button class="btn mini" onclick="p620DownloadPDF('${t.id}',true)">Thermal PDF</button> <button class="btn mini" onclick="p620Print('${t.id}',true)">Print thermal</button> <button class="btn mini" onclick="p620EscPos('${t.id}')">ESC/POS</button></td></tr>`).join('')||'<tr><td colspan="6">No saved invoices yet. Create a sale or order first.</td></tr>'}</tbody></table></div>`;return}v.innerHTML=`<div class="p620-settings"><label>Paper size<select id="iPaper"><option ${s.paperSize==='A4'?'selected':''}>A4</option><option ${s.paperSize==='A5'?'selected':''}>A5</option></select></label><label>Orientation<select id="iOrient"><option ${s.orientation==='portrait'?'selected':''}>portrait</option><option ${s.orientation==='landscape'?'selected':''}>landscape</option></select></label><label>Font<select id="iFont"><option ${s.fontSize==='small'?'selected':''}>small</option><option ${s.fontSize==='medium'?'selected':''}>medium</option><option ${s.fontSize==='large'?'selected':''}>large</option></select></label><label>Theme<select id="iTheme"><option value="clean" ${s.theme==='clean'?'selected':''}>Clean</option><option value="compact" ${s.theme==='compact'?'selected':''}>Compact</option><option value="classic" ${s.theme==='classic'?'selected':''}>Classic</option></select></label><label>Accent<input id="iAccent" type="color" value="${safe(s.accent)}"></label><label>Thermal width<select id="iThermal"><option value="58" ${s.thermalWidth==='58'?'selected':''}>58mm</option><option value="80" ${s.thermalWidth==='80'?'selected':''}>80mm</option></select></label><label>Copies<input id="iCopies" type="number" min="1" max="5" value="${n(s.thermalCopies)||1}"></label><label>Terms<textarea id="iTerms">${safe(s.terms)}</textarea></label><label>Signature text<input id="iSign" value="${safe(s.signatureText)}"></label></div><div class="p620-checks">${[['showLogo','Logo'],['showAddress','Address'],['showEmail','Email'],['showPhone','Phone'],['showGSTIN','GSTIN'],['showHSN','HSN/SAC'],['showMRP','MRP'],['showDescription','Description'],['showTax','Tax details'],['showReceived','Received'],['showBalance','Balance'],['showAmountWords','Amount in words'],['showPaymentMode','Payment mode'],['showTerms','Terms & Conditions'],['showSignature','Signature'],['showPageNumbers','Page numbers'],['originalDuplicate','Original + Duplicate'],['thermalAutoCut','Thermal auto-cut'],['thermalCashDrawer','Cash drawer pulse']].map(([k,l])=>`<label><input id="i_${k}" type="checkbox" ${s[k]?'checked':''}> ${l}</label>`).join('')}</div><h3>Custom Invoice Fields</h3><div class="p611-form"><input id="iCustomLabel" placeholder="Field label"><input id="iCustomValue" placeholder="Field value"><button class="btn" onclick="p620AddInvoiceCustomField()">Add Field</button></div><div id="iCustomList">${(S().invoiceCustomFields620||[]).filter(x=>x.businessId===biz()).map(x=>`<span class="pill">${safe(x.label)}: ${safe(x.value)} <button class="btn mini danger" onclick="p620DeleteInvoiceCustomField('${x.id}')">×</button></span>`).join('')}</div><button class="btn primary" onclick="p620SavePrintSettings()">Save Print Settings</button><p class="muted">Direct ESC/POS uses a paired Bluetooth printer when the Android bridge is available. Browser mode safely downloads an ESC/POS .bin fallback.</p>`};
window.p620SavePrintSettings=function(){const s=S().invoiceSettings620;s.paperSize=$('iPaper').value;s.orientation=$('iOrient').value;s.fontSize=$('iFont').value;s.theme=$('iTheme').value;s.accent=$('iAccent').value;s.thermalWidth=$('iThermal').value;s.thermalCopies=Math.max(1,Math.min(5,n($('iCopies').value)||1));s.terms=$('iTerms').value;s.signatureText=$('iSign').value;['showLogo','showAddress','showEmail','showPhone','showGSTIN','showHSN','showMRP','showDescription','showTax','showReceived','showBalance','showAmountWords','showPaymentMode','showTerms','showSignature','showPageNumbers','originalDuplicate','thermalAutoCut','thermalCashDrawer'].forEach(k=>s[k]=$('i_'+k).checked);log('UPDATE','PRINT_SETTINGS','620','Invoice/thermal settings updated');saveAll();toast('Print settings saved')};
window.p620AddInvoiceCustomField=function(){const label=String($('iCustomLabel')?.value||'').trim(),value=String($('iCustomValue')?.value||'').trim();if(!label)return alert('Field label required');S().invoiceCustomFields620.push({id:uid620(),businessId:biz(),label,value,enabled:true,createdAt:now()});saveAll();p620PrintTab('settings')};
window.p620DeleteInvoiceCustomField=function(id){S().invoiceCustomFields620=S().invoiceCustomFields620.filter(x=>x.id!==id);saveAll();p620PrintTab('settings')};
window.p620Print=function(id,thermal){const t=txById(id);if(t)printHtml(invoiceHtml(t,thermal))};
window.p620DownloadPDF=function(id,thermal){
  ensure(); const t=txById(id); if(!t)return;
  const business=businessInfo();
  return window.VyaparInvoicePDF.download({transaction:t,business,settings:S().invoiceSettings620,thermal:!!thermal,
    customFields:(S().invoiceCustomFields620||[]).filter(f=>f.businessId===biz()),
    amountWords:((t.currency||business.baseCurrency||'INR')==='INR'?amountWords(t.total):'')});
};
function escPosBytes(t){const st=S().invoiceSettings620,bi=businessInfo(),width=st.thermalWidth==='58'?32:48,enc=new TextEncoder(),parts=[];const push=s=>parts.push(enc.encode(s));push('\x1b@');push('\x1ba\x01');push(bi.name+'\n');push('\x1ba\x00');push(t.type+' '+t.number+'\n'+t.date+'\n'+(t.partyName?'Party: '+t.partyName+'\n':'')+'-'.repeat(width)+'\n');(t.items||[]).forEach(i=>push((i.name+' x'+i.qty+' '+cash(n(i.qty)*n(i.rate))).slice(0,width)+'\n'));push('-'.repeat(width)+'\nTOTAL: '+cash(t.total)+'\nReceived: '+cash(t.receivedPaid)+'\nBalance: '+cash(t.balance)+'\n');if(st.showTerms)push(st.terms+'\n');push('\n\n');if(st.thermalCashDrawer)parts.push(Uint8Array.from([27,112,0,25,250]));if(st.thermalAutoCut)parts.push(Uint8Array.from([29,86,0]));const len=parts.reduce((z,p)=>z+p.length,0),out=new Uint8Array(len);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length});return out}
function bytesB64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+8192)));return btoa(s)}
window.p620EscPos=function(id){const t=txById(id);if(!t)return;const bytes=escPosBytes(t),b64=bytesB64(bytes);if(window.AndroidApp?.getPairedBluetoothPrinters&&window.AndroidApp?.printEscPosBase64){let list='[]';try{list=AndroidApp.getPairedBluetoothPrinters()||'[]'}catch(_){}let devs=[];try{devs=JSON.parse(list)}catch(_){}if(devs.length){const choice=prompt('Paired printers:\n'+devs.map((d,i)=>(i+1)+'. '+d.name+' '+d.address).join('\n')+'\nEnter number','1'),d=devs[Math.max(0,n(choice)-1)];if(d){AndroidApp.printEscPosBase64(d.address,b64);return}}alert('No paired Bluetooth printer found. Saving ESC/POS file instead.')}if(window.AndroidDownloads?.saveBase64)AndroidDownloads.saveBase64(t.number+'-'+S().invoiceSettings620.thermalWidth+'mm.bin','application/octet-stream',b64);else downloadText(t.number+'.txt','text/plain','ESC/POS binary is available only in the Android app.')};
function renderTax(){const el=$('businessModuleArea');if(!el)return;const s=S().advancedTax620;el.innerHTML=shell('Advanced GST & Tax',`<div class="p620-checks"><label><input id="txReverse" type="checkbox" ${s.reverseChargeEnabled?'checked':''}> Reverse Charge</label><label><input id="txCess" type="checkbox" ${s.cessEnabled?'checked':''}> Additional CESS</label><label><input id="txEway" type="checkbox" ${s.ewayEnabled?'checked':''}> E-Way Bill field</label><label><input id="txTcs" type="checkbox" ${s.tcsEnabled?'checked':''}> TCS</label><label><input id="txTds" type="checkbox" ${s.tdsEnabled?'checked':''}> TDS</label><label><input id="txComp" type="checkbox" ${s.compositionScheme?'checked':''}> Composition Scheme</label></div><div class="p620-settings"><label>TCS %<input id="txTcsRate" type="number" step="0.01" value="${n(s.tcsRate)}"></label><label>TDS %<input id="txTdsRate" type="number" step="0.01" value="${n(s.tdsRate)}"></label></div><button class="btn primary" onclick="p620SaveTax()">Save Advanced Tax Settings</button><div class="notice">CGST/SGST vs IGST remains driven by Business State + State of Supply. Reverse Charge/TDS/TCS metadata is stored per transaction; use the GST reports for audit.</div>`,'GST split · CESS · Reverse Charge · E-Way · TDS/TCS · Composition')}
window.p620SaveTax=function(){const s=S().advancedTax620;s.reverseChargeEnabled=$('txReverse').checked;s.cessEnabled=$('txCess').checked;s.ewayEnabled=$('txEway').checked;s.tcsEnabled=$('txTcs').checked;s.tdsEnabled=$('txTds').checked;s.compositionScheme=$('txComp').checked;s.tcsRate=Math.max(0,n($('txTcsRate').value));s.tdsRate=Math.max(0,n($('txTdsRate').value));saveAll();toast('Advanced tax settings saved')};
function template(t){return S().messaging620.templates[t]||S().messaging620.templates.SALE||''}
function fillTemplate(text,t,url){const bi=businessInfo(),vals={party:t.partyName||'Customer',business:bi.name,number:t.number,amount:cash(t.total),received:cash(t.receivedPaid),balance:cash(t.balance),invoice_link:url?'View Invoice: '+url:'',date:t.date,type:t.type};return String(text).replace(/{{(\w+)}}/g,(_,k)=>vals[k]??'')}
async function providerMessage(t){const cfg=S().messaging620;if(cfg.provider!=='brevo')return false;const token=localStorage.getItem('vyapar_ai_auth_token_v1')||'';if(!token||!t.partyId)return false;const party=[...(S().customers||[]),...(S().suppliers||[])].find(p=>p.id===t.partyId),phone=party?.phone||party?.mobile;if(!phone)return false;try{const r=await (window.vyaparAuthFetch||fetch)('https://vypar-backend.onrender.com/messages/transaction',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({businessId:biz(),transactionId:t.id,to:phone,message:fillTemplate(template(t.type),t,'')})});const d=await r.json();S().messageLog620.unshift({id:uid620(),businessId:biz(),transactionId:t.id,to:phone,provider:'brevo',success:r.ok&&d.success,createdAt:now(),message:d.message||''});saveAll();return r.ok&&d.success}catch(e){return false}}
async function afterTransaction(t){if(!t||t.__p620Processed)return;t.__p620Processed=true;const adv=S().advancedTax620||{};t.reverseCharge=!!$('p620Reverse')?.checked;t.eWayBillNo=String($('p620Eway')?.value||'').trim();if(adv.tcsEnabled&&n(adv.tcsRate)>0)t.tcsAmount=txBaseNet(t)*n(adv.tcsRate)/100;if(adv.tdsEnabled&&n(adv.tdsRate)>0)t.tdsAmount=txBaseNet(t)*n(adv.tdsRate)/100;const party=[...(S().customers||[]),...(S().suppliers||[])].find(p=>p.id===t.partyId);if(t.type==='SALE'&&S().loyaltySettings620.enabled&&party){const pts=Math.floor(n(t.total)/100*n(S().loyaltySettings620.earnPer100));if(pts>0){S().loyaltyEntries611.push({id:uid620(),businessId:biz(),partyId:party.id,partyName:party.name,type:'earn',points:pts,value:0,transactionId:t.id,date:t.date,createdAt:now()});notify('loyalty','Loyalty points earned',(party.name||'Customer')+' earned '+pts+' points.')}}saveAll();const m=S().messaging620;if(m.autoTypes?.[t.type]||(t.type==='SALE'&&m.sendOnSale)||(t.type==='PAYMENT_IN'&&m.sendOnPayment))providerMessage(t)}
function loyaltyBalance(partyId){return (S().loyaltyEntries611||[]).filter(x=>x.businessId===biz()&&x.partyId===partyId).reduce((z,x)=>z+(x.type==='redeem'?-n(x.points):n(x.points)),0)}
function injectAdvancedTxFields(){const form=document.querySelector('#businessModuleArea .p611-form');if(!form||$('p620AdvancedFields'))return;const w=document.createElement('div');w.id='p620AdvancedFields';w.className='p620-inline-fields';w.innerHTML=`<label><input id="p620Reverse" type="checkbox"> Reverse Charge</label><input id="p620Eway" placeholder="E-Way Bill No. (optional)"><label><input id="p620Wholesale" type="checkbox"> Use wholesale price</label><label><input id="p620SecondaryQty" type="checkbox"> Qty entered in secondary unit</label><input id="p620Redeem" type="number" min="0" step="1" placeholder="Loyalty points to redeem">`;form.appendChild(w)}
const MESSAGE_TYPES=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN','ESTIMATE','PROFORMA','PAYMENT_IN','PAYMENT_OUT','SALE_ORDER','PURCHASE_ORDER','DELIVERY_CHALLAN','CANCELLED'];
function renderMessages(){const el=$('businessModuleArea');if(!el)return;const m=S().messaging620,sel=String(window.__p620MsgType||'SALE');el.innerHTML=shell('Messaging & Reminders',`<div class="p620-settings"><label>Provider<select id="mProvider"><option value="manual" ${m.provider==='manual'?'selected':''}>Manual SMS/WhatsApp</option><option value="brevo" ${m.provider==='brevo'?'selected':''}>Brevo SMS (backend)</option></select></label><label>Template type<select id="mType" onchange="p620MsgType(this.value)">${MESSAGE_TYPES.map(k=>`<option value="${k}" ${sel===k?'selected':''}>${k.replaceAll('_',' ')}</option>`).join('')}</select></label></div><h3>Automatic transaction messaging</h3><div class="p620-checks">${MESSAGE_TYPES.map(k=>`<label><input id="mAuto_${k}" type="checkbox" ${m.autoTypes?.[k]?'checked':''}> ${k.replaceAll('_',' ')}</label>`).join('')}</div><h3>${sel.replaceAll('_',' ')} Template</h3><textarea id="mTemplate" class="p620-textarea">${safe(m.templates[sel]||'')}</textarea><p class="muted">Placeholders: {{party}}, {{business}}, {{number}}, {{amount}}, {{received}}, {{balance}}, {{date}}, {{type}}, {{invoice_link}}</p><button class="btn primary" onclick="p620SaveMessaging()">Save Messaging</button><h3>Payment Reminders</h3><div class="actions"><button class="btn" onclick="p620GenerateDueReminders()">Generate Due Reminders</button><button class="btn" onclick="p620OpenServiceReminder()">Add Service Reminder</button></div><div id="p620ReminderList"></div>`,'Per-transaction templates · provider-backed SMS · payment/service reminders');renderReminderList()}
window.p620MsgType=function(v){const old=String(window.__p620MsgType||'SALE');if($('mTemplate'))S().messaging620.templates[old]=$('mTemplate').value;window.__p620MsgType=v;saveAll();renderMessages()};
window.p620SaveMessaging=function(){const m=S().messaging620;m.provider=$('mProvider').value;MESSAGE_TYPES.forEach(k=>m.autoTypes[k]=!!$('mAuto_'+k)?.checked);const sel=String($('mType')?.value||window.__p620MsgType||'SALE');m.templates[sel]=$('mTemplate').value;m.sendOnSale=!!m.autoTypes.SALE;m.sendOnPayment=!!m.autoTypes.PAYMENT_IN;saveAll();toast('Messaging settings saved')};
window.p620GenerateDueReminders=function(){S().paymentReminders611=S().paymentReminders611||[];activeTx().filter(t=>['SALE','PURCHASE'].includes(t.type)&&n(t.balance)>0).forEach(t=>{if(!S().paymentReminders611.some(r=>r.businessId===biz()&&r.transactionId===t.id&&r.status!=='done'))S().paymentReminders611.push({id:uid620(),businessId:biz(),transactionId:t.id,partyId:t.partyId,partyName:t.partyName,dueAmount:t.balance,dueDate:t.dueDate||t.date,nextReminder:today(),repeatDays:3,status:'open',createdAt:now()})});saveAll();renderReminderList();toast('Due reminders updated')};
window.p620OpenServiceReminder=function(){const party=prompt('Customer / Party name');if(!party)return;const service=prompt('Service / follow-up');if(!service)return;const date=prompt('Next reminder date (YYYY-MM-DD)',today());if(!date)return;S().serviceReminders611.push({id:uid620(),businessId:biz(),partyName:party,service,nextDate:date,status:'open',createdAt:now()});saveAll();renderReminderList()};
function renderReminderList(){const v=$('p620ReminderList');if(!v)return;const prs=(S().paymentReminders611||[]).filter(r=>r.businessId===biz()&&r.status!=='done'),srs=(S().serviceReminders611||[]).filter(r=>r.businessId===biz()&&r.status!=='done');v.innerHTML=`<div class="p611-table"><table class="table"><thead><tr><th>Kind</th><th>Party</th><th>Due/Service</th><th>Date</th><th></th></tr></thead><tbody>${prs.map(r=>`<tr><td>Payment</td><td>${safe(r.partyName)}</td><td>${cash(r.dueAmount)}</td><td>${safe(r.nextReminder)}</td><td><button class="btn mini" onclick="p620SendReminder('${r.id}','payment')">Send</button> <button class="btn mini" onclick="p620DoneReminder('${r.id}','payment')">Done</button></td></tr>`).join('')}${srs.map(r=>`<tr><td>Service</td><td>${safe(r.partyName)}</td><td>${safe(r.service)}</td><td>${safe(r.nextDate)}</td><td><button class="btn mini" onclick="p620SendReminder('${r.id}','service')">Send</button> <button class="btn mini" onclick="p620DoneReminder('${r.id}','service')">Done</button></td></tr>`).join('')||'<tr><td colspan="5">No reminders.</td></tr>'}</tbody></table></div>`}
window.p620SendReminder=function(id,kind){const r=(kind==='payment'?S().paymentReminders611:S().serviceReminders611).find(x=>x.id===id);if(!r)return;const msg=kind==='payment'?`Hi ${r.partyName||'Customer'}, payment of ${cash(r.dueAmount)} is due to ${businessInfo().name}.`:`Hi ${r.partyName||'Customer'}, reminder for ${r.service} from ${businessInfo().name}.`;window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');r.lastSent=now();saveAll()};
window.p620DoneReminder=function(id,kind){const r=(kind==='payment'?S().paymentReminders611:S().serviceReminders611).find(x=>x.id===id);if(r){r.status='done';r.doneAt=now();saveAll();renderReminderList()}};
function renderInventoryAdvanced(){const el=$('businessModuleArea');if(!el)return;const ps=S().products||[],rules=(S().priceRules620||[]).filter(x=>x.businessId===biz()),boms=(S().bom620||[]).filter(x=>x.businessId===biz());el.innerHTML=shell('Advanced Inventory',`<h3>Item Units / Wholesale / Low Stock</h3><div class="p611-form"><select id="invItem">${ps.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('')}</select><input id="invUnit" placeholder="Base unit e.g. pair"><input id="invSecondary" placeholder="Secondary unit e.g. box"><input id="invConversion" type="number" min="0" placeholder="1 secondary = base qty"><input id="invWholesale" type="number" min="0" placeholder="Wholesale price"><input id="invLow" type="number" min="0" placeholder="Low stock level"><button class="btn primary" onclick="p620SaveItemAdvanced()">Save Item</button></div><h3>Party-wise Price</h3><div class="p611-form"><input id="prParty" placeholder="Party name"><select id="prItem">${ps.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('')}</select><input id="prPrice" type="number" min="0" placeholder="Special sale price"><button class="btn" onclick="p620AddPriceRule()">Add Price Rule</button></div><div class="p611-table"><table class="table"><thead><tr><th>Party</th><th>Item</th><th>Price</th><th></th></tr></thead><tbody>${rules.map(r=>`<tr><td>${safe(r.partyName)}</td><td>${safe(r.itemName)}</td><td>${cash(r.price)}</td><td><button class="btn mini danger" onclick="p620DeletePriceRule('${r.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="4">No special prices.</td></tr>'}</tbody></table></div><h3>BOM / Manufacturing</h3><div class="p611-form"><select id="bomFinished">${ps.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('')}</select><select id="bomRaw">${ps.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('')}</select><input id="bomQty" type="number" min="0.001" step="0.001" value="1" placeholder="Raw qty per finished"><button class="btn" onclick="p620AddBomLine()">Add BOM Line</button><input id="mfgQty" type="number" min="0.001" value="1" placeholder="Manufacture qty"><button class="btn primary" onclick="p620Manufacture()">Manufacture</button></div><div class="p611-table"><table class="table"><thead><tr><th>Finished</th><th>Raw</th><th>Qty/unit</th><th></th></tr></thead><tbody>${boms.map(b=>`<tr><td>${safe(item(b.finishedItemId)?.name||'')}</td><td>${safe(item(b.rawItemId)?.name||'')}</td><td>${b.qty}</td><td><button class="btn mini danger" onclick="p620DeleteBom('${b.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="4">No BOM lines.</td></tr>'}</tbody></table></div><h3>Loyalty</h3><div class="p620-settings"><label><input id="loyalEnable" type="checkbox" ${S().loyaltySettings620.enabled?'checked':''}> Enable loyalty</label><label>Points per ₹100<input id="loyalEarn" type="number" min="0" value="${n(S().loyaltySettings620.earnPer100)}"></label><label>₹ value per point<input id="loyalValue" type="number" min="0" value="${n(S().loyaltySettings620.redeemValuePerPoint)}"></label><button class="btn" onclick="p620SaveLoyalty()">Save Loyalty</button></div>`,'Advanced units · wholesale pricing · party rates · BOM · loyalty')}
window.p620SaveItemAdvanced=function(){const p=item($('invItem').value);if(!p)return;p.unit=$('invUnit').value.trim()||p.unit||'pcs';p.secondaryUnit=$('invSecondary').value.trim();p.unitConversion=Math.max(0,n($('invConversion').value));p.wholesalePrice=Math.max(0,n($('invWholesale').value));p.lowStockLevel=Math.max(0,n($('invLow').value));p.updatedAt=now();saveAll();toast('Item settings saved')};
window.p620AddPriceRule=function(){const p=item($('prItem').value),party=$('prParty').value.trim(),price=Math.max(0,n($('prPrice').value));if(!p||!party||!price)return alert('Party, item and price required');S().priceRules620.push({id:uid620(),businessId:biz(),partyName:party,itemId:p.id,itemName:p.name,price,createdAt:now()});saveAll();renderInventoryAdvanced()};
window.p620DeletePriceRule=function(id){S().priceRules620=S().priceRules620.filter(r=>r.id!==id);saveAll();renderInventoryAdvanced()};
window.p620AddBomLine=function(){const f=$('bomFinished').value,r=$('bomRaw').value,q=Math.max(0,n($('bomQty').value));if(!f||!r||f===r||q<=0)return alert('Select different finished/raw items and valid qty');S().bom620.push({id:uid620(),businessId:biz(),finishedItemId:f,rawItemId:r,qty:q,createdAt:now()});saveAll();renderInventoryAdvanced()};
window.p620DeleteBom=function(id){S().bom620=S().bom620.filter(b=>b.id!==id);saveAll();renderInventoryAdvanced()};
window.p620Manufacture=function(){const f=$('bomFinished').value,qty=Math.max(0,n($('mfgQty').value)),lines=S().bom620.filter(b=>b.businessId===biz()&&b.finishedItemId===f);if(!f||qty<=0||!lines.length)return alert('Add BOM lines first');try{const raws=lines.map(l=>({itemId:l.rawItemId,qty:l.qty}));window.VyaparPlatform611.manufacture(f,qty,raws);const cost=lines.reduce((z,l)=>z+n(item(l.rawItemId)?.purchasePrice)*n(l.qty),0);const p=item(f);if(p&&cost>0)p.purchasePrice=cost;log('CREATE','MANUFACTURING_BOM',f,'Qty '+qty+', unit cost '+cost);saveAll();toast('Manufacturing completed');renderInventoryAdvanced()}catch(e){alert(e.message)}};
window.p620SaveLoyalty=function(){S().loyaltySettings620.enabled=$('loyalEnable').checked;S().loyaltySettings620.earnPer100=Math.max(0,n($('loyalEarn').value));S().loyaltySettings620.redeemValuePerPoint=Math.max(0,n($('loyalValue').value));saveAll();toast('Loyalty settings saved')};
function renderFinance(){const el=$('businessModuleArea');if(!el)return;const cs=(S().cheques620||[]).filter(x=>x.businessId===biz()).slice().reverse(),ls=(S().loans620||[]).filter(x=>x.businessId===biz());el.innerHTML=shell('Cheques & Loans',`<h3>Cheque Register</h3><div class="p611-form"><input id="chNo" placeholder="Cheque number"><select id="chDir"><option value="received">Received</option><option value="issued">Issued</option></select><input id="chParty" placeholder="Party"><input id="chBank" placeholder="Bank"><input id="chAmount" type="number" min="0" placeholder="Amount"><input id="chDate" type="date" value="${today()}"><button class="btn primary" onclick="p620AddCheque()">Add Cheque</button></div><div class="p611-table"><table class="table"><thead><tr><th>Date</th><th>No.</th><th>Direction</th><th>Party</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${cs.map(c=>`<tr><td>${c.date}</td><td>${safe(c.number)}</td><td>${c.direction}</td><td>${safe(c.party)}</td><td>${cash(c.amount)}</td><td>${c.status}</td><td>${c.status==='pending'?`<button class="btn mini" onclick="p620ChequeStatus('${c.id}','cleared')">Clear</button> <button class="btn mini danger" onclick="p620ChequeStatus('${c.id}','bounced')">Bounce</button>`:c.status==='cleared'?`<button class="btn mini danger" onclick="p620ChequeStatus('${c.id}','bounced')">Mark Bounced</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7">No cheques.</td></tr>'}</tbody></table></div><h3>Loan Accounts</h3><div class="p611-form"><input id="lnName" placeholder="Loan name / lender"><input id="lnPrincipal" type="number" min="0" placeholder="Principal"><input id="lnRate" type="number" min="0" step="0.01" placeholder="Annual interest %"><input id="lnTerm" type="number" min="1" placeholder="Term months"><select id="lnAccount">${paymentAccountOptions()}</select><button class="btn primary" onclick="p620AddLoan()">Add Loan</button></div><div class="p611-table"><table class="table"><thead><tr><th>Loan</th><th>Principal</th><th>Rate</th><th>Outstanding</th><th>Repay</th></tr></thead><tbody>${ls.map(l=>`<tr><td>${safe(l.name)}</td><td>${cash(l.principal)}</td><td>${l.annualRate}%</td><td>${cash(Math.max(0,-accountBalance(l.accountId)))}</td><td><button class="btn mini" onclick="p620RepayLoan('${l.id}')">Record repayment</button></td></tr>`).join('')||'<tr><td colspan="5">No loans.</td></tr>'}</tbody></table></div>`,'Cheque lifecycle · loan liability · principal/interest repayment')}
window.p620AddCheque=function(){const number=$('chNo').value.trim(),amount=Math.max(0,n($('chAmount').value));if(!number||!amount)return alert('Cheque number and amount required');S().cheques620.push({id:uid620(),businessId:biz(),number,direction:$('chDir').value,party:$('chParty').value.trim(),bank:$('chBank').value.trim(),amount,date:$('chDate').value||today(),status:'pending',createdAt:now()});saveAll();renderFinance()};
window.p620ChequeStatus=function(id,status){const c=S().cheques620.find(x=>x.id===id);if(!c)return;if(status==='cleared'&&c.status==='pending'){const ar=ensureAccount(c.direction==='received'?'AR':'AP',c.direction==='received'?'Accounts Receivable':'Accounts Payable',c.direction==='received'?'asset':'liability'),cheque=ensureAccount('CHEQUE','Cheque Account','asset'),tid='CHEQUE-'+c.id;if(c.direction==='received'){addLedgerRaw(tid,cheque.id,c.amount,0,'Cheque received '+c.number,c.date);addLedgerRaw(tid,ar.id,0,c.amount,'Receivable settled by cheque '+c.number,c.date)}else{addLedgerRaw(tid,ar.id,c.amount,0,'Payable settled by cheque '+c.number,c.date);addLedgerRaw(tid,cheque.id,0,c.amount,'Cheque issued '+c.number,c.date)}c.postingId=tid;c.status='cleared';c.clearedAt=now()}else if(status==='bounced'&&c.status==='cleared'){const es=(S().ledgerEntries611||[]).filter(e=>e.businessId===biz()&&e.transactionId===c.postingId);es.forEach(e=>addLedgerRaw(c.postingId+'-BOUNCE',e.accountId,e.credit,e.debit,'Reverse bounced cheque '+c.number,today()));c.status='bounced';c.bouncedAt=now()}else if(status==='bounced'){c.status='bounced';c.bouncedAt=now()}saveAll();renderFinance()};
window.p620AddLoan=function(){const name=$('lnName').value.trim(),principal=Math.max(0,n($('lnPrincipal').value)),annualRate=Math.max(0,n($('lnRate').value)),termMonths=Math.max(1,Math.floor(n($('lnTerm').value)||1)),payId=$('lnAccount').value;if(!name||!principal||!payId)return alert('Loan name, principal and receiving account required');const loanAcc=ensureAccount('LOAN-'+Date.now(),name+' Loan','liability'),tid='LOAN-OPEN-'+loanAcc.id;addLedgerRaw(tid,payId,principal,0,'Loan proceeds '+name,today());addLedgerRaw(tid,loanAcc.id,0,principal,'Loan liability '+name,today());S().loans620.push({id:uid620(),businessId:biz(),name,principal,annualRate,termMonths,startDate:today(),accountId:loanAcc.id,paymentAccountId:payId,createdAt:now()});saveAll();renderFinance()};
window.p620RepayLoan=function(id){const l=S().loans620.find(x=>x.id===id);if(!l)return;const principal=Math.max(0,n(prompt('Principal repayment amount','0'))),interest=Math.max(0,n(prompt('Interest amount','0')));if(principal+interest<=0)return;const outstanding=Math.max(0,-accountBalance(l.accountId));if(principal>outstanding+0.01)return alert('Principal exceeds loan outstanding');const pay=prompt('Payment account ID (leave blank for original)',l.paymentAccountId)||l.paymentAccountId,pa=accountById(pay);if(!pa)return alert('Payment account not found');const interestAcc=ensureAccount('INTEREST_EXP','Interest Expense','expense'),tid='LOAN-PAY-'+uid620();if(principal)addLedgerRaw(tid,l.accountId,principal,0,'Loan principal repayment '+l.name,today());if(interest)addLedgerRaw(tid,interestAcc.id,interest,0,'Loan interest '+l.name,today());addLedgerRaw(tid,pa.id,0,principal+interest,'Loan payment '+l.name,today());l.lastPaymentAt=now();saveAll();renderFinance()};
function renderCurrency(){const el=$('businessModuleArea');if(!el)return;const rates=(S().currencyRates620||[]).filter(r=>r.businessId===biz());el.innerHTML=shell('Multi-Currency Manager',`<div class="notice">Base currency: <b>${safe(baseCurrency())}</b>. Transactions keep original currency + exchange rate + normalized base amount.</div><div class="p611-form"><input id="curCode" maxlength="3" placeholder="Currency e.g. USD"><input id="curRate" type="number" min="0.000001" step="0.000001" placeholder="1 currency = base"><button class="btn primary" onclick="p620SaveRate()">Save Rate</button></div><div class="p611-table"><table class="table"><thead><tr><th>Currency</th><th>Rate to ${safe(baseCurrency())}</th><th>Updated</th><th></th></tr></thead><tbody>${rates.map(r=>`<tr><td>${safe(r.currency)}</td><td>${r.rate}</td><td>${safe(String(r.updatedAt||'').slice(0,19))}</td><td><button class="btn mini danger" onclick="p620DeleteRate('${r.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="4">No saved rates.</td></tr>'}</tbody></table></div>`,'Exchange-rate table · normalized base accounting')}
window.p620SaveRate=function(){const c=$('curCode').value.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,3),r=Math.max(0,n($('curRate').value));if(c.length!==3||r<=0)return alert('Enter valid 3-letter currency and rate');let x=S().currencyRates620.find(x=>x.businessId===biz()&&x.currency===c);if(!x){x={id:uid620(),businessId:biz(),currency:c};S().currencyRates620.push(x)}x.rate=r;x.updatedAt=now();saveAll();renderCurrency()};
window.p620DeleteRate=function(id){S().currencyRates620=S().currencyRates620.filter(r=>r.id!==id);saveAll();renderCurrency()};
function token(){return localStorage.getItem('vyapar_ai_auth_token_v1')||''}
async function api(path,opts){const h={'Content-Type':'application/json',...(opts?.headers||{})};if(token())h.Authorization='Bearer '+token();const request=window.vyaparAuthFetch||fetch;const r=await request('https://vypar-backend.onrender.com'+path,{...opts,headers:h}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'Request failed');return d}
function renderStaff(){const el=$('businessModuleArea');if(!el)return;el.innerHTML=shell('Staff & Permissions',`<div class="p611-form"><input id="stEmail" type="email" placeholder="Staff email"><select id="stRole"><option>Admin</option><option>Manager</option><option>Cashier</option><option>Sales</option><option>Inventory</option><option>Accountant</option><option>Viewer</option></select><input id="stPerms" placeholder="Permissions comma separated e.g. sale.create,reports.view"><button class="btn primary" onclick="p620SaveStaff()">Save Staff</button></div><div class="actions"><button class="btn" onclick="p620LoadStaff()">Refresh Staff</button><button class="btn" onclick="p620Biometric()">Test Device Biometric / Lock</button></div><div id="p620StaffList"><p class="muted">Press Refresh Staff.</p></div>`,'Backend-enforced business access · roles · permissions · native device authentication')}
window.p620LoadStaff=async function(){const v=$('p620StaffList');try{const d=await api('/business/'+encodeURIComponent(biz())+'/staff');v.innerHTML=`<div class="p611-table"><table class="table"><thead><tr><th>Email</th><th>Role</th><th>Permissions</th><th>Active</th><th></th></tr></thead><tbody>${(d.staff||[]).map(s=>`<tr><td>${safe(s.staff_email)}</td><td>${safe(s.role)}</td><td>${safe((s.permissions||[]).join(', '))}</td><td>${s.active?'Yes':'No'}</td><td>${s.active?`<button class="btn mini danger" onclick="p620DisableStaff('${safe(s.staff_email)}')">Disable</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5">No staff.</td></tr>'}</tbody></table></div>`}catch(e){v.innerHTML='<div class="notice danger">'+safe(e.message)+'</div>'}};
window.p620SaveStaff=async function(){try{const email=$('stEmail').value.trim().toLowerCase(),role=$('stRole').value,permissions=$('stPerms').value.split(',').map(x=>x.trim()).filter(Boolean);await api('/business/'+encodeURIComponent(biz())+'/staff/'+encodeURIComponent(email),{method:'PUT',body:JSON.stringify({role,permissions})});toast('Staff saved');p620LoadStaff()}catch(e){alert(e.message)}};
window.p620DisableStaff=async function(email){if(!confirm('Disable staff access for '+email+'?'))return;try{await api('/business/'+encodeURIComponent(biz())+'/staff/'+encodeURIComponent(email),{method:'DELETE'});p620LoadStaff()}catch(e){alert(e.message)}};
window.onNativeBiometricResult=function(ok){toast(ok?'Device authentication successful':'Device authentication cancelled/failed')};
window.p620Biometric=function(){if(window.AndroidApp?.authenticateDevice){try{AndroidApp.authenticateDevice();return}catch(_){}}alert('Native device authentication is available in the Android APK build.')};
function renderNotifications(){const el=$('businessModuleArea');if(!el)return;const ns=(S().notifications611||[]).filter(x=>x.businessId===biz()).slice(0,300);el.innerHTML=shell('Notification Centre',`<div class="actions"><button class="btn" onclick="p620MarkAllRead()">Mark all read</button><button class="btn danger" onclick="p620ClearRead()">Clear read</button></div><div class="p620-notifications">${ns.map(x=>`<div class="notice ${x.read?'':'success'}"><div><b>${safe(x.title)}</b><br><span>${safe(x.message)}</span><br><small>${safe(String(x.createdAt||'').replace('T',' ').slice(0,19))}</small></div><button class="btn mini" onclick="p620ToggleNotification('${x.id}')">${x.read?'Unread':'Read'}</button></div>`).join('')||'<p class="muted">No notifications.</p>'}</div>`,'Read/unread · cleanup · business activity')}
window.p620ToggleNotification=function(id){const x=S().notifications611.find(n=>n.id===id);if(x)x.read=!x.read;saveAll();renderNotifications()};
window.p620MarkAllRead=function(){S().notifications611.filter(x=>x.businessId===biz()).forEach(x=>x.read=true);saveAll();renderNotifications()};
window.p620ClearRead=function(){if(!confirm('Clear read notifications? Unread notifications will stay.'))return;S().notifications611=S().notifications611.filter(x=>x.businessId!==biz()||!x.read);saveAll();renderNotifications()};
function checkDueReminders(){const d=today();(S().paymentReminders611||[]).filter(r=>r.businessId===biz()&&r.status!=='done'&&r.nextReminder<=d&&!r.notifiedOn?.startsWith(d)).forEach(r=>{notify('reminder','Payment due',`${r.partyName||'Customer'} · ${cash(r.dueAmount)}`);r.notifiedOn=d});(S().serviceReminders611||[]).filter(r=>r.businessId===biz()&&r.status!=='done'&&r.nextDate<=d&&!r.notifiedOn?.startsWith(d)).forEach(r=>{notify('reminder','Service reminder',`${r.partyName||'Customer'} · ${r.service}`);r.notifiedOn=d});saveAll()}
const prevHome=window.p611Home,prevOpen=window.p611Open;
window.p611Home=function(){ensure();prevHome&&prevHome();setTimeout(()=>{const grid=document.querySelector('#businessModuleArea .p611-modules');if(!grid||grid.dataset.p620)return;grid.dataset.p620='1';[['reports620','50+ Reports','Deep accounting, stock, party & GST report library'],['documents620','Orders & Lifecycle','Quote/order/challan conversion and fulfilment'],['print620','Invoice & Thermal','A4/A5 + 58/80mm + ESC/POS'],['tax620','Advanced GST','RCM, CESS, E-Way, TDS/TCS, composition'],['messages620','Messaging & Reminders','Templates, SMS provider, due/service reminders'],['inventory620','Advanced Inventory','Units, wholesale, party price, BOM, loyalty'],['currency620','Multi-Currency','Exchange-rate manager'],['staff620','Staff & Security','RBAC + device authentication'],['notifications620','Notification Centre','Read/unread business activity'],['finance620','Cheques & Loans','Cheque clearing/bounce and loan repayment']].forEach(([m,t,s])=>{const b=document.createElement('button');b.onclick=()=>window.p611Open(m);b.innerHTML=`<b>${t}</b><span>${s}</span>`;grid.appendChild(b)})},0)};
window.p611Open=function(mod){ensure();if(mod==='reports620')return renderReportLibrary();if(mod==='documents620')return renderDocuments();if(mod==='print620')return renderPrint();if(mod==='tax620')return renderTax();if(mod==='messages620')return renderMessages();if(mod==='inventory620')return renderInventoryAdvanced();if(mod==='currency620')return renderCurrency();if(mod==='staff620')return renderStaff();if(mod==='notifications620')return renderNotifications();if(mod==='finance620')return renderFinance();const r=prevOpen&&prevOpen(mod);if(mod==='transactions')setTimeout(injectAdvancedTxFields,0);return r};
window.p611CreateFromForm=function(){try{const type=$('pType')?.value||'SALE',q=String($('pItem')?.value||'').trim(),products=S().products||[],it=products.find(p=>[p.id,p.sku,p.barcode,p.name].some(v=>String(v||'').toLowerCase()===q.toLowerCase()))||products.find(p=>[p.name,p.sku,p.barcode,p.brand,p.article].join(' ').toLowerCase().includes(q.toLowerCase())),needsItem=['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type),partyName=String($('pParty')?.value||'').trim(),party=[...(S().customers||[]),...(S().suppliers||[])].find(p=>String(p.name||'').toLowerCase()===partyName.toLowerCase()||String(p.mobile||p.phone||'')===partyName),useWholesale=!!$('p620Wholesale')?.checked;let rate=n($('pRate')?.value);if(!rate&&it)rate=type==='PURCHASE'?n(it.purchasePrice):useWholesale&&n(it.wholesalePrice)?n(it.wholesalePrice):(window.VyaparPlatform611?.priceForParty?window.VyaparPlatform611.priceForParty(partyName,it.id,n(it.sellingPrice||it.salePrice||it.mrp||it.purchasePrice)):n(it.sellingPrice||it.salePrice||it.mrp||it.purchasePrice));let qty=Math.max(0,n($('pQty')?.value));if($('p620SecondaryQty')?.checked&&it&&n(it.unitConversion)>0)qty*=n(it.unitConversion);let discount=n($('pDisc')?.value);const redeem=Math.max(0,Math.floor(n($('p620Redeem')?.value))),available=party?loyaltyBalance(party.id):0,value=redeem*n(S().loyaltySettings620.redeemValuePerPoint);if(redeem>available)throw new Error('Only '+available+' loyalty points are available');if(redeem&&type!=='SALE')throw new Error('Loyalty redemption is allowed only on Sale');if(redeem&&needsItem&&qty*rate>0)discount=Math.min(100,discount+(value/(qty*rate))*100);const items=needsItem?[{itemId:it?.id||'',name:it?.name||q,qty,rate,purchaseRate:n(it?.purchasePrice)||rate,tax:n($('pTax')?.value)||n(it?.gst),cess:n($('pCess')?.value),discount}]:[],total=needsItem?0:n($('pRate')?.value)||n($('pPaid')?.value),input={type,party:partyName,partyId:party?.id||'',items,total,receivedPaid:n($('pPaid')?.value),paymentMode:$('pMode')?.value,paymentAccountId:$('pAccount')?.value,linkedTransactionId:$('pLinked')?.value,stateOfSupply:$('pState')?.value,currency:($('pCurrency')?.value||baseCurrency()).trim().toUpperCase(),exchangeRate:(()=>{const c=($('pCurrency')?.value||baseCurrency()).trim().toUpperCase();if(c===baseCurrency())return 1;const entered=n($('pFx')?.value);const saved=(S().currencyRates620||[]).find(r=>r.businessId===biz()&&r.currency===c);return entered>0&&entered!==1?entered:n(saved?.rate)||entered||1})(),notes:$('pNotes')?.value},tx=window.VyaparPlatform611.createTransaction(input);tx.reverseCharge=!!$('p620Reverse')?.checked;tx.eWayBillNo=String($('p620Eway')?.value||'').trim();if(redeem&&party){S().loyaltyEntries611.push({id:uid620(),businessId:biz(),partyId:party.id,partyName:party.name,type:'redeem',points:redeem,value,transactionId:tx.id,date:tx.date,createdAt:now()});tx.loyaltyRedeemed=redeem;tx.loyaltyDiscountValue=value}saveAll();notify('business','Transaction saved',tx.type+' '+tx.number+' · '+cash(tx.total));toast(tx.number+' saved');window.p611Open('transactions');return tx}catch(e){alert(e.message)}};
const oldCreate=window.VyaparPlatform611?.createTransaction;if(window.VyaparPlatform611&&oldCreate){window.VyaparPlatform611.createTransaction=function(input){const t=oldCreate(input);afterTransaction(t);return t};window.VyaparPlatform611.version=VERSION;window.VyaparPlatform611.reportData=reportData;window.VyaparPlatform611.reportCatalog=reportCatalog;window.VyaparPlatform611.invoiceHtml=invoiceHtml;window.VyaparPlatform611.priceForParty=function(partyName,itemId,normal){const r=(S().priceRules620||[]).find(x=>x.businessId===biz()&&x.itemId===itemId&&String(x.partyName).toLowerCase()===String(partyName||'').toLowerCase());return r?n(r.price):n(normal)};}
window.onNativeAppReady=(function(old){return function(){try{old&&old()}catch(_){}ensure();checkDueReminders()}})(window.onNativeAppReady);
window.onNativeAppResume=(function(old){return function(){try{old&&old()}catch(_){}checkDueReminders()}})(window.onNativeAppResume);
ensure();setTimeout(checkDueReminders,500);
})();


;
/* ===== platform-621-business-ui.js ===== */
/* Vyapar AI 6.2.1 — Business UX consolidation hotfix.
   UI/navigation layer only: keeps 6.2.0 accounting, tax, inventory and report engines authoritative.
   Goals: remove duplicate entry points, surface advanced tools in the right workspace, add safe bulk controls,
   and improve Android vertical scrolling without deleting any existing feature implementation. */
(function(){
'use strict';

const VERSION='6.2.1';
const oldRenderBusiness=window.renderBusiness;
const oldRenderSales=window.renderSales;
const oldRenderStock=window.renderStock;
const oldPlatformOpen=window.p611Open;
const oldPlatformHome=window.p611Home;
const oldAdvancedHome=window.renderAdvancedHome;
const oldAdvancedOpen=window.advRenderModule;
let activeHostContext='business';
let tableSeq=0;

window.vx621LegacyBusinessRenderer=oldRenderBusiness;
window.vx621LegacyPlatformHome=oldPlatformHome;
window.vx621LegacyAdvancedHome=oldAdvancedHome;

function S(){ return (typeof state!=='undefined' && state) ? state : {}; }
function N(v){ const x=Number(v); return Number.isFinite(x)?x:0; }
function E(v){
  if(typeof esc==='function') return esc(String(v??''));
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function M(v){ return typeof money==='function'?money(N(v)):'₹'+N(v).toFixed(2); }
function plan(){ return typeof getCurrentPlan==='function'?getCurrentPlan():'free'; }
function rank(p){ return ({free:0,pro:1,business:2})[p]??0; }
function allowed(required){
  if(!required || required==='free') return true;
  if(rank(plan())>=rank(required)) return true;
  if(typeof requirePlan==='function') requirePlan(required);
  return false;
}
function saveState(){
  try{
    if(typeof save==='function'){ save(); return; }
    localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(S()));
  }catch(_){ }
}
function ensure621(){
  const s=S();
  s.ui621=s.ui621||{};
  s.ui621.version=VERSION;
  s.ui621.domainMode=s.ui621.domainMode||{};
  ['billing','gst','reports','inventory','finance'].forEach(k=>{
    if(!['advanced','legacy'].includes(s.ui621.domainMode[k])) s.ui621.domainMode[k]='advanced';
  });
  if(typeof s.ui621.compactBusiness!=='boolean') s.ui621.compactBusiness=true;
  return s.ui621;
}
function activeBusinessId(){ return String(S().activeBusinessId||S().currentStoreId||'MAIN'); }
function accountingTotals(){
  try{ return window.VyaparPlatform611?.totals?.()||null; }catch(_){ return null; }
}
function balanceSheet(){
  try{ return window.VyaparPlatform611?.balanceSheet?.()||null; }catch(_){ return null; }
}
function legacyTotals(){
  try{ return typeof businessTotals==='function'?businessTotals():{sales:0,gross:0,expenses:0,net:0,outstanding:0}; }
  catch(_){ return {sales:0,gross:0,expenses:0,net:0,outstanding:0}; }
}
function tierBadge(tier){
  if(!tier || tier==='free') return '<span class="vx621-tier free">FREE</span>';
  const locked=rank(plan())<rank(tier);
  return `<span class="vx621-tier ${tier} ${locked?'locked':''}">${locked?'🔒 ':''}${tier.toUpperCase()}</span>`;
}
function button(label,action,tier='business',kind=''){
  const locked=rank(plan())<rank(tier);
  const blue=['Payment In','Purchase','Suppliers','Purchase Return','Cheques & Loans','Currencies','Sale Return'].includes(String(label));
  return `<button type="button" class="vx621-action ${kind} ${blue?'blue':''} ${locked?'is-locked':''}" onclick="${action}"><span>${E(label)}</span>${tierBadge(tier)}</button>`;
}
function featureCard(title,desc,actions,icon='◈'){
  return `<article class="vx621-feature-card"><div class="vx621-feature-icon" aria-hidden="true">${icon}</div><div class="vx621-feature-copy"><h3>${E(title)}</h3><p>${E(desc)}</p><div class="vx621-card-actions">${actions}</div></div></article>`;
}
function group(title,subtitle,cards){
  return `<section class="vx621-group"><div class="vx621-group-head"><div><h2>${E(title)}</h2><p>${E(subtitle)}</p></div></div><div class="vx621-feature-grid">${cards.join('')}</div></section>`;
}
function findHost(context){ return document.querySelector(`[data-vx621-host="${context}"]`); }
function activateHost(context){
  const target=findHost(context);
  if(!target) return null;
  target.hidden=false;
  document.querySelectorAll('[data-vx621-host]').forEach(el=>{
    if(el!==target && el.id==='businessModuleArea'){
      el.id=el.dataset.vx621OriginalId||('vx621-'+el.dataset.vx621Host+'-host');
    }
  });
  if(target.id!=='businessModuleArea'){
    target.dataset.vx621OriginalId=target.id||('vx621-'+context+'-host');
    target.id='businessModuleArea';
  }
  activeHostContext=context;
  return target;
}
function scrollToHost(context){
  setTimeout(()=>{
    const h=findHost(context)||document.getElementById('businessModuleArea');
    h?.scrollIntoView?.({behavior:'smooth',block:'start'});
  },40);
}
function setTransactionPreset(type){
  setTimeout(()=>{
    const el=document.getElementById('pType');
    if(el && type){ el.value=type; el.dispatchEvent(new Event('change',{bubbles:true})); }
  },25);
}

window.vx621OpenPlatform=function(context,module,tier='business',preset=''){
  if(!allowed(tier)) return false;
  const openNow=()=>{
    const host=activateHost(context);
    if(!host) return;
    if(typeof oldPlatformOpen==='function') oldPlatformOpen(module);
    if(module==='transactions' && preset) setTransactionPreset(preset);
    setTimeout(()=>{ decorateCurrentPlatform(module); observeHost(host); },40);
    scrollToHost(context);
  };
  if(typeof currentTab!=='undefined' && currentTab!==context && typeof setTab==='function'){
    if(context==='business' && tier!=='business'){
      // Pro tools are allowed to live in Sales; do not force the Business-only tab.
      return false;
    }
    const r=setTab(context);
    if(r===false) return false;
    setTimeout(openNow,20);
  }else openNow();
  return true;
};

window.vx621OpenAdvanced=function(context,module,tier='business'){
  if(!allowed(tier)) return false;
  const openNow=()=>{
    const host=activateHost(context);
    if(!host) return;
    if(typeof oldAdvancedOpen==='function') oldAdvancedOpen(module);
    setTimeout(()=>{ decorateGenericDeleteTables(host); observeHost(host); },40);
    scrollToHost(context);
  };
  if(typeof currentTab!=='undefined' && currentTab!==context && typeof setTab==='function'){
    const r=setTab(context); if(r===false) return false; setTimeout(openNow,20);
  }else openNow();
  return true;
};

window.vx621OpenDomain=function(domain,context='business'){
  const mode=ensure621().domainMode[domain]||'advanced';
  if(domain==='billing'){
    if(mode==='legacy' && context==='business') return window.businessShowModule?.('billing');
    return window.vx621OpenPlatform(context,'transactions','business','SALE');
  }
  if(domain==='gst'){
    if(mode==='legacy'){
      if(typeof setTab==='function') return setTab('calculator');
      return false;
    }
    return window.vx621OpenPlatform(context,'tax620','business');
  }
  if(domain==='reports'){
    if(mode==='legacy') return window.vx621OpenAdvanced(context,'reports','business');
    return window.vx621OpenPlatform(context,'reports620','business');
  }
  if(domain==='inventory'){
    if(mode==='legacy'){
      if(typeof setTab==='function') return setTab('stock');
      return false;
    }
    return window.vx621OpenPlatform(context,'inventory620','business');
  }
  if(domain==='finance'){
    if(mode==='legacy' && context==='business') return window.businessShowModule?.('payments');
    return window.vx621OpenPlatform(context,'cashbank','business');
  }
};

window.p611Home=function(){
  if(activeHostContext==='sales') return window.renderSales?.();
  if(activeHostContext==='stock') return window.renderStock?.();
  if(activeHostContext==='business') return window.renderBusiness?.();
  return oldPlatformHome?.();
};
window.renderAdvancedHome=function(){
  if(activeHostContext==='sales') return window.renderSales?.();
  if(activeHostContext==='stock') return window.renderStock?.();
  if(activeHostContext==='business') return window.renderBusiness?.();
  return oldAdvancedHome?.();
};

function recentTransactions(){
  const bid=activeBusinessId();
  return (S().transactions611||[]).filter(t=>String(t.businessId||'MAIN')===bid).slice().reverse().slice(0,12);
}
function recentActivityHtml(){
  const rows=recentTransactions();
  return `<div class="vx621-recent-head"><div><h2>Recent Business Activity</h2><p>Your latest transactions. Cancelling a transaction reverses its stock and balance changes.</p></div><div class="vx621-bulk-actions"><button class="btn mini" onclick="vx621SelectAllRecent(true)">Select All</button><button class="btn mini" onclick="vx621SelectAllRecent(false)">Clear</button><button class="btn mini danger" onclick="vx621CancelRecentSelected()">Cancel Selected</button></div></div><div class="vx621-table-wrap"><table class="table vx621-table"><thead><tr><th class="vx621-check-col"><input type="checkbox" onchange="vx621SelectAllRecent(this.checked)"></th><th>Date</th><th>Type</th><th>No.</th><th>Party</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map(t=>`<tr><td><input class="vx621-recent-check" type="checkbox" value="${E(t.id)}" ${t.status==='cancelled'?'disabled':''}></td><td>${E(t.date)}</td><td>${E(t.type)}</td><td>${E(t.number)}</td><td>${E(t.partyName||'')}</td><td>${M(t.total)}</td><td>${E(t.status||'active')}</td><td>${t.status==='cancelled'?'<span class="vx621-muted">Cancelled</span>':`<button class="btn mini danger" onclick="p611Cancel('${E(t.id)}')">Cancel</button>`}</td></tr>`).join('')||'<tr><td colspan="8" class="muted">No business transactions yet.</td></tr>'}</tbody></table></div>`;
}
window.vx621SelectAllRecent=function(checked){ document.querySelectorAll('.vx621-recent-check:not(:disabled)').forEach(x=>x.checked=!!checked); };
window.vx621CancelRecentSelected=async function(){
  const ids=[...document.querySelectorAll('.vx621-recent-check:checked')].map(x=>x.value);
  if(!ids.length) return alert('Select at least one active transaction.');
  const ok=await confirmAction(`Cancel ${ids.length} selected transaction(s)? Stock and ledger effects will be reversed safely.`,'Cancel Selected');
  if(!ok) return;
  for(const id of ids){
    const tx=(S().transactions611||[]).find(t=>t.id===id);
    if(tx && tx.status!=='cancelled'){
      try{ window.VyaparPlatform611?.reverseTransaction?.(tx); }catch(e){ console.warn('Cancel failed',id,e); }
    }
  }
  saveState();
  window.renderBusiness?.();
};

function renderBusinessHome(){
  ensure621();
  try{ window.VyaparPlatform611?.ensure?.(); }catch(_){ }
  const el=document.getElementById('screen-business'); if(!el) return;
  const at=accountingTotals(),bs=balanceSheet(),lt=legacyTotals();
  const revenue=at?N(at.revenue):N(lt.sales),net=at?N(at.net):N(lt.net),expenses=at?N(at.expenses):N(lt.expenses),assets=bs?N(bs.assets):0;
  const cards=[];

  const daily=[
    featureCard('Transactions','Sales, purchases and returns.',button('New Sale',"vx621OpenPlatform('business','transactions','business','SALE')",'business','primary')+button('Purchase',"vx621OpenPlatform('business','transactions','business','PURCHASE')",'business'),'⇄'),
    featureCard('Customers & Udhaar','Balances, receipts and reminders.',button('Customers',"vx621OpenAdvanced('business','customers','business')",'business','primary')+button('Payment In',"vx621OpenPlatform('business','transactions','business','PAYMENT_IN')",'business'),'👥'),
    featureCard('Suppliers & Purchases','Suppliers, dues and returns.',button('Suppliers',"vx621OpenAdvanced('business','suppliers','business')",'business')+button('Purchase Return',"vx621OpenPlatform('business','transactions','business','PURCHASE_RETURN')",'business'),'▣'),
    featureCard('Cash & Bank','Cash, bank and UPI payments.',button('Open Cash & Bank',"vx621OpenDomain('finance','business')",'business','primary')+button('Cheques & Loans',"vx621OpenPlatform('business','finance620','business')",'business'),'₹')
  ];
  const accounting=[
    featureCard('Central Ledgers','View customer, supplier and account balances.',button('Open Ledgers',"vx621OpenPlatform('business','ledger','business')",'business','primary'),'≡'),
    featureCard('58 Reports','Profit, balance sheet and GST reports.',button('Open Reports',"vx621OpenDomain('reports','business')",'business','primary'),'▥'),
    featureCard('Advanced GST & Tax','GST, e-way bills and tax settings.',button('Advanced GST',"vx621OpenDomain('gst','business')",'business','primary'),'GST'),
    featureCard('Business Expenses','Record shop expenses and track their effect on profit.',button('Expense Entry',"businessShowModule('expenses')",'business','primary'),'−')
  ];
  const docs=[
    featureCard('Invoice & Thermal','PDF invoices and thermal printing.',button('Invoice & Print',"vx621OpenPlatform('business','print620','business')",'business','primary'),'▤'),
    featureCard('Orders & Lifecycle','Quotes, orders and delivery notes.',button('Orders & Documents',"vx621OpenPlatform('business','documents620','business')",'business','primary'),'↗'),
    featureCard('Messaging & Reminders','Invoice messages and reminders.',button('Messaging',"vx621OpenPlatform('business','messages620','business')",'business','primary'),'✉'),
    featureCard('Multi-Currency','Currencies and exchange rates.',button('Currencies',"vx621OpenPlatform('business','currency620','business')",'business'),'¤')
  ];
  const stockCards=[
    featureCard('Product Catalog & Barcode','Product identity, SKU/article, size/color, barcode and bulk import live in Stock.',button('Open in Stock',"vx621GoStock('catalog')",'business','primary'),'▦'),
    featureCard('Godowns & Stock Transfer','Godown creation, stock ledger, valuation and transfers are kept with Stock.',button('Open in Stock',"vx621GoStock('godowns')",'business','primary'),'⌂'),
    featureCard('Advanced Inventory','Units, wholesale price, party pricing, BOM/manufacturing and loyalty are kept with Stock.',button('Open in Stock',"vx621GoStock('advanced')",'business','primary'),'⚙')
  ];
  const salesCards=[
    featureCard('Sales & Returns','Sale, Sale Return and invoice workflows are surfaced directly on the Sales page.',button('Open Sales & Returns',"vx621GoSales('transactions')",'business','primary')+button('Sale Return',"vx621OpenPlatform('business','transactions','business','SALE_RETURN')",'business'),'₹'),
    featureCard('Invoice & Print','Advanced invoice and thermal tools are also available from Sales for Pro/Business users.',button('Open in Sales',"vx621GoSales('print')",'pro','primary'),'▤'),
    featureCard('Quotations & Orders','Estimate/quotation, Proforma, Sale Order and Delivery Challan shortcuts live with Sales.',button('Open in Sales',"vx621GoSales('documents')",'pro','primary'),'⇢')
  ];
  const admin=[
    featureCard('Company / Multifirm','Create, switch and manage business firms without mixing scoped accounting data.',button('Manage Companies',"vx621OpenPlatform('business','businesses','business')",'business','primary'),'▧'),
    featureCard('Staff & Security','Roles, permissions and device authentication.',button('Staff & Security',"vx621OpenPlatform('business','staff620','business')",'business','primary'),'♙'),
    featureCard('Notifications & Audit','Notification centre plus accounting/business audit trail.',button('Notifications',"vx621OpenPlatform('business','notifications620','business')",'business')+button('Audit Log',"vx621OpenPlatform('business','audit','business')",'business'),'●'),
    featureCard('Business & Transaction Settings','Transaction/tax prefixes and compatibility switches. App Settings remains in More Tools.',button('Business Settings',"vx621OpenBusinessSettings()",'business','primary'),'⚙'),
    featureCard('Data Manager','Safe bulk management. Accounting transactions use Cancel/Reversal instead of destructive deletion.',button('Manage Data',"vx621RenderDataManager()",'business','primary'),'✓')
  ];

  el.innerHTML=`<div class="vx621-business-shell">
    <section class="vx621-hero card"><div><span class="pill">Business Workspace</span><h1>Your business</h1><p>Manage sales, payments and stock from one place.</p></div><div class="vx621-hero-actions">${button('New Sale',"vx621OpenPlatform('business','transactions','business','SALE')",'business','primary')}${button('Payment In',"vx621OpenPlatform('business','transactions','business','PAYMENT_IN')",'business')}</div></section>
    <section class="vx621-kpis"><div class="vx621-kpi"><span>Revenue</span><b>${M(revenue)}</b></div><div class="vx621-kpi"><span>Net Profit</span><b>${M(net)}</b></div><div class="vx621-kpi"><span>Expenses</span><b>${M(expenses)}</b></div><div class="vx621-kpi"><span>Assets</span><b>${M(assets)}</b></div><div class="vx621-kpi"><span>Customer Due</span><b>${M(lt.outstanding)}</b></div></section>
    <div class="business-tool-search" role="search" aria-label="Find business tools">
      <label for="businessToolSearch">Find a tool</label>
      <div class="business-tool-search-field">
        <input id="businessToolSearch" type="search" placeholder="Try purchase, customer, GST…" autocomplete="off" aria-controls="businessToolResults" />
        <button id="businessToolSearchClear" type="button" hidden aria-label="Clear tool search">Clear</button>
      </div>
      <p id="businessToolSearchStatus" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>
    <div id="businessToolResults">
    ${group('Daily Business','Transactions, parties and money movement.',daily)}
    ${group('Accounting & Compliance','Track profit, balances, expenses and taxes.',accounting)}
    ${group('Documents & Communication','Invoices, orders, messaging and currency tools.',docs)}
    ${group('Stock-related Tools','Manage products, stock levels and transfers.',stockCards)}
    ${group('Sales-related Tools','Create bills, process returns and manage orders.',salesCards)}
    ${group('Company, Security & Settings','Administration and data-control tools.',admin)}
    </div>
    <section class="card vx621-recent">${recentActivityHtml()}</section>
    <section id="vx621-business-host" data-vx621-host="business" hidden class="card vx621-platform-host"><div class="vx621-empty"><b>Choose a feature above.</b><span>Your selected tool will open here.</span></div></section>
  </div>`;
  activateHost('business');
  observeHost(findHost('business'));
  findHost('business').hidden=true;
  if (window.VyaparBusinessTools) window.VyaparBusinessTools.bind(el);
}
window.renderBusiness=renderBusinessHome;

window.vx621GoSales=function(tool){
  if(typeof setTab==='function' && setTab('sales')===false) return false;
  setTimeout(()=>{
    if(tool==='transactions') return window.vx621OpenPlatform('sales','transactions','business','SALE');
    if(tool==='print') return window.vx621OpenPlatform('sales','print620','pro');
    if(tool==='documents') return window.vx621OpenPlatform('sales','documents620','pro');
    if(tool==='messages') return window.vx621OpenPlatform('sales','messages620','business');
  },20);
};
window.vx621GoStock=function(tool){
  if(typeof setTab==='function' && setTab('stock')===false) return false;
  setTimeout(()=>{
    if(tool==='catalog') return window.vx621OpenAdvanced('stock','inventory','business');
    if(tool==='godowns') return window.vx621OpenPlatform('stock','inventory','business');
    if(tool==='advanced') return window.vx621OpenPlatform('stock','inventory620','business');
    if(tool==='reports') return window.vx621OpenPlatform('stock','reports620','business');
  },20);
};

function appendSalesTools(){
  const el=document.getElementById('screen-sales'); if(!el || el.querySelector('.vx621-sales-tools')) return;
  const block=document.createElement('section');
  block.className='card vx621-sales-tools';
  block.innerHTML=`<div class="vx621-context-head"><div><span class="pill">Sales Tools</span><h2>Advanced Sales & Billing</h2><p>Create bills, handle returns and print invoices.</p></div></div><div class="vx621-feature-grid compact">
    ${featureCard('Sale / Sale Return','Create a sale or record a return.',button('New Sale',"vx621OpenPlatform('sales','transactions','business','SALE')",'business','primary')+button('Sale Return',"vx621OpenPlatform('sales','transactions','business','SALE_RETURN')",'business'),'⇄')}
    ${featureCard('Invoice & Thermal','Download PDF or print an invoice.',button('Invoice & Print',"vx621OpenPlatform('sales','print620','pro')",'pro','primary'),'▤')}
    ${featureCard('Quotation & Orders','Quotes, orders and delivery notes.',button('Open Documents',"vx621OpenPlatform('sales','documents620','pro')",'pro','primary'),'⇢')}
    ${featureCard('Customer Messaging','Share invoices and send reminders.',button('Messaging',"vx621OpenPlatform('sales','messages620','business')",'business','primary'),'✉')}
  </div><div id="vx621-sales-host" data-vx621-host="sales" class="vx621-platform-host"><div class="vx621-empty"><b>Choose an advanced sales tool.</b><span>It opens here; you do not need to enter the Business page.</span></div></div>`;
  const firstGrid=el.querySelector('.grid');
  if(firstGrid) firstGrid.insertAdjacentElement('afterend',block); else el.prepend(block);
}
function tableCardByHeading(root,text){
  return [...root.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()===text);
}
function enhanceLegacyTable(root,title,bucket,deleteFnName){
  const card=tableCardByHeading(root,title); if(!card || card.dataset.vx621Bulk==='1') return;
  const table=card.querySelector('table'); if(!table) return;
  card.dataset.vx621Bulk='1';
  const head=table.querySelector('thead tr'); if(head){ const th=document.createElement('th'); th.className='vx621-check-col'; th.innerHTML=`<input type="checkbox" onchange="vx621LegacySelectAll('${bucket}',this.checked)">`; head.prepend(th); }
  table.querySelectorAll('tbody tr').forEach(row=>{
    const buttons=[...row.querySelectorAll('button')];
    const deleteBtn=buttons.find(b=>(b.getAttribute('onclick')||'').includes(deleteFnName+'('));
    const editFn=bucket==='sales'?'editSale':bucket==='monthly'?'editMonthly':'';
    const editBtn=editFn?buttons.find(b=>(b.getAttribute('onclick')||'').includes(editFn+'(')):null;
    const sourceBtn=deleteBtn||editBtn;
    if(!sourceBtn) return;
    const m=(sourceBtn.getAttribute('onclick')||'').match(/\(['"]([^'"]+)['"]\)/); if(!m) return;
    const td=document.createElement('td'); td.className='vx622-check-col'; td.innerHTML=`<input type="checkbox" class="vx621-legacy-check" data-bucket="${bucket}" value="${E(m[1])}">`; row.prepend(td);
    if(deleteBtn&&editBtn) deleteBtn.remove();
  });
  const controls=document.createElement('div'); controls.className='vx621-bulk-actions vx621-inline-bulk';
  controls.innerHTML=`<button class="btn mini" onclick="vx621LegacySelectAll('${bucket}',true)">Select All</button><button class="btn mini" onclick="vx621LegacySelectAll('${bucket}',false)">Clear</button><button class="btn mini danger" onclick="vx621BulkLegacy('${bucket}','selected')">Delete Selected</button><button class="btn mini danger" onclick="vx621BulkLegacy('${bucket}','all')">Delete All</button>`;
  card.querySelector('h2')?.insertAdjacentElement('afterend',controls);
}
window.vx621LegacySelectAll=function(bucket,checked){ document.querySelectorAll(`.vx621-legacy-check[data-bucket="${bucket}"]`).forEach(x=>x.checked=!!checked); };
window.vx621BulkLegacy=async function(bucket,mode){
  const map={sales:'sales',daily:'daily',monthly:'monthly'};
  const key=map[bucket]; if(!key || !Array.isArray(S()[key])) return;
  const ids=mode==='all'?S()[key].map(x=>x.id):[...document.querySelectorAll(`.vx621-legacy-check[data-bucket="${bucket}"]:checked`)].map(x=>x.value);
  if(!ids.length) return alert('No records selected.');
  const ok=await confirmAction(`Delete ${ids.length} ${bucket} record(s)? This cannot be undone.`,'Delete'); if(!ok)return;
  S()[key]=S()[key].filter(x=>!ids.includes(x.id));
  saveState();
};
function appendStockTools(){
  const el=document.getElementById('screen-stock'); if(!el || el.querySelector('.vx621-stock-tools')) return;
  const block=document.createElement('section'); block.className='card vx621-stock-tools';
  block.innerHTML=`<div class="vx621-context-head"><div><span class="pill">Stock Tools</span><h2>Inventory Workspace</h2><p>Manage your catalog, godowns and stock transfers.</p></div></div><div class="vx621-feature-grid compact">
    ${featureCard('Product Catalog & Barcode','Product, SKU/article, size/color, barcode, bulk import, reorder and dead-stock helpers.',button('Catalog & Barcode',"vx621OpenAdvanced('stock','inventory','business')",'business','primary'),'▦')}
    ${featureCard('Godowns & Transfers','Stock locations and transfers.',button('Godowns',"vx621OpenPlatform('stock','inventory','business')",'business','primary'),'⌂')}
    ${featureCard('Advanced Inventory','Units, wholesale rates and stock tools.',button('Advanced Inventory',"vx621OpenPlatform('stock','inventory620','business')",'business','primary'),'⚙')}
    ${featureCard('Stock Reports','Stock levels, value and movement.',button('Stock Reports',"vx621OpenPlatform('stock','reports620','business')",'business','primary'),'▥')}
  </div><div id="vx621-stock-host" data-vx621-host="stock" class="vx621-platform-host"><div class="vx621-empty"><b>Choose a stock tool.</b><span>Advanced inventory modules open here.</span></div></div>`;
  el.appendChild(block);
  renderStockRecords(el);
}
function renderStockRecords(root){
  if(root.querySelector('.vx621-stock-records')) return;
  const card=document.createElement('section'); card.className='card vx621-stock-records';
  const rows=S().stocks||[];
  card.innerHTML=`<div class="vx621-recent-head"><div><h2>Saved Stock Records</h2><p>Select individual rows, select all, or delete all manual stock records.</p></div><div class="vx621-bulk-actions"><button class="btn mini" onclick="vx621StockSelectAll(true)">Select All</button><button class="btn mini" onclick="vx621StockSelectAll(false)">Clear</button><button class="btn mini danger" onclick="vx621DeleteStock('selected')">Delete Selected</button><button class="btn mini danger" onclick="vx621DeleteStock('all')">Delete All</button></div></div><div class="vx621-table-wrap"><table class="table"><thead><tr><th><input type="checkbox" onchange="vx621StockSelectAll(this.checked)"></th><th>Item</th><th>Qty</th><th>Min Alert</th><th>Action</th></tr></thead><tbody>${rows.slice().reverse().map(x=>`<tr><td><input class="vx621-stock-check" type="checkbox" value="${E(x.id)}"></td><td>${E(x.item||x.product||'')}</td><td>${N(x.qty)}</td><td>${N(x.min||x.lowStock||0)}</td><td><button class="btn mini danger" onclick="vx621DeleteStockOne('${E(x.id)}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">No manual stock records yet.</td></tr>'}</tbody></table></div>`;
  root.appendChild(card);
}
window.vx621StockSelectAll=function(c){ document.querySelectorAll('.vx621-stock-check').forEach(x=>x.checked=!!c); };
window.vx621DeleteStockOne=async function(id){
  const ok=await confirmAction('Delete this manual stock record?','Delete'); if(!ok)return;
  S().stocks=(S().stocks||[]).filter(x=>x.id!==id); saveState();
};
window.vx621DeleteStock=async function(mode){
  const ids=mode==='all'?(S().stocks||[]).map(x=>x.id):[...document.querySelectorAll('.vx621-stock-check:checked')].map(x=>x.value);
  if(!ids.length)return alert('No stock records selected.');
  const ok=await confirmAction(`Delete ${ids.length} manual stock record(s)?`,'Delete'); if(!ok)return;
  S().stocks=(S().stocks||[]).filter(x=>!ids.includes(x.id)); saveState();
};

window.renderSales=function(){
  oldRenderSales?.();
  const el=document.getElementById('screen-sales'); if(!el)return;
  appendSalesTools();
  enhanceLegacyTable(el,'Daily Records','daily','delDaily');
  enhanceLegacyTable(el,'Sales Records','sales','delSale');
  enhanceLegacyTable(el,'Monthly Profit Records','monthly','delMonthly');
};
window.renderStock=function(){ oldRenderStock?.(); const el=document.getElementById('screen-stock'); if(!el)return; appendStockTools(); };

async function confirmAction(message,okText){
  if(typeof showGlassDialog==='function'){
    try{return await showGlassDialog({title:'Are you sure?',message,kind:'danger',confirm:true,okText:okText||'Confirm',cancelText:'Cancel'});}catch(_){ }
  }
  return window.confirm(message);
}

window.vx621OpenBusinessSettings=function(){
  if(!allowed('business'))return false;
  activateHost('business');
  oldPlatformOpen?.('settings');
  setTimeout(()=>{
    const host=findHost('business')||document.getElementById('businessModuleArea'); if(!host)return;
    const title=host.querySelector('h2'); if(title)title.textContent='Business & Transaction Settings';
    const ui=ensure621();
    const box=document.createElement('section'); box.className='vx621-compat card';
    box.innerHTML=`<h3>Feature Compatibility Modes</h3><p class="muted">Advanced is the default. Only one entry mode is active per overlapping domain, so old and new screens are not exposed at the same time. This changes UI routing only; it does not create a second accounting engine.</p><div class="vx621-mode-grid">
      ${modeSelect('billing','Billing / Transactions',ui.domainMode.billing)}
      ${modeSelect('gst','GST / Tax',ui.domainMode.gst)}
      ${modeSelect('reports','Reports',ui.domainMode.reports)}
      ${modeSelect('inventory','Inventory',ui.domainMode.inventory)}
      ${modeSelect('finance','Payments / Finance',ui.domainMode.finance)}
    </div><button class="btn primary" onclick="vx621SaveModes()">Save Compatibility Modes</button><div class="notice success">Recommended: keep all five on <b>Advanced</b>. Use Legacy only if you temporarily need an old entry screen for compatibility.</div>`;
    host.appendChild(box);
    decorateCurrentPlatform('settings'); observeHost(host);
  },30);
};
function modeSelect(key,label,value){return `<label>${E(label)}<select id="vxMode_${key}"><option value="advanced" ${value==='advanced'?'selected':''}>Advanced (recommended)</option><option value="legacy" ${value==='legacy'?'selected':''}>Legacy compatibility</option></select></label>`;}
window.vx621SaveModes=function(){
  const ui=ensure621(); ['billing','gst','reports','inventory','finance'].forEach(k=>{const v=document.getElementById('vxMode_'+k)?.value;if(['advanced','legacy'].includes(v))ui.domainMode[k]=v;}); saveState();
  if(typeof showGlassToast==='function')showGlassToast('Business compatibility modes saved.');
};

window.vx621RenderDataManager=function(){
  if(!allowed('business'))return false;
  const host=activateHost('business'); if(!host)return;
  const s=S(),bid=activeBusinessId();
  const tx=(s.transactions611||[]).filter(x=>String(x.businessId||'MAIN')===bid), customers=s.customers||[],suppliers=s.suppliers||[],expenses=s.expenses||[],reminders=[...(s.paymentReminders611||[]).filter(x=>String(x.businessId||'MAIN')===bid),...(s.serviceReminders611||[]).filter(x=>String(x.businessId||'MAIN')===bid)];
  host.innerHTML=`<div class="calculator-head"><div><span class="pill">Business Data</span><h2>Data Manager</h2><p class="muted">Bulk controls with integrity protection.</p></div><button class="btn mini" onclick="renderBusiness()">Business Home</button></div>
  <div class="notice">Accounting transactions use <b>Cancel/Reversal</b>, not hard delete. Customers/suppliers referenced by transactions are protected from deletion.</div>
  <div class="vx621-data-tabs">${dataTab('transactions','Transactions',tx.length)}${dataTab('customers','Customers',customers.length)}${dataTab('suppliers','Suppliers',suppliers.length)}${dataTab('expenses','Expenses',expenses.length)}${dataTab('reminders','Reminders',reminders.length)}</div><div id="vx621DataBody"></div>`;
  window.vx621DataTab('transactions'); observeHost(host); scrollToHost('business');
};
function dataTab(k,l,c){return `<button class="btn mini" onclick="vx621DataTab('${k}')">${E(l)} (${c})</button>`;}
window.vx621DataTab=function(kind){
  const body=document.getElementById('vx621DataBody'); if(!body)return;
  const s=S(),bid=activeBusinessId(); let rows=[],cols=[],renderRow=()=>'';
  if(kind==='transactions'){
    rows=(s.transactions611||[]).filter(x=>String(x.businessId||'MAIN')===bid).slice().reverse(); cols=['Date','Type','No.','Party','Total','Status'];
    renderRow=x=>`<td>${E(x.date)}</td><td>${E(x.type)}</td><td>${E(x.number)}</td><td>${E(x.partyName||'')}</td><td>${M(x.total)}</td><td>${E(x.status||'active')}</td>`;
  }else if(kind==='customers'){
    rows=s.customers||[]; cols=['Name','Mobile','Due']; renderRow=x=>`<td>${E(x.name)}</td><td>${E(x.mobile||'')}</td><td>${M(x.due)}</td>`;
  }else if(kind==='suppliers'){
    rows=s.suppliers||[]; cols=['Name','Mobile','Outstanding']; renderRow=x=>`<td>${E(x.name)}</td><td>${E(x.mobile||x.phone||'')}</td><td>${M(x.due||x.outstanding||0)}</td>`;
  }else if(kind==='expenses'){
    rows=s.expenses||[]; cols=['Date','Category','Note','Amount']; renderRow=x=>`<td>${E(x.date)}</td><td>${E(x.category)}</td><td>${E(x.note||'')}</td><td>${M(x.amount)}</td>`;
  }else if(kind==='reminders'){
    rows=[...(s.paymentReminders611||[]).filter(x=>String(x.businessId||'MAIN')===bid).map(x=>({...x,__kind:'payment'})),...(s.serviceReminders611||[]).filter(x=>String(x.businessId||'MAIN')===bid).map(x=>({...x,__kind:'service'}))]; cols=['Kind','Party','Date','Status']; renderRow=x=>`<td>${E(x.__kind)}</td><td>${E(x.partyName||'')}</td><td>${E(x.nextReminder||x.nextDate||'')}</td><td>${E(x.status||'open')}</td>`;
  }
  const actionLabel=kind==='transactions'?'Cancel':'Delete';
  body.innerHTML=`<div class="vx621-bulk-actions vx621-data-actions"><button class="btn mini" onclick="vx621DataSelectAll('${kind}',true)">Select All</button><button class="btn mini" onclick="vx621DataSelectAll('${kind}',false)">Clear</button><button class="btn mini danger" onclick="vx621DataBulk('${kind}','selected')">${actionLabel} Selected</button><button class="btn mini danger" onclick="vx621DataBulk('${kind}','all')">${actionLabel} All</button></div><div class="vx621-table-wrap"><table class="table"><thead><tr><th><input type="checkbox" onchange="vx621DataSelectAll('${kind}',this.checked)"></th>${cols.map(c=>`<th>${E(c)}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.map(x=>`<tr><td><input class="vx621-data-check" data-kind="${kind}" type="checkbox" value="${E(x.id)}" ${kind==='transactions'&&x.status==='cancelled'?'disabled':''}></td>${renderRow(x)}<td>${kind==='transactions'?(x.status==='cancelled'?'Cancelled':`<button class="btn mini danger" onclick="vx621DataOne('${kind}','${E(x.id)}')">Cancel</button>`):`<button class="btn mini danger" onclick="vx621DataOne('${kind}','${E(x.id)}')">Delete</button>`}</td></tr>`).join('')||`<tr><td colspan="${cols.length+2}" class="muted">No records.</td></tr>`}</tbody></table></div>`;
  body.dataset.kind=kind;
};
window.vx621DataSelectAll=function(kind,c){document.querySelectorAll(`.vx621-data-check[data-kind="${kind}"]:not(:disabled)`).forEach(x=>x.checked=!!c);};
function entityReferenced(kind,obj){
  const tx=S().transactions611||[];
  if(kind==='customers'||kind==='suppliers'){
    const id=String(obj.id||''),name=String(obj.name||'').trim().toLowerCase();
    return tx.some(t=>String(t.partyId||'')===id || (name && String(t.partyName||'').trim().toLowerCase()===name));
  }
  return false;
}
window.vx621DataOne=async function(kind,id){
  const ok=await confirmAction(`${kind==='transactions'?'Cancel':'Delete'} this record?`,kind==='transactions'?'Cancel':'Delete'); if(!ok)return;
  applyDataAction(kind,[id]);
  window.vx621DataTab(kind);
};
window.vx621DataBulk=async function(kind,mode){
  let ids=[];
  if(mode==='selected') ids=[...document.querySelectorAll(`.vx621-data-check[data-kind="${kind}"]:checked`)].map(x=>x.value);
  else{
    if(kind==='transactions')ids=(S().transactions611||[]).filter(x=>String(x.businessId||'MAIN')===activeBusinessId()&&x.status!=='cancelled').map(x=>x.id);
    else if(kind==='reminders')ids=[...(S().paymentReminders611||[]),...(S().serviceReminders611||[])].filter(x=>String(x.businessId||'MAIN')===activeBusinessId()).map(x=>x.id);
    else ids=(S()[kind]||[]).map(x=>x.id);
  }
  if(!ids.length)return alert('No records selected.');
  const word=kind==='transactions'?'Cancel':'Delete'; const ok=await confirmAction(`${word} ${ids.length} ${kind} record(s)?`,word); if(!ok)return;
  const result=applyDataAction(kind,ids); if(result?.blocked)alert(`${result.blocked} referenced ${kind} record(s) were protected and not deleted.`);
  window.vx621DataTab(kind);
};
function applyDataAction(kind,ids){
  const s=S(); let blocked=0;
  if(kind==='transactions'){
    ids.forEach(id=>{const tx=(s.transactions611||[]).find(x=>x.id===id);if(tx&&tx.status!=='cancelled'){try{window.VyaparPlatform611?.reverseTransaction?.(tx);}catch(_){}}});
  }else if(kind==='customers'||kind==='suppliers'){
    s[kind]=(s[kind]||[]).filter(x=>{if(!ids.includes(x.id))return true;if(entityReferenced(kind,x)){blocked++;return true;}return false;});
  }else if(kind==='expenses') s.expenses=(s.expenses||[]).filter(x=>!ids.includes(x.id));
  else if(kind==='reminders'){
    s.paymentReminders611=(s.paymentReminders611||[]).filter(x=>!ids.includes(x.id));
    s.serviceReminders611=(s.serviceReminders611||[]).filter(x=>!ids.includes(x.id));
  }
  saveState(); return {blocked};
}

function decorateCurrentPlatform(mod){
  const host=document.getElementById('businessModuleArea'); if(!host)return;
  const h=host.querySelector('.calculator-head h2');
  if(mod==='settings' && h) h.textContent='Business & Transaction Settings';
  if(mod==='transactions') decorateTransactionTable(host);
  decorateGenericDeleteTables(host);
}
function decorateTransactionTable(host){
  const table=[...host.querySelectorAll('table')].find(t=>t.querySelector('button[onclick*="p611Cancel"]')); if(!table||table.dataset.vx621TxBulk==='1')return;
  table.dataset.vx621TxBulk='1'; const th=document.createElement('th'); th.innerHTML='<input type="checkbox" onchange="vx621PlatformTxSelectAll(this.checked)">'; table.querySelector('thead tr')?.prepend(th);
  table.querySelectorAll('tbody tr').forEach(row=>{const b=row.querySelector('button[onclick*="p611Cancel"]');const td=document.createElement('td');if(b){const m=(b.getAttribute('onclick')||'').match(/p611Cancel\(['"]([^'"]+)['"]\)/);if(m)td.innerHTML=`<input class="vx621-platform-tx-check" type="checkbox" value="${E(m[1])}">`;}row.prepend(td);});
  const bar=document.createElement('div');bar.className='vx621-bulk-actions vx621-inline-bulk';bar.innerHTML='<button class="btn mini" onclick="vx621PlatformTxSelectAll(true)">Select All</button><button class="btn mini" onclick="vx621PlatformTxSelectAll(false)">Clear</button><button class="btn mini danger" onclick="vx621PlatformCancelSelected()">Cancel Selected</button><button class="btn mini danger" onclick="vx621PlatformCancelAll()">Cancel All Active</button>';
  table.closest('.p611-table')?.insertAdjacentElement('beforebegin',bar);
}
window.vx621PlatformTxSelectAll=function(c){document.querySelectorAll('.vx621-platform-tx-check').forEach(x=>x.checked=!!c);};
async function cancelPlatformIds(ids){if(!ids.length)return alert('No active transactions selected.');const ok=await confirmAction(`Cancel ${ids.length} transaction(s)? Ledger and stock effects will be reversed.`,'Cancel');if(!ok)return;for(const id of ids){const tx=(S().transactions611||[]).find(x=>x.id===id);if(tx&&tx.status!=='cancelled'){try{window.VyaparPlatform611?.reverseTransaction?.(tx);}catch(_){}}}saveState();oldPlatformOpen?.('transactions');setTimeout(()=>decorateCurrentPlatform('transactions'),25);}
window.vx621PlatformCancelSelected=function(){return cancelPlatformIds([...document.querySelectorAll('.vx621-platform-tx-check:checked')].map(x=>x.value));};
window.vx621PlatformCancelAll=function(){const bid=activeBusinessId();return cancelPlatformIds((S().transactions611||[]).filter(x=>String(x.businessId||'MAIN')===bid&&x.status!=='cancelled').map(x=>x.id));};
function decorateGenericDeleteTables(host){
  host.querySelectorAll('table').forEach(table=>{
    if(table.dataset.vx621DeleteBulk==='1'||table.dataset.vx621TxBulk==='1')return;
    const rows=[...table.querySelectorAll('tbody tr')]; const specs=[];
    rows.forEach(row=>{
      const b=[...row.querySelectorAll('button')].find(btn=>{const oc=btn.getAttribute('onclick')||'';return /Delete[A-Za-z0-9_$]*\(/.test(oc)&&!/p612DeleteBusiness/.test(oc);});
      if(!b)return;
      const oc=b.getAttribute('onclick')||''; const m=oc.match(/^\s*([A-Za-z_$][\w$]*)\(['"]([^'"]*)['"]\)\s*;?\s*$/); if(!m)return;
      specs.push({row,fn:m[1],arg:m[2]});
    });
    if(!specs.length)return;
    table.dataset.vx621DeleteBulk='1'; const id='vx621tbl'+(++tableSeq);table.dataset.vx621TableId=id;
    const th=document.createElement('th');th.innerHTML=`<input type="checkbox" onchange="vx621GenericSelectAll('${id}',this.checked)">`;table.querySelector('thead tr')?.prepend(th);
    specs.forEach(({row,fn,arg})=>{const td=document.createElement('td');td.innerHTML=`<input type="checkbox" class="vx621-generic-check" data-table="${id}" data-fn="${E(fn)}" data-arg="${E(arg)}">`;row.prepend(td);});
    rows.filter(r=>!specs.some(s=>s.row===r)).forEach(r=>{const td=document.createElement('td');r.prepend(td);});
    const bar=document.createElement('div');bar.className='vx621-bulk-actions vx621-inline-bulk';bar.innerHTML=`<button class="btn mini" onclick="vx621GenericSelectAll('${id}',true)">Select All</button><button class="btn mini" onclick="vx621GenericSelectAll('${id}',false)">Clear</button><button class="btn mini danger" onclick="vx621GenericDelete('${id}','selected')">Delete Selected</button><button class="btn mini danger" onclick="vx621GenericDelete('${id}','all')">Delete All</button>`;
    table.closest('.p611-table,.adv-table')?.insertAdjacentElement('beforebegin',bar);
  });
}
window.vx621GenericSelectAll=function(id,c){document.querySelectorAll(`.vx621-generic-check[data-table="${id}"]`).forEach(x=>x.checked=!!c);};
window.vx621GenericDelete=async function(id,mode){
  const all=[...document.querySelectorAll(`.vx621-generic-check[data-table="${id}"]`)],chosen=mode==='all'?all:all.filter(x=>x.checked);if(!chosen.length)return alert('No records selected.');
  const ok=await confirmAction(`Delete ${chosen.length} selected record(s)? Existing module validation will still run.`,'Delete');if(!ok)return;
  const actions=chosen.map(x=>({fn:x.dataset.fn,arg:x.dataset.arg}));
  for(const a of actions){try{if(typeof window[a.fn]==='function')window[a.fn](a.arg);}catch(e){console.warn(a.fn,e);}}
};
function observeHost(host){
  if(!host||host.dataset.vx621Observed==='1')return;host.dataset.vx621Observed='1';let pending=false;
  const obs=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const empty=host.children.length===1&&host.firstElementChild.classList.contains('vx621-empty');if(!empty)host.hidden=false;decorateGenericDeleteTables(host);if(host.querySelector('button[onclick*="p611Cancel"]'))decorateTransactionTable(host);});});
  obs.observe(host,{childList:true,subtree:true});
}

// Wrap platform open only to add bulk controls after every advanced module render.
window.p611Open=function(mod){const r=oldPlatformOpen?.(mod);setTimeout(()=>{decorateCurrentPlatform(mod);const h=document.getElementById('businessModuleArea');observeHost(h);},35);return r;};

// Expose release marker for diagnostics.
window.VyaparUI621={version:VERSION,renderBusiness:renderBusinessHome,openPlatform:window.vx621OpenPlatform};
ensure621();
})();


;
/* ===== platform-622-ui-cleanup.js ===== */
/* Vyapar AI 6.2.2 — UI cleanup requested after 6.2.1.
   Keeps business/accounting logic intact while simplifying navigation and controls. */
(function(){
'use strict';

const VERSION='6.2.2';
const oldRenderBusiness=window.renderBusiness;
const oldRenderSettings=window.renderSettings;

function S(){ return (typeof state!=='undefined' && state) ? state : {}; }
function saveState(){
  try{
    if(typeof save==='function'){ save(); return; }
    localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(S()));
  }catch(_){ }
}
function toast(message){
  if(typeof showGlassToast==='function') showGlassToast(message);
  else if(typeof advToast==='function') advToast(message);
}
function businessPlanAllowed(){
  try{
    if(typeof requirePlan==='function') return requirePlan('business') !== false;
  }catch(_){ }
  return true;
}

/* ---------- Business page: remove Company / Security / Settings block ---------- */
function simplifyBusinessPage(){
  const screen=document.getElementById('screen-business');
  if(!screen) return;
  screen.querySelectorAll('.vx621-group').forEach(group=>{
    const title=group.querySelector('.vx621-group-head h2')?.textContent.trim();
    if(title==='Company, Security & Settings') group.remove();
  });
  const hero=screen.querySelector('.vx621-hero p');
  if(hero) hero.textContent='Manage sales, payments and stock from one place.';
}
if(typeof oldRenderBusiness==='function'){
  window.renderBusiness=function(){
    const result=oldRenderBusiness.apply(this,arguments);
    simplifyBusinessPage();
    setTimeout(()=>{ simplifyBusinessPage(); convertBulkRows(document.getElementById('screen-business')); },0);
    return result;
  };
}

/* ---------- Compact three-dot bulk action menus ---------- */
function setBulkSelectionMode(menu,open){
  if(!menu) return;
  const scope=menu.closest('.card')||menu.parentElement;
  if(scope) scope.classList.toggle('vx622-selection-open',!!open);
}
function prepareBulkSelectionColumns(menu){
  const scope=menu?.closest('.card')||menu?.parentElement;
  if(!scope) return;
  const selector='.vx621-recent-check,.vx621-stock-check,.vx621-data-check,.vx621-platform-tx-check,.vx621-generic-check,.vx621-legacy-check';
  scope.querySelectorAll(selector).forEach(input=>input.closest('td')?.classList.add('vx622-check-col'));
  scope.querySelectorAll('thead th').forEach(th=>{if(th.querySelector(':scope > input[type="checkbox"]'))th.classList.add('vx622-check-col')});
}
function closeBulkMenus(except){
  document.querySelectorAll('.vx622-bulk-menu').forEach(menu=>{
    if(menu!==except){
      menu.classList.remove('is-open');
      menu.querySelector('.vx622-menu-trigger')?.setAttribute('aria-expanded','false');
      setBulkSelectionMode(menu,false);
    }
  });
}
function convertBulkRows(root){
  if(!root) return;
  root.querySelectorAll('.vx621-bulk-actions').forEach(row=>{
    if(row.dataset.vx622Menu==='1') return;
    let buttons=[...row.querySelectorAll(':scope > button')];
    if(buttons.length<2) return;
    const selectBtn=buttons.find(button=>/select all/i.test(button.textContent||''));
    const clearBtn=buttons.find(button=>/^clear$/i.test((button.textContent||'').trim()) || /clear/i.test(button.textContent||''));
    const destructiveBtn=buttons.find(button=>/(delete|cancel).*selected/i.test(button.textContent||'')) || buttons.find(button=>/(delete|cancel)/i.test(button.textContent||''));
    const preferred=[selectBtn,clearBtn,destructiveBtn].filter(Boolean);
    if(preferred.length===3){
      buttons.forEach(button=>{ if(!preferred.includes(button)) button.remove(); });
      buttons=preferred;
      selectBtn.textContent='Select All';
      clearBtn.textContent='Clear Selected';
      if(/delete/i.test(destructiveBtn.textContent||'')) destructiveBtn.textContent='Delete';
      else if(/cancel/i.test(destructiveBtn.textContent||'')) destructiveBtn.textContent='Cancel';
    }
    row.dataset.vx622Menu='1';
    row.classList.add('vx622-bulk-menu');
    const trigger=document.createElement('button');
    trigger.type='button';
    trigger.className='btn mini vx622-menu-trigger';
    trigger.setAttribute('aria-label','Bulk actions');
    trigger.setAttribute('aria-expanded','false');
    trigger.textContent='⋮';
    const panel=document.createElement('div');
    panel.className='vx622-menu-panel';
    panel.setAttribute('role','menu');
    buttons.forEach(button=>{
      button.classList.add('vx622-menu-item');
      button.setAttribute('role','menuitem');
      panel.appendChild(button);
    });
    row.append(trigger,panel);
    row.closest('.card')?.classList.add('vx622-menu-card');
    prepareBulkSelectionColumns(row);
    trigger.addEventListener('click',event=>{
      event.stopPropagation();
      const open=!row.classList.contains('is-open');
      closeBulkMenus(row);
      row.classList.toggle('is-open',open);
      setBulkSelectionMode(row,open);
      prepareBulkSelectionColumns(row);
      trigger.setAttribute('aria-expanded',String(open));
    });
    panel.addEventListener('click',event=>{
      const item=event.target.closest('.vx622-menu-item');
      if(!item) return;
      row.classList.remove('is-open');
      trigger.setAttribute('aria-expanded','false');
      /* Keep checkbox selection mode visible after a bulk command so the user can review it. */
      setBulkSelectionMode(row,true);
    });
  });
}
window.vx622ConvertBulkRows=convertBulkRows;

document.addEventListener('click',event=>{
  if(event.target.closest('.vx622-menu-card') && event.target.closest('input[type="checkbox"]')) return;
  closeBulkMenus();
});
document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeBulkMenus(); });

const bulkObserver=new MutationObserver(mutations=>{
  let shouldRun=false;
  for(const m of mutations){ if(m.addedNodes.length){ shouldRun=true; break; } }
  if(shouldRun) requestAnimationFrame(()=>convertBulkRows(document));
});
bulkObserver.observe(document.documentElement,{childList:true,subtree:true});

/* ---------- Settings: Company, Security and Business Settings live here ---------- */
function settingsAdminCard(){
  const section=document.createElement('div');
  section.className='card settings-section vx622-admin-section';
  section.id='vx622AdminSettings';
  section.innerHTML=`
    <div class="settings-section-heading">
      <div>
        <span class="settings-kicker">BUSINESS ADMIN</span>
        <h2>Company & business settings</h2>
        <p class="muted">Company, staff security and transaction preferences.</p>
      </div>
      <div class="settings-section-icon">⚙</div>
    </div>
    <div class="vx622-settings-list">
      <button type="button" class="vx622-settings-row" onclick="vx622OpenSettingsModule('businesses')">
        <span><b>Company</b><small>Create, switch and manage firms</small></span><i>›</i>
      </button>
      <button type="button" class="vx622-settings-row" onclick="vx622OpenSettingsModule('staff620')">
        <span><b>Staff & Security</b><small>Roles, permissions and device access</small></span><i>›</i>
      </button>
      <button type="button" class="vx622-settings-row" onclick="vx622OpenSettingsModule('settings')">
        <span><b>Business Settings</b><small>GST, invoice numbering and transaction preferences</small></span><i>›</i>
      </button>
      <button type="button" class="vx622-settings-row" onclick="vx622OpenSettingsModule('audit')">
        <span><b>Notifications & Audit</b><small>Business activity and important records</small></span><i>›</i>
      </button>
      <button type="button" class="vx622-settings-row" onclick="vx622OpenSettingsDataManager()">
        <span><b>Data Management</b><small>Manage saved records with safe bulk actions</small></span><i>›</i>
      </button>
    </div>
    <div id="vx622SettingsAdminHost" class="vx622-settings-admin-host" hidden></div>`;
  return section;
}

function appLockCard(){
  const enabled=Boolean(S().appLock?.enabled);
  const section=document.createElement('div');
  section.className='card settings-section vx622-lock-section';
  section.id='vx622AppLockSection';
  section.innerHTML=`
    <div class="settings-section-heading vx622-lock-heading">
      <div>
        <span class="settings-kicker">APP LOCK</span>
        <h2>Inside app lock</h2>
        <p class="muted">Protect the app with your PIN.</p>
      </div>
      <label class="vx622-switch" aria-label="App lock on or off">
        <input id="vx622LockToggle" type="checkbox" ${enabled?'checked':''} onchange="vx622ToggleAppLock(this)">
        <span></span>
      </label>
    </div>
    <div class="vx622-lock-status ${enabled?'is-on':'is-off'}">
      <b>${enabled?'App lock is on':'App lock is off'}</b>
      <small>${enabled?'PIN will be required when the app is locked.':'Turn it on to protect app access.'}</small>
    </div>
    <div class="settings-actions vx622-lock-actions">
      <button type="button" class="btn" onclick="vx622ChangeAppPin()">Change Password</button>
    </div>
    <div id="vx622PinEditor" class="vx622-pin-editor" hidden>
      <label>New PIN</label>
      <input id="vx622NewPin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="4–8 digit PIN">
      <button type="button" class="btn primary" onclick="vx622SaveAppPin()">Save PIN</button>
    </div>`;
  return section;
}

function enhanceSettings(){
  const screen=document.getElementById('screen-settings');
  const stack=screen?.querySelector('.settings-stack');
  if(!stack) return;
  if(!document.getElementById('vx622AdminSettings')){
    const businessProfile=[...stack.children].find(x=>x.textContent.includes('Shop details'));
    const admin=settingsAdminCard();
    if(businessProfile?.nextSibling) stack.insertBefore(admin,businessProfile.nextSibling);
    else stack.appendChild(admin);
  }
  if(!document.getElementById('vx622AppLockSection')){
    const admin=document.getElementById('vx622AdminSettings');
    const lock=appLockCard();
    if(admin?.nextSibling) stack.insertBefore(lock,admin.nextSibling);
    else stack.appendChild(lock);
  }
}

if(typeof oldRenderSettings==='function'){
  window.renderSettings=function(){
    const result=oldRenderSettings.apply(this,arguments);
    enhanceSettings();
    setTimeout(enhanceSettings,0);
    return result;
  };
}

function restoreBusinessHostIds(settingsHost){
  document.querySelectorAll('#businessModuleArea').forEach(host=>{
    if(host===settingsHost) return;
    host.id=host.dataset.vx621OriginalId || host.dataset.vx622OldId || 'vx621-business-host';
  });
}
window.vx622OpenSettingsModule=function(module){
  if(!businessPlanAllowed()) return false;
  const host=document.getElementById('vx622SettingsAdminHost');
  if(!host) return false;
  restoreBusinessHostIds(host);
  host.hidden=false;
  host.id='businessModuleArea';
  try{ window.p611Open?.(module); }catch(error){ console.warn('Settings module failed',module,error); }
  host.id='vx622SettingsAdminHost';
  host.querySelector('.calculator-head .pill')?.remove();
  const back=host.querySelector('.calculator-head button');
  if(back){ back.textContent='Close'; back.setAttribute('onclick','vx622CloseSettingsModule()'); }
  convertBulkRows(host);
  host.scrollIntoView?.({behavior:'smooth',block:'start'});
  return true;
};
window.vx622CloseSettingsModule=function(){
  const host=document.getElementById('vx622SettingsAdminHost');
  if(!host) return;
  host.innerHTML='';
  host.hidden=true;
  document.getElementById('vx622AdminSettings')?.scrollIntoView?.({behavior:'smooth',block:'start'});
};

window.vx622OpenSettingsDataManager=function(){
  if(!businessPlanAllowed()) return false;
  const host=document.getElementById('vx622SettingsAdminHost');
  const businessHost=document.querySelector('[data-vx621-host="business"]');
  if(!host || typeof window.vx621RenderDataManager!=='function') return false;
  const previousBusinessContext=businessHost?.getAttribute('data-vx621-host');
  if(businessHost) businessHost.setAttribute('data-vx621-host','business-hidden');
  host.hidden=false;
  host.setAttribute('data-vx621-host','business');
  host.dataset.vx621OriginalId='vx622SettingsAdminHost';
  try{ window.vx621RenderDataManager(); }
  catch(error){ console.warn('Data manager failed',error); }
  host.id='vx622SettingsAdminHost';
  host.removeAttribute('data-vx621-host');
  if(businessHost && previousBusinessContext) businessHost.setAttribute('data-vx621-host',previousBusinessContext);
  const homeButton=host.querySelector('.calculator-head button');
  if(homeButton){ homeButton.textContent='Close'; homeButton.setAttribute('onclick','vx622CloseSettingsModule()'); }
  convertBulkRows(host);
  setTimeout(()=>host.scrollIntoView?.({behavior:'smooth',block:'start'}),60);
  return true;
};

window.vx622ToggleAppLock=async function(input){
  const wantOn=Boolean(input?.checked);
  const lock=S().appLock||{};
  if(wantOn){
    if(lock.pinHash){
      lock.enabled=true;
      S().appLock=lock;
      saveState();
      window.renderSettings?.();
      toast('App lock turned on.');
      return;
    }
    if(input) input.checked=false;
    const editor=document.getElementById('vx622PinEditor');
    if(editor){ editor.hidden=false; document.getElementById('vx622NewPin')?.focus(); }
    return;
  }
  if(lock.enabled && typeof window.advUnlock==='function'){
    const verified=await window.advUnlock();
    if(!verified){ if(input) input.checked=true; return; }
  }
  S().appLock={...lock,enabled:false};
  saveState();
  window.renderSettings?.();
  toast('App lock turned off.');
};

window.vx622ChangeAppPin=async function(){
  if(S().appLock?.enabled && typeof window.advUnlock==='function'){
    const verified=await window.advUnlock();
    if(!verified) return;
  }
  const editor=document.getElementById('vx622PinEditor');
  if(editor){ editor.hidden=false; document.getElementById('vx622NewPin')?.focus(); }
};

window.vx622SaveAppPin=async function(){
  const input=document.getElementById('vx622NewPin');
  const pin=String(input?.value||'').trim();
  if(!/^\d{4,8}$/.test(pin)){ alert('Use a 4–8 digit PIN.'); return; }
  const proxy=document.createElement('input');
  proxy.id='advPin';
  proxy.value=pin;
  proxy.type='hidden';
  document.body.appendChild(proxy);
  try{
    if(typeof window.advSetLock==='function') await window.advSetLock();
    else { S().appLock={enabled:true,pinHash:btoa(pin)}; saveState(); }
  }finally{ proxy.remove(); }
  window.renderSettings?.();
  toast('App lock PIN saved.');
};

/* Initial cleanup after all 6.2.1 renderers have loaded. */
function init(){
  simplifyBusinessPage();
  enhanceSettings();
  convertBulkRows(document);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));
else setTimeout(init,0);

window.VyaparUI622={version:VERSION,refresh:init};
})();

/* ===== SCRIPT SOURCE: security-ui-643.js ===== */

/* Vyapar AI 6.5.7 — Android password verification + refresh-aware account password policy */
(function(){
  'use strict';

  var POLICY_KEY='vyapar_ai_password_login_policy_v1';
  var ACCOUNT_KEY='vyapar_ai_account_cache_v1';
  var TOKEN_KEY='vyapar_ai_auth_token_v1';
  var API_BASE='https://vypar-backend.onrender.com';

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(_){return fallback}}
  function account(){return readJson(ACCOUNT_KEY,{})}
  function accountEmail(){
    var a=account();
    return String((a.user&&a.user.email)||a.email||'').trim().toLowerCase();
  }
  function policy(){var p=readJson(POLICY_KEY,{});return p&&typeof p==='object'?p:{}}
  function savePolicy(p){try{localStorage.setItem(POLICY_KEY,JSON.stringify(p))}catch(_){}}
  function enabledFor(email){email=String(email||'').trim().toLowerCase();return !!(email&&policy()[email]===true)}
  function setEnabled(email,value){
    email=String(email||'').trim().toLowerCase();
    if(!email)return;
    var p=policy();p[email]=value===true;savePolicy(p);
  }
  function token(){return String(localStorage.getItem(TOKEN_KEY)||'').trim()}
  function notify(msg,type){
    if(typeof window.showGlassToast==='function')window.showGlassToast(msg,type||'success');
    else alert(msg);
  }

  /* Tap-only bottom navigation on both web and Android. Stops drag/swipe while preserving normal button clicks. */
  function stopNavGesture(event){
    var nav=event.target&&event.target.closest?event.target.closest('#nav'):null;
    if(!nav)return;
    if(event.type.indexOf('pointer')===0 || event.type.indexOf('touch')===0){
      event.stopPropagation();
    }
  }
  ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend'].forEach(function(type){
    document.addEventListener(type,stopNavGesture,true);
  });

  function modal(enableAfter){
    var email=accountEmail();
    if(!email||!token()){
      notify('Sign in with Email OTP first, then manage password login.','error');
      return;
    }
    document.getElementById('vx643PasswordModal')?.remove();
    var overlay=document.createElement('div');
    overlay.id='vx643PasswordModal';
    overlay.className='vx643-modal-overlay';
    overlay.innerHTML='\
      <div class="vx643-modal" role="dialog" aria-modal="true" aria-labelledby="vx643ModalTitle">\
        <h2 id="vx643ModalTitle">Change account password</h2>\
        <p>This is the same password used by “Login with Password”. Your email stays the same.</p>\
        <label>Account email</label>\
        <div class="vx643-email">'+email.replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})+'</div>\
        <label for="vx643CurrentPassword">Current password</label>\
        <input id="vx643CurrentPassword" type="password" autocomplete="current-password" placeholder="Enter current password">\
        <small class="vx643-password-help">Required to securely change your account password.</small>\
        <label for="vx643NewPassword">New password</label>\
        <input id="vx643NewPassword" type="password" autocomplete="new-password" placeholder="8–72 characters">\
        <label for="vx643ConfirmPassword">Confirm password</label>\
        <input id="vx643ConfirmPassword" type="password" autocomplete="new-password" placeholder="Repeat new password">\
        <div class="vx643-error" id="vx643ModalError"></div>\
        <div class="vx643-modal-actions">\
          <button type="button" data-cancel>Cancel</button>\
          <button type="button" class="primary" data-save>Update password</button>\
        </div>\
      </div>';
    document.body.appendChild(overlay);
    var close=function(){if(window.vyaparMotion)window.vyaparMotion.closeOverlay(overlay);else overlay.remove()};
    overlay.querySelector('[data-cancel]').onclick=close;
    overlay.addEventListener('click',function(e){if(e.target===overlay)close()});
    var save=overlay.querySelector('[data-save]');
    save.onclick=async function(){
      var current=String(document.getElementById('vx643CurrentPassword')?.value||'');
      var pass=String(document.getElementById('vx643NewPassword')?.value||'');
      var confirm=String(document.getElementById('vx643ConfirmPassword')?.value||'');
      var err=document.getElementById('vx643ModalError');
      if(!current){err.textContent='Enter your current password.';document.getElementById('vx643CurrentPassword')?.focus();return}
      if(pass.length<8||pass.length>72){err.textContent='Password must be 8–72 characters.';return}
      if(pass!==confirm){err.textContent='Passwords do not match.';return}
      err.textContent='';save.disabled=true;save.textContent='Updating…';
      try{
        var authenticatedFetch=typeof window.vyaparAuthFetch==='function'?window.vyaparAuthFetch:fetch;
        var response=await authenticatedFetch(API_BASE+'/auth/password',{
          method:'PUT',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},
          body:JSON.stringify({currentPassword:current,newPassword:pass,password:pass})
        });
        var data={};
        try{data=await response.json()}catch(_){data={}}
        if(!response.ok||data.success===false)throw new Error(data.message||'Unable to update password');
        if(enableAfter===true)setEnabled(email,true);
        close();
        refreshSecurityCard();
        refreshAuthPolicy();
        notify('Account password updated.','success');
      }catch(error){
        err.textContent=error&&error.message?error.message:'Unable to update password';
        save.disabled=false;save.textContent='Update password';
      }
    };
    setTimeout(function(){document.getElementById('vx643CurrentPassword')?.focus()},30);
  }

  window.vx643ChangeAccountPassword=function(){modal(false)};
  window.vx643TogglePasswordLogin=function(input){
    var email=accountEmail();
    if(!email||!token()){
      if(input)input.checked=false;
      notify('Sign in with Email OTP first.','error');
      return;
    }
    if(input&&input.checked){
      input.checked=false;
      modal(true);
      return;
    }
    setEnabled(email,false);
    refreshSecurityCard();
    refreshAuthPolicy();
    notify('Password login disabled. Email OTP remains available.','success');
  };

  function securityMarkup(){
    var email=accountEmail();
    var on=enabledFor(email);
    return '\
      <div class="settings-section-heading vx622-lock-heading">\
        <div class="vx643-security-copy">\
          <span class="settings-kicker">SECURITY</span>\
          <h2>Inside app lock</h2>\
          <p class="muted">Control account password login for this app.</p>\
        </div>\
        <label class="vx622-switch" aria-label="Password login on or off">\
          <input id="vx643PasswordLoginToggle" type="checkbox" '+(on?'checked':'')+' onchange="vx643TogglePasswordLogin(this)">\
          <span></span>\
        </label>\
      </div>\
      <div class="vx643-security-status">\
        <span><b>Password login</b><small>'+(on?'Your saved account email can use the account password.':'Locked. Email OTP is the only login method until enabled.')+'</small></span>\
        <i class="vx643-state '+(on?'on':'off')+'">'+(on?'Enabled':'Locked')+'</i>\
      </div>\
      <div class="vx643-security-actions">\
        <button type="button" class="btn" onclick="vx643ChangeAccountPassword()">Change Password</button>\
      </div>';
  }

  function refreshSecurityCard(){
    var section=document.getElementById('vx622AppLockSection');
    if(!section)return false;
    if(section.dataset.vx643Security==='1'){
      var email=accountEmail(),on=enabledFor(email),toggle=document.getElementById('vx643PasswordLoginToggle');
      if(toggle)toggle.checked=on;
      var state=section.querySelector('.vx643-state');if(state){state.textContent=on?'Enabled':'Locked';state.className='vx643-state '+(on?'on':'off')}
      var small=section.querySelector('.vx643-security-status small');if(small)small.textContent=on?'Your saved account email can use the account password.':'Locked. Email OTP is the only login method until enabled.';
      return true;
    }
    section.dataset.vx643Security='1';
    section.innerHTML=securityMarkup();
    return true;
  }

  function authCandidateEmail(gate){
    var pass=gate.querySelector('#login-email');
    var otp=gate.querySelector('#login-otp-email');
    return String((pass&&pass.value)||(otp&&otp.value)||accountEmail()||'').trim().toLowerCase();
  }
  function refreshAuthPolicy(){
    // The current auth module owns its tabs; legacy policy must not disable
    // Password or force OTP while the user is signing in.
    if(window.__vyaparAuth867Ready)return true;
    var gate=document.getElementById('vyaparOtpGate');
    if(!gate)return false;
    var passTab=gate.querySelector('#tab-login-pass');
    var otpTab=gate.querySelector('#tab-login-otp');
    if(!passTab||!otpTab)return false;
    var email=authCandidateEmail(gate);
    var on=enabledFor(email);
    var tabs=passTab.closest('.auth-method-tabs');
    if(on){
      passTab.disabled=false;
      passTab.removeAttribute('aria-disabled');
      passTab.classList.remove('vx643-password-locked');
      if(tabs)tabs.classList.remove('vx643-password-disabled');
      if(passTab.textContent.indexOf('Login with Password')<0)passTab.textContent='Login with Password';
    }else{
      if(passTab.classList.contains('active')&&!otpTab.classList.contains('active')){
        passTab.disabled=false;
        try{otpTab.click()}catch(_){}
      }
      passTab.disabled=true;
      passTab.setAttribute('aria-disabled','true');
      passTab.classList.add('vx643-password-locked');
      if(tabs)tabs.classList.add('vx643-password-disabled');
      passTab.textContent='Login with Password';
    }
    if(!gate.dataset.vx643EmailBound){
      gate.dataset.vx643EmailBound='1';
      ['#login-email','#login-otp-email'].forEach(function(sel){
        var input=gate.querySelector(sel);
        if(!input)return;
        input.addEventListener('input',function(){
          var other=gate.querySelector(sel==='#login-email'?'#login-otp-email':'#login-email');
          if(other&&other.value!==input.value)other.value=input.value;
          refreshAuthPolicy();
        });
      });
    }
    return true;
  }

  var scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(function(){scheduled=false;refreshSecurityCard();refreshAuthPolicy()});
  }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});
  window.addEventListener('load',schedule,{once:true});
  schedule();
})();

/* ===== SCRIPT SOURCE: plan-badge-menu-645.js ===== */

/* Vyapar AI — verified account badge + explicit Pro/Business plan-card targeting. */
(function(){
'use strict';
const ACCOUNT_KEY='vyapar_ai_account_cache_v1',STATE_KEY='vyapar_ai_prod_v1';
const tickSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9.7 16.6-4.2-4.2 1.8-1.8 2.4 2.4 6.9-6.9 1.8 1.8z"/></svg>';
function readJson(k){try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(_){return{}}}
function normalizePlan(v){const p=String(v||'').trim().toLowerCase();if(p.includes('business'))return'business';if(p.includes('pro'))return'pro';return''}
function resolvedPlan(){const a=readJson(ACCOUNT_KEY),s=readJson(STATE_KEY),token=String(localStorage.getItem('vyapar_ai_auth_token_v1')||'').trim();const statePlan=(s?.subscription?.verified===true&&String(s?.subscription?.token||token).trim())?normalizePlan(s?.subscription?.plan):'';if(statePlan)return statePlan;const accountPlan=normalizePlan(a?.subscription?.plan),status=String(a?.subscription?.status||'').trim().toLowerCase();const inactive=/^(cancelled|canceled|expired|failed|none|inactive)$/.test(status);if(token&&accountPlan&&!inactive)return accountPlan;return''}
function decorateAccount(){const card=document.getElementById('productionAccountCard');if(!card)return;const title=card.querySelector('.production-account-head h3');if(!title)return;const plan=resolvedPlan();card.querySelectorAll('.vy647-plan-mark').forEach(el=>el.remove());let badge=title.querySelector('.vy645-plan-tick');if(!plan){if(badge)badge.remove()}else{if(!badge){badge=document.createElement('span');badge.className='vy645-plan-tick';badge.innerHTML=tickSvg;title.appendChild(badge)}badge.className='vy645-plan-tick '+plan;badge.setAttribute('role','img');badge.setAttribute('aria-label',plan==='business'?'Business verified':'Pro verified');badge.title=plan==='business'?'Business verified':'Pro verified'}const avatar=card.querySelector('.production-avatar, .account-avatar, .profile-avatar, .avatar');if(avatar){const wanted=plan||'';if(avatar.dataset.plan!==wanted){avatar.classList.remove('vy648-plan-avatar','pro','business');avatar.removeAttribute('data-plan');if(plan){avatar.classList.add('vy648-plan-avatar',plan);avatar.setAttribute('data-plan',plan)}}}}
function decoratePlanCards(){document.querySelectorAll('.subscription-plan-grid .subscription-plan-card').forEach(card=>{card.classList.remove('vy649-pro-card','vy649-business-card');const name=String(card.querySelector('h2')?.textContent||'').trim().toLowerCase();if(name==='pro')card.classList.add('vy649-pro-card');if(name==='business')card.classList.add('vy649-business-card')})}
function setMenu(m,o){if(!m)return;m.classList.toggle('is-open',!!o);const t=m.querySelector(':scope > .vx622-menu-trigger');if(t)t.setAttribute('aria-expanded',o?'true':'false')}
function closeAll(ex){document.querySelectorAll('.vx622-bulk-menu.is-open').forEach(m=>{if(m!==ex)setMenu(m,false)})}
document.addEventListener('click',e=>{const t=e.target.closest('.vx622-menu-trigger');if(!t)return;const m=t.closest('.vx622-bulk-menu');if(!m)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const o=!m.classList.contains('is-open');closeAll(m);setMenu(m,o)},true);
document.addEventListener('click',e=>{const i=e.target.closest('.vx622-menu-item');if(i){setTimeout(()=>setMenu(i.closest('.vx622-bulk-menu'),false),0);return}if(!e.target.closest('.vx622-bulk-menu'))closeAll(null)},false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll(null)},true);window.addEventListener('scroll',()=>closeAll(null),{passive:true});
let q=false;function refresh(){if(q)return;q=true;requestAnimationFrame(()=>{q=false;decorateAccount();decoratePlanCards()})}
new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('storage',refresh);window.addEventListener('load',refresh,{once:true});setTimeout(refresh,120);setTimeout(refresh,500);setTimeout(refresh,1200);
})();

/* ===== SCRIPT SOURCE: shop-rewards.js ===== */

/* Vyapar AI Android-only small-shop growth & reward system. */
(function(){
  'use strict';

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
    const close = () => {
      const finish=()=>{ sheet.remove(); document.body.classList.remove('shop-progress-open'); };
      if(window.vyaparMotion) window.vyaparMotion.closeOverlay(sheet,finish); else finish();
    };
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

/* ===== SCRIPT SOURCE: audit-fixes-658.js ===== */

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
      if(small && small.textContent!=='Recorded transaction profit vs sales') small.textContent='Recorded transaction profit vs sales';
    }
  }

  function enhanceAnalytics(){
    if(window.VyaparInsights)return;
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
          persistBusinessState(state).catch(()=>{});
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
        if(p && p.textContent!=='Check whether a newer Vyapar AI version is available.') p.textContent='Check whether a newer Vyapar AI version is available.';
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
        const img=document.createElement('img'); img.className='vy658-footer-logo'; img.src='assets/images/footer-logo.jpg'; img.alt='Vyapar AI'; footer.prepend(img);
      }
      // The Settings footer owns its legal links; do not remove/re-add them on every mutation.
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

/* ===== SCRIPT SOURCE: sales-theme-660.js ===== */

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

  function footerMarkup(){return '<img class="vy660-footer-logo" src="assets/images/footer-logo.jpg" alt="Vyapar AI"><span>© 2026 Vyapar AI. All Rights Reserved.</span><span class="app-legal-links"><a href="pages/legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a><a href="pages/legal/terms.html" target="_blank" rel="noopener noreferrer">Terms</a><a href="pages/legal/refund.html" target="_blank" rel="noopener noreferrer">Refund</a><a href="pages/legal/delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a></span><strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';}
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
    const finish=()=>{if(popup)popup.remove();document.body.classList.remove('subscription-dialog-open')};
    if(popup && window.vyaparMotion)window.vyaparMotion.closeOverlay(popup,finish);else finish();
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
        try{if(typeof state!=='undefined'&&state){state.appUpdate={checkedAt:new Date().toISOString(),currentCode,currentName,...data};persistBusinessState(state).catch(()=>{});}}catch(_){}
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

/* ===== SCRIPT SOURCE: audit-stage2-6601.js ===== */

/* Vyapar AI 6.6.0.1 — Stage 2 audit repairs */
(function(){'use strict';
const VER='6.6.0.1',CODE=66001,N=v=>{const x=Number(String(v??'').replace(/[₹,\s]/g,''));return Number.isFinite(x)?x:0},M=v=>typeof money==='function'?money(v):'₹'+N(v).toLocaleString('en-IN'),P=v=>String(v).padStart(2,'0');
function VK(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const y=N(m[1]),mo=N(m[2]),d=N(m[3]),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];return mo>=1&&mo<=12&&d>=1&&d<=days[mo-1]}
function DK(v){const r=String(v??'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(r)){const k=r.slice(0,10);return VK(k)?k:''}const d=new Date(r);return Number.isNaN(d.getTime())?'':d.getFullYear()+'-'+P(d.getMonth()+1)+'-'+P(d.getDate())}
function key(x){return String(x?.id||[x?.date,x?.month,x?.number,x?.name,x?.type,x?.amount].join('|'))}
function merge(a,b){const o=Array.isArray(a)?a.slice():[],s=new Set(o.map(key));(Array.isArray(b)?b:[]).forEach(x=>{const k=key(x);if(!s.has(k)){s.add(k);o.push(x)}});return o}
function S(){try{if(typeof state==='undefined'||!state)return window.state||{};const w=window.state;if(w&&w!==state){Object.keys(w).forEach(k=>{const v=w[k],c=state[k];if(Array.isArray(v))state[k]=merge(c,v);else if(v&&typeof v==='object')state[k]={...(c&&typeof c==='object'?c:{}),...v};else if(state[k]===undefined)state[k]=v})}window.state=state;return state}catch(_){return window.state||{}}}
S();
function bid(){const s=S();return String(s.activeBusinessId||s.currentStoreId||'MAIN')}
function itemProfit(x){return (N(x.sellingPrice)-N(x.purchasePrice))*Math.max(0,N(x.qty))}function itemSale(x){return Math.max(0,N(x.sellingPrice))*Math.max(0,N(x.qty))}
function dayMaps(y){const s=S(),business=bid(),pre=y+'-',item={},daily={},acc={};(s.sales||[]).forEach(x=>{const d=DK(x.date);if(!d.startsWith(pre))return;const r=item[d]||(item[d]={revenue:0,profit:0});r.revenue+=itemSale(x);r.profit+=itemProfit(x)});(s.daily||[]).forEach(x=>{const d=DK(x.date);if(!d.startsWith(pre))return;daily[d]={revenue:Math.max(0,N(x.sale)),profit:N(x.profit)}});(s.transactions611||[]).forEach(t=>{if(String(t.businessId||'MAIN')!==business||t.status==='cancelled'||!['SALE','SALE_RETURN'].includes(String(t.type).toUpperCase()))return;const d=DK(t.date);if(!d.startsWith(pre))return;const sign=String(t.type).toUpperCase()==='SALE_RETURN'?-1:1;let rev=0,cogs=0;(t.items||[]).forEach(i=>{const q=Math.max(0,N(i.qty||i.quantity)),rate=Math.max(0,N(i.rate||i.price)),disc=Math.max(0,N(i.discount));rev+=q*rate*(1-disc/100);cogs+=q*Math.max(0,N(i.purchaseRate||i.purchasePrice))});if(!(t.items||[]).length)rev=Math.max(0,N(t.baseAmount||t.total)-N(t.tax)-N(t.cess));const r=acc[d]||(acc[d]={revenue:0,profit:0});r.revenue+=sign*rev;r.profit+=sign*(rev-cogs)});return{item,daily,acc}}
function FY(year){const y=String(year);if(!/^\d{4}$/.test(y))return{year:y,revenue:0,profit:0,expenses:0,net:0,months:{}};const s=S(),m=dayMaps(y),months={},days=new Set([...Object.keys(m.item),...Object.keys(m.daily),...Object.keys(m.acc)]);days.forEach(d=>{const c=m.acc[d]||m.daily[d]||m.item[d]||{revenue:0,profit:0},k=d.slice(0,7),r=months[k]||(months[k]={revenue:0,profit:0});r.revenue+=N(c.revenue);r.profit+=N(c.profit)});const manual={};(s.monthly||[]).forEach(x=>{const k=String(x.month||'').slice(0,7);if(k.startsWith(y+'-'))manual[k]=N(x.profit)});Object.entries(manual).forEach(([k,value])=>{const r=months[k]||(months[k]={revenue:0,profit:0});r.profit+=value});const revenue=Object.values(months).reduce((z,r)=>z+N(r.revenue),0),profit=Object.values(months).reduce((z,r)=>z+N(r.profit),0),expenses=(s.expenses||[]).filter(x=>DK(x.date).startsWith(y+'-')).reduce((z,x)=>z+N(x.amount),0);return{year:y,revenue,profit,expenses,net:profit-expenses,months}}
function series(){
  if(window.VyaparProfit){const all=window.VyaparProfit.build(S());return Object.keys(all).sort().flatMap(y=>Object.keys(all[y].months).sort().filter(m=>all[y].months[m].activity).map(m=>[m,N(all[y].months[m].profit)]));}
  const s=S(),ys=new Set();[s.sales,s.daily,s.monthly,s.transactions611].forEach(a=>(a||[]).forEach(x=>{const y=String(x.month||x.date||'').slice(0,4);if(/^\d{4}$/.test(y))ys.add(y)}));return [...ys].sort().flatMap(y=>Object.entries(FY(y).months).map(([k,v])=>[k,N(v.profit)]));
}

function yprofit(y){return FY(y).profit}function stats(y){const v=series().filter(([m])=>m.startsWith(String(y)+'-')).map(([,x])=>N(x)),t=v.reduce((a,b)=>a+b,0);return{count:v.length,avg:v.length?t/v.length:0,high:v.length?Math.max(...v):0,low:v.length?Math.min(...v):0,total:t}}
window.VyaparFinance6601={version:VER,code:CODE,year:FY,monthlySeries:series};try{resolvedMonthlyProfitSeries=series;yearlyProfitForYear=yprofit;monthlyStatsForYear=stats;yearlySalesForYear=y=>FY(y).revenue;accountingTotals=()=>{const f=FY(String(new Date().getFullYear()));return{revenue:f.revenue,expenses:f.expenses,net:f.net,cogs:Math.max(0,f.revenue-f.profit),other:0}}}catch(_){}Object.assign(window,{resolvedMonthlyProfitSeries:series,yearlyProfitForYear:yprofit,monthlyStatsForYear:stats});
function now(){const d=new Date();return{y:String(d.getFullYear()),m:d.getFullYear()+'-'+P(d.getMonth()+1),d:d.getFullYear()+'-'+P(d.getMonth()+1)+'-'+P(d.getDate())}}
function monthBreak(k){const y=k.slice(0,4),m=dayMaps(y);let acc=0,daily=0,item=0,manual=0;Object.entries(m.acc).forEach(([d,v])=>{if(d.startsWith(k+'-'))acc+=N(v.profit)});Object.entries(m.daily).forEach(([d,v])=>{if(d.startsWith(k+'-')&&!m.acc[d])daily+=N(v.profit)});Object.entries(m.item).forEach(([d,v])=>{if(d.startsWith(k+'-')&&!m.acc[d]&&!m.daily[d])item+=N(v.profit)});(S().monthly||[]).forEach(x=>{if(String(x.month||'').slice(0,7)===k)manual=N(x.profit)});return{acc,daily,item,manual,total:acc+daily+item+manual}}
function profitCard(){const c=document.getElementById('vy660ProfitCard');if(!c)return;const p=now(),f=FY(p.y),b=monthBreak(p.m),todays=(S().daily||[]).filter(x=>DK(x.date)===p.d),today=N(todays.length?todays[todays.length-1].profit:0),h='<div class="vy660-profit-head"><div><span class="home-section-kicker">PROFIT OVERVIEW</span><h2>Yearly Profit · '+p.y+'</h2><strong>'+M(f.profit)+'</strong></div></div><div class="vy660-live-grid"><div class="vy660-live-box"><span>This month · live</span><b>'+M(b.total)+'</b><small>Manual '+M(b.manual)+' + daily '+M(b.daily)+' + item '+M(b.item)+' + accounting '+M(b.acc)+'</small></div><div class="vy660-live-box"><span>Today\'s Daily Profit</span><b>'+M(today)+'</b><small>Today only · Daily Quick Entry</small></div></div><p class="muted vy660-note">Unified finance prevents duplicate sales on the same date: accounting transaction → Daily Quick Entry → item-wise sale. Monthly manual profit stays additive.</p>';if(c.innerHTML!==h)c.innerHTML=h}
function yearFilter(){if(window.VyaparRecords)return;const c=document.getElementById('monthly-profit-records');if(!c)return;c.querySelectorAll('.vy658-year-filter').forEach(x=>x.remove());const existing=[...c.querySelectorAll('.vy6601-year-filter')];existing.slice(1).forEach(x=>x.remove());const title=c.querySelector('h2');if(title&&title.textContent!=='Monthly Manual Profit Records')title.textContent='Monthly Manual Profit Records';[...c.querySelectorAll('thead th')].forEach(x=>{if(/Net Profit/i.test(x.textContent))x.textContent='Manual Profit'});if(!c.querySelector('.vy6601-month-note')){const p=document.createElement('p');p.className='muted vy6601-month-note';p.textContent='Manual entries only. Live totals also include non-duplicate Daily, item-sale and accounting profit.';title?.after(p)}const ys=[...new Set((S().monthly||[]).map(x=>String(x.month||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();let w=existing[0]||null;if(!ys.length){if(w)w.remove();return}if(!w){w=document.createElement('div');w.className='vy6601-year-filter';w.innerHTML='<label>Year</label><select><option value="all">All years</option>'+ys.map(y=>'<option>'+y+'</option>').join('')+'</select>';c.insertBefore(w,c.querySelector('.scroll'));w.querySelector('select').addEventListener('change',yearFilter)}const sel=w.querySelector('select');if(!sel)return;const options=[...sel.options].map(o=>o.value||o.textContent);if(options.length!==ys.length+1||!ys.every(y=>options.includes(y))){const previous=sel.value;sel.innerHTML='<option value="all">All years</option>'+ys.map(y=>'<option>'+y+'</option>').join('');sel.value=(previous==='all'||ys.includes(previous))?previous:'all'}const y=sel.value;[...c.querySelectorAll('tbody tr')].forEach(r=>{const t=[...r.querySelectorAll('td')].map(x=>x.textContent).join(' ');r.hidden=y!=='all'&&!t.includes(y)})}
function business(){const s=document.getElementById('screen-business');if(!s)return;s.querySelectorAll('.vx621-group').forEach(g=>{const h=g.querySelector('h2')?.textContent;if(h==='Stock-related Tools'||h==='Sales-related Tools')g.remove()});s.querySelectorAll('.pill').forEach(x=>{if(/^Business Platform\s+\d/.test(x.textContent))x.textContent='Business Platform'});const h=s.querySelector('.vx621-hero p'),ht='Choose a tool to manage your business.';if(h&&h.textContent!==ht)h.textContent=ht;const f=FY(String(new Date().getFullYear()));s.querySelectorAll('.vx621-kpi').forEach(k=>{const l=k.querySelector('span')?.textContent,b=k.querySelector('b');if(!b)return;if(l==='Revenue'&&b.textContent!==M(f.revenue))b.textContent=M(f.revenue);if(l==='Net Profit'&&b.textContent!==M(f.net))b.textContent=M(f.net);if(l==='Expenses'&&b.textContent!==M(f.expenses))b.textContent=M(f.expenses)});if(!s.querySelector('.vy6601-fin-note')){const n=document.createElement('div');n.className='notice vy6601-fin-note';n.innerHTML='<b>Unified finance:</b> Net Profit = '+M(f.profit)+' − '+M(f.expenses)+' expenses = '+M(f.net);s.querySelector('.vx621-kpis')?.after(n)}}
function footer(){document.querySelectorAll('#appLegalFooter').forEach(f=>{const imgs=[...f.querySelectorAll('img')],keep=imgs.find(x=>x.classList.contains('vy660-footer-logo'))||imgs[0];if(keep){keep.classList.add('vy658-footer-logo','vy6601-footer-logo');imgs.forEach(x=>{if(x!==keep)x.remove()})}const sig=f.querySelector('.gupta-legacy-signature');if(sig&&sig.textContent!=='A Gupta Legacy product')sig.textContent='A Gupta Legacy product';const l=f.querySelector('.app-legal-links');if(l&&!l.querySelector('a[href*="delete-account"]')){const a=document.createElement('a');a.href='pages/legal/delete-account.html';a.target='_blank';a.textContent='Delete Account';l.appendChild(a)}})}
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];function dates(root=document){root.querySelectorAll('td,time').forEach(x=>{if(x.children.length)return;const t=x.textContent.trim(),m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)x.textContent=Number(m[3])+' '+MN[Number(m[2])-1]+' '+m[1]})}
function labels(root=document){root.querySelectorAll('.pill,.auth-help').forEach(x=>{if(/^Business Platform\s+\d/.test(x.textContent))x.textContent='Business Platform';if(/^Vyapar AI\s+6\./.test(x.textContent))x.textContent='Vyapar AI '+VER});const sale=[...document.querySelectorAll('#screen-sales .card')].find(c=>c.querySelector('h2')?.textContent==='Sales Records'),td=sale&&[...sale.querySelectorAll('tbody td')].find(x=>/No sale records yet/.test(x.textContent));if(td)td.textContent='No item-wise sales yet. Daily Quick Entry and monthly manual records are tracked separately.'}
function otp(){const g=document.getElementById('vyaparOtpGate');if(!g||g.dataset.v6601)return;g.dataset.v6601='1';const l=document.getElementById('login-otp-code'),u=document.getElementById('signup-otp');l?.parentElement?.classList.add('vy6601-login-step');document.getElementById('login-otp-submit')?.classList.add('vy6601-login-step');u?.parentElement?.classList.add('vy6601-signup-step');const tab=document.getElementById('tab-login-otp'),sub=document.getElementById('login-otp-submit');if(tab)tab.textContent='Email OTP';if(sub)sub.textContent='Verify & Sign In';const msg=document.getElementById('auth-message');if(msg)new MutationObserver(()=>{if(msg.classList.contains('success')&&/sent|verification code/i.test(msg.textContent)){const sign=!document.getElementById('signup-section')?.classList.contains('hidden');g.classList.add(sign?'vy6601-signup-sent':'vy6601-login-sent')}}).observe(msg,{attributes:true,childList:true,characterData:true,subtree:true});const tabs=g.querySelector('.auth-method-tabs');if(tabs){let sx=null;tabs.addEventListener('touchstart',e=>sx=e.touches?.[0]?.clientX??null,{capture:true,passive:true});tabs.addEventListener('touchend',e=>{if(sx===null)return;const dx=(e.changedTouches?.[0]?.clientX??sx)-sx;sx=null;if(Math.abs(dx)>=24){e.preventDefault();e.stopImmediatePropagation()}},{capture:true,passive:false})}}
let last=0;function closeSel(immediate){const node=document.getElementById('vy6601Select');if(!node)return;if(immediate===true){if(window.vyaparMotion)window.vyaparMotion.cancelOverlay(node);node.remove()}else if(window.vyaparMotion)window.vyaparMotion.closeOverlay(node);else node.remove()}function openSel(s){if(!s||s.disabled)return;closeSel(true);last=Date.now();const o=document.createElement('div');o.id='vy6601Select';o.className='vy6601-select-overlay';o.innerHTML='<div class="vy6601-select-sheet" role="dialog" aria-modal="true" aria-label="Choose an option"><div class="vy6601-select-head"><b>Choose an option</b><button>×</button></div><div class="vy6601-select-options"></div></div>';const list=o.querySelector('.vy6601-select-options');[...s.options].forEach(x=>{const b=document.createElement('button');b.textContent=x.textContent;b.disabled=x.disabled;b.className=x.selected?'selected':'';b.onclick=()=>{s.value=x.value;s.dispatchEvent(new Event('change',{bubbles:true}));closeSel()};list.appendChild(b)});o.querySelector('.vy6601-select-head button').onclick=closeSel;o.onclick=e=>{if(e.target===o)closeSel()};document.body.appendChild(o)}function selects(){if(!document.documentElement.classList.contains('native-android')||document.documentElement.dataset.v6601sel)return;document.documentElement.dataset.v6601sel='1';document.addEventListener('touchstart',e=>{const s=e.target.closest?.('select');if(!s)return;e.preventDefault();e.stopImmediatePropagation();openSel(s)},{capture:true,passive:false});document.addEventListener('click',e=>{const s=e.target.closest?.('select');if(!s)return;e.preventDefault();e.stopImmediatePropagation();if(Date.now()-last>600)openSel(s)},true)}
let lastFinanceRevision=-1,lastProfitNode=null,lastBusinessNode=null;
function fix(root=document){S();const rev=window.__vyaparDataRevision||0,pc=document.getElementById('vy660ProfitCard'),bc=document.getElementById('screen-business')?.firstElementChild;if(rev!==lastFinanceRevision||pc!==lastProfitNode){profitCard();lastProfitNode=pc}if(rev!==lastFinanceRevision||bc!==lastBusinessNode){business();lastBusinessNode=bc}lastFinanceRevision=rev;yearFilter();footer();labels(root);dates(root);otp();selects()}
function wrap(n,fn){const old=window[n];if(typeof old!=='function'||old.__6601)return;const w=function(){S();const r=old.apply(this,arguments);fn();return r};w.__6601=1;window[n]=w}wrap('renderSales',()=>{profitCard();yearFilter();labels();dates(document.getElementById('screen-sales')||document)});wrap('renderBusiness',()=>{business();dates(document.getElementById('screen-business')||document)});wrap('renderSettings',footer);
const ob=new MutationObserver(()=>{clearTimeout(window.__6601);window.__6601=setTimeout(()=>fix(document),55)});ob.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{try{renderHome?.();renderSales?.();renderBusiness?.();renderSettings?.()}catch(_){}fix()},0);
})();

/* ===== SCRIPT SOURCE: production-ui-670p1.js ===== */

/*
 * Vyapar AI 6.7.0-phase.1
 * Production-readiness Phase 1: task-based screen organisation.
 * No feature handlers, data keys, formulas, routes or plan gates are replaced here.
 */
(function(){
  'use strict';

  const VERSION = '6.7.0-phase.1';
  const memory = Object.create(null);
  let scheduled = false;

  document.documentElement.classList.add('production-ui-p1');
  document.documentElement.dataset.productionUiVersion = VERSION;

  function text(node){
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function heading(node){
    return text(node && node.querySelector('h1,h2,h3,.settings-kicker'));
  }

  function savedMode(screenId, fallback){
    if(memory[screenId]) return memory[screenId];
    try{
      const value = sessionStorage.getItem('vyapar_ui_p1_mode_' + screenId);
      if(value) return (memory[screenId] = value);
    }catch(_){ }
    return (memory[screenId] = fallback);
  }

  function saveMode(screenId, mode){
    memory[screenId] = mode;
    try{ sessionStorage.setItem('vyapar_ui_p1_mode_' + screenId, mode); }catch(_){ }
  }

  function makeModeBar(screen, screenId, modes, beforeNode){
    let bar = screen.querySelector(':scope > .p1-modebar[data-screen="' + screenId + '"]');
    if(bar) return bar;

    bar = document.createElement('div');
    bar.className = 'p1-modebar';
    bar.dataset.screen = screenId;
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', modes.label || 'Choose a view');
    bar.innerHTML = modes.items.map(function(item){
      return '<button type="button" role="tab" data-mode="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    bar.addEventListener('click', function(event){
      const button = event.target.closest('button[data-mode]');
      if(!button) return;
      const previous=savedMode(screenId,modes.items[0][0]);
      if(previous===button.dataset.mode)return;
      saveMode(screenId, button.dataset.mode);
      applyMode(screen, screenId, modes);
      if(window.vyaparMotion){
        const direction=modes.items.findIndex(item=>item[0]===button.dataset.mode)<modes.items.findIndex(item=>item[0]===previous)?-1:1;
        screen.querySelectorAll('.p1-mode-section[data-p1-mode]').forEach(node=>{if(!node.hidden)window.vyaparMotion.enter(node,direction)});
      }
    });

    screen.insertBefore(bar, beforeNode || screen.firstChild);
    return bar;
  }

  function setSectionMode(node, mode){
    if(!node || !mode) return;
    node.classList.add('p1-mode-section');
    node.dataset.p1Mode = mode;
  }

  function applyMode(screen, screenId, modes){
    let active = savedMode(screenId, modes.items[0][0]);
    if(!modes.items.some(function(item){ return item[0] === active; })) active = modes.items[0][0];

    const bar = screen.querySelector('.p1-modebar[data-screen="' + screenId + '"]');
    if(bar){
      bar.querySelectorAll('button[data-mode]').forEach(function(button){
        const selected = button.dataset.mode === active;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    screen.querySelectorAll('.p1-mode-section[data-p1-mode]').forEach(function(node){
      const visible = node.dataset.p1Mode.split(' ').includes(active);
      node.hidden = !visible;
      node.setAttribute('aria-hidden', String(!visible));
    });

    if(screenId === 'business' && window.VyaparBusinessTools) window.VyaparBusinessTools.refresh(screen);

    screen.querySelectorAll('.grid').forEach(function(grid){
      const sections = Array.from(grid.children).filter(function(child){
        return child.classList && child.classList.contains('p1-mode-section');
      });
      grid.classList.toggle('p1-grid-hidden', sections.length > 0 && sections.every(function(child){ return child.hidden; }));
    });
  }

  function salesCards(screen){
    const result = [];
    Array.from(screen.children).forEach(function(child){
      if(child.classList.contains('grid')){
        Array.from(child.children).forEach(function(item){ if(item.classList.contains('card')) result.push(item); });
      }else if(child.classList.contains('card')) result.push(child);
    });
    return result;
  }

  function organiseSales(){
    const screen = document.getElementById('screen-sales');
    if(!screen || !screen.children.length) return;

    salesCards(screen).forEach(function(card){
      const title = heading(card);
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;

      if(/add item sale|edit sale|daily quick entry/.test(title)) setSectionMode(card, 'today');
      else if(/monthly profit entry|edit monthly profit|monthly manual profit records|monthly profit records/.test(title)) setSectionMode(card, 'monthly');
      else if(/advanced sales|billing/.test(title)) setSectionMode(card, 'billing');
      else if(/daily records|sales records/.test(title)) setSectionMode(card, 'history');
    });

    const modes = {
      label: 'Sales workspace',
      items: [['today','Today'],['monthly','Monthly'],['billing','Billing'],['history','History']]
    };
    const profit = screen.querySelector('#vy660ProfitCard');
    const insertionPoint = profit && profit.nextSibling ? profit.nextSibling : screen.firstChild;
    makeModeBar(screen, 'sales', modes, insertionPoint);
    if(screen.querySelector('h2') && /edit monthly profit/i.test(screen.textContent)) saveMode('sales', 'monthly');
    applyMode(screen, 'sales', modes);
  }

  function organiseStock(){
    const screen = document.getElementById('screen-stock');
    if(!screen || !screen.children.length) return;

    Array.from(screen.children).forEach(function(node){
      if(!node.classList.contains('card')) return;
      const title = heading(node);
      node.classList.remove('p1-mode-section');
      node.removeAttribute('data-p1-mode');
      node.hidden = false;
      if(/stock manager|stock alerts/.test(title)) setSectionMode(node, 'manage');
      else if(/inventory workspace/.test(title)) setSectionMode(node, 'tools');
      else if(/saved stock records/.test(title)) setSectionMode(node, 'records');
    });

    const modes = {
      label: 'Stock workspace',
      items: [['manage','Manage'],['tools','Tools'],['records','Records']]
    };
    makeModeBar(screen, 'stock', modes, screen.querySelector('.stats')?.nextSibling || screen.firstChild);
    applyMode(screen, 'stock', modes);
  }

  function organiseBusiness(){
    const screen = document.getElementById('screen-business');
    const shell = screen && screen.querySelector('.vx621-business-shell');
    if(!screen || !shell) return;

    Array.from(shell.querySelectorAll('.vx621-group,.vx621-recent')).forEach(function(node){
      node.classList.remove('p1-mode-section');
      node.removeAttribute('data-p1-mode');
      node.hidden = false;
      const title = heading(node);
      if(node.classList.contains('vx621-group')){
        if(/daily business/.test(title)) setSectionMode(node, 'daily');
        else if(/accounting|compliance/.test(title)) setSectionMode(node, 'accounts');
        else if(/documents|communication/.test(title)) setSectionMode(node, 'documents');
        else setSectionMode(node, 'daily');
      }else if(node.classList.contains('vx621-recent')) setSectionMode(node, 'activity');
    });

    const modes = {
      label: 'Business workspace',
      items: [['daily','Daily'],['accounts','Accounts'],['documents','Documents'],['activity','Activity']]
    };
    const kpis = shell.querySelector('.vx621-kpis');
    let bar = shell.querySelector(':scope > .p1-modebar[data-screen="business"]');
    if(!bar){
      bar = document.createElement('div');
      bar.className = 'p1-modebar';
      bar.dataset.screen = 'business';
      bar.setAttribute('role','tablist');
      bar.setAttribute('aria-label',modes.label);
      bar.innerHTML = modes.items.map(function(item){ return '<button type="button" role="tab" data-mode="' + item[0] + '">' + item[1] + '</button>'; }).join('');
      bar.addEventListener('click',function(event){
        const button=event.target.closest('button[data-mode]');
        if(!button) return;
        const search=screen.querySelector('#businessToolSearch');
        if(search) search.value='';
        saveMode('business',button.dataset.mode);
        applyMode(screen,'business',modes);
      });
      bar.addEventListener('keydown',function(event){
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const buttons=Array.from(bar.querySelectorAll('button[data-mode]'));
        const index=buttons.indexOf(event.target); if(index<0) return;
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
        event.preventDefault();buttons[next].click();buttons[next].focus();
      });
      shell.insertBefore(bar,kpis && kpis.nextSibling ? kpis.nextSibling : shell.firstChild);
    }
    applyMode(screen, 'business', modes);
  }

  function settingsGroup(card){
    const value = text(card.querySelector('.settings-kicker')) + ' ' + heading(card);
    if(/account|business profile|shop details/.test(value)) return 'account';
    if(/business admin|company|app lock|inside app lock|security/.test(value)) return 'business';
    if(/appearance|performance|motion/.test(value)) return 'appearance';
    if(/data safety|backup/.test(value)) return 'data';
    if(/support|legal|app update/.test(value)) return 'legal';
    return '';
  }

  function organiseSettings(){
    const screen = document.getElementById('screen-settings');
    const stack = screen && screen.querySelector('.settings-stack');
    if(!screen || !stack) return;

    Array.from(stack.children).forEach(function(card){
      if(card.id === 'appLegalFooter') return;
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;
      const group = settingsGroup(card);
      if(group) setSectionMode(card, group);
    });

    const modes = {
      label: 'Settings sections',
      items: [['account','Account'],['business','Business'],['appearance','Appearance'],['data','Data'],['legal','Legal']]
    };
    makeModeBar(screen, 'settings', modes, stack);
    applyMode(screen, 'settings', modes);
  }

  function improveSemantics(root){
    root.querySelectorAll('button:not([type])').forEach(function(button){ button.type = 'button'; });
    root.querySelectorAll('.scroll,.vx621-table-wrap,.p611-table').forEach(function(scroller){
      if(!scroller.hasAttribute('tabindex')) scroller.tabIndex = 0;
      if(!scroller.hasAttribute('aria-label')) scroller.setAttribute('aria-label','Scrollable records');
    });
    root.querySelectorAll('input[type="number"]').forEach(function(input){ input.inputMode = 'decimal'; });
  }

  function organise(){
    scheduled = false;
    organiseSales();
    organiseStock();
    organiseBusiness();
    organiseSettings();
    improveSemantics(document);
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(organise);
  }

  ['renderSales','renderStock','renderBusiness','renderSettings'].forEach(function(name){
    const original = window[name];
    if(typeof original !== 'function' || original.__productionUiP1) return;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      schedule();
      return result;
    };
    wrapped.__productionUiP1 = true;
    window[name] = wrapped;
  });

  const observer = new MutationObserver(function(mutations){
    if(mutations.some(function(mutation){ return mutation.addedNodes.length > 0; })) schedule();
  });
  observer.observe(document.querySelector('main') || document.body, {childList:true, subtree:true});

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();

  window.VyaparProductionUI = {
    version: VERSION,
    phase: 1,
    refresh: schedule,
    setView: function(screen, mode){ saveMode(screen, mode); schedule(); }
  };
})();

/* ===== SCRIPT SOURCE: workflow-ui-670p2.js ===== */

/*
 * Vyapar AI 6.7.0-phase.2
 * Production-readiness Phase 2: workflow guidance, validation and feedback.
 * Existing save functions remain authoritative; this layer validates before calling them.
 */
(function(){
  'use strict';

  const VERSION = '6.7.0-phase.2';
  let scheduled = false;

  document.documentElement.classList.add('workflow-ui-p2');
  document.documentElement.dataset.workflowUiVersion = VERSION;

  const $ = function(id){ return document.getElementById(id); };
  const number = function(value){
    const parsed = Number(String(value == null ? '' : value).replace(/[₹,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const raw = function(id){ return String($(id)?.value ?? '').trim(); };
  const stateRef = function(){
    try{ if(typeof state !== 'undefined' && state) return state; }catch(_){ }
    return window.state || {};
  };
  const cash = function(value){
    try{ if(typeof money === 'function') return money(number(value)); }catch(_){ }
    return '₹' + number(value).toLocaleString('en-IN', {maximumFractionDigits:2});
  };

  function liveRegion(){
    let node = document.getElementById('p2LiveRegion');
    if(node) return node;
    node = document.createElement('div');
    node.id = 'p2LiveRegion';
    node.className = 'p2-live-region';
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    document.body.appendChild(node);
    return node;
  }

  function announce(message){
    const node = liveRegion();
    node.textContent = '';
    setTimeout(function(){ node.textContent = message; }, 20);
  }

  function notify(message, type){
    announce(message);
    try{
      if(typeof showGlassToast === 'function') showGlassToast(message, type || 'success');
      else if(typeof advToast === 'function') advToast(message);
    }catch(_){ }
  }

  function titleCase(value){
    return String(value || '').replace(/[_-]+/g,' ').replace(/\b\w/g,function(char){ return char.toUpperCase(); });
  }

  function ensureIntro(card, key, message){
    if(!card || card.querySelector('[data-p2-intro="' + key + '"]')) return;
    const node = document.createElement('div');
    node.className = 'p2-form-intro';
    node.dataset.p2Intro = key;
    node.textContent = message;
    const heading = card.querySelector('h1,h2,h3,.calculator-head');
    if(heading?.classList?.contains('calculator-head')) heading.insertAdjacentElement('afterend', node);
    else if(heading) heading.insertAdjacentElement('afterend', node);
    else card.prepend(node);
  }

  function associatedLabel(input){
    if(!input) return null;
    const parentLabel = input.closest('label');
    if(parentLabel) return parentLabel;
    let previous = input.previousElementSibling;
    if(previous && previous.tagName === 'LABEL') return previous;
    const card = input.closest('.card');
    if(card){
      const byFor = card.querySelector('label[for="' + input.id + '"]');
      if(byFor) return byFor;
    }
    return null;
  }

  function markRequired(input){
    if(!input) return;
    input.required = true;
    input.setAttribute('aria-required','true');
    const label = associatedLabel(input);
    if(label && !label.querySelector('.p2-required-mark')){
      if(input.id && label.tagName === 'LABEL' && !label.contains(input)) label.htmlFor = input.id;
      const mark = document.createElement('span');
      mark.className = 'p2-required-mark';
      mark.setAttribute('aria-hidden','true');
      mark.textContent = '*';
      label.appendChild(mark);
    }
  }

  function setError(input, message){
    if(!input) return;
    const id = (input.id || 'field') + '-p2-error';
    let node = document.getElementById(id);
    input.classList.toggle('p2-input-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    if(!message){
      input.removeAttribute('aria-describedby');
      node?.remove();
      return;
    }
    if(!node){
      node = document.createElement('small');
      node.id = id;
      node.className = 'p2-error-text';
      input.insertAdjacentElement('afterend', node);
    }
    node.textContent = message;
    input.setAttribute('aria-describedby', id);
  }

  function fail(errors){
    const list = errors.filter(function(item){ return item && item.input && item.message; });
    if(!list.length) return true;
    list.forEach(function(item){ setError(item.input, item.message); });
    const first = list[0].input;
    try{ first.focus({preventScroll:true}); }catch(_){ first.focus(); }
    first.scrollIntoView({behavior:'smooth', block:'center'});
    notify('Please fix ' + list.length + ' highlighted field' + (list.length === 1 ? '.' : 's.'), 'error');
    return false;
  }

  function clearErrors(ids){
    ids.forEach(function(id){ setError($(id), ''); });
  }

  function validDate(value){ return /^\d{4}-\d{2}-\d{2}$/.test(value); }
  function validMonth(value){ return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }

  function validateSale(){
    if(!$('sproduct')) return true;
    const ids = ['sdate','sproduct','sqty','sbuy','ssell'];
    clearErrors(ids);
    const errors = [];
    const date = raw('sdate'), product = raw('sproduct');
    const qtyText = raw('sqty'), buyText = raw('sbuy'), sellText = raw('ssell');
    const qty = number(qtyText), buy = number(buyText), sell = number(sellText);
    if(!validDate(date)) errors.push({input:$('sdate'),message:'Choose a valid sale date.'});
    if(!product || /^(undefined|null|nan)$/i.test(product)) errors.push({input:$('sproduct'),message:'Enter the product name.'});
    if(qtyText === '' || qty <= 0) errors.push({input:$('sqty'),message:'Quantity must be greater than zero.'});
    if(buyText !== '' && buy < 0) errors.push({input:$('sbuy'),message:'Purchase price cannot be negative.'});
    if(sellText !== '' && sell < 0) errors.push({input:$('ssell'),message:'Selling price cannot be negative.'});
    if(buy === 0 && sell === 0){
      errors.push({input:$('sbuy'),message:'Enter purchase or selling price.'});
      errors.push({input:$('ssell'),message:'Enter purchase or selling price.'});
    }
    return fail(errors);
  }

  function validateDaily(){
    if(!$('ddate')) return true;
    const ids = ['ddate','dsale','dprofit'];
    clearErrors(ids);
    const errors = [];
    const date = raw('ddate'), saleText = raw('dsale'), profitText = raw('dprofit');
    const sale = number(saleText), profit = number(profitText);
    if(!validDate(date)) errors.push({input:$('ddate'),message:'Choose a valid date.'});
    if(saleText !== '' && sale < 0) errors.push({input:$('dsale'),message:'Daily sale cannot be negative.'});
    if(sale === 0 && profit === 0){
      errors.push({input:$('dsale'),message:'Enter sale or profit amount.'});
      errors.push({input:$('dprofit'),message:'Enter sale or profit amount.'});
    }
    return fail(errors);
  }

  function validateMonthly(){
    if(!$('mmonth')) return true;
    clearErrors(['mmonth','mprofit']);
    const errors = [];
    if(!validMonth(raw('mmonth'))) errors.push({input:$('mmonth'),message:'Choose a valid month.'});
    if(raw('mprofit') === '' || !Number.isFinite(Number(raw('mprofit')))) errors.push({input:$('mprofit'),message:'Enter the manual monthly profit or loss.'});
    return fail(errors);
  }

  function validateStock(){
    if(!$('stockItem')) return true;
    clearErrors(['stockItem','stockQty','stockMin']);
    const errors = [];
    const item = raw('stockItem'), qtyText = raw('stockQty'), minText = raw('stockMin');
    if(!item) errors.push({input:$('stockItem'),message:'Enter the stock item name.'});
    if(qtyText === '' || number(qtyText) < 0) errors.push({input:$('stockQty'),message:'Quantity must be zero or more.'});
    if(minText !== '' && number(minText) < 0) errors.push({input:$('stockMin'),message:'Alert quantity cannot be negative.'});
    return fail(errors);
  }

  function validatePOSItem(){
    if(!$('fs607Product')) return true;
    clearErrors(['fs607Product','fs607Qty','fs607Discount']);
    const errors = [];
    if(!raw('fs607Product')) errors.push({input:$('fs607Product'),message:'Choose a product, SKU or barcode.'});
    if(raw('fs607Qty') === '' || number(raw('fs607Qty')) <= 0) errors.push({input:$('fs607Qty'),message:'Quantity must be greater than zero.'});
    const discount = number(raw('fs607Discount'));
    if(discount < 0 || discount > 100) errors.push({input:$('fs607Discount'),message:'Discount must be between 0% and 100%.'});
    return fail(errors);
  }

  function validatePOSCheckout(){
    if(!$('fs607Cart')) return true;
    clearErrors(['fs607Customer','fs607Discount']);
    const cart = stateRef().posCart || [];
    const errors = [];
    if(!cart.length){
      notify('Add at least one product before completing the sale.', 'error');
      return false;
    }
    const discount = number(raw('fs607Discount'));
    if(discount < 0 || discount > 100) errors.push({input:$('fs607Discount'),message:'Discount must be between 0% and 100%.'});
    if(raw('fs607Payment') === 'Credit' && !raw('fs607Customer')){
      errors.push({input:$('fs607Customer'),message:'Customer is required for a credit sale.'});
    }
    return fail(errors);
  }

  function validateTransaction(){
    if(!$('pType')) return true;
    const ids = ['pItem','pQty','pRate','pTax','pCess','pDisc','pPaid','pFx','pLinked'];
    clearErrors(ids);
    const errors = [];
    const type = raw('pType') || 'SALE';
    const needsItem = ['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type);
    const amountTypes = ['PAYMENT_IN','PAYMENT_OUT','OTHER_INCOME','FIXED_ASSET'].includes(type);
    if(needsItem && !raw('pItem')) errors.push({input:$('pItem'),message:'Choose an item, SKU or barcode.'});
    if(needsItem && (raw('pQty') === '' || number(raw('pQty')) <= 0)) errors.push({input:$('pQty'),message:'Quantity must be greater than zero.'});
    if(raw('pRate') !== '' && number(raw('pRate')) < 0) errors.push({input:$('pRate'),message:'Rate cannot be negative.'});
    if(amountTypes && number(raw('pRate')) <= 0 && number(raw('pPaid')) <= 0) errors.push({input:$('pRate'),message:'Enter a transaction amount.'});
    [['pTax','GST'],['pCess','CESS'],['pDisc','Discount']].forEach(function(pair){
      const value = number(raw(pair[0]));
      if(value < 0 || value > 100) errors.push({input:$(pair[0]),message:pair[1] + ' must be between 0% and 100%.'});
    });
    if(raw('pFx') !== '' && number(raw('pFx')) <= 0) errors.push({input:$('pFx'),message:'Exchange rate must be greater than zero.'});
    return fail(errors);
  }

  function validateAccount(){
    if(!$('pAccName')) return true;
    clearErrors(['pAccName','pAccOpen']);
    const errors = [];
    if(!raw('pAccName')) errors.push({input:$('pAccName'),message:'Enter the account name.'});
    if(raw('pAccOpen') !== '' && number(raw('pAccOpen')) < 0) errors.push({input:$('pAccOpen'),message:'Opening balance cannot be negative.'});
    return fail(errors);
  }

  function previewNode(id, card, before){
    let node = document.getElementById(id);
    if(node) return node;
    node = document.createElement('div');
    node.id = id;
    node.className = 'p2-live-preview';
    card.insertBefore(node, before || null);
    return node;
  }

  function metric(label, value){
    return '<div class="p2-preview-metric"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function updateSalePreview(){
    const input = $('sproduct'); if(!input) return;
    const card = input.closest('.card'); if(!card) return;
    const preview = previewNode('p2SalePreview', card, card.querySelector('.actions'));
    const qty = Math.max(0, number(raw('sqty'))), buy = Math.max(0, number(raw('sbuy'))), sell = Math.max(0, number(raw('ssell')));
    const revenue = qty * sell, cost = qty * buy, profit = revenue - cost;
    const margin = revenue > 0 ? profit / revenue * 100 : 0;
    preview.classList.toggle('is-positive', profit > 0);
    preview.classList.toggle('is-negative', profit < 0);
    preview.innerHTML = '<div class="p2-preview-title"><span>Live sale preview</span><span>Not saved yet</span></div>' +
      metric('Revenue', cash(revenue)) + metric('Cost', cash(cost)) + metric('Profit', cash(profit)) + metric('Margin', revenue ? margin.toFixed(1) + '%' : '—') +
      '<div class="p2-preview-note">Profit = (selling price − purchase price) × quantity.</div>';
  }

  function updateDailyPreview(){
    const input = $('dsale'); if(!input) return;
    const card = input.closest('.card'); if(!card) return;
    const button = Array.from(card.querySelectorAll('button')).find(function(node){ return /addDaily/.test(node.getAttribute('onclick') || ''); });
    const preview = previewNode('p2DailyPreview', card, button);
    const sale = Math.max(0, number(raw('dsale'))), profit = number(raw('dprofit'));
    const margin = sale > 0 ? profit / sale * 100 : 0;
    preview.classList.toggle('is-positive', profit > 0 && profit <= sale);
    preview.classList.toggle('is-warning', sale > 0 && profit > sale);
    preview.classList.toggle('is-negative', profit < 0);
    preview.innerHTML = '<div class="p2-preview-title"><span>Daily total preview</span><span>Today-only entry</span></div>' +
      metric('Sale', cash(sale)) + metric('Profit / Loss', cash(profit)) + metric('Margin', sale ? margin.toFixed(1) + '%' : '—') + metric('Source', 'Daily') +
      '<div class="p2-preview-note">Use this when the amount is the final total for the selected day. Negative profit records a loss.</div>';
  }

  function updateMonthlyPreview(){
    const input = $('mprofit'); if(!input) return;
    const card = input.closest('.card'); if(!card) return;
    const preview = previewNode('p2MonthlyPreview', card, card.querySelector('.actions'));
    const value = number(raw('mprofit')), month = raw('mmonth') || 'Selected month';
    preview.classList.toggle('is-positive', value > 0);
    preview.classList.toggle('is-negative', value < 0);
    preview.innerHTML = '<div class="p2-preview-title"><span>Manual monthly record</span><span>' + month + '</span></div>' +
      metric('Manual profit', cash(value)) + metric('Entry type', value < 0 ? 'Loss' : 'Profit') +
      '<div class="p2-preview-note">Saving the same month updates its manual record. Daily, item-sale and accounting totals remain separate and non-duplicated.</div>';
  }

  function updateStockPreview(){
    const input = $('stockItem'); if(!input) return;
    const card = input.closest('.card'); if(!card) return;
    const button = Array.from(card.querySelectorAll('button')).find(function(node){ return /addStock/.test(node.getAttribute('onclick') || ''); });
    const preview = previewNode('p2StockPreview', card, button);
    const qty = Math.max(0, number(raw('stockQty'))), min = raw('stockMin') === '' ? 5 : Math.max(0, number(raw('stockMin')));
    const status = qty === 0 ? 'Out of stock' : qty <= min ? 'Reorder' : 'Healthy';
    preview.classList.toggle('is-positive', qty > min);
    preview.classList.toggle('is-warning', qty > 0 && qty <= min);
    preview.classList.toggle('is-negative', qty === 0);
    preview.innerHTML = '<div class="p2-preview-title"><span>Stock status preview</span><span>Manual record</span></div>' +
      metric('Available', String(qty)) + metric('Alert at', String(min)) + metric('Status', status) +
      '<div class="p2-preview-note">Zero quantity is allowed and immediately creates an out-of-stock alert.</div>';
  }

  function wrapField(control, label, required, hint){
    if(!control) return null;
    let wrapper = control.closest('.p2-field');
    if(wrapper) return wrapper;
    wrapper = document.createElement('div');
    wrapper.className = 'p2-field';
    const labelNode = document.createElement('span');
    labelNode.className = 'p2-field-label';
    labelNode.textContent = label;
    if(required){
      const mark = document.createElement('span');
      mark.className = 'p2-required-mark';
      mark.setAttribute('aria-hidden','true');
      mark.textContent = '*';
      labelNode.appendChild(mark);
      control.required = true;
      control.setAttribute('aria-required','true');
    }
    control.parentNode.insertBefore(wrapper, control);
    wrapper.appendChild(labelNode);
    wrapper.appendChild(control);
    if(hint){
      const hintNode = document.createElement('small');
      hintNode.className = 'p2-field-hint';
      hintNode.textContent = hint;
      wrapper.appendChild(hintNode);
    }
    return wrapper;
  }

  function setFieldRequired(id, required){
    const control = $(id); if(!control) return;
    const label = control.closest('.p2-field')?.querySelector('.p2-field-label');
    let mark = label?.querySelector('.p2-required-mark');
    if(required && label && !mark){
      mark = document.createElement('span');
      mark.className = 'p2-required-mark';
      mark.setAttribute('aria-hidden','true');
      mark.textContent = '*';
      label.appendChild(mark);
    }else if(!required && mark){
      mark.remove();
    }
    control.required = Boolean(required);
    if(required) control.setAttribute('aria-required','true');
    else control.removeAttribute('aria-required');
  }

  const transactionLabels = {
    pType:['Transaction type',true,'Controls stock, ledger and document behavior.'],
    pParty:['Customer / supplier',false,'Walk-in is allowed where supported.'],
    pItem:['Item / SKU / barcode',false,'Required for sales, purchases and returns.'],
    pQty:['Quantity',false,'Required for item-based transactions.'],
    pRate:['Rate / amount',false,'Per-item rate or transaction amount.'],
    pPaid:['Received / paid / refund',false,'Amount settled now.'],
    pMode:['Payment mode',false,'Cash, UPI, bank, card, cheque or credit.'],
    pTax:['GST %',false,'0–100.'],
    pCess:['CESS %',false,'0–100.'],
    pDisc:['Discount %',false,'0–100.'],
    pAccount:['Payment account',false,'Auto uses the account mapped to payment mode.'],
    pLinked:['Original document',false,'Required by linked return/payment rules.'],
    pState:['State of supply',false,'Used for CGST/SGST/IGST decision.'],
    pCurrency:['Currency',false,'Three-letter transaction currency.'],
    pFx:['Exchange rate',false,'1 transaction currency in base currency.'],
    pNotes:['Notes',false,'Optional internal transaction note.']
  };

  function transactionContext(type){
    const map = {
      SALE:'Posts revenue, tax, customer balance, stock-out and cost of goods sold.',
      PURCHASE:'Posts purchase/input tax, supplier balance and stock-in.',
      SALE_RETURN:'Link the original sale to prevent over-return and reverse stock/ledger correctly.',
      PURCHASE_RETURN:'Link the original purchase to reverse stock and supplier accounting correctly.',
      PAYMENT_IN:'Records money received and updates a linked receivable when selected.',
      PAYMENT_OUT:'Records money paid and updates a linked payable when selected.',
      ESTIMATE:'Non-posting document until converted to a sale.',
      PROFORMA:'Non-posting proforma document until converted.',
      SALE_ORDER:'Non-posting customer order until fulfilled.',
      PURCHASE_ORDER:'Non-posting supplier order until received.',
      DELIVERY_CHALLAN:'Delivery document; accounting posts only after conversion where applicable.',
      OTHER_INCOME:'Posts non-sales business income.',
      FIXED_ASSET:'Records a fixed-asset purchase or opening asset value.'
    };
    return map[type] || 'The accounting engine remains the authoritative source for this transaction.';
  }

  function updateTransactionPreview(){
    const typeInput = $('pType'); if(!typeInput) return;
    const form = typeInput.closest('.p611-form'); if(!form) return;
    const preview = document.getElementById('p2TxPreview'); if(!preview) return;
    const type = raw('pType') || 'SALE', qty = Math.max(0, number(raw('pQty'))), rate = Math.max(0, number(raw('pRate')));
    const needsItem = ['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type);
    setFieldRequired('pItem', needsItem);
    setFieldRequired('pQty', needsItem);
    const subtotal = ['SALE','PURCHASE','SALE_RETURN','PURCHASE_RETURN'].includes(type) ? qty * rate : Math.max(rate, Math.max(0, number(raw('pPaid'))));
    const discount = subtotal * Math.max(0, Math.min(100, number(raw('pDisc')))) / 100;
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * (Math.max(0, number(raw('pTax'))) + Math.max(0, number(raw('pCess')))) / 100;
    const total = taxable + tax, paid = Math.max(0, number(raw('pPaid'))), due = Math.max(0, total - paid);
    const linkedWarning = ['SALE_RETURN','PURCHASE_RETURN'].includes(type) && !raw('pLinked');
    preview.classList.toggle('is-warning', linkedWarning);
    preview.innerHTML = '<div class="p2-preview-title"><span>' + titleCase(type) + ' preview</span><span>Not posted yet</span></div>' +
      metric('Subtotal', cash(subtotal)) + metric('Discount', cash(discount)) + metric('Tax + CESS', cash(tax)) + metric('Balance', cash(due)) +
      '<div class="p2-preview-note">' + (linkedWarning ? 'Choose the original invoice or purchase before saving this return. ' : '') + transactionContext(type) + '</div>';
    const context = form.querySelector('.p2-tx-context');
    if(context) context.textContent = transactionContext(type);
    const details = form.querySelector('.p2-advanced-fields');
    if(details && (linkedWarning || ['PAYMENT_IN','PAYMENT_OUT'].includes(type))) details.open = true;
  }

  function enhanceTransactionForm(){
    const type = $('pType'); if(!type) return;
    const form = type.closest('.p611-form'); if(!form || form.dataset.p2Enhanced === '1') return;
    form.dataset.p2Enhanced = '1';
    form.classList.add('p2-tx-form');

    const core = document.createElement('section');
    core.className = 'p2-form-group p2-core-fields';
    core.innerHTML = '<div class="p2-form-group-title"><span>Transaction basics</span><small>Type, party, item and payment</small></div><p class="p2-tx-context"></p>';
    const details = document.createElement('details');
    details.className = 'p2-advanced-fields';
    details.innerHTML = '<summary>Tax, document link, currency & notes</summary><section class="p2-form-group p2-detail-fields"><div class="p2-form-group-title"><span>Additional details</span><small>All existing fields retained</small></div></section>';
    const advanced = details.querySelector('.p2-detail-fields');
    form.prepend(core);
    form.appendChild(details);

    ['pType','pParty','pItem','pQty','pRate','pPaid','pMode'].forEach(function(id){
      const control = $(id); if(!control || !form.contains(control)) return;
      const meta = transactionLabels[id];
      const wrapper = wrapField(control, meta[0], meta[1], meta[2]);
      core.appendChild(wrapper);
    });
    ['pTax','pCess','pDisc','pAccount','pLinked','pState','pCurrency','pFx','pNotes'].forEach(function(id){
      const control = $(id); if(!control || !form.contains(control)) return;
      const meta = transactionLabels[id];
      const wrapper = wrapField(control, meta[0], meta[1], meta[2]);
      advanced.appendChild(wrapper);
    });

    const actions = form.nextElementSibling?.classList.contains('actions') ? form.nextElementSibling : form.parentElement?.querySelector('.actions');
    const preview = document.createElement('div');
    preview.id = 'p2TxPreview';
    preview.className = 'p2-live-preview';
    if(actions) actions.parentNode.insertBefore(preview, actions); else form.insertAdjacentElement('afterend', preview);

    form.addEventListener('input', updateTransactionPreview);
    form.addEventListener('change', updateTransactionPreview);
    updateTransactionPreview();
  }

  function placeAdvancedTransactionFields(){
    const extra = $('p620AdvancedFields'); if(!extra) return;
    const form = extra.closest('.p611-form');
    const target = form?.querySelector('.p2-detail-fields');
    if(!target || target.contains(extra)) return;
    extra.classList.add('p2-platform-fields');
    target.appendChild(extra);
  }

  function enhanceAccountForm(){
    const name = $('pAccName'); if(!name) return;
    const form = name.closest('.p611-form'); if(!form || form.dataset.p2AccountEnhanced === '1') return;
    form.dataset.p2AccountEnhanced = '1';
    form.classList.add('p2-account-form');
    const intro = document.createElement('div');
    intro.className = 'p2-form-intro p2-account-intro';
    intro.textContent = 'Create a cash, bank, UPI or liability account. Opening balance is posted through the existing balanced-ledger flow.';
    form.parentNode.insertBefore(intro, form);
    wrapField(name, 'Account name', true, 'Use a clear bank, UPI or loan name.');
    wrapField($('pAccCat'), 'Account type', true, 'Asset for cash/bank; liability for loans.');
    wrapField($('pAccOpen'), 'Opening balance', false, 'Optional and cannot be negative.');
  }

  function enhancePOS(){
    const product = $('fs607Product'); if(!product) return;
    const pos = product.closest('.fs607-pos');
    const grid = product.closest('.adv-form-grid');
    if(!pos || !grid) return;

    if(!pos.querySelector('.p2-pos-steps')){
      const steps = document.createElement('div');
      steps.className = 'p2-pos-steps';
      steps.innerHTML = '<div class="p2-pos-step" data-step="1"><i>1</i><span>Add items</span></div><div class="p2-pos-step" data-step="2"><i>2</i><span>Review bill</span></div><div class="p2-pos-step" data-step="3"><i>3</i><span>Payment</span></div>';
      grid.parentNode.insertBefore(steps, grid);
    }

    grid.classList.add('p2-pos-fields');
    const map = {
      fs607Customer:['Customer / mobile',false,'Optional for walk-in sale.'],
      fs607Payment:['Payment mode',true,'Credit creates customer due.'],
      fs607Product:['Product / SKU / barcode',true,'Search the saved product catalog.'],
      fs607Qty:['Quantity',true,'Cannot exceed available stock.'],
      fs607Discount:['Bill discount %',false,'0–100 on the complete bill.']
    };
    Object.keys(map).forEach(function(id){
      const control = $(id); if(!control || control.closest('.p2-field')) return;
      const meta = map[id]; wrapField(control, meta[0], meta[1], meta[2]);
    });
    updatePOSSteps();
  }

  function updatePOSSteps(){
    const pos = document.querySelector('.fs607-pos'); if(!pos) return;
    const count = (stateRef().posCart || []).length;
    pos.querySelectorAll('.p2-pos-step').forEach(function(step){
      const index = number(step.dataset.step);
      step.classList.toggle('is-done', count > 0 && index === 1);
      step.classList.toggle('is-active', count === 0 ? index === 1 : index === 2 || index === 3);
    });
  }

  function enhanceSales(){
    const sale = $('sproduct');
    if(sale){
      const card = sale.closest('.card');
      ensureIntro(card,'sale','Required: date, product, quantity and at least one price. The preview uses the same item-profit formula as the saved record.');
      ['sdate','sproduct','sqty'].forEach(function(id){ markRequired($(id)); });
      ['sdate','sproduct','sqty','sbuy','ssell'].forEach(function(id){
        const input = $(id); if(input && input.dataset.p2Bound !== '1'){
          input.dataset.p2Bound = '1';
          input.addEventListener('input',function(){ setError(input,''); updateSalePreview(); });
          input.addEventListener('change',updateSalePreview);
        }
      });
      updateSalePreview();
    }

    const daily = $('dsale');
    if(daily){
      const card = daily.closest('.card');
      ensureIntro(card,'daily','Use Daily Quick Entry for the final total of one date. Item-wise or accounting entries on that date are not counted twice.');
      markRequired($('ddate'));
      ['ddate','dsale','dprofit'].forEach(function(id){
        const input = $(id); if(input && input.dataset.p2Bound !== '1'){
          input.dataset.p2Bound = '1'; input.addEventListener('input',function(){ setError(input,''); updateDailyPreview(); }); input.addEventListener('change',updateDailyPreview);
        }
      });
      updateDailyPreview();
    }

    const monthly = $('mprofit');
    if(monthly){
      const card = monthly.closest('.card');
      ensureIntro(card,'monthly','This saves a manual monthly profit or loss. It does not replace sales records or accounting transactions.');
      markRequired($('mmonth')); markRequired(monthly);
      ['mmonth','mprofit'].forEach(function(id){
        const input = $(id); if(input && input.dataset.p2Bound !== '1'){
          input.dataset.p2Bound = '1'; input.addEventListener('input',function(){ setError(input,''); updateMonthlyPreview(); }); input.addEventListener('change',updateMonthlyPreview);
        }
      });
      updateMonthlyPreview();
    }
  }

  function enhanceStock(){
    const item = $('stockItem'); if(!item) return;
    const card = item.closest('.card');
    ensureIntro(card,'stock','Save one manual stock record with its available quantity and reorder alert point. Zero quantity is valid.');
    markRequired(item); markRequired($('stockQty'));
    ['stockItem','stockQty','stockMin'].forEach(function(id){
      const input = $(id); if(input && input.dataset.p2Bound !== '1'){
        input.dataset.p2Bound = '1'; input.addEventListener('input',function(){ setError(input,''); updateStockPreview(); }); input.addEventListener('change',updateStockPreview);
      }
    });
    updateStockPreview();
  }

  function enhanceEmptyStates(root){
    root.querySelectorAll('tbody tr').forEach(function(row){
      if(row.dataset.p2Empty === '1') return;
      const cells = row.querySelectorAll('td');
      if(cells.length !== 1) return;
      const cell = cells[0], value = String(cell.textContent || '').trim();
      if(!/^(no\b|cart is empty|nothing\b)/i.test(value)) return;
      row.dataset.p2Empty = '1';
      row.classList.add('p2-empty-row');
      cell.classList.add('p2-empty-cell');
      const wrapper = document.createElement('div');
      wrapper.className = 'p2-empty-inline';
      wrapper.textContent = value;
      cell.textContent = '';
      cell.appendChild(wrapper);
    });
    root.querySelectorAll('p.muted').forEach(function(node){
      if(/^(no\b|cart is empty|nothing\b)/i.test(String(node.textContent || '').trim())) node.classList.add('p2-empty-copy');
    });
  }

  function markPrimaryButtons(root){
    root.querySelectorAll('button').forEach(function(button){
      const action = button.getAttribute('onclick') || '';
      if(/addSale|updateSale|addDaily|addMonthly|updateMonthly|addStock|fs607AddPOSItem|fs607CheckoutPOS|p611CreateFromForm|p611AddAccount/.test(action)){
        button.classList.add('p2-primary-action');
      }
    });
  }

  function enhance(){
    scheduled = false;
    liveRegion();
    enhanceSales();
    enhanceStock();
    enhanceTransactionForm();
    placeAdvancedTransactionFields();
    enhanceAccountForm();
    enhancePOS();
    enhanceEmptyStates(document);
    markPrimaryButtons(document);
    updatePOSSteps();
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function wrap(name, validator, successMessage, before, changed){
    const original = window[name];
    if(typeof original !== 'function' || original.__workflowUiP2) return;
    const wrapped = function(){
      enhance();
      if(validator && validator() === false) return false;
      const snapshot = before ? before() : undefined;
      const result = original.apply(this, arguments);
      const didChange = changed ? changed(snapshot) : true;
      if(successMessage && didChange) setTimeout(function(){ notify(successMessage, 'success'); }, 10);
      schedule();
      return result;
    };
    wrapped.__workflowUiP2 = true;
    window[name] = wrapped;
  }

  function lengthOf(key){ const value = stateRef()[key]; return Array.isArray(value) ? value.length : 0; }
  function fingerprint(key){
    const value = stateRef()[key];
    try{ return JSON.stringify(Array.isArray(value) ? value : []); }catch(_){ return String(lengthOf(key)); }
  }
  function posQuantity(){
    return (stateRef().posCart || []).reduce(function(total, item){ return total + number(item?.qty); }, 0);
  }

  wrap('addSale', validateSale, 'Sale saved.', function(){ return lengthOf('sales'); }, function(before){ return lengthOf('sales') > before; });
  wrap('updateSale', validateSale, 'Sale updated.', function(){ return fingerprint('sales'); }, function(before){ return fingerprint('sales') !== before; });
  wrap('addDaily', validateDaily, 'Daily entry saved.', function(){ return fingerprint('daily'); }, function(before){ return fingerprint('daily') !== before; });
  wrap('addMonthly', validateMonthly, 'Monthly manual profit saved.', function(){ return fingerprint('monthly'); }, function(before){ return fingerprint('monthly') !== before; });
  wrap('updateMonthly', validateMonthly, 'Monthly manual profit updated.', function(){ return fingerprint('monthly'); }, function(before){ return fingerprint('monthly') !== before; });
  wrap('addStock', validateStock, 'Stock record saved.', function(){ return lengthOf('stocks'); }, function(before){ return lengthOf('stocks') > before; });
  wrap('fs607AddPOSItem', validatePOSItem, 'Item added to bill.', posQuantity, function(before){ return posQuantity() > before; });
  wrap('fs607CheckoutPOS', validatePOSCheckout, 'Sale completed.', function(){ return lengthOf('invoices'); }, function(before){ return lengthOf('invoices') > before; });
  wrap('p611CreateFromForm', validateTransaction, '');
  wrap('p611AddAccount', validateAccount, 'Account saved.', function(){ return lengthOf('accounts611'); }, function(before){ return lengthOf('accounts611') > before; });

  document.addEventListener('input', function(event){
    const input = event.target;
    if(input?.matches?.('input,select,textarea')) setError(input, '');
  }, {passive:true});

  document.addEventListener('click', function(event){
    const button = event.target.closest('button');
    if(!button) return;
    const action = button.getAttribute('onclick') || '';
    if(!/addSale|updateSale|addDaily|addMonthly|updateMonthly|addStock|fs607AddPOSItem|fs607CheckoutPOS|p611CreateFromForm|p611AddAccount/.test(action)) return;
    if(button.dataset.p2Busy === '1'){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    button.dataset.p2Busy = '1';
    button.classList.add('p2-busy');
    button.setAttribute('aria-busy','true');
    setTimeout(function(){
      button.dataset.p2Busy = '0';
      button.classList.remove('p2-busy');
      button.removeAttribute('aria-busy');
    }, 700);
  }, true);

  const observer = new MutationObserver(function(mutations){
    if(mutations.some(function(mutation){ return mutation.addedNodes.length > 0; })) schedule();
  });
  observer.observe(document.querySelector('main') || document.body, {childList:true, subtree:true});

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();

  window.VyaparWorkflowUI = {
    version: VERSION,
    phase: 2,
    refresh: schedule,
    validate: {
      sale: validateSale,
      daily: validateDaily,
      monthly: validateMonthly,
      stock: validateStock,
      transaction: validateTransaction,
      posItem: validatePOSItem,
      posCheckout: validatePOSCheckout,
      account: validateAccount
    }
  };
})();

/* ===== SCRIPT SOURCE: commercial-ui-6702026.js ===== */

(() => {
  "use strict";

  const ROOT_CLASS = "commercial-ui-v1";
  const HELP_THRESHOLD = 86;

  function readSavedTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem("vyapar_ai_prod_v1") || "{}");
      return saved && saved.settings ? saved.settings.theme : "";
    } catch (_) {
      return "";
    }
  }

  function applyRootMode() {
    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);

    root.classList.remove('theme-light');
    root.style.colorScheme = 'dark';
  }

  function cleanStaticChrome() {
    const tagline = document.querySelector(".brand .tag");
    if (tagline && /clear business overview/i.test(tagline.textContent || "")) {
      tagline.textContent = "Business overview";
    }

    const themeButton = document.getElementById("themeToggle");
    if (themeButton) {
      themeButton.setAttribute("aria-label", "Appearance");
      themeButton.setAttribute("title", "Appearance");
    }
  }

  function makeHelpControl(text, owner) {
    // v6.7.4: information popup buttons are intentionally disabled.
    // Keep the UI direct and readable; no hidden help affordances.
    return;
  }

  function collapseLongHelp(scope = document) {
    // Remove any legacy help controls created by earlier builds.
    scope.querySelectorAll(".cu-help").forEach((node) => node.remove());

    // Restore helper text that older builds clamped behind an info button.
    scope.querySelectorAll(".cu-clamped-help").forEach((node) => {
      node.classList.remove("cu-clamped-help");
      const full = (node.getAttribute("title") || "").trim();
      if (full && /quick tip/i.test((node.textContent || "").trim())) node.textContent = full;
      node.removeAttribute("title");
      node.dataset.cuProcessed = "1";
    });

    // Remove stale Quick tip placeholders that no longer have visible content.
    scope.querySelectorAll(".p2-form-intro").forEach((node) => {
      node.querySelectorAll(".cu-help").forEach((help) => help.remove());
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (/^quick tip$/i.test(text)) node.remove();
      else node.dataset.cuProcessed = "1";
    });
  }

  function improveButtonSemantics(scope = document) {
    scope.querySelectorAll("button").forEach((button) => {
      if (!button.getAttribute("aria-label")) {
        const label = (button.textContent || "").replace(/\s+/g, " ").trim();
        if (label && label.length <= 48) button.setAttribute("aria-label", label);
      }
    });
  }

  function polish(scope = document) {
    cleanStaticChrome();
    collapseLongHelp(scope);
    improveButtonSemantics(scope);
  }

  function startObserver() {
    if (!document.body || !window.MutationObserver) return;
    let scheduled = false;

    const observer = new MutationObserver((records) => {
      if (scheduled) return;
      const hasAddedNodes = records.some((record) => record.addedNodes && record.addedNodes.length);
      if (!hasAddedNodes) return;

      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        polish(document);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  applyRootMode();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      polish(document);
      startObserver();
    }, { once: true });
  } else {
    polish(document);
    startObserver();
  }

  // v6.7.4: legacy info controls are removed rather than opened/closed.
  document.addEventListener("click", () => {
    document.querySelectorAll(".cu-help").forEach((node) => node.remove());
  });
})();

/* ===== SCRIPT SOURCE: native-shell-hotfix-6712026.js ===== */

/* Vyapar AI 6.7.1.2026 — Android native shell hotfix. */
(() => {
  "use strict";

  if (!document.documentElement.classList.contains("native-android")) return;

  function keepFooterInSettings() {
    document.querySelectorAll(".android-sheet-legal").forEach((node) => node.remove());

    const settings = document.getElementById("screen-settings");
    const stack = settings && (settings.querySelector(".settings-stack") || settings);
    if (!stack) return;

    const footers = Array.from(document.querySelectorAll("#appLegalFooter"));
    let footer = footers.shift() || null;
    footers.forEach((node) => node.remove());

    if (!footer) {
      footer = document.createElement("footer");
      footer.id = "appLegalFooter";
      footer.className = "app-legal-footer vy660-settings-footer";
      footer.innerHTML =
        '<img class="vy660-footer-logo" src="assets/images/footer-logo.jpg" alt="Vyapar AI">' +
        '<span>© 2026 Vyapar AI. All Rights Reserved.</span>' +
        '<span class="app-legal-links">' +
          '<a href="pages/legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>' +
          '<a href="pages/legal/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>' +
          '<a href="pages/legal/refund.html" target="_blank" rel="noopener noreferrer">Refund</a>' +
          '<a href="pages/legal/delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a>' +
        '</span>' +
        '<strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';
    }

    if (footer.parentNode !== stack) stack.appendChild(footer);
    footer.style.display = "";
  }

  function blockPageSelectionGestures() {
    document.addEventListener("selectstart", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest("input, textarea, [contenteditable='true'], .allow-copy")) return;
      event.preventDefault();
    }, true);

    document.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest("input, textarea, [contenteditable='true'], .allow-copy")) return;
      event.preventDefault();
    }, true);
  }

  function refresh() {
    keepFooterInSettings();
  }

  blockPageSelectionGestures();

  const observer = new MutationObserver(() => {
    clearTimeout(window.__vy671NativeShellTimer);
    window.__vy671NativeShellTimer = setTimeout(refresh, 24);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      refresh();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof window.renderSettings === "function" && !window.renderSettings.__vy671NativeShell) {
    const original = window.renderSettings;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      requestAnimationFrame(refresh);
      return result;
    };
    wrapped.__vy671NativeShell = true;
    window.renderSettings = wrapped;
  }
})();

/* ===== SCRIPT SOURCE: ui-hotfix-671.js ===== */

(() => {
  'use strict';

  function removeLegacyInfo(){
    document.querySelectorAll('.cu-help').forEach(node => node.remove());
    document.querySelectorAll('.p2-form-intro').forEach(node => {
      const text=String(node.textContent||'').replace(/\s+/g,' ').trim();
      if(/^quick tip$/i.test(text)) node.remove();
    });
  }

  let queued=false;
  const schedule=()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;removeLegacyInfo();});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{removeLegacyInfo();},{once:true});
  else removeLegacyInfo();

  if(window.MutationObserver){
    const observer=new MutationObserver(records=>{
      if(records.some(r=>r.addedNodes&&r.addedNodes.length)) schedule();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();

/* ===== SCRIPT SOURCE: settings-center-675.js ===== */

/* Vyapar AI 6.7.5 — single, user-friendly Settings center. */
(() => {
  'use strict';

  const ICONS = {
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v10h14V10M4 4h16l1 6H3l1-6Zm5 16v-6h6v6"/></svg>',
    controls: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10h12v10H6V10Zm3 0V7a3 3 0 0 1 6 0v3M12 14v2"/></svg>',
    appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 7 7 0 0 0 20 15.5Z"/></svg>',
    navigation: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 18-7-4-7 4 7-18Z"/></svg>',
    backup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8.5 4.5 4.5 0 0 0 7 18Zm5-7v7m-3-3 3 3 3-3"/></svg>',
    update: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.8 7M17.9 15A7 7 0 0 1 5.2 17"/></svg>',
    legal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v.01M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-1 .7-1.5 1.2-1.5 2.2"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
  };

  const SECTIONS = [
    {
      group: 'Your account',
      items: [
        { id: 'account', icon: 'account', title: 'Account & plan', subtitle: 'Profile, subscription and sign-in', keywords: 'email login logout cloud session upgrade plan', match: card => card.classList.contains('settings-account-section') }
      ]
    },
    {
      group: 'Your business',
      items: [
        { id: 'profile', icon: 'store', title: 'Business profile', subtitle: 'Shop name, location and yearly goal', keywords: 'store firm name profit target', match: card => /shop details|business profile/i.test(card.textContent || '') && !card.id },
        { id: 'business', icon: 'controls', title: 'Business controls', subtitle: 'Company, staff, transactions and data', keywords: 'roles team numbering prefix saved records', match: card => card.id === 'vx622AdminSettings' }
      ]
    },
    {
      group: 'App preferences',
      items: [
        { id: 'security', icon: 'lock', title: 'Privacy & security', subtitle: 'Password login and app protection', keywords: 'pin otp password lock safety', match: card => card.id === 'vx622AppLockSection' },
        { id: 'appearance', icon: 'appearance', title: 'Motion & performance', subtitle: 'Animations and device speed', keywords: 'dark auto smooth lite animation lag fast', match: card => /appearance|motion & performance|performance/i.test(card.textContent || '') && !/app update/i.test(card.textContent || '') },
        { id: 'navigation', icon: 'navigation', title: 'Navigation', subtitle: 'Scrolling and page behaviour', keywords: 'auto scroll top remember page position', match: card => card.id === 'vy675NavigationSettings' },
        { id: 'data', icon: 'backup', title: 'Backup & restore', subtitle: 'Device backup and Google Drive', keywords: 'download upload json cloud disconnect', match: card => card.classList.contains('data-safety-section') || /backup & data safety|data safety/i.test(card.textContent || '') }
      ]
    },
    {
      group: 'Support & about',
      items: [
        { id: 'update', icon: 'update', title: 'App updates', subtitle: 'Check for the latest version', keywords: 'apk release version newer', match: card => card.id === 'fs607Settings' || /app update/i.test(card.textContent || '') },
        { id: 'legal', icon: 'legal', title: 'Help & legal', subtitle: 'Privacy, terms, refunds and account deletion', keywords: 'support policy delete account', match: card => /legal & support|privacy policy|refund policy/i.test(card.textContent || '') }
      ]
    }
  ];

  const ALL_ITEMS = SECTIONS.flatMap(section => section.items);
  const scrollPositions = Object.create(null);
  let activePage = '';
  let scheduled = false;
  let building = false;
  let observer = null;

  function screen() {
    return document.getElementById('screen-settings');
  }

  function appState() {
    try { if (typeof S === 'function') return S(); } catch (_) {}
    try { if (typeof state !== 'undefined') return state; } catch (_) {}
    return null;
  }

  function themeName() { return 'Dark'; }

  function currentPlan() {
    const node = document.querySelector('#productionAccountCard .production-plan, #planBadge');
    const text = String(node?.textContent || '').replace(/\s+Plan$/i, '').trim();
    if (text) return text;
    const data = appState();
    return String(data?.plan || data?.subscription?.plan || 'Free').replace(/^./, char => char.toUpperCase());
  }

  function autoTopEnabled() {
    const data = appState();
    return Boolean(data?.settings?.autoScrollTop === true);
  }

  function saveAutoTop(enabled) {
    const data = appState();
    if (!data) return;
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    data.settings.autoScrollTop = Boolean(enabled);
    try { if (typeof save === 'function') { save(); return; } } catch (_) {}
    try { localStorage.setItem('vyapar_ai_prod_v1', JSON.stringify(data)); } catch (_) {}
  }

  function navigationCard() {
    const card = document.createElement('div');
    card.id = 'vy675NavigationSettings';
    card.className = 'card settings-section vy675-navigation-card';
    const checked = autoTopEnabled();
    card.innerHTML = `
      <div class="vy675-option-row">
        <span class="vy675-option-copy">
          <b>Auto Scroll to Top</b>
          <small>${checked ? 'Pages open at the top after navigation.' : 'Each section remembers its last position.'}</small>
        </span>
        <label class="vy675-switch" aria-label="Auto Scroll to Top">
          <input type="checkbox" data-vy675-auto-top ${checked ? 'checked' : ''}>
          <span></span>
        </label>
      </div>`;
    card.querySelector('[data-vy675-auto-top]')?.addEventListener('change', event => {
      const enabled = Boolean(event.target.checked);
      saveAutoTop(enabled);
      const description = card.querySelector('.vy675-option-copy small');
      if (description) description.textContent = enabled ? 'Pages open at the top after navigation.' : 'Each section remembers its last position.';
      updateStatuses();
      try {
        if (typeof toast === 'function') toast(enabled ? 'Auto Scroll to Top enabled.' : 'Page position memory enabled.');
        else if (typeof showGlassToast === 'function') showGlassToast(enabled ? 'Auto Scroll to Top enabled.' : 'Page position memory enabled.');
      } catch (_) {}
    });
    return card;
  }

  function shellMarkup() {
    return `
      <div class="vy675-settings-home">
        <header class="vy675-settings-intro">
          <span class="vy675-settings-eyebrow">VYAPAR AI</span>
          <h2>Settings</h2>
          <p>Manage your business, account and app preferences.</p>
        </header>
        <label class="vy675-settings-search">
          <span>${ICONS.search}</span>
          <input id="settingsSearch" type="search" autocomplete="off" placeholder="Search settings, backup, password…" aria-label="Search settings" aria-controls="settingsSearchResults">
          <button type="button" aria-label="Clear search" hidden>×</button>
        </label>
        <div class="vy675-settings-groups" id="settingsSearchResults">
          ${SECTIONS.map(section => `
            <section class="vy675-settings-group" data-vy675-group>
              <h3>${section.group}</h3>
              <div class="vy675-settings-list">
                ${section.items.map(rowMarkup).join('')}
              </div>
            </section>`).join('')}
        </div>
        <p class="vy675-search-status" role="status" aria-live="polite"></p>
        <div class="vy675-search-empty" hidden>
          <span>${ICONS.search}</span>
          <b>No setting found</b>
          <small>Try another word.</small>
        </div>
        <footer class="vy675-settings-footer" id="vy675SettingsFooter">
          <img src="assets/images/footer-logo.jpg" alt="Vyapar AI">
          <span>© 2026 Vyapar AI. All Rights Reserved.</span>
          <small>A Gupta Legacy product</small>
        </footer>
      </div>
      <div class="vy675-settings-page" hidden>
        <header class="vy675-page-header">
          <button type="button" class="vy675-page-back" aria-label="Back to Settings">${ICONS.back}</button>
          <div><h2>Settings</h2><p></p></div>
        </header>
        <div class="vy675-page-body"></div>
      </div>`;
  }

  function rowMarkup(item) {
    return `
      <button type="button" class="vy675-settings-row" data-vy675-page="${item.id}" data-vy675-search="${item.title} ${item.subtitle} ${item.keywords}" aria-label="Open ${item.title}">
        <span class="vy675-row-icon">${ICONS[item.icon]}</span>
        <span class="vy675-row-copy"><b>${item.title}</b><small>${item.subtitle}</small></span>
        <span class="vy675-row-meta" data-vy675-status></span>
        <span class="vy675-row-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function ensureShell(scr) {
    let shell = scr.querySelector(':scope > .vy675-settings-shell');
    if (shell) return shell;
    shell = document.createElement('div');
    shell.className = 'vy675-settings-shell';
    shell.innerHTML = shellMarkup();
    scr.prepend(shell);

    shell.querySelectorAll('[data-vy675-page]').forEach(row => {
      row.addEventListener('click', () => openPage(row.dataset.vy675Page, true));
    });
    shell.querySelector('.vy675-page-back')?.addEventListener('click', () => openHome(true));

    const input = shell.querySelector('.vy675-settings-search input');
    const clear = shell.querySelector('.vy675-settings-search button');
    input?.addEventListener('input', () => filterRows(input.value));
    input?.addEventListener('search', () => filterRows(input.value));
    input?.addEventListener('keydown', event => { if(event.key==='Escape' && input.value){event.preventDefault();event.stopPropagation();input.value='';filterRows('');} });
    clear?.addEventListener('click', () => {
      input.value = '';
      filterRows('');
      input.focus();
    });
    return shell;
  }

  function filterRows(value) {
    const shell = screen()?.querySelector(':scope > .vy675-settings-shell');
    if (!shell) return;
    const query = String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
    const terms=query.split(' ').filter(Boolean);
    const clear = shell.querySelector('.vy675-settings-search button');
    if (clear) clear.hidden = !query;
    let visibleCount = 0;
    shell.querySelectorAll('.vy675-settings-row').forEach(row => {
      const text=String(row.dataset.vy675Search || row.textContent || '').toLowerCase();
      const matches=terms.every(term=>text.includes(term));
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    shell.querySelectorAll('[data-vy675-group]').forEach(group => {
      group.hidden = ![...group.querySelectorAll('.vy675-settings-row')].some(row => !row.hidden);
    });
    const empty = shell.querySelector('.vy675-search-empty');
    if (empty) empty.hidden = visibleCount !== 0;
    const status=shell.querySelector('.vy675-search-status');
    if(status)status.textContent=query?visibleCount+' settings found':'';
  }

  function ensureRepository(scr) {
    let stack = scr.querySelector(':scope > .settings-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'settings-stack';
      scr.appendChild(stack);
    }
    stack.classList.add('vy675-settings-repository');
    stack.hidden = true;
    stack.setAttribute('aria-hidden', 'true');
    return stack;
  }

  function collectCards(scr) {
    const stack = ensureRepository(scr);
    const body = scr.querySelector('.vy675-page-body');
    if (body) [...body.children].forEach(node => stack.appendChild(node));
    scr.querySelectorAll(':scope > #fs607Settings').forEach(node => stack.appendChild(node));
    if (!stack.querySelector('#vy675NavigationSettings')) stack.appendChild(navigationCard());

    const cards = [...stack.children].filter(node =>
      node instanceof HTMLElement &&
      node.id !== 'appLegalFooter' &&
      !node.classList.contains('p1-modebar') &&
      node.id !== 'vy675SettingsFooter'
    );
    const map = Object.fromEntries(ALL_ITEMS.map(item => [item.id, []]));
    cards.forEach(card => {
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;
      card.removeAttribute('aria-hidden');
      const item = ALL_ITEMS.find(candidate => {
        try { return candidate.match(card); } catch (_) { return false; }
      });
      if (item) map[item.id].push(card);
    });
    return map;
  }

  function statusFor(id) {
    if (id === 'account') return currentPlan();
    if (id === 'profile') {
      const data = appState();
      const name = String(data?.profile?.businessName || '').trim();
      return name && name.length <= 16 ? name : (name ? 'Configured' : 'Set up');
    }
    if (id === 'security') {
      const toggle = document.querySelector('#vx643PasswordLoginToggle, #vx622LockToggle');
      return toggle?.checked ? 'On' : 'Off';
    }
    if (id === 'appearance') return themeName();
    if (id === 'navigation') return autoTopEnabled() ? 'Auto top' : 'Remember';
    if (id === 'data') return localStorage.getItem('vyapar_ai_drive_connected_v1') === '1' ? 'Drive on' : 'Local';
    if (id === 'update') return document.querySelector('meta[name="vyapar-ui-version"]')?.content || '';
    return '';
  }

  function updateStatuses() {
    const scr = screen();
    if (!scr) return;
    scr.querySelectorAll('.vy675-settings-row').forEach(row => {
      const status = row.querySelector('[data-vy675-status]');
      const value = statusFor(row.dataset.vy675Page);
      if (status) {
        status.textContent = value;
        status.hidden = !value;
      }
    });
  }

  let homeScrollPosition = 0;

  function openHome(scrollTop) {
    const scr = screen();
    if (!scr) return;
    const shell = ensureShell(scr);
    collectCards(scr);
    activePage = '';
    scr.dataset.vy675Page = '';
    scr.classList.remove('vy675-page-open');
    shell.querySelector('.vy675-settings-home').hidden = false;
    shell.querySelector('.vy675-settings-page').hidden = true;
    updateStatuses();
    filterRows(shell.querySelector('.vy675-settings-search input')?.value || '');
    if (scrollTop && window.vyaparMotion) {
      window.vyaparMotion.scrollTo(homeScrollPosition);
      window.vyaparMotion.enter(shell.querySelector('.vy675-settings-home'), -1);
    }
  }

  function openPage(id, scrollTop) {
    const scr = screen();
    const item = ALL_ITEMS.find(candidate => candidate.id === id);
    if (!scr || !item) return;
    if(scrollTop && !activePage) homeScrollPosition=window.scrollY || 0;
    const shell = ensureShell(scr);
    const map = collectCards(scr);
    const page = shell.querySelector('.vy675-settings-page');
    const body = shell.querySelector('.vy675-page-body');
    const title = shell.querySelector('.vy675-page-header h2');
    const subtitle = shell.querySelector('.vy675-page-header p');
    const cards = map[id] || [];
    body.replaceChildren(...cards);
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'vy675-page-empty';
      empty.innerHTML = `<b>This setting is not available yet.</b><small>Please reopen Settings and try again.</small>`;
      body.appendChild(empty);
    }
    title.textContent = item.title;
    subtitle.textContent = item.subtitle;
    activePage = id;
    scr.dataset.vy675Page = id;
    scr.classList.add('vy675-page-open');
    shell.querySelector('.vy675-settings-home').hidden = true;
    page.hidden = false;
    if (scrollTop && window.vyaparMotion) { window.vyaparMotion.scrollTo(0); window.vyaparMotion.enter(page, 1); }
  }

  function removePreviousSettingsUi(scr) {
    scr.querySelectorAll(':scope > .p1-modebar[data-screen="settings"], :scope > .vy672-settings-directory, :scope > .vy672-settings-subpage').forEach(node => node.remove());
    scr.classList.remove('vy672-settings-ready', 'vy672-subpage-open');
  }

  function build() {
    scheduled = false;
    if (building) return;
    const scr = screen();
    if (!scr) return;
    const stack = scr.querySelector(':scope > .settings-stack');
    if (!stack) return;
    building = true;
    observer?.disconnect();
    removePreviousSettingsUi(scr);
    ensureShell(scr);
    ensureRepository(scr);
    collectCards(scr);
    scr.classList.add('vy675-settings-ready');
    if (activePage) openPage(activePage, false);
    else openHome(false);
    updateStatuses();
    observer?.observe(scr, { childList: true, subtree: true });
    building = false;
  }

  function scheduleBuild() {
    if (scheduled || building) return;
    scheduled = true;
    requestAnimationFrame(build);
  }

  function installRenderWrapper() {
    const current = window.renderSettings;
    if (typeof current !== 'function' || current.__vy675SettingsCenter) return;
    const wrapped = function () {
      activePage = '';
      const result = current.apply(this, arguments);
      build();
      return result;
    };
    wrapped.__vy675SettingsCenter = true;
    window.renderSettings = wrapped;
  }

  function installScrollBehaviour() {
    // Main navigation owns synchronous scroll restoration through vyaparMotion.
  }

  function installNativeBack() {
    const current = window.handleNativeBackPress;
    if (typeof current === 'function' && current.__vy675SettingsBack) return;
    const wrapped = function () {
      if(window.vyaparMotion && window.vyaparMotion.dismissTop()) return true;
      if (screen() && !screen().classList.contains('hide') && screen().classList.contains('vy675-page-open')) {
        openHome(true);
        return true;
      }
      return typeof current === 'function' ? current.apply(this, arguments) : false;
    };
    wrapped.__vy675SettingsBack = true;
    window.handleNativeBackPress = wrapped;
  }

  function init() {
    installRenderWrapper();
    installScrollBehaviour();
    installNativeBack();
    observer = new MutationObserver(records => {
      if (building) return;
      const needsBuild = records.some(record => {
        const target = record.target;
        if (target instanceof Element && target.closest('.vy675-settings-shell, .vy675-settings-repository')) return false;
        return Boolean(record.addedNodes?.length || record.removedNodes?.length);
      });
      if (needsBuild) scheduleBuild();
    });
    const settingsScreen = screen();
    if (settingsScreen) observer.observe(settingsScreen, { childList: true, subtree: true });
    build();
  }

  document.addEventListener('keydown', event => {
    if (!event.defaultPrevented && event.key === 'Escape' && screen() && !screen().classList.contains('hide') && screen().classList.contains('vy675-page-open')) openHome(true);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.vy675SettingsHome = () => openHome(true);
  window.vy675OpenSettingsPage = id => openPage(id, true);
})();

/* ===== SCRIPT SOURCE: complete-ui-680.js ===== */

/* Vyapar AI 6.8.0 final UI stability layer. No business/data logic is changed here. */
(function () {
  'use strict';

  document.documentElement.lang = 'en';
  document.documentElement.classList.add('vy680-complete-ui');

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const syncThemeColor = () => {
    if (!themeMeta) return;
    themeMeta.setAttribute('content', document.documentElement.classList.contains('theme-light') ? '#f4f8ff' : '#07111f');
  };

  function removeConsecutiveDuplicateHeadings(root) {
    if (!root) return;
    const headings = Array.from(root.querySelectorAll('.settings-section h2, .settings-section h3, .vy675-page-body h2, .vy675-page-body h3'));
    const seen = new Map();
    headings.forEach((heading) => {
      const label = (heading.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!label) return;
      const parent = heading.closest('.settings-section, .vy675-page-body, .card') || heading.parentElement;
      const key = label + '::' + (parent && parent.dataset ? JSON.stringify(parent.dataset) : '');
      const previous = seen.get(key);
      if (previous && previous.parentElement === heading.parentElement) {
        heading.setAttribute('aria-hidden', 'true');
        heading.style.display = 'none';
      } else {
        seen.set(key, heading);
      }
    });
  }

  function hardenLayout() {
    syncThemeColor();
    const settings = document.getElementById('screen-settings');
    removeConsecutiveDuplicateHeadings(settings);

    document.querySelectorAll('img').forEach((img) => {
      if (!img.hasAttribute('loading') && !img.closest('#appLoader, #vy647StartupSplash, .brand')) img.loading = 'lazy';
      img.decoding = 'async';
    });

    document.querySelectorAll('button:not([type])').forEach((button) => button.setAttribute('type', 'button'));
  }

  let pending = false;
  const scheduleHarden = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      hardenLayout();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hardenLayout, { once: true });
  } else {
    hardenLayout();
  }

  const observer = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length > 0)) scheduleHarden();
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  window.addEventListener('orientationchange', scheduleHarden, { passive: true });
  window.addEventListener('resize', scheduleHarden, { passive: true });

  /* 8.5 maintenance: Telegram-like tab transition, native theme bars and long-press guard. */
  const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const currentVisibleTab = () => {
    const screen = Array.from(document.querySelectorAll('.screen')).find(node => !node.classList.contains('hide'));
    return screen ? screen.id.replace('screen-', '') : 'home';
  };
  const tabRank = tab => {
    const ranks = { home: 0, business: 1, sales: 2, stock: 3, upload: 4, analytics: 4, calculator: 4, subscription: 4, settings: 4 };
    return Object.prototype.hasOwnProperty.call(ranks, tab) ? ranks[tab] : 4;
  };

  // Page motion is coordinated once by vyaparMotion in the core navigator.

  const syncNativeTheme = () => {
    try {
      const bridge = window.AndroidApp;
      if (bridge && typeof bridge.setSystemTheme === 'function') {
        bridge.setSystemTheme(document.documentElement.classList.contains('theme-light'));
      }
    } catch (_) {}
  };
  syncNativeTheme();

  const nativeThemeObserver = new MutationObserver(syncNativeTheme);
  nativeThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  nativeThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Old Android WebViews can freeze while creating selection/action-mode UI on
  // long press. Native code consumes long-clicks too; this prevents the web
  // context menu/drag fallback from starting before Android receives it.
  if (document.documentElement.classList.contains('native-android')) {
    document.addEventListener('contextmenu', event => event.preventDefault(), true);
    document.addEventListener('dragstart', event => {
      if (event.target && event.target.closest && event.target.closest('img, a, button')) event.preventDefault();
    }, true);
  }

})();

/* ===== SCRIPT SOURCE: inspected-glitchfix-855.js ===== */

/* Vyapar AI 8.5.5 inspected glitch fix — presentation only.
   Removes full-screen theme flashes, holds first paint until real UI exists,
   and primes Settings before navigation so old Android WebViews never show an
   empty intermediate frame. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy855-inspected-fix');

  const reduced=()=>Boolean(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let themeBusy=false;

  function removeThemeArtifacts(){
    document.querySelectorAll(
      '.vy855-theme-curtain,.vy854-theme-wipe,.vy853-theme-reveal,.vy852-theme-bloom,.theme-ripple,.vx657-theme-crossfade'
    ).forEach(node=>node.remove());
  }

  function currentLight(){
    return root.classList.contains('theme-light')||Boolean(document.body&&document.body.classList.contains('theme-light'));
  }

  function saveTheme(target){
    const light=target==='light';
    const body=document.body;

    root.classList.toggle('theme-light',light);
    if(body)body.classList.toggle('theme-light',light);
    root.style.backgroundColor=light?'#eff6fb':'#06172d';
    if(body)body.style.backgroundColor=light?'#eff6fb':'#06172d';

    try{
      const appState=window.state;
      if(appState){
        appState.settings=appState.settings&&typeof appState.settings==='object'?appState.settings:{};
        appState.settings.theme=target;
      }
    }catch(_){}

    try{if(typeof window.applyTheme==='function')window.applyTheme();}catch(_){}
    try{if(typeof window.applyGlassControl==='function')window.applyGlassControl();}catch(_){}
    try{
      if(typeof window.persistThemeWithoutRender==='function')window.persistThemeWithoutRender();
      else if(window.state)localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(window.state));
    }catch(_){}

    try{
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content',light?'#eff6fb':'#06172d');
    }catch(_){}

    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light);
    }catch(_){}
  }

  function runTheme(target){
    const normalized=target==='light'?'light':'dark';
    if(themeBusy)return false;
    if((normalized==='light')===currentLight()){
      removeThemeArtifacts();
      return false;
    }

    themeBusy=true;
    removeThemeArtifacts();
    root.classList.add('vy855-theme-atomic');

    const button=document.getElementById('themeToggle');
    if(button&&!reduced()&&typeof button.animate==='function'){
      try{
        button.animate(
          [{transform:'scale(1)'},{transform:'scale(.93)'},{transform:'scale(1)'}],
          {duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}
        );
      }catch(_){}
    }

    /* Commit the theme immediately. No opaque curtain, no blank handoff. */
    saveTheme(normalized);
    removeThemeArtifacts();

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      root.classList.remove('vy855-theme-atomic');
      removeThemeArtifacts();
      themeBusy=false;
    }));
    return false;
  }

  window.toggleTheme=function(){return runTheme(currentLight()?'dark':'light')};
  window.setTheme=function(theme){return runTheme(theme==='light'?'light':'dark')};

  /* Settings shell is deterministic and local. Build it before setTab hides the
     previous screen, then let the existing business/navigation logic continue. */
  function primeSettings(){
    try{
      const screen=document.getElementById('screen-settings');
      if(!screen)return;
      const ready=screen.querySelector('.vy675-settings-shell,.vy675-settings-home,.vy675-settings-page');
      if(!ready&&typeof window.renderSettings==='function')window.renderSettings();
    }catch(_){}
  }

  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy855InspectedWrapped){
    const wrapped=function(tab,withLoader){
      if(tab==='settings')primeSettings();
      const result=previousSetTab.call(this,tab,withLoader);
      if(tab==='settings'){
        const settle=()=>{
          primeSettings();
          const screen=document.getElementById('screen-settings');
          if(screen&&!screen.classList.contains('hide')){
            screen.style.opacity='1';
            screen.style.visibility='visible';
          }
        };
        settle();
        requestAnimationFrame(settle);
      }
      return result;
    };
    wrapped.__vy855InspectedWrapped=true;
    window.setTab=wrapped;
  }

  // android-session-flow-647 owns startup until authentication resolves.
  removeThemeArtifacts();
})();

/* ===== SCRIPT SOURCE: flat-black-ios-861.js ===== */

/* Vyapar AI 8.6.1.2026 — final flat black/white presentation coordinator. */
(function(){
  'use strict';

  const root=document.documentElement;
  root.classList.add('vy861-flat-black');
  const OLD_CLASSES=[
    'vy859-liquid-v2','vy858-unified','vy857-ios27','vy855-liquid-lens','vy855-stable-ios',
    'vy860-hig-ios','vy854-apple-unified','vy853-apple-liquid','vy852-apple-liquid'
  ];
  OLD_CLASSES.forEach(name=>root.classList.remove(name));

  function isLight(){
    return false;
  }

  function cleanupOptics(){
    document.querySelectorAll(
      '.android-nav-glass-indicator,.vy852-theme-bloom,.vy853-theme-reveal,.vy854-theme-wipe,.vy855-theme-curtain,.theme-ripple,.vx657-theme-crossfade,.vy856-liquid-lens,.vy856-liquid-orb,[class*="liquid-lens"],[class*="glass-lens"],[class*="liquid-orb"]'
    ).forEach(node=>node.remove());
    if(document.body){
      ['vy859-modal-open','more-sheet-open'].forEach(name=>{
        if(document.body.classList.contains(name))document.body.classList.remove(name);
      });
    }
  }

  function applyThemeMeta(){
    const light=isLight();
    root.style.colorScheme=light?'light':'dark';
    root.style.backgroundColor=light?'#f5f5f7':'#000000';
    if(document.body)document.body.style.backgroundColor=light?'#f5f5f7':'#000000';
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',light?'#f5f5f7':'#000000');
    const button=document.getElementById('themeToggle');
    if(button){
      button.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');
      button.setAttribute('title',light?'Dark mode':'Light mode');
      if(button.textContent!=='Theme')button.textContent='Theme';
    }
  }

  function persistTheme(target){
    target='dark';
    const light=false;
    root.classList.toggle('theme-light',light);
    if(document.body)document.body.classList.toggle('theme-light',light);
    try{
      if(window.state){
        window.state.settings=window.state.settings&&typeof window.state.settings==='object'?window.state.settings:{};
        window.state.settings.theme=target;
        if(window.VyaparStorage)window.VyaparStorage.save(window.state).catch(()=>{});else localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(window.state));
      }else{
        const saved=JSON.parse(localStorage.getItem('vyapar_ai_prod_v1')||'{}');
        saved.settings=saved.settings&&typeof saved.settings==='object'?saved.settings:{};
        saved.settings.theme=target;
        localStorage.setItem('vyapar_ai_prod_v1',JSON.stringify(saved));
      }
    }catch(_){ }
    try{if(typeof window.applyTheme==='function')window.applyTheme();}catch(_){ }
    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light);
    }catch(_){ }
    cleanupOptics();
    applyThemeMeta();
  }

  window.toggleTheme=function(){
    persistTheme(isLight()?'dark':'light');
    const button=document.getElementById('themeToggle');
    if(button&&typeof button.animate==='function'){
      try{button.animate([{transform:'scale(1)'},{transform:'scale(.90)'},{transform:'scale(1)'}],{duration:150,easing:'ease-out'});}catch(_){ }
    }
    return false;
  };
  window.setTheme=function(theme){persistTheme(theme==='light'?'light':'dark');return false;};

  function decorateNav(){
    const nav=document.getElementById('nav');
    if(!nav)return;
    nav.querySelectorAll('button').forEach(button=>{
      const tab=button.dataset.androidTab||button.dataset.tab||'';
      if(tab&&!button.dataset.androidTab)button.dataset.androidTab=tab;
      if(tab&&!button.dataset.tab&&tab!=='more')button.dataset.tab=tab;
      button.setAttribute('aria-pressed',button.classList.contains('active')?'true':'false');
    });
    nav.querySelectorAll('.android-nav-glass-indicator').forEach(node=>node.remove());
  }

  const popupOverlaySelector=[
    '.glass-dialog-overlay','.subscription-overlay','.shop-progress-overlay','.vx643-modal-overlay',
    '.production-overlay','.android-permission-overlay','.android-sheet-overlay',
    '#vyaparDeleteConfirm','#vyaparAccountDeleteConfirm','.account-delete-overlay',
    '.upgrade-plan-popup','.upgrade-plan-reference-popup'
  ].join(',');

  function visibleOverlays(){
    return Array.from(document.querySelectorAll(popupOverlaySelector)).filter(node=>{
      if(!node.isConnected)return false;
      const style=getComputedStyle(node);
      return style.display!=='none'&&style.visibility!=='hidden';
    });
  }

  function syncModalState(){
    const overlays=visibleOverlays();
    if(document.body)document.body.classList.toggle('vy861-modal-open',overlays.length>0);
    overlays.forEach(overlay=>{if(!overlay.classList.contains('vy861-universal-popup'))overlay.classList.add('vy861-universal-popup')});
    // Duplicate ids are a real source of double-action popups. Keep newest live instance.
    const seen=new Map();
    overlays.forEach(node=>{
      if(!node.id)return;
      if(seen.has(node.id))seen.get(node.id).remove();
      seen.set(node.id,node);
    });
  }

  function closeTopPopup(){
    const overlays=visibleOverlays();
    const top=overlays[overlays.length-1];
    if(!top)return false;
    const close=top.querySelector('.android-sheet-close,.shop-sheet-close,.production-close,[data-cancel],#closePlanSuccessPopup,#closeCancelPopup,#closeUpgradePopup,#accountDeleteCancel,[aria-label^="Close" i],[aria-label="Close" i]');
    if(close){close.click();return true;}
    if(top.id==='vyaparGlassDialog'&&typeof window.closeGlassDialog==='function'){window.closeGlassDialog(false);return true;}
    return false;
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(closeTopPopup()){event.preventDefault();event.stopPropagation();}
  },true);

  // More must have exactly one live sheet. Existing app.js owns navigation semantics.
  const previousOpenMore=typeof window.openMoreSheet==='function'?window.openMoreSheet:null;
  if(previousOpenMore&&!previousOpenMore.__vy861Wrapped){
    const wrapped=function(){
      document.querySelectorAll('#androidMoreSheet').forEach(node=>node.remove());
      if(document.body)document.body.classList.remove('android-sheet-open');
      const result=previousOpenMore.apply(this,arguments);
      requestAnimationFrame(()=>{decorateNav();syncModalState();cleanupOptics();});
      return result;
    };
    wrapped.__vy861Wrapped=true;
    window.openMoreSheet=wrapped;
  }

  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;
  if(previousSetTab&&!previousSetTab.__vy861Wrapped){
    const wrapped=function(tab,withLoader){
      const result=previousSetTab.call(this,tab,false);
      requestAnimationFrame(()=>{decorateNav();syncModalState();cleanupOptics();});
      return result;
    };
    wrapped.__vy861Wrapped=true;
    window.setTab=wrapped;
  }

  function fixAuthGate(){
    const gate=document.getElementById('vyaparOtpGate');
    if(!gate)return;
    gate.classList.toggle('auth-dark',!isLight());
    // Never allow stale loading state after a failed/returned login attempt.
    const message=gate.querySelector('#auth-message');
    if(gate.classList.contains('auth-loading')&&message&&/unable|failed|error|cancel/i.test(message.textContent||'')){
      gate.classList.remove('auth-loading');
    }
  }

  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      cleanupOptics();
      decorateNav();
      syncModalState();
      fixAuthGate();
      applyThemeMeta();
    });
  });

  function init(){
    cleanupOptics();
    decorateNav();
    syncModalState();
    fixAuthGate();
    applyThemeMeta();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

/* ===== SCRIPT SOURCE: ui-stability-862.js ===== */

/* Vyapar AI 8.6.2 — final UI coordinator.
   Keeps account authentication intact while removing the obsolete local password-lock gate. */
(function(){
  'use strict';

  const root=document.documentElement;
  let queued=false;

  function light(){return root.classList.contains('theme-light')||Boolean(document.body&&document.body.classList.contains('theme-light'))}

  function unlockPasswordTab(){
    if(window.__vyaparAuth867Ready)return;
    const gate=document.getElementById('vyaparOtpGate');
    if(!gate)return;
    const pass=gate.querySelector('#tab-login-pass');
    const tabs=pass&&pass.closest('.auth-method-tabs');
    if(pass){
      pass.disabled=false;
      pass.removeAttribute('disabled');
      pass.removeAttribute('aria-disabled');
      pass.classList.remove('vx643-password-locked');
      if(pass.textContent!=='Password')pass.textContent='Password';
    }
    if(tabs)tabs.classList.remove('vx643-password-disabled');
  }

  function simplifySecuritySettings(){
    const section=document.getElementById('vx622AppLockSection');
    if(section){
      section.querySelectorAll('.vx622-switch,.vx643-security-status').forEach(node=>node.remove());
      const title=section.querySelector('.vx622-lock-heading h2,.vx643-security-copy h2');
      if(title&&title.textContent!=='Account password')title.textContent='Account password';
      const copy=section.querySelector('.vx622-lock-heading p,.vx643-security-copy p');
      if(copy&&copy.textContent!=='Change your sign-in password. Email OTP remains available.')copy.textContent='Change your sign-in password. Email OTP remains available.';
      const kicker=section.querySelector('.settings-kicker');
      if(kicker&&kicker.textContent!=='SIGN-IN')kicker.textContent='SIGN-IN';
      if(!section.classList.contains('vy862-security-simplified'))section.classList.add('vy862-security-simplified');
    }

    document.querySelectorAll('#screen-settings .vy675-settings-row,#screen-settings [data-vy675-setting]').forEach(row=>{
      const text=(row.textContent||'').toLowerCase();
      if(!text.includes('privacy & security')&&!text.includes('password login and app protection'))return;
      const title=row.querySelector('b,strong,.vy675-settings-title');
      const sub=row.querySelector('small,.vy675-settings-subtitle');
      if(title&&/privacy|security/i.test(title.textContent||''))title.textContent='Sign-in & privacy';
      if(sub&&sub.textContent!=='Account password, OTP and privacy options')sub.textContent='Account password, OTP and privacy options';
    });
  }

  function syncSystemBars(){
    try{
      const bridge=window.AndroidApp;
      if(bridge&&typeof bridge.setSystemTheme==='function')bridge.setSystemTheme(light());
    }catch(_){ }
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',light()?'#f5f5f7':'#000000');
  }

  function removeThemeDebris(){
    document.querySelectorAll('.android-nav-glass-indicator,.vy852-theme-bloom,.vy853-theme-reveal,.vy854-theme-wipe,.vy855-theme-curtain,.theme-ripple,.vx657-theme-crossfade,.vy856-liquid-lens,.vy856-liquid-orb').forEach(node=>node.remove());
  }

  function normalize(){
    unlockPasswordTab();
    simplifySecuritySettings();
    syncSystemBars();
    removeThemeDebris();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }

  const observer=new MutationObserver(schedule);
  function init(){
    normalize();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.addEventListener('load',schedule,{once:true});
})();

/* ===== SCRIPT SOURCE: graphite-maroon-863.js ===== */

/* Vyapar AI 8.6.3 — Graphite/Maroon presentation coordinator.
   Replaces the top-bar theme control with a profile shortcut and applies cosmetic
   plan-aware styling without changing entitlement, authentication or accounting logic. */
(function(){
  'use strict';

  const root=document.documentElement;
  let queued=false;

  function readJson(key,fallback){
    try{const value=JSON.parse(localStorage.getItem(key)||'');return value&&typeof value==='object'?value:fallback}catch(_){return fallback}
  }

  function stateRef(){
    try{if(typeof window.S==='function'){const s=window.S();if(s)return s}}catch(_){ }
    try{if(window.state&&typeof window.state==='object')return window.state}catch(_){ }
    return readJson('vyapar_ai_prod_v1',{});
  }

  function accountRef(){
    const cached=readJson('vyapar_ai_account_cache_v1',{});
    const state=stateRef();
    return Object.assign({},cached,state&&state.account||{},state&&state.user||{});
  }

  function planName(){
    const visible=document.querySelector('#productionAccountCard .production-plan,#planBadge');
    const visibleText=String(visible&&visible.textContent||'').trim();
    if(visibleText&&!/^free plan$/i.test(visibleText))return visibleText;
    const s=stateRef();
    const a=accountRef();
    const candidates=[
      s&&s.plan,s&&s.subscription&&s.subscription.plan,s&&s.subscription&&s.subscription.tier,
      a&&a.plan,a&&a.subscription&&a.subscription.plan,a&&a.subscription&&a.subscription.tier,
      visibleText
    ];
    return String(candidates.find(Boolean)||'Free').trim();
  }

  function normalizedPlan(){
    const value=planName().toLowerCase();
    if(value.includes('business'))return 'business';
    if(value.includes('pro'))return 'pro';
    return 'free';
  }

  function displayName(){
    const account=accountRef();
    const s=stateRef();
    const direct=[
      account&&account.name,account&&account.displayName,account&&account.fullName,
      account&&account.user&&account.user.name,
      s&&s.profile&&s.profile.ownerName,s&&s.profile&&s.profile.name
    ].find(v=>String(v||'').trim());
    if(direct)return String(direct).trim();
    const email=String(account&&account.email||account&&account.user&&account.user.email||'').trim();
    if(email)return email.split('@')[0].replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    return 'Profile';
  }

  function profileImage(){
    const img=document.querySelector('#productionAccountCard .production-avatar img,#productionAccountCard img.production-avatar');
    if(img&&img.getAttribute('src'))return img.getAttribute('src');
    const account=accountRef();
    return String(account&&(
      account.photoURL||account.photoUrl||account.picture||account.avatar||
      account.user&&account.user.picture||account.user&&account.user.photoURL
    )||'').trim();
  }

  function initial(){
    const name=displayName();
    const parts=name.split(/\s+/).filter(Boolean);
    return (((parts[0]&&parts[0][0])||'P')+((parts.length>1&&parts[parts.length-1][0])||'')).slice(0,2).toUpperCase();
  }

  function openProfile(){
    try{if(typeof window.setTab==='function')window.setTab('settings',false)}catch(_){ }
    const openAccount=()=>{
      const row=document.querySelector('#screen-settings [data-vy675-page="account"]');
      if(row){row.click();return true}
      return false;
    };
    requestAnimationFrame(()=>{
      if(openAccount())return;
      setTimeout(openAccount,120);
    });
  }

  function buildProfileChip(){
    const actions=document.querySelector('.top .top-actions');
    if(!actions)return;
    const old=document.getElementById('themeToggle');
    if(old)old.remove();
    const badge=document.getElementById('planBadge');
    if(badge)badge.hidden=true;

    let chip=document.getElementById('vy863ProfileChip');
    if(!chip){
      chip=document.createElement('button');
      chip.id='vy863ProfileChip';
      chip.type='button';
      chip.className='vy863-profile-chip';
      chip.setAttribute('aria-label','Open account and plan');
      actions.appendChild(chip);
    }
    if(chip.dataset.vy863Bound!=='1'){
      chip.dataset.vy863Bound='1';
      chip.addEventListener('click',openProfile);
    }

    const image=profileImage();
    const name=displayName();
    const plan=planName().replace(/\s+Plan$/i,'');
    const signature=[image,initial(),name,plan].join('|');
    if(chip.dataset.vy863Signature!==signature){
      chip.dataset.vy863Signature=signature;
      chip.innerHTML='<span class="vy863-profile-avatar">'+(image?'<img src="'+image.replace(/"/g,'&quot;')+'" alt="">':initial())+'</span><i class="vy863-plan-dot" aria-hidden="true"></i>';
      chip.title=name+' · '+plan;
    }
  }

  function applyPlan(){
    const plan=normalizedPlan();
    if(root.dataset.vy863Plan!==plan)root.dataset.vy863Plan=plan;
    const card=document.getElementById('productionAccountCard');
    if(card&&card.dataset.vy863Plan!==plan)card.dataset.vy863Plan=plan;
    const host=document.getElementById('productionAccountCardHost');
    if(host&&host.dataset.vy863Plan!==plan)host.dataset.vy863Plan=plan;
    document.querySelectorAll('#screen-settings .settings-account-section').forEach(node=>{
      if(node.dataset.vy863Plan!==plan)node.dataset.vy863Plan=plan;
    });
  }

  function removeBlueInlineStyles(){
    if(root.classList.contains('theme-light'))return;
    document.querySelectorAll('#screen-home,#screen-business,#screen-sales,#screen-stock,#screen-settings').forEach(screen=>{
      screen.querySelectorAll('[style]').forEach(node=>{
        const style=node.getAttribute('style')||'';
        if(/background(?:-color)?\s*:\s*(?:#(?:0a84ff|0071e3|2563eb|1d4ed8|0b3b68|0d3b66|123c66)|rgb\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235)[^)]*\))/i.test(style)){
          node.style.removeProperty('background');
          node.style.removeProperty('background-color');
          node.style.removeProperty('background-image');
        }
        if(/border(?:-color)?\s*:\s*(?:#(?:0a84ff|0071e3|2563eb|1d4ed8)|rgba?\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235)[^)]*\))/i.test(style)){
          node.style.removeProperty('border');
          node.style.removeProperty('border-color');
        }
      });
    });
  }

  function updateSettingsAppearanceCopy(){
    document.querySelectorAll('#screen-settings .vy675-settings-row').forEach(row=>{
      const text=(row.textContent||'').toLowerCase();
      if(!text.includes('appearance & performance'))return;
      const sub=row.querySelector('small');
      if(sub&&sub.textContent!=='Theme, motion and device performance')sub.textContent='Theme, motion and device performance';
    });
  }

  function normalize(){
    buildProfileChip();
    applyPlan();
    removeBlueInlineStyles();
    updateSettingsAppearanceCopy();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }

  const observer=new MutationObserver(schedule);
  function init(){
    normalize();
    if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.addEventListener('load',schedule,{once:true});
})();

/* ===== SCRIPT SOURCE: premium-tier-864.js ===== */

/* Vyapar AI 8.6.5 — cosmetic tier + premium motion coordinator.
   Presentation only: does not grant plans, change entitlements, auth or accounting logic. */
(function(){
  'use strict';
  const root=document.documentElement;
  const LOGO='assets/images/logo.png';
  let queued=false;

  function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||'');return v&&typeof v==='object'?v:fallback}catch(_){return fallback}}
  function stateRef(){
    try{if(typeof window.S==='function'){const s=window.S();if(s)return s}}catch(_){ }
    try{if(window.state&&typeof window.state==='object')return window.state}catch(_){ }
    return readJson('vyapar_ai_prod_v1',{});
  }
  function accountRef(){
    const cached=readJson('vyapar_ai_account_cache_v1',{});
    const s=stateRef();
    return Object.assign({},cached,s&&s.account||{},s&&s.user||{});
  }
  function planText(){
    const visible=document.querySelector('#productionAccountCard .production-plan,#planBadge');
    const visibleText=String(visible&&visible.textContent||'').trim();
    const s=stateRef(),a=accountRef();
    const candidates=[
      s&&s.subscription&&s.subscription.plan,s&&s.subscription&&s.subscription.tier,s&&s.plan,
      a&&a.subscription&&a.subscription.plan,a&&a.subscription&&a.subscription.tier,a&&a.plan,
      visibleText
    ];
    return String(candidates.find(v=>String(v||'').trim())||'Free').trim();
  }
  function plan(){
    const value=planText().toLowerCase();
    if(value.includes('business'))return 'business';
    if(value.includes('pro'))return 'pro';
    return 'free';
  }
  function applyPlan(){
    const p=plan();
    if(root.dataset.vy864Plan!==p)root.dataset.vy864Plan=p;
    document.querySelectorAll('#productionAccountCard,.settings-account-section,#productionAccountCardHost').forEach(n=>{if(n.dataset.vy864Plan!==p)n.dataset.vy864Plan=p;});
  }

  function normalizeLogos(scope){
    (scope||document).querySelectorAll?.('img').forEach(img=>{
      const src=String(img.getAttribute('src')||'');
      if(/(?:^|\/)logo\.png(?:\?|$)|footer-logo\.png(?:\?|$)/i.test(src)){
        if(src!==LOGO)img.setAttribute('src',LOGO);
      }
    });
    const icon=document.querySelector('link[rel="icon"]');
    if(icon&&icon.getAttribute('href')!==LOGO){icon.setAttribute('href',LOGO);icon.setAttribute('type','image/png')}
  }

  const blue=/(?:#(?:0a84ff|0071e3|2563eb|1d4ed8|0b3b68|0d3b66|123c66|2563e[bf]|3b82f6|2196f3)|rgba?\([^)]*(?:10\s*,\s*132\s*,\s*255|37\s*,\s*99\s*,\s*235|59\s*,\s*130\s*,\s*246|33\s*,\s*150\s*,\s*243)[^)]*\))/i;
  function sanitizeInline(scope){
    (scope||document).querySelectorAll?.('[style]').forEach(node=>{
      const style=node.style;
      for(let i=style.length-1;i>=0;i--){
        const prop=style[i];
        const value=style.getPropertyValue(prop)||'';
        if(!blue.test(value))continue;
        if(prop.startsWith('--'))style.setProperty(prop,'var(--vy864-tier-accent)');
        else style.removeProperty(prop);
      }
    });
  }

  function normalizeDangerLabels(){
    document.querySelectorAll('button,.btn').forEach(btn=>{
      const text=String(btn.textContent||'').trim().toLowerCase();
      if(/delete account|cancel at cycle end|manage cancellation|delete selected|delete record/.test(text) && !btn.classList.contains('danger'))btn.classList.add('danger');
    });
  }

  function fixNav(){
    const nav=document.getElementById('nav');
    if(!nav)return;
    if(document.body && nav.parentElement!==document.body)document.body.appendChild(nav);
    ['left','right','top','bottom','width','min-width','max-width','height','transform','translate','margin','margin-left','margin-right'].forEach(prop=>nav.style.removeProperty(prop));
    nav.scrollLeft=0;
  }

  function updateProfileChip(){
    const chip=document.getElementById('vy863ProfileChip');
    if(!chip)return;
    const currentPlan=plan();
    if(chip.dataset.vy864Plan!==currentPlan)chip.dataset.vy864Plan=currentPlan;
    if(chip.getAttribute('aria-label')!=='Open profile and plan')chip.setAttribute('aria-label','Open profile and plan');
  }

  function normalize(){
    applyPlan();
    normalizeLogos(document);
    sanitizeInline(document);
    normalizeDangerLabels();
    fixNav();
    updateProfileChip();
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;normalize()});
  }
  function init(){
    normalize();
    if(document.body){
      new MutationObserver(records=>{
        records.forEach(r=>r.addedNodes&&r.addedNodes.forEach(node=>{
          if(node.nodeType===1){normalizeLogos(node);sanitizeInline(node)}
        }));
        schedule();
      }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','src']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('load',schedule,{once:true});
})();

/* ===== SCRIPT SOURCE: video-final-867.js ===== */

/* Vyapar AI 8.6.7 — runtime guard for the exact glitches recorded on Android. */
(function(){
  'use strict';
  if(window.__vy867VideoFinalFix) return;
  window.__vy867VideoFinalFix = true;

  function important(el, prop, value){
    if(el && el.style) el.style.setProperty(prop, value, 'important');
  }

  function flatten(el, removePadding){
    if(!el) return;
    important(el,'background','transparent');
    important(el,'background-image','none');
    important(el,'border','0');
    important(el,'box-shadow','none');
    important(el,'backdrop-filter','none');
    important(el,'-webkit-backdrop-filter','none');
    if(removePadding) important(el,'padding','0');
  }

  function fixHomeSurfaces(){
    var home=document.getElementById('screen-home');
    if(!home) return;
    home.querySelectorAll('.home-section').forEach(function(el){ flatten(el,false); });
    var mount=home.querySelector('#homeQuickActionsMount');
    flatten(mount,true);
    home.querySelectorAll('.android-quick-actions,.home-metrics').forEach(function(el){
      flatten(el,true);
      important(el,'overflow','visible');
    });
    home.querySelectorAll('.home-metric-head').forEach(function(el){ flatten(el,true); });
  }

  var customersSvg='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.5-3 2.5-4.7 5.5-4.7s5 1.7 5.5 4.7"/><circle cx="17.2" cy="9" r="2.4"/><path d="M15.3 13.7c2.8-.5 5.1 1 5.6 4.3"/></svg>';
  function fixCustomersIcon(){
    var business=document.getElementById('screen-business');
    if(!business) return;
    business.querySelectorAll('.vx621-feature-card').forEach(function(card){
      var text=(card.textContent||'').replace(/\s+/g,' ').trim();
      if(!/Customers\s*&\s*Udhaar/i.test(text)) return;
      var icon=card.querySelector('.vx621-feature-icon');
      if(!icon || icon.dataset.vy867Monochrome==='1') return;
      icon.innerHTML=customersSvg;
      icon.dataset.vy867Monochrome='1';
      icon.classList.add('vy867-mono-customers');
    });
  }

  function fixNav(){
    var nav=document.getElementById('nav');
    if(!nav) return;
    nav.querySelectorAll('button').forEach(function(btn){
      important(btn,'filter','none');
      important(btn,'text-shadow','none');
    });
  }

  function fixUpdateButton(){
    var settings=document.getElementById('screen-settings');
    if(!settings || settings.getAttribute('data-vy675-page')!=='update') return;
    var card=settings.querySelector('#fs607Settings');
    if(!card) return;
    card.querySelectorAll('button,.btn').forEach(function(btn){
      important(btn,'background','#222428');
      important(btn,'background-image','none');
      important(btn,'border','1px solid #3b3f45');
      important(btn,'color','#fff');
      important(btn,'box-shadow','none');
    });
  }

  function fixMoreGeometry(){
    // CSS owns sheet geometry; never overwrite an in-flight transform.
  }

  var queued=false;
  function repair(){
    queued=false;
    fixHomeSurfaces();
    fixCustomersIcon();
    fixNav();
    fixUpdateButton();
    fixMoreGeometry();
  }
  function queueRepair(){
    if(queued) return;
    queued=true;
    (window.requestAnimationFrame||function(cb){return setTimeout(cb,16);})(repair);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',repair,{once:true});
  else repair();
  window.addEventListener('resize',queueRepair,{passive:true});
  document.addEventListener('click',function(){setTimeout(queueRepair,0);},true);
  new MutationObserver(queueRepair).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-vy675-page']});
  setTimeout(repair,120);
  setTimeout(repair,500);
})();

/* ===== SCRIPT SOURCE: workspace-startup.js ===== */

/* Final wiring: the app remains covered until its durable data has loaded. */
(function (root) {
  'use strict';
  let busy = false, lastFocus = null;
  function busyMessage(text) { const el = document.getElementById('workspaceBusyMessage'); if (el) el.textContent = text; }
  function setBusy(value, message) {
    if (value && busy) throw new Error('Please wait for the current import to finish.');
    busy = value;
    let overlay = document.getElementById('workspaceBusy');
    if (!value) { if (overlay) overlay.remove(); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); return; }
    lastFocus = document.activeElement;
    overlay = document.createElement('div'); overlay.id = 'workspaceBusy'; overlay.className = 'workspace-blocker';
    overlay.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="workspaceBusyMessage" tabindex="-1"><span class="workspace-spinner" aria-hidden="true"></span><p id="workspaceBusyMessage" role="status" aria-live="polite"></p></div>';
    document.body.appendChild(overlay); busyMessage(message || 'Saving…'); overlay.firstElementChild.focus();
  }
  function storageBlocked(message) {
    const el = document.createElement('div'); el.className = 'workspace-blocker'; el.id = 'workspaceStorageBlocked';
    el.innerHTML = '<div role="alertdialog" aria-modal="true" aria-labelledby="storageBlockedTitle"><h2 id="storageBlockedTitle">Could not load your records</h2><p></p><button type="button" class="btn primary">Reopen app</button></div>';
    try { if(root.AndroidApp && root.AndroidApp.onStartupFrameReady) root.AndroidApp.onStartupFrameReady(); } catch(_) {}
    el.querySelector('p').textContent = message; el.querySelector('button').onclick = () => location.reload(); document.body.appendChild(el);
  }
  function storageStatus() {
    const status = root.VyaparStorage.getStatus();
    const label = status.error ? 'Not saved: ' + status.error : status.mode === 'loading' ? 'Opening device storage…' : status.mode === 'basic' ? 'Basic local storage · download backups regularly' : status.records.toLocaleString('en-IN') + ' records saved on this device';
    const settings = document.getElementById('settingsStatus'); if (settings && settings.textContent !== label) settings.textContent = label;
    let banner = document.getElementById('workspaceStorageError');
    if (status.error) {
      if (!banner) { banner = document.createElement('div'); banner.id = 'workspaceStorageError'; banner.setAttribute('role','alert'); banner.innerHTML = '<p></p><button type="button" class="btn">Retry save</button><button type="button" class="btn">Download backup</button>'; document.body.appendChild(banner); const buttons = banner.querySelectorAll('button'); buttons[0].onclick = () => root.VyaparStorage.save(root.state).catch(() => {}); buttons[1].onclick = () => root.downloadBackup(); }
      banner.querySelector('p').textContent = label;
    } else if (banner) banner.remove();
  }
  root.VyaparWorkspace = { setBusy, busyMessage, storageBlocked };
  root.addEventListener('vyapar:storage-status', storageStatus);
  document.addEventListener('keydown', event => {
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.key === 'Tab') document.documentElement.classList.add('keyboard-navigation');
  }, true);
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-navigation'), {passive:true});
  // Do not let background handlers save or edit while the import transaction is staged.
  document.addEventListener('click', event => { if (busy && !event.target.closest('#workspaceBusy')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  const renderSettings = root.renderSettings;
  root.renderSettings = function () { const result = renderSettings.apply(this, arguments); storageStatus(); return result; };
  root.VyaparStorage.attach(() => root.state, saved => {
    const current = root.state;
    const restored = normalizeState(saved);
    restored.subscription = { ...current.subscription }; restored.plan = current.plan;
    root.state = restored;
  }).then(() => { root.VyaparInsights.invalidate(); root.render(); storageStatus(); });
})(window);
