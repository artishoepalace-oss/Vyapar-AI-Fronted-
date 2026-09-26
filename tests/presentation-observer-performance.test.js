'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('presentation observers do not watch transition style churn',()=>{
  const graphite=read('frontend-source/android/scripts/graphite-maroon-863.js');
  const premium=read('frontend-source/android/scripts/premium-tier-864.js');
  assert.match(graphite,/attributeFilter:\['class'\]/);
  assert.match(premium,/attributeFilter:\['class','src'\]/);
  assert.doesNotMatch(graphite,/attributeFilter:\[[^\]]*'style'/);
  assert.doesNotMatch(premium,/attributeFilter:\[[^\]]*'style'/);
});


test('empty and already-notified reminder scans do not refresh the open page',()=>{
  const vm=require('node:vm'),source=read('frontend-source/android/scripts/app.js');
  const fn=source.slice(source.indexOf('function checkDueReminders(){'),source.indexOf('\nconst prevHome=',source.indexOf('function checkDueReminders(){')));
  const state={paymentReminders611:[],serviceReminders611:[]};let saves=0,notifications=0;
  const context={S:()=>state,today:()=> '2026-09-26',biz:()=> 'shop',cash:String,notify:()=>notifications++,saveAll:()=>saves++};
  vm.createContext(context);vm.runInContext(fn,context);
  context.checkDueReminders();assert.equal(saves,0);
  state.paymentReminders611.push({businessId:'shop',nextReminder:'2026-09-25',dueAmount:50});
  state.serviceReminders611.push({businessId:'other',nextDate:'2026-09-25'});
  context.checkDueReminders();assert.equal(saves,1);assert.equal(notifications,1);
  assert.equal(state.paymentReminders611[0].notifiedOn,'2026-09-26');
  context.checkDueReminders();assert.equal(saves,1);assert.equal(notifications,1);
});
