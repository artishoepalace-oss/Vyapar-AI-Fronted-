/* Earliest startup guard. This file must stay first in the combined script so a later runtime error cannot leave the app covered forever. */
(function (root) {
  'use strict';
  if (root.__vyaparStartupFailSafeInstalled) return;
  root.__vyaparStartupFailSafeInstalled = true;

  var fault = '';
  function rememberFault(value) {
    if (fault) return;
    try { fault = String(value && (value.message || value.reason || value) || ''); } catch (_) { fault = ''; }
  }
  if (root.addEventListener) {
    root.addEventListener('error', function (event) { rememberFault(event && (event.error || event.message)); }, true);
    root.addEventListener('unhandledrejection', function (event) { rememberFault(event && event.reason); }, true);
  }

  function nativeReady() {
    try {
      if (root.AndroidApp && typeof root.AndroidApp.onStartupFrameReady === 'function') root.AndroidApp.onStartupFrameReady();
    } catch (_) {}
  }

  function clearVisualGuard() {
    var doc = root.document;
    if (!doc) return;
    var html = doc.documentElement;
    var guard = doc.getElementById('vy855BootGuard');
    if (guard && guard.parentNode) guard.parentNode.removeChild(guard);
    if (html && html.classList) html.classList.remove('vy855-booting');
    var old = doc.getElementById('appLoader'); if (old && old.parentNode) old.parentNode.removeChild(old);
    old = doc.getElementById('vy647StartupSplash'); if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function destinationReady() {
    var doc = root.document, html = doc && doc.documentElement;
    if (!doc || !html) return false;
    var session = html.getAttribute('data-vyapar-session');
    if (session === 'login') return !!doc.getElementById('vyaparOtpGate');
    if (!session || session === 'restoring') return false;
    if (!root.VyaparStorage || root.VyaparStorage.bootReady !== true) return false;
    var screen = doc.querySelector('.screen:not(.hide)');
    return !!(screen && screen.children && screen.children.length);
  }

  function showRecovery() {
    var doc = root.document;
    if (!doc || !doc.body || doc.getElementById('vyStartupRecovery')) return;
    var box = doc.createElement('div');
    box.id = 'vyStartupRecovery';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#000;color:#fff;font-family:system-ui,-apple-system,sans-serif;text-align:center;';
    box.innerHTML = '<div style="width:min(360px,100%);padding:24px;border-radius:22px;background:#171717"><strong style="display:block;font-size:20px;margin-bottom:10px">Vyapar AI could not finish opening</strong><p style="margin:0 0 18px;line-height:1.45;color:#cfcfcf">Your saved business data has not been cleared or overwritten.</p><button type="button" style="border:0;border-radius:14px;padding:12px 18px;font-weight:700">Reopen app</button></div>';
    var button = box.getElementsByTagName('button')[0];
    if (button) button.onclick = function () { root.location.reload(); };
    doc.body.appendChild(box);
  }

  function releaseOrRecover() {
    clearVisualGuard();
    if (!destinationReady()) showRecovery();
    nativeReady();
  }

  root.__vyaparReleaseStartupGuard = function () {
    clearVisualGuard();
    nativeReady();
  };

  root.setTimeout(function () {
    var doc = root.document, html = doc && doc.documentElement;
    var guard = doc && doc.getElementById('vy855BootGuard');
    if (guard || (html && html.classList && html.classList.contains('vy855-booting'))) releaseOrRecover();
  }, 9000);
})(window);
