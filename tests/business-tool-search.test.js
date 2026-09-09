'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend-source/android/scripts/business-tool-search.js'), 'utf8');

function fixture() {
  function control() {
    const events = {};
    return { value: '', dataset: {}, hidden: false, textContent: '', focused: false,
      addEventListener(type, handler) { (events[type] ||= []).push(handler); },
      fire(type, event = {}) { (events[type] || []).forEach(handler => handler(event)); },
      focus() { this.focused = true; }, events };
  }
  const input = control(), clear = control(), status = control();
  const sale = { textContent: 'Transactions New Sale Purchase', hidden: false, draft: 'keep me' };
  const customer = { textContent: 'Customers & Udhaar Payment In', hidden: false };
  const gst = { textContent: 'Advanced GST & Tax', hidden: false };
  const groups = [
    { hidden: false, cards: [sale, customer], title: 'Daily Business' },
    { hidden: false, cards: [gst], title: 'Accounting & Compliance' }
  ];
  groups.forEach(group => {
    group.querySelector = () => ({ textContent: group.title });
    group.querySelectorAll = () => group.cards;
  });
  const results = { querySelectorAll: () => groups };
  const controls = { '#businessToolSearch': input, '#businessToolSearchClear': clear,
    '#businessToolSearchStatus': status, '#businessToolResults': results };
  const root = { querySelector: selector => controls[selector] };
  const env = { window: {} };
  vm.runInNewContext(source, env);
  env.window.VyaparBusinessTools.bind(root);
  return { input, clear, status, groups, sale, customer, gst, root, api: env.window.VyaparBusinessTools,
    search(value) { input.value = value; input.fire('input'); } };
}

test('Tool search matches case-insensitive multiword text and group titles without rebuilding cards', () => {
  const f = fixture();
  f.search('  DAILY   PURCHASE  ');
  assert.equal(f.sale.hidden, false);
  assert.equal(f.customer.hidden, true);
  assert.equal(f.groups[1].hidden, true);
  assert.equal(f.status.textContent, '1 tool found');
  assert.equal(f.sale.draft, 'keep me');
  f.search('GST and TAX');
  assert.equal(f.gst.hidden, false);
  assert.equal(f.groups[0].hidden, true);
});

test('No-result search, clear and native search reset restore all tools and focus', () => {
  const f = fixture();
  f.search('<img onerror=alert(1)>');
  assert(f.groups.every(group => group.hidden));
  assert.match(f.status.textContent, /No tools found/);
  f.clear.fire('click');
  assert.equal(f.input.value, '');
  assert.equal(f.input.focused, true);
  assert.equal(f.clear.hidden, true);
  assert.equal(f.status.textContent, '');
  assert(f.groups.every(group => !group.hidden && group.cards.every(card => !card.hidden)));
  f.search('GST');
  f.input.value = '';
  f.input.fire('search');
  assert(f.groups.every(group => !group.hidden));
});

