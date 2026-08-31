'use strict';

const assert = require('assert/strict');
const crypto = require('crypto').webcrypto;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  {
    name: 'web',
    app: path.join(ROOT, 'web/app.js'),
    finance: path.join(ROOT, 'web/audit-stage2-6601.js')
  },
  {
    name: 'android',
    app: path.join(ROOT, 'android-app/app/src/main/assets/app.js'),
    finance: path.join(ROOT, 'android-app/app/src/main/assets/audit-stage2-6601.js')
  }
];

let checks = 0;

function check(name, fn){
  return Promise.resolve()
    .then(fn)
    .then(() => {
      checks++;
      process.stdout.write(`✓ ${name}\n`);
    });
}

function makeElement(){
  return {
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    style: { setProperty(){} },
    dataset: {},
    classList: {
      add(){},
      remove(){},
      toggle(){},
      contains(){ return false; }
    },
    appendChild(){},
    remove(){},
    setAttribute(){},
    focus(){},
    scrollIntoView(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; }
  };
}

function loadCore(appPath){
  const source = fs.readFileSync(appPath, 'utf8');
  const end = source.indexOf('\nrender();\n');
  assert.ok(end > 0, 'core runtime boundary must exist');

  const inputs = {};
  const storage = new Map();
  const alerts = [];
  const toasts = [];
  let promptValue = '';

  const document = {
    getElementById(id){ return inputs[id] || null; },
    createElement(){ return makeElement(); },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){},
    body: makeElement(),
    documentElement: makeElement()
  };

  const window = {
    addEventListener(){},
    matchMedia(){ return { matches: false, addEventListener(){} }; },
    open(){},
    state: null
  };

  const context = {
    window,
    document,
    navigator: { onLine: true },
    localStorage: {
      getItem(key){ return storage.get(key) || null; },
      setItem(key, value){ storage.set(key, value); },
      removeItem(key){ storage.delete(key); }
    },
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    Promise,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    crypto,
    Blob: class {},
    URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
    FileReader: class {},
    Image: class {},
    alert(message){ alerts.push(String(message)); },
    confirm(){ return true; },
    prompt(){ return promptValue; },
    advToast(message){ toasts.push(String(message)); },
    setTimeout(){ return 0; },
    clearTimeout(){},
    requestAnimationFrame(){ return 0; },
    cancelAnimationFrame(){},
    fetch: async () => ({ ok: false, json: async () => ({}) })
  };

  vm.createContext(context);
  const expose = `
render=function(){};
window.__phase3Core={
  normalizeState,
  isValidDateKey,
  parseCsv,
  importCsvOrText,
  addDaily,
  addMonthly,
  addMonthlyFromRow,
  yearlySalesForYear,
  detailedBusinessData,
  restoreBackup,
  getState:()=>state,
  setState:value=>{state=value}
};`;
  vm.runInContext(source.slice(0, end) + expose, context, {
    filename: appPath
  });

  return {
    source,
    context,
    core: window.__phase3Core,
    window,
    inputs,
    alerts,
    toasts,
    setPrompt(value){ promptValue = value; }
  };
}

function setInput(runtime, id, value){
  runtime.inputs[id] = runtime.inputs[id] || makeElement();
  runtime.inputs[id].value = String(value);
}

function baseCoreState(core, extra = {}){
  return core.normalizeState({
    subscription: { plan: 'business', verified: true, token: 'current-token' },
    sales: [],
    stocks: [],
    daily: [],
    monthly: [],
    ...extra
  });
}

async function encryptEnvelope(value, password){
  const encoder = new TextEncoder();
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 21);
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value))
  );
  return JSON.stringify({
    v: 1,
    s: [...salt],
    i: [...iv],
    d: [...new Uint8Array(encrypted)]
  });
}

