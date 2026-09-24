/* v00042 follow-up: presentation only; accounting, stock ledger and print engines stay canonical. */
(function (root) {
  'use strict';
  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function number(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  function currency(value) {
    return '₹' + number(value).toLocaleString('en-IN', {maximumFractionDigits:2});
  }
  function simplifyBusinessTools() {
    var page=byId('screen-business');
    if (!page) return;
    page.querySelectorAll('.vx621-group').forEach(function (group) {
      var title=group.querySelector('.vx621-group-head h2');
      var name=title ? title.textContent.trim() : '';
      // Keep the actual tools in Sales and Stock, including their plan checks.
      if (name==='Sales-related Tools' || name==='Stock-related Tools') {
        group.remove();
      } else if (name==='Documents & Communication') {
        group.querySelectorAll('.vx621-feature-card').forEach(function (card) {
          var heading=card.querySelector('h3,h2');
          var label=heading ? heading.textContent.trim() : '';
          if (label==='Invoice & Thermal' || label==='Orders & Lifecycle') card.remove();
        });
        if (title) title.textContent='Business Communication';
      }
    });
  }
  if (typeof root.renderBusiness==='function') {
    var previousBusiness=root.renderBusiness;
    root.renderBusiness=function () {
      var result=previousBusiness.apply(this, arguments);
      simplifyBusinessTools();
      return result;
    };
  }

  function enhanceStock() {
    var page=byId('screen-stock');
    if (!page) return;
    // A normal item is not an alert. Retain legacy records without changing data.
    var alerts=page.querySelector('#stockAlerts');
    if (alerts) {
      var pills=alerts.querySelectorAll('p.pill');
      var low=0;
      pills.forEach(function (pill) {
        if (pill.querySelector('.danger-text')) low++;
        else pill.remove();
      });
      alerts.hidden=low===0;
      var heading=alerts.querySelector('h3');
      if (heading) heading.textContent='Low Stock Alerts ('+low+')';
    }
    var card=page.querySelector('.vx621-stock-records');
    if (!card || card.querySelector('.vy-stock-search')) return;
    var table=card.querySelector('table');
    if (!table) return;
    var label=document.createElement('label');
    label.className='vy-stock-search';
    label.textContent='Search saved stock';
    var field=document.createElement('input');
    field.type='search';
    field.placeholder='Item name or quantity';
    field.setAttribute('aria-label','Search saved stock records');
    label.appendChild(field);
    var hint=document.createElement('p');
    hint.className='vy-stock-count muted';
    var wrapper=card.querySelector('.vx621-table-wrap');
    wrapper.before(label, hint);
    function filter() {
      var term=field.value.toLocaleLowerCase().trim();
      var visible=0;
      table.querySelectorAll('tbody tr').forEach(function (row) {
        var name=row.cells[1] ? row.cells[1].textContent : '';
        var qty=row.cells[2] ? row.cells[2].textContent : '';
        var matched=(!term || (name+' '+qty).toLocaleLowerCase().includes(term));
        row.hidden=!matched;
        if (!matched) {
          var check=row.querySelector('.vx621-stock-check');
          if (check) check.checked=false;
        } else if (row.querySelector('.vx621-stock-check')) visible++;
      });
      hint.textContent=visible+' stock record'+(visible===1?'':'s')+' shown';
    }
    field.addEventListener('input',filter);
    filter();
  }
  if (typeof root.renderStock==='function') {
    var previousStock=root.renderStock;
    root.renderStock=function () {
      var result=previousStock.apply(this,arguments);
      enhanceStock();
      root.requestAnimationFrame(enhanceStock);
      return result;
    };
  }
  if (typeof root.vx621StockSelectAll==='function') {
    var previousSelectAll=root.vx621StockSelectAll;
    root.vx621StockSelectAll=function (checked) {
      previousSelectAll(checked);
      if (checked) document.querySelectorAll('.vx621-stock-check').forEach(function (box) {
        if (box.closest('tr') && box.closest('tr').hidden) box.checked=false;
      });
    };
  }

  function salePreview() {
    var product=byId('sproduct'),qty=byId('sqty'),rate=byId('ssell'),buy=byId('sbuy');
    if (!product || !qty || !rate || !buy) return;
    var form=product.closest('.card');
    if (!form) return;
    var result=form.querySelector('.vy-sale-preview');
    if (!result) {
      result=document.createElement('div');
      result.className='vy-sale-preview';
      result.setAttribute('role','status');
      result.setAttribute('aria-live','polite');
      var actions=form.querySelector('.actions');
      if (actions) actions.before(result);
      else form.appendChild(result);
    }
    var amount=number(qty.value)*number(rate.value);
    var profit=(number(rate.value)-number(buy.value))*number(qty.value);
    result.innerHTML='<span>Sale total <strong>'+currency(amount)+'</strong></span>'+
      '<span>Estimated item profit <strong>'+currency(profit)+'</strong></span>';
    [qty,rate,buy].forEach(function (input) {
      input.setAttribute('inputmode','decimal');
      if (input===qty) {input.min='0.01'; input.step='0.01';}
      else {input.min='0';input.step='0.01';}
    });
  }
  if (typeof root.renderSales==='function') {
    var previousSales=root.renderSales;
    root.renderSales=function () {
      var result=previousSales.apply(this,arguments);
      salePreview();
      return result;
    };
  }
  document.addEventListener('input',function (event) {
    if (event.target && ['sqty','ssell','sbuy'].includes(event.target.id)) salePreview();
  });

  // Invoice is a single chooser -> details -> actions inside the existing sheet.
  // Never open another modal or duplicate the accounting or PDF implementation.
  if (typeof root.p620PrintTab==='function') {
    var previousPrintTab=root.p620PrintTab;
    root.p620PrintTab=function (tab) {
      if (tab!=='documents') {
        var sheet=byId('p620PrintBody')?.closest('.vy-form-sheet');
        if (sheet) sheet.classList.remove('vy-invoice-sheet');
        return previousPrintTab.apply(this,arguments);
      }
      var body=byId('p620PrintBody');
      if (!body) return;
      var sheet=body.closest('.vy-form-sheet');
      if (sheet) sheet.classList.add('vy-invoice-sheet');
      var documents=Array.isArray(root.__p620PrintTx) ? root.__p620PrintTx.slice() : [];
      body.innerHTML='<div class="vy-invoice-workspace">'+
        '<div class="vy-invoice-search"><label for="vyInvoiceSearch">Find an invoice</label>'+
        '<input id="vyInvoiceSearch" type="search" placeholder="Bill number, customer or date" autocomplete="off"></div>'+
        '<p id="vyInvoiceCount" class="muted" role="status" aria-live="polite"></p>'+
        '<div id="vyInvoiceList" class="vy-invoice-list"></div>'+
        '<section id="vyInvoiceDetail" class="vy-invoice-detail" hidden aria-label="Selected invoice"></section>'+
        '</div>';
      var field=byId('vyInvoiceSearch'),list=byId('vyInvoiceList'),detail=byId('vyInvoiceDetail');
      var count=byId('vyInvoiceCount');
      function showList() {
        detail.hidden=true;list.hidden=false;field.parentElement.hidden=false;count.hidden=false;
        body.closest('.vy-form-body')?.scrollTo(0,0);
        filter();
      }
      function filter() {
        var term=field.value.toLocaleLowerCase().trim();
        var rows=documents.filter(function (tx) {
          return (String(tx.number||'')+' '+String(tx.partyName||'')+' '+String(tx.date||'')+' '+String(tx.type||''))
            .toLocaleLowerCase().includes(term);
        });
        count.textContent=rows.length+' saved document'+(rows.length===1?'':'s');
        list.innerHTML=rows.map(function (tx) {
          return '<button type="button" class="vy-invoice-row" data-invoice-id="'+escapeHtml(tx.id)+'">'+
            '<span><strong>'+escapeHtml(tx.number||'Invoice')+'</strong>'+
            '<small>'+escapeHtml(tx.partyName||'Walk-in customer')+' · '+escapeHtml(tx.date||'')+'</small></span>'+
            '<span class="vy-invoice-row-end"><b>'+currency(tx.total)+'</b><small>'+escapeHtml(tx.type||'SALE')+'</small></span>'+
            '<span class="vy-invoice-arrow" aria-hidden="true">›</span></button>';
        }).join('') || '<p class="vy-invoice-empty">No matching invoices. Create a sale in Sales to generate one.</p>';
      }
      function showDetail(tx) {
        list.hidden=true;field.parentElement.hidden=true;count.hidden=true;detail.hidden=false;
        var items=Array.isArray(tx.items) ? tx.items : [];
        detail.innerHTML='<button type="button" class="btn mini vy-invoice-back" data-invoice-back>← All invoices</button>'+
          '<div class="vy-invoice-summary"><small>'+escapeHtml(tx.type||'SALE')+' · '+escapeHtml(tx.date||'')+'</small>'+
          '<h3>'+escapeHtml(tx.number||'Invoice')+'</h3><p>'+escapeHtml(tx.partyName||'Walk-in customer')+'</p>'+
          '<div class="vy-invoice-total">Total <strong>'+currency(tx.total)+'</strong></div>'+
          '<div class="vy-invoice-payments"><span>Paid: '+currency(tx.receivedPaid)+'</span><span>Balance: '+currency(tx.balance)+'</span></div></div>'+
          '<div class="vy-invoice-items"><h4>Items ('+items.length+')</h4>'+
          (items.map(function (item) {
            return '<div><span>'+escapeHtml(item.name||'Item')+' <small>× '+escapeHtml(item.qty||0)+'</small></span>'+
              '<b>'+currency(number(item.qty)*number(item.rate))+'</b></div>';
          }).join('') || '<p class="muted">No item rows on this document.</p>')+'</div>'+
          '<div class="vy-invoice-actions">'+
          '<button class="btn primary" type="button" data-invoice-action="pdf">Download PDF</button>'+
          '<button class="btn" type="button" data-invoice-action="print">Print invoice</button>'+
          '<button class="btn" type="button" data-invoice-action="thermal">Thermal PDF</button>'+
          '<button class="btn" type="button" data-invoice-action="print-thermal">Print thermal</button>'+
          '<button class="btn" type="button" data-invoice-action="escpos">Bluetooth / ESC-POS</button>'+
          '<button class="btn" type="button" data-invoice-action="share">Share invoice</button></div>';
        body.closest('.vy-form-body')?.scrollTo(0,0);
        detail.onclick=function (event) {
          if (event.target.closest('[data-invoice-back]')) return showList();
          var action=event.target.closest('button[data-invoice-action]');
          if (!action) return;
          var id=tx.id;
          switch (action.dataset.invoiceAction) {
            case 'pdf': return root.p620DownloadPDF(id,false);
            case 'print': return root.p620Print(id,false);
            case 'thermal': return root.p620DownloadPDF(id,true);
            case 'print-thermal': return root.p620Print(id,true);
            case 'escpos': return root.p620EscPos(id);
            case 'share': return root.p611Share(id);
          }
        };
      }
      field.addEventListener('input',filter);
      list.addEventListener('click',function (event) {
        var row=event.target.closest('button[data-invoice-id]');
        if (!row || !list.contains(row)) return;
        var selected=documents.find(function (tx) { return String(tx.id)===row.dataset.invoiceId; });
        if (selected) showDetail(selected);
      });
      filter();
    };
  }
  root.VyaparInvoiceWorkspace42={simplifyBusinessTools:simplifyBusinessTools,enhanceStock:enhanceStock,salePreview:salePreview};
  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded',function () {
      simplifyBusinessTools();enhanceStock();salePreview();
    },{once:true});
  } else {simplifyBusinessTools();enhanceStock();salePreview();}
})(window);
