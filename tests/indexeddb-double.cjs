'use strict';
// Asynchronous transaction double with copy-on-commit and injected aborts.
// This checks storage orchestration; it is not an Android/browser integration test.
module.exports=function indexedDbDouble(){
  const stores=new Map();
  const control={failWrite:false,unavailable:false,stores};
  const copy=value=>value===undefined?undefined:structuredClone(value);
  const db={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore(name){stores.set(name,new Map());},close(){},transaction(names,mode){
    const writable=mode==='readwrite';
    const shadow=new Map([...stores].map(([key,value])=>[key,new Map([...value].map(([k,v])=>[k,copy(v)]))]));
    let pending=0,aborted=false,finished=false,timer;
    const tx={error:null,objectStore(name){
      const map=shadow.get(name);if(!map)throw Error('Unknown store');
      function request(kind,key,value){
        const r={result:undefined,error:null}; pending++;
        const captured=copy(value);
        queueMicrotask(()=>{
          if(aborted)return;
          try{if(kind==='get')r.result=copy(map.get(key));if(kind==='put')map.set(key,captured);if(kind==='delete')map.delete(key);if(r.onsuccess)r.onsuccess({target:r});}
          catch(error){tx.error=error;tx.abort();}
          pending--;schedule();
        });return r;
      }
      return {get:key=>request('get',key),put:(value,key)=>request('put',key,value),delete:key=>request('delete',key)};
    },abort(){if(aborted||finished)return;aborted=true;clearTimeout(timer);queueMicrotask(()=>{if(tx.onabort)tx.onabort();});}};
    function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(aborted||pending||finished)return;if(writable&&control.failWrite){control.failWrite=false;tx.error=new Error('QuotaExceededError');tx.abort();return;}if(writable)shadow.forEach((value,key)=>stores.set(key,value));finished=true;if(tx.oncomplete)tx.oncomplete();},0);}
    schedule();return tx;
  }};
  control.indexedDB={open(){const r={result:db,error:null};setTimeout(()=>{if(control.unavailable){r.error=new Error('Storage unavailable');r.onerror();return;}if(!stores.size&&r.onupgradeneeded)r.onupgradeneeded();r.onsuccess();},0);return r;}};
  return control;
};