async function testCore(target){
  const runtime = loadCore(target.app);
  const { core, window } = runtime;

  assert.equal(window.state, core.getState(), 'window and lexical state must match');
  const replacement = baseCoreState(core, { marker: 'lexical-to-window' });
  core.setState(replacement);
  assert.equal(window.state, replacement, 'lexical assignment must update window state');
  const windowReplacement = baseCoreState(core, { marker: 'window-to-lexical' });
  window.state = windowReplacement;
  assert.equal(core.getState(), windowReplacement, 'window assignment must update lexical state');

  assert.equal(core.isValidDateKey('2024-02-29'), true);
  assert.equal(core.isValidDateKey('2026-02-29'), false);
  assert.equal(core.isValidDateKey('2026-13-01'), false);

  const normalized = baseCoreState(core, {
    transactions611: [{ id: 'TX-1' }],
    ledgerEntries611: [{ id: 'LE-1' }],
    products: [{ id: 'P-1', name: 'Shoe' }]
  });
  assert.equal(normalized.transactions611.length, 1, 'advanced transactions survive normalization');
  assert.equal(normalized.ledgerEntries611.length, 1, 'advanced ledger survives normalization');
  assert.equal(normalized.products.length, 1, 'catalog survives normalization');

  core.setState(baseCoreState(core));
  setInput(runtime, 'ddate', '2026-08-01');
  setInput(runtime, 'dsale', 100);
  setInput(runtime, 'dprofit', 30);
  core.addDaily();
  setInput(runtime, 'dsale', 120);
  setInput(runtime, 'dprofit', 40);
  core.addDaily();
  assert.equal(core.getState().daily.length, 1, 'same-date daily entry updates in place');
  assert.equal(core.getState().daily[0].sale, 120);
  assert.equal(core.getState().daily[0].profit, 40);

  core.setState(baseCoreState(core, {
    monthly: [
      { id: 'M-OLD', month: '2026-08', profit: 10 },
      { id: 'M-LATEST', month: '2026-08', profit: 20 }
    ]
  }));
  setInput(runtime, 'mmonth', '2026-08');
  setInput(runtime, 'mprofit', 30);
  core.addMonthly();
  assert.equal(core.getState().monthly.length, 2, 'historical duplicate rows remain recoverable');
  assert.equal(core.getState().monthly[0].profit, 10, 'older duplicate is untouched');
  assert.equal(core.getState().monthly[1].profit, 30, 'latest duplicate is authoritative');
  const importResult = core.addMonthlyFromRow(
    { year: 2026, month: 8, profit: 45 },
    'test-import'
  );
  assert.equal(importResult, 'updated');
  assert.equal(core.getState().monthly[1].profit, 45, 'import updates latest month row');

  core.setState(baseCoreState(core));
  const csv = [
    'type,date,product,purchasePrice,sellingPrice,qty',
    'sale,2026-08-02,"Shoe, Blue",50,100,2',
    'sale,2026-02-29,Invalid Date,50,100,1'
  ].join('\n');
  const csvResult = core.importCsvOrText(csv);
  assert.deepEqual(
    JSON.parse(JSON.stringify(csvResult)),
    { profit: 0, updated: 0, sales: 1, stock: 0, skipped: 1 }
  );
  const stockResult = core.importCsvOrText([
    'type,product,qty',
    'stock,Zero Stock Item,0'
  ].join('\n'));
  assert.equal(stockResult.stock, 1);
  assert.equal(core.getState().sales[0].product, 'Shoe, Blue', 'quoted comma is preserved');
  assert.equal(core.getState().stocks[0].qty, 0, 'valid zero-stock item is preserved');

  core.setState(baseCoreState(core, {
    sales: [
      { id: 'S1', date: '2026-08-01', sellingPrice: 50, purchasePrice: 20, qty: 2 },
      { id: 'S2', date: '2026-08-02', sellingPrice: 40, purchasePrice: 10, qty: 1 }
    ],
    daily: [
      { id: 'D1', date: '2026-08-01', sale: 110, profit: 35 },
      { id: 'D2', date: '2026-08-01', sale: 120, profit: 40 }
    ]
  }));
  assert.equal(core.yearlySalesForYear('2026'), 160, 'latest daily total replaces item sales for that date');

  const current = baseCoreState(core, {
    sales: [{ id: 'CURRENT', date: '2026-08-01', sellingPrice: 10, purchasePrice: 5, qty: 1 }]
  });
  core.setState(current);
  const plainBackup = JSON.stringify({
    subscription: { plan: 'free', verified: false, token: '' },
    plan: 'free',
    sales: [{ id: 'RESTORED', date: '2026-08-03', sellingPrice: 20, purchasePrice: 5, qty: 1 }]
  });
  await core.restoreBackup({ size: plainBackup.length, text: async () => plainBackup });
  assert.equal(core.getState().sales[0].id, 'RESTORED');
  assert.equal(core.getState().plan, 'business', 'normal restore preserves current plan');
  assert.equal(core.getState().subscription.token, 'current-token', 'normal restore preserves current account');
  assert.equal(window.state, core.getState(), 'normal restore keeps canonical state');
}

