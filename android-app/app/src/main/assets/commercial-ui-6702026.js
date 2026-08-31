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
    if (!text || !owner || owner.dataset.cuHelpReady === "1") return;
    owner.dataset.cuHelpReady = "1";

    const help = document.createElement("span");
    help.className = "cu-help";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cu-help-button";
    button.textContent = "i";
    button.setAttribute("aria-label", "More information");
    button.setAttribute("aria-expanded", "false");

    const panel = document.createElement("span");
    panel.className = "cu-help-panel";
    panel.textContent = text;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const opening = !help.classList.contains("is-open");
      document.querySelectorAll(".cu-help.is-open").forEach((node) => {
        if (node !== help) {
          node.classList.remove("is-open");
          const other = node.querySelector(".cu-help-button");
          if (other) other.setAttribute("aria-expanded", "false");
        }
      });
      help.classList.toggle("is-open", opening);
      button.setAttribute("aria-expanded", String(opening));
    });

    help.append(button, panel);
    owner.appendChild(help);
  }

  function collapseLongHelp(scope = document) {
    const selectors = [
      ".p2-field-hint",
      ".p2-preview-note",
      ".p2-tx-context",
      ".muted"
    ];

    scope.querySelectorAll(selectors.join(",")).forEach((node) => {
      if (node.dataset.cuProcessed === "1") return;
      const full = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (full.length < HELP_THRESHOLD) return;

      node.dataset.cuProcessed = "1";
      node.classList.add("cu-clamped-help");
      node.setAttribute("title", full);

      const label =
        node.closest(".p2-field")?.querySelector(".p2-field-label") ||
        node.previousElementSibling;

      if (label && label.nodeType === Node.ELEMENT_NODE) {
        makeHelpControl(full, label);
      }
    });

    scope.querySelectorAll(".p2-form-intro").forEach((node) => {
      if (node.dataset.cuProcessed === "1") return;
      const full = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!full) return;

      node.dataset.cuProcessed = "1";
      if (full.length >= HELP_THRESHOLD) {
        node.textContent = "Quick tip";
        makeHelpControl(full, node);
      }
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

  document.addEventListener("click", (event) => {
    if (event.target.closest(".cu-help")) return;
    document.querySelectorAll(".cu-help.is-open").forEach((node) => {
      node.classList.remove("is-open");
      const button = node.querySelector(".cu-help-button");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  });
})();
