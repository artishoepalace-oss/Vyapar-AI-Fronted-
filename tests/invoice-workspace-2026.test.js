'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(project,'frontend-source/android/scripts/invoice-workspace-2026.js'),'utf8');

function element(extra={}) {
  return Object.assign({
    value:'',innerHTML:'',textContent:'',hidden:false,listeners:{},
    addEventListener(name,handler){this.listeners[name]=handler;},
    querySelector(){return null;},querySelectorAll(){return [];},
    closest(){return null;},remove(){this.removed=true;},
    setAttribute(){}
  },extra);
}
function boot(config={}) {
  const nodes=config.nodes||{};
  const doc={
    readyState:'loading',
    getElementById(id){return nodes[id]||null;},
    addEventListener(){},
    createElement(){return element();}
  };
  const window=Object.assign({
    renderBusiness(){},renderStock(){},renderSales(){},p620PrintTab(){},
    requestAnimationFrame(fn){fn();}
  },config.window||{});
  new Function('window','document',source)(window,doc);
  return {window,doc,nodes};
}

test('Business removes duplicate entry cards without removing original tools',()=>{
  const group=function(title,cards=[]) {
    return element({
      querySelector(){return element({textContent:title});},
      querySelectorAll(){return cards;}
    });
  };
  const duplicateInvoice=element({querySelector(){return element({textContent:'Invoice & Thermal'});}});
  const communication=element({querySelector(){return element({textContent:'Messaging & Reminders'});}});
  const sales=group('Sales-related Tools');
  const stock=group('Stock-related Tools');
  const docs=group('Documents & Communication',[duplicateInvoice,communication]);
  const screen=element({querySelectorAll(){return [sales,stock,docs];}});
  const app=boot({nodes:{'screen-business':screen}});
  app.window.renderBusiness();
  assert.equal(sales.removed,true);
  assert.equal(stock.removed,true);
  assert.equal(duplicateInvoice.removed,true);
  assert.equal(communication.removed,undefined);
});

test('Stock alerts show only low-stock items without deleting data',()=>{
  const healthy=element({querySelector(){return null;}});
  const low=element({querySelector(){return element();}});
  const heading=element();
  const alerts=element({
    querySelectorAll(){return [healthy,low];},
    querySelector(){return heading;}
  });
  const screen=element({querySelector(selector){return selector==='#stockAlerts'?alerts:null;}});
  const app=boot({nodes:{'screen-stock':screen}});
  app.window.renderStock();
  assert.equal(healthy.removed,true);
  assert.equal(low.removed,undefined);
  assert.equal(heading.textContent,'Low Stock Alerts (1)');
});

test('Sales live preview is derived without posting another transaction',()=>{
  const form=element({
    querySelector(selector) {
      if(selector==='.vy-sale-preview') return this.preview;
      if(selector==='.actions')return {before:(node)=>{this.preview=node;}};
      return null;
    }
  });
  const fields={
    sproduct:element({closest(){return form;}}),
    sqty:element({value:'2'}),
    ssell:element({value:'350'}),
    sbuy:element({value:'200'})
  };
  const app=boot({nodes:fields});
  app.window.renderSales();
  assert.match(form.preview.innerHTML,/₹700/);
  assert.match(form.preview.innerHTML,/₹300/);
  assert.equal(fields.sqty.min,'0.01');
});

test('Invoice chooser escapes names and routes PDF/Share to existing engines',()=>{
  const nodes={
    p620PrintBody:element(),
    vyInvoiceSearch:element({parentElement:element()}),
    vyInvoiceList:element({contains(){return true;}}),
    vyInvoiceDetail:element(),
    vyInvoiceCount:element()
  };
  let pdf=0,share=0,pdfShare=0,whatsappPdf=0;
  const app=boot({nodes,window:{
    __p620PrintTx:[{id:'inv-42',number:'INV-42',partyName:'<script>bad</script>',
      date:'2026-09-24',type:'SALE',total:700,receivedPaid:400,balance:300,
      items:[{name:'Shoe',qty:2,rate:350}]}],
    p620DownloadPDF(id,thermal){assert.equal(id,'inv-42');assert.equal(thermal,false);pdf++;},
    p620SharePDF(id,thermal,whatsappOnly){assert.equal(id,'inv-42');assert.equal(thermal,false);if(whatsappOnly)whatsappPdf++;else pdfShare++;},
    p611Share(id){assert.equal(id,'inv-42');share++;}
  }});
  app.window.p620PrintTab('documents');
  const list=nodes.vyInvoiceList;
  assert.match(list.innerHTML,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(list.innerHTML,/<script>/);
  const row={dataset:{invoiceId:'inv-42'}};
  list.listeners.click({target:{closest(){return row;}}});
  assert.equal(nodes.vyInvoiceDetail.hidden,false);
  const action=name=>({target:{closest(selector){
    return selector==='button[data-invoice-action]'?{dataset:{invoiceAction:name}}:null;
  }}});
  nodes.vyInvoiceDetail.onclick(action('pdf'));
  nodes.vyInvoiceDetail.onclick(action('share-pdf'));
  nodes.vyInvoiceDetail.onclick(action('whatsapp-pdf'));
  nodes.vyInvoiceDetail.onclick(action('share'));
  assert.equal(pdf,1);
  assert.equal(pdfShare,1);
  assert.equal(whatsappPdf,1);
  assert.equal(share,1);
});

test('Web and Android bundles reference the same single source',()=>{
  const build=fs.readFileSync(path.join(project,'tools/build-frontend-bundles.mjs'),'utf8');
  assert.match(build,/'invoice-workspace-2026.js'/);
  assert.match(build,/'invoice-workspace-2026.css'/);
  assert.equal((build.match(/'invoice-workspace-2026.js'/g)||[]).length,1);
});