async function testSecureRestore(target){
  const runtime = loadCore(target.app);
  const { core, source, context, window } = runtime;
  const start = source.indexOf('/* Completion wrappers */');
  const end = source.indexOf('/* ===== production.js ===== */', start);
  assert.ok(start > 0 && end > start, 'secure restore wrapper must exist');
  vm.runInContext(source.slice(start, end), context, { filename: `${target.app}:secure` });

  core.setState(baseCoreState(core, {
    sales: [{ id: 'CURRENT', date: '2026-08-01', sellingPrice: 10, purchasePrice: 5, qty: 1 }]
  }));
  runtime.setPrompt('phase3-secret');
  const envelope = await encryptEnvelope({
    subscription: { plan: 'free', verified: false, token: '' },
    plan: 'free',
    sales: [{ id: 'SECURE-RESTORED', date: '2026-08-04', sellingPrice: 30, purchasePrice: 10, qty: 1 }],
    transactions611: [{ id: 'SECURE-TX' }]
  }, 'phase3-secret');

  await window.advRestoreSecure({
    files: [{ size: envelope.length, text: async () => envelope }]
  });
  assert.equal(core.getState().sales[0].id, 'SECURE-RESTORED');
  assert.equal(core.getState().transactions611[0].id, 'SECURE-TX');
  assert.equal(core.getState().plan, 'business', 'encrypted restore preserves current plan');
  assert.equal(core.getState().subscription.token, 'current-token', 'encrypted restore preserves current account');
  assert.equal(window.state, core.getState(), 'encrypted restore keeps canonical state');

  const before = core.getState();
  await window.advRestoreSecure({
    files: [{ size: 30, text: async () => JSON.stringify({ v: 1, s: [1], i: [], d: [] }) }]
  });
  assert.equal(core.getState(), before, 'invalid encrypted envelope cannot replace state');
  assert.ok(runtime.alerts.some(message => message.includes('Encrypted restore failed')));
}

function platformRuntime(appPath){
  const source = fs.readFileSync(appPath, 'utf8');
  const start = source.indexOf('/* ===== platform-611.js ===== */');
  const end = source.indexOf('/* ===== platform-620-complete.js ===== */');
  assert.ok(start > 0 && end > start, 'accounting runtime boundaries must exist');

  const window = {
    state: {
      profile: { businessName: 'Test Business' },
      products: [{
        id: 'P1',
        name: 'Shoe',
        qty: 10,
        purchasePrice: 50,
        sellingPrice: 100
      }],
      customers: [],
      suppliers: [],
      expenses: []
    },
    addEventListener(){},
    open(){}
  };
  const document = {
    getElementById(){ return null; },
    addEventListener(){},
    createElement(){ return makeElement(); },
    body: makeElement(),
    documentElement: makeElement()
  };
  let sequence = 0;
  const context = {
    window,
    document,
    console,
    Date,
    Math,
    Set,
    Map,
    JSON,
    Number,
    String,
    Object,
    Array,
    Promise,
    Blob: class {},
    URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
    localStorage: { getItem(){ return null; }, setItem(){} },
    navigator: {},
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    alert(){},
    confirm(){ return true; },
    prompt(){ return ''; },
    setTimeout(){ return 0; },
    clearTimeout(){},
    localDateKey(){ return '2026-08-31'; },
    uid(){ sequence++; return `T${sequence}`; },
    money(value){ return `₹${Number(value || 0).toFixed(2)}`; },
    esc(value){ return String(value ?? ''); },
    save(){},
    showGlassToast(){}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context, { filename: appPath });
  return { window, platform: window.VyaparPlatform611 };
}

function accountId(state, code){
  return state.accounts611.find(account => account.code === code).id;
}

function assertLedgerBalanced(state){
  const debit = state.ledgerEntries611.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);
  const credit = state.ledgerEntries611.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
  assert.ok(Math.abs(debit - credit) < 0.01, `ledger differs by ${debit - credit}`);
}

