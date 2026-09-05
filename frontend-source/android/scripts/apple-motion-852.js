/* Vyapar AI 8.5.2.2026 — Apple-inspired Liquid Glass motion layer.
   Interaction polish only; existing navigation/theme/business logic stays authoritative. */
(function () {
  'use strict';

  const root = document.documentElement;
  root.classList.add('vy852-apple-liquid');

  const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function themeButton() {
    return document.getElementById('themeToggle');
  }

  function currentLight() {
    return root.classList.contains('theme-light') || document.body.classList.contains('theme-light');
  }

  function addThemeBloom(event, targetLight) {
    if (reducedMotion()) return;

    document.querySelectorAll('.vy852-theme-bloom').forEach(node => node.remove());
    const button = themeButton();
    const rect = button ? button.getBoundingClientRect() : null;
    const x = event && Number.isFinite(event.clientX) && event.clientX > 0
      ? event.clientX
      : (rect ? rect.left + rect.width / 2 : window.innerWidth - 30);
    const y = event && Number.isFinite(event.clientY) && event.clientY > 0
      ? event.clientY
      : (rect ? rect.top + rect.height / 2 : 42);

    const farX = Math.max(x, Math.max(0, window.innerWidth - x));
    const farY = Math.max(y, Math.max(0, window.innerHeight - y));
    const radius = Math.sqrt(farX * farX + farY * farY);
    const scale = Math.max(24, radius / 22 + 2);

    const bloom = document.createElement('div');
    bloom.className = 'vy852-theme-bloom';
    bloom.style.left = x + 'px';
    bloom.style.top = y + 'px';
    bloom.style.setProperty('--vy852-bloom-scale', String(scale));
    bloom.style.setProperty('--vy852-bloom-bg', targetLight ? '#eef5fb' : '#06111f');
    document.body.appendChild(bloom);
    setTimeout(() => bloom.remove(), 620);
  }

  function popThemeButton() {
    const button = themeButton();
    if (!button || reducedMotion()) return;
    button.classList.remove('vy852-theme-pop');
    void button.offsetWidth;
    button.classList.add('vy852-theme-pop');
    setTimeout(() => button.classList.remove('vy852-theme-pop'), 620);
  }

  const previousToggleTheme = typeof window.toggleTheme === 'function' ? window.toggleTheme : null;
  if (previousToggleTheme && !previousToggleTheme.__vy852Wrapped) {
    const wrappedToggleTheme = function (event) {
      const targetLight = !currentLight();
      root.classList.add('vy852-theme-animation');
      document.body.classList.add('vy852-theme-animation');
      addThemeBloom(event, targetLight);
      popThemeButton();

      const result = previousToggleTheme.call(this, event);
      clearTimeout(window.__vy852ThemeCleanup);
      window.__vy852ThemeCleanup = setTimeout(() => {
        root.classList.remove('vy852-theme-animation');
        document.body.classList.remove('vy852-theme-animation');
      }, 620);
      return result;
    };
    wrappedToggleTheme.__vy852Wrapped = true;
    window.toggleTheme = wrappedToggleTheme;
  }

  /* Spring-close the More sheet before delegating to the existing authoritative closer. */
  const originalCloseMoreSheet = typeof window.closeMoreSheet === 'function' ? window.closeMoreSheet : null;
  let closingSheet = false;

  function finishSheetClose(restoreNav) {
    if (!originalCloseMoreSheet) return;
    originalCloseMoreSheet(restoreNav);
    closingSheet = false;
  }

  function animateSheetClose(restoreNav) {
    const overlay = document.getElementById('androidMoreSheet');
    if (!overlay || reducedMotion() || !originalCloseMoreSheet) {
      finishSheetClose(restoreNav);
      return;
    }
    if (closingSheet) return;
    closingSheet = true;
    overlay.classList.add('vy852-closing');
    setTimeout(() => finishSheetClose(restoreNav), 230);
  }

  if (originalCloseMoreSheet && !originalCloseMoreSheet.__vy852Wrapped) {
    const wrappedClose = function (restoreNav) {
      animateSheetClose(restoreNav);
    };
    wrappedClose.__vy852Wrapped = true;
    window.closeMoreSheet = wrappedClose;
  }

  /* Capture sheet actions so the close animation is visible instead of instant removal. */
  document.addEventListener('click', event => {
    const overlay = event.target && event.target.closest ? event.target.closest('#androidMoreSheet') : null;
    if (!overlay) return;

    const close = event.target.closest('.android-sheet-close');
    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      animateSheetClose(true);
      return;
    }

    const item = event.target.closest('.android-sheet-item[data-tab]');
    if (item) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tab = item.getAttribute('data-tab');
      const delay = reducedMotion() ? 0 : 180;
      const sheet = document.getElementById('androidMoreSheet');
      if (sheet) sheet.classList.add('vy852-closing');
      setTimeout(() => {
        if (originalCloseMoreSheet) originalCloseMoreSheet(false);
        closingSheet = false;
        if (tab && typeof window.setTab === 'function') window.setTab(tab, false);
      }, delay);
      return;
    }

    if (event.target === overlay) {
      event.preventDefault();
      event.stopImmediatePropagation();
      animateSheetClose(true);
    }
  }, true);

  /* Add a subtle liquid press response to high-value controls without rerendering screens. */
  document.addEventListener('pointerdown', event => {
    const control = event.target && event.target.closest
      ? event.target.closest('.nav button[data-android-tab], .android-sheet-item, .btn, .vx621-action, #themeToggle')
      : null;
    if (!control) return;
    control.classList.add('vy852-pressed');
  }, { passive: true, capture: true });

  const clearPressed = () => document.querySelectorAll('.vy852-pressed').forEach(node => node.classList.remove('vy852-pressed'));
  document.addEventListener('pointerup', clearPressed, { passive: true, capture: true });
  document.addEventListener('pointercancel', clearPressed, { passive: true, capture: true });

  /* Keep the class in sync if some older renderer replaces body classes. */
  const classObserver = new MutationObserver(() => {
    if (!root.classList.contains('vy852-apple-liquid')) root.classList.add('vy852-apple-liquid');
  });
  classObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
})();
