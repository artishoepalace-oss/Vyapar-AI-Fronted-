const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync('frontend-source/android/scripts/app.js','utf8');
const start=app.indexOf('window.vx621GenericDelete=async function');
const source=app.slice(start,app.indexOf('\nfunction observeHost',start));
function fixture(confirmed){
 const calls=[],rows=['a','b','c'].map((id,i)=>({checked:i<2,dataset:{fn:'remove',arg:id}}));
 const context={window:{},document:{querySelectorAll:()=>rows},alert:()=>{},console,confirmAction:async()=>confirmed};
 context.window.remove=async id=>{calls.push('start-'+id);await new Promise(resolve=>setTimeout(resolve,10));calls.push('end-'+id);};
 vm.runInNewContext(source,context);return {calls,remove:context.window.vx621GenericDelete};
}
test('Generic bulk deletion waits for each record validation and excludes unselected rows',async()=>{
 const f=fixture(true);await f.remove('records','selected');assert.deepEqual(f.calls,['start-a','end-a','start-b','end-b']);
});
test('Cancelling bulk confirmation never invokes a record deletion',async()=>{
 const f=fixture(false);await f.remove('records','selected');assert.deepEqual(f.calls,[]);
});