function testAccounting(target){
  const { window, platform } = platformRuntime(target.app);
  const state = window.state;
  const balance = code => platform.accountBalance(accountId(state, code));

  const sale = platform.createTransaction({
    type: 'SALE',
    date: '2026-08-01',
    party: 'Customer',
    items: [{ itemId: 'P1', name: 'Shoe', qty: 2, rate: 100, purchaseRate: 50 }],
    receivedPaid: 0,
    paymentMode: 'Credit'
  });
  platform.createTransaction({
    type: 'PAYMENT_IN',
    date: '2026-08-02',
    party: 'Customer',
    total: 40,
    receivedPaid: 40,
    paymentMode: 'Cash',
    linkedTransactionId: sale.id
  });
  assert.equal(balance('CASH'), 40);
  assert.equal(balance('AR'), 160);
  assert.equal(sale.balance, 160);

  delete sale.initialReceivedPaid;
  platform.rebuildAccounting();
  platform.rebuildAccounting();
  assert.equal(sale.initialReceivedPaid, 0, 'legacy initial receipt is inferred safely');
  assert.equal(balance('CASH'), 40, 'linked receipt posts once after rebuild');
  assert.equal(balance('AR'), 160, 'receivable remains stable after rebuild');

  platform.createTransaction({
    type: 'SALE_RETURN',
    date: '2026-08-03',
    party: 'Customer',
    items: [{ itemId: 'P1', name: 'Shoe', qty: 1, rate: 100, purchaseRate: 50 }],
    receivedPaid: 0,
    paymentMode: 'Credit',
    linkedTransactionId: sale.id
  });
  assert.equal(sale.balance, 60);
  assert.equal(balance('AR'), 60);
  assert.equal(platform.stock('P1'), 9);
  assert.deepEqual(
    JSON.parse(JSON.stringify(platform.totals())),
    { revenue: 100, other: 0, cogs: 50, expenses: 0, net: 50 }
  );
  assert.throws(() => platform.createTransaction({
    type: 'SALE_RETURN',
    date: '2026-08-04',
    party: 'Customer',
    items: [{ itemId: 'P1', name: 'Shoe', qty: 2, rate: 100, purchaseRate: 50 }],
    linkedTransactionId: sale.id
  }), /Return quantity exceeds/);

  const ledgerBeforeDocument = state.ledgerEntries611.length;
  const stockBeforeDocument = platform.stock('P1');
  platform.createTransaction({
    type: 'ESTIMATE',
    date: '2026-08-04',
    party: 'Customer',
    items: [{ itemId: 'P1', name: 'Shoe', qty: 1, rate: 100, purchaseRate: 50 }]
  });
  assert.equal(state.ledgerEntries611.length, ledgerBeforeDocument, 'non-posting document has no ledger effect');
  assert.equal(platform.stock('P1'), stockBeforeDocument, 'non-posting document has no stock effect');

  const purchase = platform.createTransaction({
    type: 'PURCHASE',
    date: '2026-08-05',
    party: 'Supplier',
    items: [{ itemId: 'P1', name: 'Shoe', qty: 4, rate: 50, purchaseRate: 50 }],
    receivedPaid: 10,
    paymentMode: 'Cash'
  });
  platform.createTransaction({
    type: 'PAYMENT_OUT',
    date: '2026-08-06',
    party: 'Supplier',
    total: 60,
    receivedPaid: 60,
    paymentMode: 'Cash',
    linkedTransactionId: purchase.id
  });
  assert.equal(purchase.receivedPaid, 70);
  assert.equal(purchase.balance, 130);
  assert.equal(balance('AP'), -130);
  assert.equal(balance('CASH'), -30);
  assert.equal(platform.stock('P1'), 13);

  delete purchase.initialReceivedPaid;
  platform.rebuildAccounting();
  platform.rebuildAccounting();
  assert.equal(purchase.initialReceivedPaid, 10, 'legacy initial purchase payment is inferred safely');
  assert.equal(balance('AP'), -130, 'linked supplier payment posts once after rebuild');
  assert.equal(balance('CASH'), -30, 'cash remains stable after repeated rebuild');
  assert.equal(platform.stock('P1'), 13, 'stock remains stable after repeated rebuild');
  assertLedgerBalanced(state);
}

