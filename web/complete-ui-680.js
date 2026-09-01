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

  const observer = new MutationObserver(scheduleHarden);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('orientationchange', scheduleHarden, { passive: true });
  window.addEventListener('resize', scheduleHarden, { passive: true });
})();
