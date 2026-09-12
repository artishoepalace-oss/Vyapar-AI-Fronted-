/* One update owner for automatic prompts, Settings and native APK installation. */
(function (root) {
  'use strict';
  const REPO = 'artishoepalace-oss/Vyapar-AI-Fronted-';
  const API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const RELEASES = 'https://github.com/' + REPO + '/releases/latest';
  const CHECK_KEY = 'vyapar_github_check_v1', LATER_KEY = 'vyapar_github_later_v1';
  let pending = null, manualRequested = false, latest = null, lastFocus = null;
  let download = {status:'idle'}, status = 'Check for the latest published GitHub release.';
  const native = () => root.AndroidApp && typeof root.AndroidApp.checkGitHubUpdate === 'function';
  const store = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const read = key => { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } };
  function current() {
    let name = document.querySelector('meta[name="vyapar-ui-version"]')?.content || '';
    try { name = root.AndroidApp?.getVersionName() || name; } catch (_) {}
    return name;
  }
  function compare(a, b) {
    const parts = v => /^v?\d+(?:\.\d+)*$/.test(String(v)) ? String(v).replace(/^v/, '').split('.').map(Number) : null;
    const x = parts(a), y = parts(b);
    if (!x || !y) throw new Error('Release version is not a supported numeric version.');
    for (let i=0; i<Math.max(x.length,y.length); i++) { const d=(x[i]||0)-(y[i]||0); if(d) return d>0?1:-1; }
    return 0;
  }
  function normalize(data) {
    if (!data || data.draft || data.prerelease || !data.tag_name) throw new Error('No stable release is published yet.');
    const version = String(data.tag_name).replace(/^v/, '');
    compare(version, version);
    const prefix = 'https://github.com/' + REPO + '/releases/download/';
    const assets = (data.assets || []).filter(a => a.state === 'uploaded' && /\.apk$/i.test(a.name || '') && a.size > 0 && String(a.browser_download_url || '').startsWith(prefix));
    const apk = assets.find(a => a.name === 'VyaparAI-' + version + '.apk') || (assets.length === 1 ? assets[0] : null);
    return {version, apkUrl:apk?.browser_download_url || '', size:apk?.size || 0, notes:String(data.body || '').slice(0,3000)};
  }
  function render() {
    document.querySelectorAll('[data-update-current]').forEach(el => { el.textContent = current(); });
    document.querySelectorAll('[data-update-latest]').forEach(el => { el.textContent = latest?.version || 'Not checked'; });
    document.querySelectorAll('[data-update-status]').forEach(el => { el.textContent = status; });
    document.querySelectorAll('[data-update-check]').forEach(el => { el.disabled = Boolean(pending); el.textContent = pending ? 'Checking…' : 'Check for updates'; });
    const busy = ['downloading','verifying'].includes(download.status);
    const ready = ['ready','permission','installer'].includes(download.status);
    document.querySelectorAll('[data-update-download]').forEach(el => {
      el.hidden = !ready && (!latest?.apkUrl || compare(latest.version,current())<=0);
      el.disabled = busy || Boolean(pending);
      el.textContent = busy ? (download.status === 'verifying' ? 'Verifying APK…' : 'Downloading…') : ready ? 'Install update' : 'Download & install';
    });
    document.querySelectorAll('[data-update-progress]').forEach(el => {
      el.hidden = !busy; if(download.total>0) { el.max=download.total; el.value=download.bytes||0; } else el.removeAttribute('value');
    });
    const stamp = read(CHECK_KEY);
    document.querySelectorAll('[data-update-checked]').forEach(el => { el.textContent=stamp?'Last checked: '+new Date(Number(stamp)).toLocaleString():'Not checked yet'; });
  }
  function cardMarkup() {
    return '<div class="update-versions"><div><small>Installed version</small><strong data-update-current></strong></div><div><small>Latest release</small><strong data-update-latest></strong></div></div>'+
      '<p class="update-status" data-update-status role="status" aria-live="polite"></p><progress data-update-progress hidden></progress>'+
      '<div class="update-actions"><button type="button" class="btn primary" data-update-download hidden>Download &amp; install</button><button type="button" class="btn" data-update-check>Check for updates</button></div>'+
      '<small class="update-checked" data-update-checked></small><button class="update-release-link" type="button" data-update-release>View GitHub release</button>'+
      '<p class="update-install-note">Your records stay on this device. Android asks you to confirm installation. Never uninstall the app to update it.</p>';
  }
  function mountSettings() {
    const card = document.getElementById('fs607Settings');
    if (card && !card.querySelector('.github-update-card')) {
      card.replaceChildren();
      const content = document.createElement('div'); content.className='github-update-card'; content.innerHTML=cardMarkup(); card.appendChild(content); render();
    }
  }
  function close() {
    const modal=document.getElementById('vyGitHubUpdate'); if(!modal)return;
    modal.remove(); if(lastFocus?.isConnected)lastFocus.focus();
  }
  function show() {
    if(document.getElementById('vyGitHubUpdate')) { render(); return; }
    lastFocus=document.activeElement;
    const modal=document.createElement('div'); modal.id='vyGitHubUpdate'; modal.className='github-update-overlay';
    modal.innerHTML='<section class="github-update-dialog" role="dialog" aria-modal="true" aria-labelledby="githubUpdateTitle" tabindex="-1"><div class="update-dialog-heading"><h2 id="githubUpdateTitle">App update</h2><button type="button" data-update-close aria-label="Close update dialog">×</button></div>'+cardMarkup()+'<details><summary>What’s new</summary><p class="update-release-notes"></p></details><button type="button" class="btn update-later" data-update-close>Not now</button></section>';
    modal.querySelector('.update-release-notes').textContent=latest?.notes || 'Release notes are available on GitHub.';
    modal.addEventListener('click', e=>{if(e.target===modal)close();});
    modal.addEventListener('keydown', e=>{
      if(e.key==='Escape'){ e.stopPropagation(); close(); }
      if(e.key==='Tab') {
        const els=[...modal.querySelectorAll('button:not([disabled]),summary')].filter(el=>!el.hidden && el.getClientRects().length);
        if(!els.length)return; const first=els[0],last=els[els.length-1];
        if(e.shiftKey && (document.activeElement===first || document.activeElement===modal.firstElementChild)){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    document.body.appendChild(modal); render(); modal.firstElementChild.focus();
  }
  function webRequest() {
    const controller=typeof AbortController==='function'?new AbortController():null;
    let timer;
    return Promise.race([
      fetch(API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',...(controller?{signal:controller.signal}:{})}).then(async res=>{
        if(!res.ok)throw new Error(res.status===403||res.status===429?'GitHub rate limit reached. Try again later.':res.status===404?'No published GitHub release found.':'GitHub could not be reached.');
        return res.json();
      }),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(new Error('Update check timed out. Check your connection and retry.'));},18000);})
    ]).finally(()=>clearTimeout(timer));
  }
  let nativeResolve=null, nativeReject=null, nativeSequence=0, activeRequest=0;
  root.onGitHubUpdateCheck=function(result) {
    if(!nativeResolve || result.requestId!==activeRequest)return;
    if(result.error)nativeReject(new Error(result.error));else nativeResolve(result.release);
  };
  function request() {
    if(!native())return webRequest();
    let timer;
    return new Promise((resolve,reject)=>{
      nativeResolve=resolve; nativeReject=reject;
      activeRequest=++nativeSequence;
      timer=setTimeout(()=>reject(new Error('Update check timed out. Check your connection and retry.')),20000);
      root.AndroidApp.checkGitHubUpdate(activeRequest);
    }).finally(()=>{clearTimeout(timer);nativeResolve=null;nativeReject=null;activeRequest=0;});
  }
  function check(manual) {
    if(manual)manualRequested=true;
    if(pending)return pending;
    if(!manual && Date.now()-Number(read(CHECK_KEY))<6*60*60*1000)return Promise.resolve(latest);
    if(['downloading','verifying'].includes(download.status)){if(manual)show();return Promise.resolve(latest);}
    status='Checking GitHub for updates…';
    pending=request().then(data=>{
      latest=normalize(data); store(CHECK_KEY,String(Date.now()));
      const newer=compare(latest.version,current())>0;
      status=newer?(latest.apkUrl?'Version '+latest.version+' is available · '+(latest.size/1048576).toFixed(1)+' MB.':'Version '+latest.version+' is published. Its APK has not been uploaded yet.'):'You have the latest version ('+current()+').';
      if(manualRequested || (newer && latest.apkUrl && read(LATER_KEY)!==latest.version))show();
      return latest;
    }).catch(error=>{status=error.message || 'Update check failed. Please retry.'; if(manualRequested)show();return null;})
      .finally(()=>{pending=null;manualRequested=false;render();});
    render(); return pending;
  }
  function openRelease(url) {
    if(root.AndroidApp?.openExternalUrl)root.AndroidApp.openExternalUrl(url);else root.open(url,'_blank','noopener');
  }
  function install() {
    if(pending || ['downloading','verifying'].includes(download.status))return;
    if(native() && ['ready','permission','installer'].includes(download.status)){root.AndroidApp.installGitHubUpdate();return;}
    if(!latest?.apkUrl || compare(latest.version,current())<=0)return;
    if(native()) { download={status:'downloading'};status='Starting APK download…';render();root.AndroidApp.downloadGitHubUpdate(); }
    else {openRelease(latest.apkUrl);status='APK download opened. Open the downloaded file on Android to install.';render();}
  }
  root.onGitHubUpdateProgress=function(data) { download=data;status=data.message || 'Downloading update…';render(); };
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-update-check],[data-update-download],[data-update-close],[data-update-release]'); if(!el)return;
    if(el.hasAttribute('data-update-check'))check(true);
    else if(el.hasAttribute('data-update-download'))install();
    else if(el.hasAttribute('data-update-release'))openRelease(RELEASES);
    else {if(latest)store(LATER_KEY,latest.version);close();}
  });
  function start() {
    mountSettings();
    new MutationObserver(mountSettings).observe(document.getElementById('screen-settings'),{childList:true,subtree:true});
    try { if(native()){download=JSON.parse(root.AndroidApp.getGitHubUpdateState());if(download.status!=='idle')status=download.message;render();} } catch (_) {}
    // Check only after startup has settled; never hold the splash or login flow.
    setTimeout(()=>check(false),7000);
    const previousBack=root.handleNativeBackPress;
    root.handleNativeBackPress=function(){
      if(document.getElementById('vyGitHubUpdate')) { if(latest)store(LATER_KEY,latest.version);close();return true; }
      return typeof previousBack==='function'?previousBack.apply(this,arguments):false;
    };
  }
  root.fs607CheckUpdate=check;
  root.VyaparUpdates={check,compare,normalize,install,close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