function financeRuntime(financePath, state){
  const source = fs.readFileSync(financePath, 'utf8');
  const window = { state };
  const document = {
    getElementById(){ return null; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    addEventListener(){},
    body: makeElement(),
    documentElement: makeElement()
  };
  class MutationObserver { observe(){} disconnect(){} }
  const context = {
    window,
    document,
    localStorage: { setItem(){}, getItem(){ return null; } },
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    MutationObserver,
    Event: class {},
    money(value){ return `₹${Number(value || 0).toFixed(2)}`; },
    setTimeout(){ return 0; },
    clearTimeout(){}
  };
  vm.createContext(context);
  vm.runInContext(`let state=window.state;\n${source}`, context, { filename: financePath });
  return window.VyaparFinance6601;
}

function testFinance(target){
  const state = {
    activeBusinessId: 'MAIN',
    sales: [
      { id: 'S1', date: '2026-08-01', sellingPrice: 100, purchasePrice: 60, qty: 1 },
      { id: 'S2', date: '2026-08-02', sellingPrice: 300, purchasePrice: 200, qty: 1 },
      { id: 'S3', date: '2026-08-03', sellingPrice: 50, purchasePrice: 30, qty: 1 },
      { id: 'BAD', date: '2026-99-99', sellingPrice: 999, purchasePrice: 0, qty: 1 }
    ],
    daily: [
      { id: 'D1', date: '2026-08-01', sale: 150, profit: 50 },
      { id: 'D2', date: '2026-08-01', sale: 160, profit: 60 },
      { id: 'D3', date: '2026-08-02', sale: 350, profit: 120 }
    ],
    monthly: [
      { id: 'M1', month: '2026-08', profit: 500 },
      { id: 'M2', month: '2026-08', profit: 700 },
      { id: 'M3', month: '2026-09', profit: 200 }
    ],
    transactions611: [{
      id: 'TX1',
      businessId: 'MAIN',
      type: 'SALE',
      status: 'posted',
      date: '2026-08-02',
      items: [{ qty: 2, rate: 200, purchaseRate: 125, discount: 0 }]
    }],
    expenses: [{ id: 'E1', date: '2026-08-20', amount: 100 }]
  };
  const finance = financeRuntime(target.finance, state);
  const result = JSON.parse(JSON.stringify(finance.year('2026')));
  assert.equal(result.revenue, 610, 'accounting > daily > item precedence controls revenue');
  assert.equal(result.profit, 1130, 'latest daily/monthly values prevent duplicate profit');
  assert.equal(result.expenses, 100);
  assert.equal(result.net, 1030);
  assert.equal(result.months['2026-08'].profit, 930);
  assert.equal(result.months['2026-09'].profit, 200);
}

function testStaticParity(){
  const webFinance = fs.readFileSync(TARGETS[0].finance);
  const androidFinance = fs.readFileSync(TARGETS[1].finance);
  assert.equal(Buffer.compare(webFinance, androidFinance), 0, 'finance resolver assets must match');

  const webWorkflow = fs.readFileSync(path.join(ROOT, 'web/workflow-ui-670p2.js'));
  const androidWorkflow = fs.readFileSync(path.join(ROOT, 'android-app/app/src/main/assets/workflow-ui-670p2.js'));
  assert.equal(Buffer.compare(webWorkflow, androidWorkflow), 0, 'workflow assets must match');

  TARGETS.forEach(target => {
    const source = fs.readFileSync(target.app, 'utf8');
    assert.match(source, /Object\.defineProperty\(window, 'state'/);
    assert.match(source, /function postForRebuild/);
    assert.match(source, /restored\.subscription=\{\.\.\.state\.subscription\}/);
    assert.match(source, /restored\.plan=state\.plan/);
    assert.match(source, /obj\.v!==1/);
  });
}

(async () => {
  for(const target of TARGETS){
    await check(`${target.name}: canonical state, imports, dates and plain restore`, () => testCore(target));
    await check(`${target.name}: encrypted restore and plan protection`, () => testSecureRestore(target));
    await check(`${target.name}: ledger, stock, returns and rebuild idempotency`, () => testAccounting(target));
    await check(`${target.name}: unified finance precedence and duplicate safety`, () => testFinance(target));
  }
  await check('web/android parity and production invariants', testStaticParity);
  process.stdout.write(`\nPhase 3 integrity suite passed (${checks} groups).\n`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
