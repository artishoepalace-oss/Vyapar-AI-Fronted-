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
  observer.observe(document.documentElement, {childList:true, subtree:true});

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
