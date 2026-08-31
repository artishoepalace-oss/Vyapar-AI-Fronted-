/* Vyapar AI 6.7.1.2026 — Android native shell hotfix. */
(() => {
  "use strict";

  if (!document.documentElement.classList.contains("native-android")) return;

  function keepFooterInSettings() {
    document.querySelectorAll(".android-sheet-legal").forEach((node) => node.remove());

    const settings = document.getElementById("screen-settings");
    const stack = settings && (settings.querySelector(".settings-stack") || settings);
    if (!stack) return;

    const footers = Array.from(document.querySelectorAll("#appLegalFooter"));
    let footer = footers.shift() || null;
    footers.forEach((node) => node.remove());

    if (!footer) {
      footer = document.createElement("footer");
      footer.id = "appLegalFooter";
      footer.className = "app-legal-footer vy660-settings-footer";
      footer.innerHTML =
        '<img class="vy660-footer-logo" src="footer-logo.png" alt="Vyapar AI">' +
        '<span>© 2026 Vyapar AI. All Rights Reserved.</span>' +
        '<span class="app-legal-links">' +
          '<a href="privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>' +
          '<a href="terms.html" target="_blank" rel="noopener noreferrer">Terms</a>' +
          '<a href="refund.html" target="_blank" rel="noopener noreferrer">Refund</a>' +
          '<a href="delete-account.html" target="_blank" rel="noopener noreferrer">Delete Account</a>' +
        '</span>' +
        '<strong class="gupta-legacy-signature">From: Gupta Legacy</strong>';
    }

    if (footer.parentNode !== stack) stack.appendChild(footer);
    footer.style.display = "";
  }

  function blockPageSelectionGestures() {
    document.addEventListener("selectstart", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest("input, textarea, [contenteditable='true'], .allow-copy")) return;
      event.preventDefault();
    }, true);

    document.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (!target || !target.closest) return;
      if (target.closest("input, textarea, [contenteditable='true'], .allow-copy")) return;
      event.preventDefault();
    }, true);
  }

  function refresh() {
    keepFooterInSettings();
  }

  blockPageSelectionGestures();

  const observer = new MutationObserver(() => {
    clearTimeout(window.__vy671NativeShellTimer);
    window.__vy671NativeShellTimer = setTimeout(refresh, 24);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      refresh();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof window.renderSettings === "function" && !window.renderSettings.__vy671NativeShell) {
    const original = window.renderSettings;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      requestAnimationFrame(refresh);
      return result;
    };
    wrapped.__vy671NativeShell = true;
    window.renderSettings = wrapped;
  }
})();
