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
