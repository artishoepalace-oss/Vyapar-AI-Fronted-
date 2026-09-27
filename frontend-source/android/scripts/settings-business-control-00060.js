/* Vyapar AI 20.10.2004.00060.2026
   Settings Business Controls single-popup routing + editable account display name.
   Existing accounting, plan gating and form renderers remain authoritative. */
(function(root){
  'use strict';

  const VERSION='20.10.2004.00060.2026';
  const ACCOUNT_KEY='vyapar_ai_account_cache_v1';
  const STATE_KEY='vyapar_ai_prod_v1';
  let businessSession=null;
  let accountQueued=false;

  function readJson(key,fallback){
    try{
      const parsed=JSON.parse(localStorage.getItem(key)||'');
      return parsed&&typeof parsed==='object'?parsed:fallback;
    }catch(_){return fallback;}
  }

  function stateRef(){
    try{if(root.state&&typeof root.state==='object')return root.state;}catch(_){ }
    return readJson(STATE_KEY,{});
  }

  function saveState(){
    try{
      if(typeof save==='function'){save();return;}
      const value=stateRef();
      if(root.VyaparStorage&&typeof root.VyaparStorage.save==='function'){
        root.VyaparStorage.save(value);
        return;
      }
      localStorage.setItem(STATE_KEY,JSON.stringify(value));
    }catch(error){console.warn('Display name could not be saved',error);}
  }

  function toast(message){
    try{
      if(typeof showGlassToast==='function'){showGlassToast(message);return;}
      if(typeof advToast==='function'){advToast(message);return;}
    }catch(_){ }
  }

  function requireBusiness(){
    try{
      if(typeof requirePlan==='function')return requirePlan('business')!==false;
    }catch(_){ }
    return true;
  }

  function accountName(){
    const s=stateRef();
    const cached=readJson(ACCOUNT_KEY,{});
    const custom=String(s?.profile?.ownerName||'').trim();
    if(custom)return custom;
    const candidates=[
      cached?.name,cached?.displayName,cached?.fullName,
      cached?.user?.name,cached?.user?.displayName,cached?.user?.fullName,
      s?.profile?.name
    ];
    const found=candidates.find(value=>String(value||'').trim());
    if(found)return String(found).trim();
    const email=String(cached?.email||cached?.user?.email||'').trim();
    return email?email.split('@')[0].replace(/[._-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()):'Add name';
  }

  function pencilIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L4 15.8V20Z"></path><path d="m13.7 6.1 4.2 4.2"></path></svg>';
  }

  function closeNameEditor(row){
    if(!row)return;
    const editor=row.querySelector('.vy60-account-name-editor');
    const summary=row.querySelector('.vy60-account-name-summary');
    const edit=row.querySelector('[data-vy60-edit-name]');
    if(editor)editor.hidden=true;
    if(summary)summary.hidden=false;
    if(edit)edit.setAttribute('aria-expanded','false');
  }

  function openNameEditor(row){
    if(!row)return;
    const editor=row.querySelector('.vy60-account-name-editor');
    const summary=row.querySelector('.vy60-account-name-summary');
    const edit=row.querySelector('[data-vy60-edit-name]');
    const input=row.querySelector('[data-vy60-name-input]');
    if(summary)summary.hidden=true;
    if(editor)editor.hidden=false;
    if(edit)edit.setAttribute('aria-expanded','true');
    if(input){input.value=accountName()==='Add name'?'':accountName();setTimeout(()=>input.focus({preventScroll:true}),0);}
  }

  function saveDisplayName(row){
    const input=row?.querySelector('[data-vy60-name-input]');
    if(!input)return;
    const name=String(input.value||'').replace(/\s+/g,' ').trim().slice(0,80);
    if(name.length<2){
      input.setCustomValidity('Enter at least 2 characters.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    const s=stateRef();
    s.profile=s.profile&&typeof s.profile==='object'?s.profile:{};
    s.profile.ownerName=name;
    saveState();
    const value=row.querySelector('[data-vy60-account-name]');
    if(value)value.textContent=name;
    closeNameEditor(row);
    const chip=document.getElementById('vy863ProfileChip');
    if(chip)chip.dataset.vy863Signature='';
    document.dispatchEvent(new CustomEvent('vyapar:display-name-changed',{detail:{name}}));
    toast('Name saved.');
  }

  function ensureAccountNameEditor(){
    accountQueued=false;
    const section=document.querySelector('#screen-settings .settings-account-section');
    if(!section)return;
    let row=section.querySelector('.vy60-account-name-row');
    if(!row){
      row=document.createElement('div');
      row.className='vy60-account-name-row';
      row.innerHTML=''+
        '<div class="vy60-account-name-summary">'+
          '<div class="vy60-account-name-copy">'+
            '<small>NAME</small>'+
            '<b data-vy60-account-name></b>'+
            '<span>Shown in your profile shortcut on this device.</span>'+
          '</div>'+
          '<button type="button" class="vy60-name-pencil" data-vy60-edit-name aria-label="Edit name" aria-expanded="false">'+pencilIcon()+'</button>'+
        '</div>'+
        '<div class="vy60-account-name-editor" hidden>'+
          '<label for="vy60AccountNameInput">Name</label>'+
          '<input id="vy60AccountNameInput" data-vy60-name-input type="text" maxlength="80" autocomplete="name" placeholder="Enter your name">'+
          '<div class="vy60-account-name-actions">'+
            '<button type="button" class="btn" data-vy60-name-cancel>Cancel</button>'+
            '<button type="button" class="btn primary" data-vy60-name-save>Save name</button>'+
          '</div>'+
        '</div>';
      const host=section.querySelector('#productionAccountCardHost');
      if(host)section.insertBefore(row,host);
      else section.appendChild(row);
      row.querySelector('[data-vy60-edit-name]').addEventListener('click',()=>openNameEditor(row));
      row.querySelector('[data-vy60-name-cancel]').addEventListener('click',()=>closeNameEditor(row));
      row.querySelector('[data-vy60-name-save]').addEventListener('click',()=>saveDisplayName(row));
      row.querySelector('[data-vy60-name-input]').addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();saveDisplayName(row);}
        if(event.key==='Escape'){event.preventDefault();closeNameEditor(row);}
      });
    }
    const value=row.querySelector('[data-vy60-account-name]');
    const name=accountName();
    if(value&&row.querySelector('.vy60-account-name-editor')?.hidden!==false&&value.textContent!==name)value.textContent=name;
  }

  function scheduleAccountEditor(){
    if(accountQueued)return;
    accountQueued=true;
    requestAnimationFrame(ensureAccountNameEditor);
  }

  function legacySettingsHost(){return document.getElementById('vx622SettingsAdminHost');}

  function cleanupBusinessSession(){
    const session=businessSession;
    if(!session)return;
    businessSession=null;
    try{session.observer?.disconnect();}catch(_){ }
    if(session.host?.isConnected)session.host.remove();
    if(session.businessHost?.isConnected){
      if(session.businessHostAttr===null)session.businessHost.removeAttribute('data-vx621-host');
      else session.businessHost.setAttribute('data-vx621-host',session.businessHostAttr);
    }
    if(session.idHost?.isConnected){
      if(session.idHostId)session.idHost.id=session.idHostId;
      else session.idHost.removeAttribute('id');
    }
    const legacy=legacySettingsHost();
    if(legacy){legacy.innerHTML='';legacy.hidden=true;legacy.removeAttribute('data-vx621-host');}
  }

  function closeExistingBusinessSession(){
    if(!businessSession)return;
    try{root.VyaparFormSheets?.close?.(true);}catch(_){ }
    cleanupBusinessSession();
  }

  function prepareBusinessPopupHost(){
    closeExistingBusinessSession();
    try{
      if(document.getElementById('vyFormSheet'))root.VyaparFormSheets?.close?.(true);
    }catch(_){ }

    const legacy=legacySettingsHost();
    if(legacy){legacy.innerHTML='';legacy.hidden=true;legacy.removeAttribute('data-vx621-host');}

    const idHost=document.getElementById('businessModuleArea');
    const idHostId=idHost?.id||'';
    if(idHost)idHost.id='vy60HeldBusinessModuleArea';

    const businessHost=document.querySelector('#screen-business [data-vx621-host="business"]');
    const businessHostAttr=businessHost?.getAttribute('data-vx621-host')??null;
    if(businessHost)businessHost.setAttribute('data-vx621-host','business-hidden');

    const host=document.createElement('div');
    host.id='businessModuleArea';
    host.className='card vy60-business-popup-host';
    host.setAttribute('data-vx621-host','business');
    host.setAttribute('data-vy60-settings-popup','true');
    document.body.appendChild(host);

    businessSession={host,idHost,idHostId,businessHost,businessHostAttr,observer:null};
    return host;
  }

  function watchBusinessPopup(host){
    const overlay=host?.closest('#vyFormSheet')||document.getElementById('vyFormSheet');
    if(!overlay||!businessSession)return;
    const parent=overlay.parentNode;
    if(!parent)return;
    const observer=new MutationObserver(()=>{
      if(!overlay.isConnected)cleanupBusinessSession();
    });
    observer.observe(parent,{childList:true});
    businessSession.observer=observer;
  }

  function ensurePopup(host){
    if(!host)return false;
    if(!host.closest('#vyFormSheet')){
      try{root.VyaparFormSheets?.openHost?.(host,'business');}catch(error){console.warn('Business settings popup failed',error);}
    }
    const overlay=host.closest('#vyFormSheet')||document.getElementById('vyFormSheet');
    if(!overlay){cleanupBusinessSession();return false;}
    overlay.setAttribute('data-vy60-business-settings','true');
    watchBusinessPopup(host);
    return true;
  }

  root.vx622OpenSettingsModule=function(module){
    if(!requireBusiness())return false;
    const host=prepareBusinessPopupHost();
    try{
      root.p611Open?.(module);
    }catch(error){
      console.warn('Settings business module failed',module,error);
      cleanupBusinessSession();
      return false;
    }
    return ensurePopup(host);
  };

  root.vx622OpenSettingsDataManager=function(){
    if(!requireBusiness())return false;
    if(typeof root.vx621RenderDataManager!=='function')return false;
    const host=prepareBusinessPopupHost();
    try{
      root.vx621RenderDataManager();
    }catch(error){
      console.warn('Settings data manager failed',error);
      cleanupBusinessSession();
      return false;
    }
    return ensurePopup(host);
  };

  root.vx622CloseSettingsModule=function(){
    if(businessSession){
      try{root.VyaparFormSheets?.close?.(false);}catch(_){cleanupBusinessSession();}
      return;
    }
    const legacy=legacySettingsHost();
    if(legacy){legacy.innerHTML='';legacy.hidden=true;}
  };

  function boot(){
    scheduleAccountEditor();
    const settings=document.getElementById('screen-settings');
    if(settings){
      new MutationObserver(records=>{
        if(records.some(record=>record.addedNodes.length||record.type==='attributes'))scheduleAccountEditor();
      }).observe(settings,{childList:true,subtree:true,attributes:true,attributeFilter:['data-vy675-page','class']});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  root.VyaparSettings00060={version:VERSION,ensureAccountNameEditor,cleanupBusinessSession};
})(window);
