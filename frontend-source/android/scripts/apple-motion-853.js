/* Vyapar AI 8.5.3.2026 — Apple Liquid Glass motion/stability refinement.
   Fixes page-switch flicker and synchronizes nav/theme animation without touching business logic. */
(function () {
  'use strict';

  const root = document.documentElement;
  root.classList.add('vy853-apple-liquid');

  const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const mainTabs = ['home', 'business', 'sales', 'stock'];
  const tabRank = { home: 0, business: 1, sales: 2, stock: 3, upload: 4, analytics: 4, calculator: 4, subscription: 4, settings: 4 };

  function visibleTab() {
    const screen = Array.from(document.querySelectorAll('.screen')).find(node => !node.classList.contains('hide'));
    return screen ? screen.id.replace(/^screen-/, '') : 'home';
  }

  function rank(tab) {
    return Object.prototype.hasOwnProperty.call(tabRank, tab) ? tabRank[tab] : 4;
  }

  function clearPageClasses() {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove(
        'vy853-page-enter-forward',
        'vy853-page-enter-backward',
        'vy-telegram-page-from-left',
        'vy-telegram-page-from-right'
      );
    });
  }

  let pageTimer = 0;
  function animatePage(previousTab, nextTab) {
    if (reducedMotion() || !nextTab || previousTab === nextTab) return;
    const screen = document.getElementById('screen-' + nextTab);
    if (!screen || screen.classList.contains('hide')) return;

    clearTimeout(pageTimer);
    clearPageClasses();
    const direction = rank(nextTab) < rank(previousTab) ? 'vy853-page-enter-backward' : 'vy853-page-enter-forward';
    requestAnimationFrame(() => {
      screen.classList.add(direction);
      pageTimer = setTimeout(() => screen.classList.remove(direction), 340);
    });
  }

  function navElement() {
    return document.getElementById('nav') || document.querySelector('.nav');
  }

  function ensureLens() {
    const nav = navElement();
    if (!nav) return null;
    let lens = nav.querySelector('.android-nav-glass-indicator');
    if (!lens) {
      lens = document.createElement('span');
      lens.className = 'android-nav-glass-indicator';
      lens.setAttribute('aria-hidden', 'true');
      nav.insertBefore(lens, nav.firstChild);
    }
    return lens;
  }

  let lensTimer = 0;
  function syncLens(animate) {
    const nav = navElement();
    const lens = ensureLens();
    if (!nav || !lens) return;

    const active = nav.querySelector('button.active[data-android-tab]') || nav.querySelector('button[data-android-tab="home"]');
    if (!active) return;

    const x = active.offsetLeft;
    const width = active.offsetWidth;
    lens.style.width = width + 'px';
    lens.style.setProperty('--vy853-nav-x', x + 'px');

    if (animate && !reducedMotion()) {
      lens.classList.remove('vy853-lens-moving');
      void lens.offsetWidth;
      lens.classList.add('vy853-lens-moving');
      clearTimeout(lensTimer);
      lensTimer = setTimeout(() => lens.classList.remove('vy853-lens-moving'), 500);
    }
  }

  const authoritativeSetTab = typeof window.setTab === 'function' ? window.setTab : null;
  if (authoritativeSetTab && !authoritativeSetTab.__vy853Wrapped) {
    const wrappedSetTab = function (tab, withLoader) {
      const previousTab = visibleTab();
      const isBottomTab = mainTabs.includes(tab);
      root.classList.toggle('vy853-nav-switching', isBottomTab && previousTab !== tab);

      // Bottom tabs are local, already-rendered workspaces; suppressing the tiny
      // loader removes the flash seen in the reference video without changing data flow.
      const result = authoritativeSetTab.call(this, tab, isBottomTab ? false : withLoader);
      const nextTab = visibleTab();

      if (result !== false && previousTab !== nextTab) animatePage(previousTab, nextTab);
      requestAnimationFrame(() => syncLens(previousTab !== nextTab));

      clearTimeout(window.__vy853NavSwitchTimer);
      window.__vy853NavSwitchTimer = setTimeout(() => root.classList.remove('vy853-nav-switching'), 340);
      return result;
    };
    wrappedSetTab.__vy853Wrapped = true;
    window.setTab = wrappedSetTab;
  }

  // Capture only the four real workspace tabs. More keeps its existing sheet logic.
  document.addEventListener('click', event => {
    const button = event.target && event.target.closest ? event.target.closest('.nav button[data-android-tab]') : null;
    if (!button) return;
    const tab = button.getAttribute('data-android-tab');
    if (!mainTabs.includes(tab) || typeof window.setTab !== 'function') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.setTab(tab, false);
  }, true);

  // Theme transition: expand the destination material from the button first,
  // switch the real theme only once the reveal covers the screen, then fade it away.
  const previousToggleTheme = typeof window.toggleTheme === 'function' ? window.toggleTheme : null;
  let themeBusy = false;

  function currentLight() {
    return root.classList.contains('theme-light') || (document.body && document.body.classList.contains('theme-light'));
  }

  function themeButton() {
    return document.getElementById('themeToggle');
  }

  function themeOrigin(event) {
    const button = themeButton();
    const rect = button ? button.getBoundingClientRect() : null;
    return {
      x: event && Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (rect ? rect.left + rect.width / 2 : window.innerWidth - 30),
      y: event && Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (rect ? rect.top + rect.height / 2 : 44)
    };
  }

  function makeThemeReveal(event, targetLight) {
    if (reducedMotion()) return null;
    document.querySelectorAll('.vy853-theme-reveal, .vy852-theme-bloom').forEach(node => node.remove());

    const origin = themeOrigin(event);
    const farX = Math.max(origin.x, Math.max(0, window.innerWidth - origin.x));
    const farY = Math.max(origin.y, Math.max(0, window.innerHeight - origin.y));
    const radius = Math.sqrt(farX * farX + farY * farY);
    const scale = Math.max(28, radius / 24 + 2.5);

    const reveal = document.createElement('div');
    reveal.className = 'vy853-theme-reveal ' + (targetLight ? 'to-light' : 'to-dark');
    reveal.style.setProperty('--vy853-x', origin.x + 'px');
    reveal.style.setProperty('--vy853-y', origin.y + 'px');
    reveal.style.setProperty('--vy853-scale', String(scale));
    document.body.appendChild(reveal);
    return reveal;
  }

  function popThemeButton() {
    const button = themeButton();
    if (!button || reducedMotion()) return;
    button.classList.remove('vy853-theme-pop');
    void button.offsetWidth;
    button.classList.add('vy853-theme-pop');
    setTimeout(() => button.classList.remove('vy853-theme-pop'), 620);
  }

  if (previousToggleTheme && !previousToggleTheme.__vy853Wrapped) {
    const wrappedTheme = function (event) {
      if (themeBusy) return false;
      themeBusy = true;

      const targetLight = !currentLight();
      root.classList.add('vy853-theme-running', targetLight ? 'vy853-preview-light' : 'vy853-preview-dark');
      root.classList.remove(targetLight ? 'vy853-preview-dark' : 'vy853-preview-light');
      if (document.body) document.body.classList.add('vy853-theme-running');

      const reveal = makeThemeReveal(event, targetLight);
      popThemeButton();

      const commitDelay = reducedMotion() ? 0 : 330;
      setTimeout(() => {
        try {
          previousToggleTheme.call(this, event);
        } finally {
          // Native status/navigation bars are synced by the existing observer.
        }
      }, commitDelay);

      clearTimeout(window.__vy853ThemeCleanup);
      window.__vy853ThemeCleanup = setTimeout(() => {
        if (reveal && reveal.parentNode) reveal.remove();
        root.classList.remove('vy853-theme-running', 'vy853-preview-light', 'vy853-preview-dark');
        if (document.body) document.body.classList.remove('vy853-theme-running');
        themeBusy = false;
      }, reducedMotion() ? 60 : 660);

      return false;
    };
    wrappedTheme.__vy853Wrapped = true;
    window.toggleTheme = wrappedTheme;
  }

  function initialise() {
    clearPageClasses();
    syncLens(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }

  const navObserver = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.attributeName === 'class')) {
      requestAnimationFrame(() => syncLens(false));
    }
  });

  const nav = navElement();
  if (nav) navObserver.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('resize', () => requestAnimationFrame(() => syncLens(false)), { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(() => syncLens(false), 120), { passive: true });
})();
