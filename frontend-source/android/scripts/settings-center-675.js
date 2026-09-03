/* Vyapar AI 6.7.5 — single, user-friendly Settings center. */
(() => {
  'use strict';

  const ICONS = {
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v10h14V10M4 4h16l1 6H3l1-6Zm5 16v-6h6v6"/></svg>',
    controls: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10h12v10H6V10Zm3 0V7a3 3 0 0 1 6 0v3M12 14v2"/></svg>',
    appearance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 1 1 8.5 4 7 7 0 0 0 20 15.5Z"/></svg>',
    navigation: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 18-7-4-7 4 7-18Z"/></svg>',
    backup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 8.5 4.5 4.5 0 0 0 7 18Zm5-7v7m-3-3 3 3 3-3"/></svg>',
    update: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.8 7M17.9 15A7 7 0 0 1 5.2 17"/></svg>',
    legal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v.01M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-1 .7-1.5 1.2-1.5 2.2"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
  };

  const SECTIONS = [
    {
      group: 'Your account',
      items: [
        { id: 'account', icon: 'account', title: 'Account & plan', subtitle: 'Profile, subscription and sign-in', keywords: 'email login logout cloud session upgrade plan', match: card => card.classList.contains('settings-account-section') }
      ]
    },
    {
      group: 'Your business',
      items: [
        { id: 'profile', icon: 'store', title: 'Business profile', subtitle: 'Shop name, location and yearly goal', keywords: 'store firm name profit target', match: card => /shop details|business profile/i.test(card.textContent || '') && !card.id },
        { id: 'business', icon: 'controls', title: 'Business controls', subtitle: 'Company, staff, transactions and data', keywords: 'roles team numbering prefix saved records', match: card => card.id === 'vx622AdminSettings' }
      ]
    },
    {
      group: 'App preferences',
      items: [
        { id: 'security', icon: 'lock', title: 'Privacy & security', subtitle: 'Password login and app protection', keywords: 'pin otp password lock safety', match: card => card.id === 'vx622AppLockSection' },
        { id: 'appearance', icon: 'appearance', title: 'Appearance & performance', subtitle: 'Theme, motion and device speed', keywords: 'light dark auto smooth lite animation', match: card => /appearance|motion & performance|performance/i.test(card.textContent || '') && !/app update/i.test(card.textContent || '') },
        { id: 'navigation', icon: 'navigation', title: 'Navigation', subtitle: 'Scrolling and page behaviour', keywords: 'auto scroll top remember page position', match: card => card.id === 'vy675NavigationSettings' },
        { id: 'data', icon: 'backup', title: 'Backup & restore', subtitle: 'Device backup and Google Drive', keywords: 'download upload json cloud disconnect', match: card => card.classList.contains('data-safety-section') || /backup & data safety|data safety/i.test(card.textContent || '') }
      ]
    },
    {
      group: 'Support & about',
      items: [
        { id: 'update', icon: 'update', title: 'App updates', subtitle: 'Check for the latest version', keywords: 'apk release version newer', match: card => card.id === 'fs607Settings' || /app update/i.test(card.textContent || '') },
        { id: 'legal', icon: 'legal', title: 'Help & legal', subtitle: 'Privacy, terms, refunds and account deletion', keywords: 'support policy delete account', match: card => /legal & support|privacy policy|refund policy/i.test(card.textContent || '') }
      ]
    }
  ];

  const ALL_ITEMS = SECTIONS.flatMap(section => section.items);
  const scrollPositions = Object.create(null);
  let activePage = '';
  let scheduled = false;
  let building = false;
  let observer = null;

  function screen() {
    return document.getElementById('screen-settings');
  }

  function appState() {
    try { if (typeof S === 'function') return S(); } catch (_) {}
    try { if (typeof state !== 'undefined') return state; } catch (_) {}
    return null;
  }

  function themeName() {
    try { if (typeof activeTheme === 'function') return activeTheme() === 'light' ? 'Light' : 'Dark'; } catch (_) {}
    return document.documentElement.classList.contains('theme-light') ? 'Light' : 'Dark';
  }

  function currentPlan() {
    const node = document.querySelector('#productionAccountCard .production-plan, #planBadge');
    const text = String(node?.textContent || '').replace(/\s+Plan$/i, '').trim();
    if (text) return text;
    const data = appState();
    return String(data?.plan || data?.subscription?.plan || 'Free').replace(/^./, char => char.toUpperCase());
  }

  function autoTopEnabled() {
    const data = appState();
    return Boolean(data?.settings?.autoScrollTop === true);
  }

  function saveAutoTop(enabled) {
    const data = appState();
    if (!data) return;
    data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    data.settings.autoScrollTop = Boolean(enabled);
    try { if (typeof save === 'function') { save(); return; } } catch (_) {}
    try { localStorage.setItem('vyapar_ai_prod_v1', JSON.stringify(data)); } catch (_) {}
  }

  function navigationCard() {
    const card = document.createElement('div');
    card.id = 'vy675NavigationSettings';
    card.className = 'card settings-section vy675-navigation-card';
    const checked = autoTopEnabled();
    card.innerHTML = `
      <div class="vy675-option-row">
        <span class="vy675-option-copy">
          <b>Auto Scroll to Top</b>
          <small>${checked ? 'Pages open at the top after navigation.' : 'Each section remembers its last position.'}</small>
        </span>
        <label class="vy675-switch" aria-label="Auto Scroll to Top">
          <input type="checkbox" data-vy675-auto-top ${checked ? 'checked' : ''}>
          <span></span>
        </label>
      </div>`;
    card.querySelector('[data-vy675-auto-top]')?.addEventListener('change', event => {
      const enabled = Boolean(event.target.checked);
      saveAutoTop(enabled);
      const description = card.querySelector('.vy675-option-copy small');
      if (description) description.textContent = enabled ? 'Pages open at the top after navigation.' : 'Each section remembers its last position.';
      updateStatuses();
      try {
        if (typeof toast === 'function') toast(enabled ? 'Auto Scroll to Top enabled.' : 'Page position memory enabled.');
        else if (typeof showGlassToast === 'function') showGlassToast(enabled ? 'Auto Scroll to Top enabled.' : 'Page position memory enabled.');
      } catch (_) {}
    });
    return card;
  }

  function shellMarkup() {
    return `
      <div class="vy675-settings-home">
        <header class="vy675-settings-intro">
          <span class="vy675-settings-eyebrow">VYAPAR AI</span>
          <h2>Settings</h2>
          <p>Manage your business, account and app preferences.</p>
        </header>
        <label class="vy675-settings-search">
          <span>${ICONS.search}</span>
          <input type="search" autocomplete="off" placeholder="Search settings" aria-label="Search settings">
          <button type="button" aria-label="Clear search" hidden>×</button>
        </label>
        <div class="vy675-settings-groups">
          ${SECTIONS.map(section => `
            <section class="vy675-settings-group" data-vy675-group>
              <h3>${section.group}</h3>
              <div class="vy675-settings-list">
                ${section.items.map(rowMarkup).join('')}
              </div>
            </section>`).join('')}
        </div>
        <div class="vy675-search-empty" hidden>
          <span>${ICONS.search}</span>
          <b>No setting found</b>
          <small>Try another word.</small>
        </div>
        <footer class="vy675-settings-footer" id="vy675SettingsFooter">
          <img src="assets/images/footer-logo.png" alt="Vyapar AI">
          <span>© 2026 Vyapar AI. All Rights Reserved.</span>
          <small>A Gupta Legacy product</small>
        </footer>
      </div>
      <div class="vy675-settings-page" hidden>
        <header class="vy675-page-header">
          <button type="button" class="vy675-page-back" aria-label="Back to Settings">${ICONS.back}</button>
          <div><h2>Settings</h2><p></p></div>
        </header>
        <div class="vy675-page-body"></div>
      </div>`;
  }

  function rowMarkup(item) {
    return `
      <button type="button" class="vy675-settings-row" data-vy675-page="${item.id}" data-vy675-search="${item.title} ${item.subtitle} ${item.keywords}" aria-label="Open ${item.title}">
        <span class="vy675-row-icon">${ICONS[item.icon]}</span>
        <span class="vy675-row-copy"><b>${item.title}</b><small>${item.subtitle}</small></span>
        <span class="vy675-row-meta" data-vy675-status></span>
        <span class="vy675-row-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function ensureShell(scr) {
    let shell = scr.querySelector(':scope > .vy675-settings-shell');
    if (shell) return shell;
    shell = document.createElement('div');
    shell.className = 'vy675-settings-shell';
    shell.innerHTML = shellMarkup();
    scr.prepend(shell);

    shell.querySelectorAll('[data-vy675-page]').forEach(row => {
      row.addEventListener('click', () => openPage(row.dataset.vy675Page, true));
    });
    shell.querySelector('.vy675-page-back')?.addEventListener('click', () => openHome(true));

    const input = shell.querySelector('.vy675-settings-search input');
    const clear = shell.querySelector('.vy675-settings-search button');
    input?.addEventListener('input', () => filterRows(input.value));
    clear?.addEventListener('click', () => {
      input.value = '';
      filterRows('');
      input.focus();
    });
    return shell;
  }

  function filterRows(value) {
    const shell = screen()?.querySelector(':scope > .vy675-settings-shell');
    if (!shell) return;
    const query = String(value || '').trim().toLowerCase();
    const clear = shell.querySelector('.vy675-settings-search button');
    if (clear) clear.hidden = !query;
    let visibleCount = 0;
    shell.querySelectorAll('.vy675-settings-row').forEach(row => {
      const matches = !query || String(row.dataset.vy675Search || row.textContent || '').toLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    shell.querySelectorAll('[data-vy675-group]').forEach(group => {
      group.hidden = ![...group.querySelectorAll('.vy675-settings-row')].some(row => !row.hidden);
    });
    const empty = shell.querySelector('.vy675-search-empty');
    if (empty) empty.hidden = visibleCount !== 0;
  }

  function ensureRepository(scr) {
    let stack = scr.querySelector(':scope > .settings-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'settings-stack';
      scr.appendChild(stack);
    }
    stack.classList.add('vy675-settings-repository');
    stack.hidden = true;
    stack.setAttribute('aria-hidden', 'true');
    return stack;
  }

  function collectCards(scr) {
    const stack = ensureRepository(scr);
    const body = scr.querySelector('.vy675-page-body');
    if (body) [...body.children].forEach(node => stack.appendChild(node));
    scr.querySelectorAll(':scope > #fs607Settings').forEach(node => stack.appendChild(node));
    if (!stack.querySelector('#vy675NavigationSettings')) stack.appendChild(navigationCard());

    const cards = [...stack.children].filter(node =>
      node instanceof HTMLElement &&
      node.id !== 'appLegalFooter' &&
      !node.classList.contains('p1-modebar') &&
      node.id !== 'vy675SettingsFooter'
    );
    const map = Object.fromEntries(ALL_ITEMS.map(item => [item.id, []]));
    cards.forEach(card => {
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;
      card.removeAttribute('aria-hidden');
      const item = ALL_ITEMS.find(candidate => {
        try { return candidate.match(card); } catch (_) { return false; }
      });
      if (item) map[item.id].push(card);
    });
    return map;
  }

  function statusFor(id) {
    if (id === 'account') return currentPlan();
    if (id === 'profile') {
      const data = appState();
      const name = String(data?.profile?.businessName || '').trim();
      return name && name.length <= 16 ? name : (name ? 'Configured' : 'Set up');
    }
    if (id === 'security') {
      const toggle = document.querySelector('#vx643PasswordLoginToggle, #vx622LockToggle');
      return toggle?.checked ? 'On' : 'Off';
    }
    if (id === 'appearance') return themeName();
    if (id === 'navigation') return autoTopEnabled() ? 'Auto top' : 'Remember';
    if (id === 'data') return localStorage.getItem('vyapar_ai_drive_connected_v1') === '1' ? 'Drive on' : 'Local';
    if (id === 'update') return document.querySelector('meta[name="vyapar-ui-version"]')?.content || '';
    return '';
  }

  function updateStatuses() {
    const scr = screen();
    if (!scr) return;
    scr.querySelectorAll('.vy675-settings-row').forEach(row => {
      const status = row.querySelector('[data-vy675-status]');
      const value = statusFor(row.dataset.vy675Page);
      if (status) {
        status.textContent = value;
        status.hidden = !value;
      }
    });
  }

  function openHome(scrollTop) {
    const scr = screen();
    if (!scr) return;
    const shell = ensureShell(scr);
    collectCards(scr);
    activePage = '';
    scr.dataset.vy675Page = '';
    scr.classList.remove('vy675-page-open');
    shell.querySelector('.vy675-settings-home').hidden = false;
    shell.querySelector('.vy675-settings-page').hidden = true;
    updateStatuses();
    if (scrollTop) window.scrollTo(0, 0);
  }

  function openPage(id, scrollTop) {
    const scr = screen();
    const item = ALL_ITEMS.find(candidate => candidate.id === id);
    if (!scr || !item) return;
    const shell = ensureShell(scr);
    const map = collectCards(scr);
    const page = shell.querySelector('.vy675-settings-page');
    const body = shell.querySelector('.vy675-page-body');
    const title = shell.querySelector('.vy675-page-header h2');
    const subtitle = shell.querySelector('.vy675-page-header p');
    const cards = map[id] || [];
    body.replaceChildren(...cards);
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'vy675-page-empty';
      empty.innerHTML = `<b>This setting is not available yet.</b><small>Please reopen Settings and try again.</small>`;
      body.appendChild(empty);
    }
    title.textContent = item.title;
    subtitle.textContent = item.subtitle;
    activePage = id;
    scr.dataset.vy675Page = id;
    scr.classList.add('vy675-page-open');
    shell.querySelector('.vy675-settings-home').hidden = true;
    page.hidden = false;
    if (scrollTop) window.scrollTo(0, 0);
  }

  function removePreviousSettingsUi(scr) {
    scr.querySelectorAll(':scope > .p1-modebar[data-screen="settings"], :scope > .vy672-settings-directory, :scope > .vy672-settings-subpage').forEach(node => node.remove());
    scr.classList.remove('vy672-settings-ready', 'vy672-subpage-open');
  }

  function build() {
    scheduled = false;
    if (building) return;
    const scr = screen();
    if (!scr) return;
    const stack = scr.querySelector(':scope > .settings-stack');
    if (!stack) return;
    building = true;
    observer?.disconnect();
    removePreviousSettingsUi(scr);
    ensureShell(scr);
    ensureRepository(scr);
    collectCards(scr);
    scr.classList.add('vy675-settings-ready');
    if (activePage) openPage(activePage, false);
    else openHome(false);
    updateStatuses();
    observer?.observe(scr, { childList: true, subtree: true });
    building = false;
  }

  function scheduleBuild() {
    if (scheduled || building) return;
    scheduled = true;
    requestAnimationFrame(build);
  }

  function installRenderWrapper() {
    const current = window.renderSettings;
    if (typeof current !== 'function' || current.__vy675SettingsCenter) return;
    const wrapped = function () {
      activePage = '';
      const result = current.apply(this, arguments);
      build();
      setTimeout(scheduleBuild, 0);
      setTimeout(scheduleBuild, 120);
      return result;
    };
    wrapped.__vy675SettingsCenter = true;
    window.renderSettings = wrapped;
  }

  function installScrollBehaviour() {
    const current = window.setTab;
    if (typeof current !== 'function' || current.__vy675ScrollBehaviour) return;
    const wrapped = function (tab, withLoader) {
      let previous = '';
      try { previous = typeof currentTab === 'string' ? currentTab : ''; } catch (_) {}
      const root = document.scrollingElement || document.documentElement;
      const previousY = Math.max(0, Number(window.scrollY || root.scrollTop || document.body.scrollTop || 0));
      const autoTop = autoTopEnabled();
      if (!autoTop && previous) scrollPositions[previous] = previousY;
      const result = current.call(this, tab, withLoader);
      requestAnimationFrame(() => {
        if (result === false) return;
        if (autoTop) {
          window.scrollTo(0, 0);
          return;
        }
        const target = Object.prototype.hasOwnProperty.call(scrollPositions, tab)
          ? scrollPositions[tab]
          : (tab === previous ? previousY : 0);
        window.scrollTo(0, Math.max(0, target));
      });
      return result;
    };
    wrapped.__vy675ScrollBehaviour = true;
    window.setTab = wrapped;
  }

  function installNativeBack() {
    const current = window.handleNativeBackPress;
    if (typeof current === 'function' && current.__vy675SettingsBack) return;
    const wrapped = function () {
      if (screen()?.classList.contains('vy675-page-open')) {
        openHome(true);
        return true;
      }
      return typeof current === 'function' ? current.apply(this, arguments) : false;
    };
    wrapped.__vy675SettingsBack = true;
    window.handleNativeBackPress = wrapped;
  }

  function init() {
    installRenderWrapper();
    installScrollBehaviour();
    installNativeBack();
    observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes?.length || record.removedNodes?.length)) scheduleBuild();
    });
    const settingsScreen = screen();
    if (settingsScreen) observer.observe(settingsScreen, { childList: true, subtree: true });
    build();
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && screen()?.classList.contains('vy675-page-open')) openHome(false);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.vy675SettingsHome = () => openHome(true);
  window.vy675OpenSettingsPage = id => openPage(id, true);
})();
