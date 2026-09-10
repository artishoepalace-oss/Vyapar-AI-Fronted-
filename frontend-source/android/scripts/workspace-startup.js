/* Final wiring: the app remains covered until its durable data has loaded. */
(function (root) {
  'use strict';
  let busy = false, lastFocus = null;
  function busyMessage(text) { const el = document.getElementById('workspaceBusyMessage'); if (el) el.textContent = text; }
  function setBusy(value, message) {
    if (value && busy) throw new Error('Please wait for the current import to finish.');
    busy = value;
    let overlay = document.getElementById('workspaceBusy');
    if (!value) { if (overlay) overlay.remove(); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); return; }
    lastFocus = document.activeElement;
    overlay = document.createElement('div'); overlay.id = 'workspaceBusy'; overlay.className = 'workspace-blocker';
    overlay.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="workspaceBusyMessage" tabindex="-1"><span class="workspace-spinner" aria-hidden="true"></span><p id="workspaceBusyMessage" role="status" aria-live="polite"></p></div>';
    document.body.appendChild(overlay); busyMessage(message || 'Saving…'); overlay.firstElementChild.focus();
  }
  function releaseStartupGuard() {
    const guard = document.getElementById('vy855BootGuard');
    if (guard) guard.remove();
    document.documentElement.classList.remove('vy855-booting');
    ['appLoader','vy647StartupSplash'].forEach(id => document.getElementById(id)?.remove());
    try { if(root.AndroidApp && root.AndroidApp.onStartupFrameReady) root.AndroidApp.onStartupFrameReady(); } catch(_) {}
  }
  function storageBlocked(message) {
    let el = document.getElementById('workspaceStorageBlocked');
    if (!el) {
      el = document.createElement('div'); el.className = 'workspace-blocker'; el.id = 'workspaceStorageBlocked';
      el.innerHTML = '<div role="alertdialog" aria-modal="true" aria-labelledby="storageBlockedTitle"><h2 id="storageBlockedTitle">Could not load your records</h2><p></p><button type="button" class="btn primary">Reopen app</button></div>';
      document.body.appendChild(el);
    }
    releaseStartupGuard();
    el.querySelector('p').textContent = message || 'Device storage could not be opened. Your saved data has not been overwritten.';
    el.querySelector('button').onclick = () => location.reload();
  }
  function storageStatus() {
    const status = root.VyaparStorage.getStatus();
    const label = status.error ? 'Not saved: ' + status.error : status.mode === 'loading' ? 'Opening device storage…' : status.mode === 'basic' ? 'Basic local storage · download backups regularly' : status.records.toLocaleString('en-IN') + ' records saved on this device';
    const settings = document.getElementById('settingsStatus'); if (settings && settings.textContent !== label) settings.textContent = label;
    let banner = document.getElementById('workspaceStorageError');
    if (status.error) {
      if (!banner) { banner = document.createElement('div'); banner.id = 'workspaceStorageError'; banner.setAttribute('role','alert'); banner.innerHTML = '<p></p><button type="button" class="btn">Retry save</button><button type="button" class="btn">Download backup</button>'; document.body.appendChild(banner); const buttons = banner.querySelectorAll('button'); buttons[0].onclick = () => root.VyaparStorage.save(root.state).catch(() => {}); buttons[1].onclick = () => root.downloadBackup(); }
      banner.querySelector('p').textContent = label;
    } else if (banner) banner.remove();
  }
  root.VyaparWorkspace = { setBusy, busyMessage, storageBlocked };
  root.addEventListener('vyapar:storage-status', storageStatus);
  document.addEventListener('keydown', event => {
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.key === 'Tab') document.documentElement.classList.add('keyboard-navigation');
  }, true);
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-navigation'), {passive:true});
  // Do not let background handlers save or edit while the import transaction is staged.
  document.addEventListener('click', event => { if (busy && !event.target.closest('#workspaceBusy')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  const renderSettings = root.renderSettings;
  root.renderSettings = function () { const result = renderSettings.apply(this, arguments); storageStatus(); return result; };
  const startupStorageWatchdog = setTimeout(() => {
    if (!root.VyaparStorage.bootReady && !document.getElementById('workspaceStorageBlocked')) {
      storageBlocked('Device storage is taking too long to open. Your saved data has not been overwritten. Reopen the app and try again.');
    }
  }, 12000);
  root.VyaparStorage.attach(() => root.state, saved => {
    const current = root.state;
    const restored = normalizeState(saved);
    restored.subscription = { ...current.subscription }; restored.plan = current.plan;
    root.state = restored;
  }).then(() => {
    clearTimeout(startupStorageWatchdog);
    if (!root.VyaparStorage.bootReady) return;
    root.VyaparInsights.invalidate(); root.render(); storageStatus();
  }).catch(error => {
    clearTimeout(startupStorageWatchdog);
    storageBlocked(error?.message || 'Device storage could not be opened. Your saved data has not been overwritten.');
  });
})(window);
