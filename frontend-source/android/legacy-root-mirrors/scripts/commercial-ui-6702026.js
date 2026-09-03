(() => {
  "use strict";

  const ROOT_CLASS = "commercial-ui-v1";
  const HELP_THRESHOLD = 86;

  function readSavedTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem("vyapar_ai_prod_v1") || "{}");
      return saved && saved.settings ? saved.settings.theme : "";
    } catch (_) {
      return "";
    }
  }

  function applyRootMode() {
    const root = document.documentElement;
    root.classList.add(ROOT_CLASS);

    // Default to the cleaner light system only when the user has never
    // explicitly chosen a theme. Existing light/dark preferences are kept.
    if (!readSavedTheme() && !root.classList.contains("theme-light")) {
      root.classList.add("theme-light");
      root.style.colorScheme = "light";
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute("content", "#F8F9FA");
    }
  }

  function cleanStaticChrome() {
    const tagline = document.querySelector(".brand .tag");
    if (tagline && /clear business overview/i.test(tagline.textContent || "")) {
      tagline.textContent = "Business overview";
    }

    const themeButton = document.getElementById("themeToggle");
    if (themeButton) {
      themeButton.setAttribute("aria-label", "Appearance");
      themeButton.setAttribute("title", "Appearance");
    }
  }

  function makeHelpControl(text, owner) {
    // v6.7.4: information popup buttons are intentionally disabled.
    // Keep the UI direct and readable; no hidden help affordances.
    return;
  }

  function collapseLongHelp(scope = document) {
    // Remove any legacy help controls created by earlier builds.
    scope.querySelectorAll(".cu-help").forEach((node) => node.remove());

    // Restore helper text that older builds clamped behind an info button.
    scope.querySelectorAll(".cu-clamped-help").forEach((node) => {
      node.classList.remove("cu-clamped-help");
      const full = (node.getAttribute("title") || "").trim();
      if (full && /quick tip/i.test((node.textContent || "").trim())) node.textContent = full;
      node.removeAttribute("title");
      node.dataset.cuProcessed = "1";
    });

    // Remove stale Quick tip placeholders that no longer have visible content.
    scope.querySelectorAll(".p2-form-intro").forEach((node) => {
      node.querySelectorAll(".cu-help").forEach((help) => help.remove());
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (/^quick tip$/i.test(text)) node.remove();
      else node.dataset.cuProcessed = "1";
    });
  }

  function improveButtonSemantics(scope = document) {
    scope.querySelectorAll("button").forEach((button) => {
      if (!button.getAttribute("aria-label")) {
        const label = (button.textContent || "").replace(/\s+/g, " ").trim();
        if (label && label.length <= 48) button.setAttribute("aria-label", label);
      }
    });
  }

  function polish(scope = document) {
    cleanStaticChrome();
    collapseLongHelp(scope);
    improveButtonSemantics(scope);
  }

  function startObserver() {
    if (!document.body || !window.MutationObserver) return;
    let scheduled = false;

    const observer = new MutationObserver((records) => {
      if (scheduled) return;
      const hasAddedNodes = records.some((record) => record.addedNodes && record.addedNodes.length);
      if (!hasAddedNodes) return;

      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        polish(document);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  applyRootMode();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      polish(document);
      startObserver();
    }, { once: true });
  } else {
    polish(document);
    startObserver();
  }

  // v6.7.4: legacy info controls are removed rather than opened/closed.
  document.addEventListener("click", () => {
    document.querySelectorAll(".cu-help").forEach((node) => node.remove());
  });
})();