test('Escape clears only an active search; repeated binding never duplicates listeners', () => {
  const f = fixture();
  f.api.bind(f.root);
  assert.equal(f.input.events.input.length, 1);
  let prevented = 0, stopped = 0;
  const event = { key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
  f.input.fire('keydown', event);
  assert.equal(prevented, 0);
  f.search('Customer');
  f.input.fire('keydown', event);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(f.input.value, '');
  // Existing page wrappers may remove a group after first render: query live groups.
  f.groups.pop();
  f.search('GST');
  assert.match(f.status.textContent, /No tools found/);
});

function categoryFixture() {
  const f=fixture(),frames=[],store=new Map();
  function classes(initial=[]) {
    const set=new Set(initial);
    return {add:v=>set.add(v),remove:v=>set.delete(v),contains:v=>set.has(v),toggle(v,force){force?set.add(v):set.delete(v);}};
  }
  function attrs(node) {
    node.attributes={};node.dataset||={};
    node.setAttribute=(key,value)=>{node.attributes[key]=value;};
    node.removeAttribute=key=>{delete node.attributes[key];if(key==='data-p1-mode')delete node.dataset.p1Mode;};
    return node;
  }
  f.groups.forEach(g=>{attrs(g);g.classList=classes(['vx621-group']);});
  const documents=attrs({hidden:false,cards:[{textContent:'Invoice PDF',hidden:false}],title:'Documents & Communication',classList:classes(['vx621-group'])});
  documents.querySelector=()=>({textContent:documents.title});documents.querySelectorAll=()=>documents.cards;
  f.groups.push(documents);
  const recent=attrs({hidden:false,classList:classes(['vx621-recent']),querySelector:()=>({textContent:'Recent activity'})});
  let bar;
  const wrapper={children:f.groups};
  const shell={children:[{},wrapper,recent],firstChild:{},
    querySelector:s=>s.includes('modebar')?bar:null,
    querySelectorAll:s=>s==='.vx621-group,.vx621-recent'?[...f.groups,recent]:[],
    insertBefore(node){bar=node;}};
  const originalQuery=f.root.querySelector;
  f.root.querySelector=s=>s==='.vx621-business-shell'?shell:s.includes('modebar')?(s.includes('aria-selected')?bar?.buttons.find(b=>b.attributes['aria-selected']==='true'):bar):s==='.vx621-recent'?recent:originalQuery(s);
  f.root.querySelectorAll=s=>s.includes('p1-mode-section')?[...f.groups,recent].filter(g=>g.classList.contains('p1-mode-section')):[];
  const doc={readyState:'complete',documentElement:{classList:classes(),dataset:{}},body:{},
    getElementById:id=>id==='screen-business'?f.root:null,querySelector:()=>null,querySelectorAll:()=>[],
    createElement(){
      const node=attrs({events:{},buttons:[],addEventListener(type,handler){this.events[type]=handler;},querySelectorAll(){return this.buttons;}});
      Object.defineProperty(node,'innerHTML',{set(html){this.buttons=Array.from(html.matchAll(/data-mode="([^"]+)"/g),m=>{
        const button=attrs({dataset:{mode:m[1]},focused:false,focus(){this.focused=true;}});
        button.closest=()=>button;button.click=()=>node.events.click({target:button});return button;
      });}});
      return node;
    }};
  const win={VyaparBusinessTools:f.api};
  const production=fs.readFileSync(path.join(__dirname,'../frontend-source/android/scripts/production-ui-670p1.js'),'utf8');
  vm.runInNewContext(production,{window:win,document:doc,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},requestAnimationFrame:cb=>frames.push(cb),MutationObserver:class{observe(){}}});
  frames.shift()();
  return {...f,documents,recent,bar,get visible(){return f.groups.filter(g=>!g.hidden).map(g=>g.dataset.p1Mode);},choose(mode){bar.buttons.find(b=>b.dataset.mode===mode).click();}};
}

test('Nested Business groups show only the selected category, including after search reset',()=>{
  const f=categoryFixture();
  assert.deepEqual(f.visible,['daily']);
  f.choose('accounts');assert.deepEqual(f.visible,['accounts']);
  f.search('invoice');assert.deepEqual(f.visible,['documents']);
  assert.equal(f.documents.attributes['aria-hidden'],'false','search results must be exposed to screen readers');
  f.clear.fire('click');assert.deepEqual(f.visible,['accounts']);
  f.choose('activity');assert.deepEqual(f.visible,[]);assert.equal(f.recent.hidden,false);
  f.search('GST');assert.deepEqual(f.visible,['accounts']);assert.equal(f.recent.hidden,true);
  f.clear.fire('click');assert.equal(f.recent.hidden,false);
});

test('Changing category clears search and arrow keys select/focus the adjacent tab',()=>{
  const f=categoryFixture();f.search('No such tool');f.choose('documents');
  assert.equal(f.input.value,'');assert.equal(f.status.textContent,'');assert.deepEqual(f.visible,['documents']);
  let prevented=false;
  f.bar.events.keydown({key:'ArrowRight',target:f.bar.buttons[2],preventDefault(){prevented=true;}});
  assert(prevented);assert.equal(f.bar.buttons[3].focused,true);assert.equal(f.bar.buttons[3].attributes['aria-selected'],'true');assert.equal(f.recent.hidden,false);
});

test('A legacy tool replacing the idle placeholder reveals its panel without losing form content',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../frontend-source/android/scripts/app.js'),'utf8');
  const code=app.slice(app.indexOf('function observeHost(host){'),app.indexOf('// Wrap platform open only'));
  let mutation;
  const host={dataset:{},hidden:true,children:[{classList:{contains:()=>true}}],querySelector:()=>null};
  Object.defineProperty(host,'firstElementChild',{get(){return this.children[0];}});
  const env={window:{},MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},requestAnimationFrame:fn=>fn(),decorateGenericDeleteTables(){},decorateTransactionTable(){}};
  vm.runInNewContext(code+'window.observeHost=observeHost;',env);env.window.observeHost(host);
  mutation();assert.equal(host.hidden,true);
  const form={classList:{contains:()=>false},draft:'Keep this invoice draft'};host.children=[form];mutation();
  assert.equal(host.hidden,false);assert.equal(host.children[0],form);assert.equal(form.draft,'Keep this invoice draft');
});
