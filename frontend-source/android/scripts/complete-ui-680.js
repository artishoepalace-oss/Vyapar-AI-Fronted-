/* Vyapar AI 6.8.0 final UI stability layer. No business/data logic is changed here. */
(function () {
  'use strict';

  document.documentElement.lang = 'en';
  document.documentElement.classList.add('vy680-complete-ui');

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const syncThemeColor = () => {
    if (!themeMeta) return;
    themeMeta.setAttribute('content', document.documentElement.classList.contains('theme-light') ? '#f4f8ff' : '#07111f');
  };

  function removeConsecutiveDuplicateHeadings(root) {
    if (!root) return;
    const headings = Array.from(root.querySelectorAll('.settings-section h2, .settings-section h3, .vy675-page-body h2, .vy675-page-body h3'));
    const seen = new Map();
    headings.forEach((heading) => {
      const label = (heading.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!label) return;
      const parent = heading.closest('.settings-section, .vy675-page-body, .card') || heading.parentElement;
      const key = label + '::' + (parent && parent.dataset ? JSON.stringify(parent.dataset) : '');
      const previous = seen.get(key);
      if (previous && previous.parentElement === heading.parentElement) {
        heading.setAttribute('aria-hidden', 'true');
        heading.style.display = 'none';
      } else {
        seen.set(key, heading);
      }
    });
  }

  function hardenLayout() {
    syncThemeColor();
    const settings = document.getElementById('screen-settings');
    removeConsecutiveDuplicateHeadings(settings);

    document.querySelectorAll('img').forEach((img) => {
      if (!img.hasAttribute('loading') && !img.closest('#appLoader, #vy647StartupSplash, .brand')) img.loading = 'lazy';
      img.decoding = 'async';
    });

    document.querySelectorAll('button:not([type])').forEach((button) => button.setAttribute('type', 'button'));
  }

  let pending = false;
  const scheduleHarden = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      hardenLayout();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hardenLayout, { once: true });
  } else {
    hardenLayout();
  }

  const observer = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length > 0)) scheduleHarden();
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  window.addEventListener('orientationchange', scheduleHarden, { passive: true });
  window.addEventListener('resize', scheduleHarden, { passive: true });

  /* 8.5 maintenance: Telegram-like tab transition, native theme bars and long-press guard. */
  const reducedMotion = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const currentVisibleTab = () => {
    const screen = Array.from(document.querySelectorAll('.screen')).find(node => !node.classList.contains('hide'));
    return screen ? screen.id.replace('screen-', '') : 'home';
  };
  const tabRank = tab => {
    const ranks = { home: 0, business: 1, sales: 2, stock: 3, upload: 4, analytics: 4, calculator: 4, subscription: 4, settings: 4 };
    return Object.prototype.hasOwnProperty.call(ranks, tab) ? ranks[tab] : 4;
  };

  const finalSetTab = typeof window.setTab === 'function' ? window.setTab : null;
  if (finalSetTab) {
    window.setTab = function (tab, withLoader) {
      const previousTab = currentVisibleTab();
      const result = finalSetTab.call(this, tab, withLoader);
      if (result === false || previousTab === tab || reducedMotion()) return result;

      const screen = document.getElementById('screen-' + tab);
      if (!screen) return result;
      screen.classList.remove('vy-telegram-page-from-left', 'vy-telegram-page-from-right');
      void screen.offsetWidth;
      screen.classList.add(tabRank(tab) < tabRank(previousTab) ? 'vy-telegram-page-from-left' : 'vy-telegram-page-from-right');
      clearTimeout(screen.__vyTelegramPageTimer);
      screen.__vyTelegramPageTimer = setTimeout(() => {
        screen.classList.remove('vy-telegram-page-from-left', 'vy-telegram-page-from-right');
      }, 320);
      return result;
    };
  }

  const syncNativeTheme = () => {
    try {
      const bridge = window.AndroidApp;
      if (bridge && typeof bridge.setSystemTheme === 'function') {
        bridge.setSystemTheme(document.documentElement.classList.contains('theme-light'));
      }
    } catch (_) {}
  };
  syncNativeTheme();

  const nativeThemeObserver = new MutationObserver(syncNativeTheme);
  nativeThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  nativeThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Old Android WebViews can freeze while creating selection/action-mode UI on
  // long press. Native code consumes long-clicks too; this prevents the web
  // context menu/drag fallback from starting before Android receives it.
  if (document.documentElement.classList.contains('native-android')) {
    document.addEventListener('contextmenu', event => event.preventDefault(), true);
    document.addEventListener('dragstart', event => {
      if (event.target && event.target.closest && event.target.closest('img, a, button')) event.preventDefault();
    }, true);
  }

})();
