/* Vyapar AI Android native shell + SwiftUI-inspired UI behavior. */
(() => {
  "use strict";

  const root = document.documentElement;
  if (!root.classList.contains("native-android")) return;
  if (window.__vyaparNativeShellSwiftUI) return;
  window.__vyaparNativeShellSwiftUI = true;

  root.classList.add("swiftui-android-v2");

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

  function readTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem("vyapar_ai_prod_v1") || "{}");
      return saved?.settings?.theme || "";
    } catch (_) {
      return "";
    }
  }

  function syncThemeChrome() {
    const stored = readTheme();
    const dark = stored === "dark" || (!root.classList.contains("theme-light") && stored !== "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#000000" : "#F2F2F7");
    root.style.background = dark ? "#000000" : "#F2F2F7";
    if (document.body) document.body.style.background = dark ? "#000000" : "#F2F2F7";
  }

  function normalizeStaticChrome() {
    const tagline = document.querySelector(".brand .tag");
    if (tagline && /clear business overview|business overview/i.test(tagline.textContent || "")) {
      tagline.textContent = "Business overview";
    }

    const themeButton = document.getElementById("themeToggle");
    if (themeButton) {
      themeButton.setAttribute("aria-label", "Appearance");
      themeButton.setAttribute("title", "Appearance");
    }
  }

  function improveButtonSemantics(scope = document) {
    scope.querySelectorAll("button").forEach((button) => {
      if (!button.getAttribute("aria-label")) {
        const label = (button.textContent || "").replace(/\s+/g, " ").trim();
        if (label && label.length <= 48) button.setAttribute("aria-label", label);
      }
    });
  }

  function markSettingsRows() {
    const settings = document.getElementById("screen-settings");
    if (!settings) return;
    settings.querySelectorAll(".vx622-settings-row").forEach((row) => row.classList.add("ios-settings-row"));
  }

  function enforceTapOnlyNav() {
    const nav = document.getElementById("nav");
    if (!nav || nav.dataset.iosTapOnly === "1") return;
    nav.dataset.iosTapOnly = "1";
    nav.style.touchAction = "manipulation";
    nav.addEventListener("dragstart", (event) => event.preventDefault(), { passive: false });
  }

  function addPressedFeedback() {
    if (document.body?.dataset.iosPressedReady === "1") return;
    if (document.body) document.body.dataset.iosPressedReady = "1";
    const selector = "button, .btn, .vx621-action, .android-quick-action";

    document.addEventListener("pointerdown", (event) => {
      const target = event.target?.closest?.(selector);
      if (!target || target.disabled) return;
      target.classList.add("ios-pressed");
    }, { passive: true });

    const clear = () => document.querySelectorAll(".ios-pressed").forEach((node) => node.classList.remove("ios-pressed"));
    document.addEventListener("pointerup", clear, { passive: true });
    document.addEventListener("pointercancel", clear, { passive: true });
  }

  function refresh() {
    root.classList.add("swiftui-android-v2");
    keepFooterInSettings();
    normalizeStaticChrome();
    improveButtonSemantics(document);
    markSettingsRows();
    enforceTapOnlyNav();
    syncThemeChrome();
  }

  blockPageSelectionGestures();
  syncThemeChrome();

  let refreshTimer = 0;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes && record.addedNodes.length)) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 40);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      addPressedFeedback();
      refresh();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    addPressedFeedback();
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof window.renderSettings === "function" && !window.renderSettings.__vySwiftUINativeShell) {
    const original = window.renderSettings;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      requestAnimationFrame(refresh);
      return result;
    };
    wrapped.__vySwiftUINativeShell = true;
    window.renderSettings = wrapped;
  }

  const originalToggle = window.toggleTheme;
  if (typeof originalToggle === "function" && !originalToggle.__vySwiftUITheme) {
    const wrappedToggle = function () {
      const result = originalToggle.apply(this, arguments);
      requestAnimationFrame(syncThemeChrome);
      return result;
    };
    wrappedToggle.__vySwiftUITheme = true;
    window.toggleTheme = wrappedToggle;
  }
})();
