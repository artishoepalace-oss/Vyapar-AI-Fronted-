/*
 * Vyapar AI 6.7.0-phase.1
 * Production-readiness Phase 1: task-based screen organisation.
 * No feature handlers, data keys, formulas, routes or plan gates are replaced here.
 */
(function(){
  'use strict';

  const VERSION = '6.7.0-phase.1';
  const memory = Object.create(null);
  let scheduled = false;

  document.documentElement.classList.add('production-ui-p1');
  document.documentElement.dataset.productionUiVersion = VERSION;

  function text(node){
    return String(node && node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function heading(node){
    return text(node && node.querySelector('h1,h2,h3,.settings-kicker'));
  }

  function savedMode(screenId, fallback){
    if(memory[screenId]) return memory[screenId];
    try{
      const value = sessionStorage.getItem('vyapar_ui_p1_mode_' + screenId);
      if(value) return (memory[screenId] = value);
    }catch(_){ }
    return (memory[screenId] = fallback);
  }

  function saveMode(screenId, mode){
    memory[screenId] = mode;
    try{ sessionStorage.setItem('vyapar_ui_p1_mode_' + screenId, mode); }catch(_){ }
  }

  function makeModeBar(screen, screenId, modes, beforeNode){
    let bar = screen.querySelector(':scope > .p1-modebar[data-screen="' + screenId + '"]');
    if(bar) return bar;

    bar = document.createElement('div');
    bar.className = 'p1-modebar';
    bar.dataset.screen = screenId;
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', modes.label || 'Choose a view');
    bar.innerHTML = modes.items.map(function(item){
      return '<button type="button" role="tab" data-mode="' + item[0] + '">' + item[1] + '</button>';
    }).join('');

    bar.addEventListener('click', function(event){
      const button = event.target.closest('button[data-mode]');
      if(!button) return;
      saveMode(screenId, button.dataset.mode);
      applyMode(screen, screenId, modes);
      button.scrollIntoView({block:'nearest', inline:'nearest'});
    });

    screen.insertBefore(bar, beforeNode || screen.firstChild);
    return bar;
  }

  function setSectionMode(node, mode){
    if(!node || !mode) return;
    node.classList.add('p1-mode-section');
    node.dataset.p1Mode = mode;
  }

  function applyMode(screen, screenId, modes){
    let active = savedMode(screenId, modes.items[0][0]);
    if(!modes.items.some(function(item){ return item[0] === active; })) active = modes.items[0][0];

    const bar = screen.querySelector('.p1-modebar[data-screen="' + screenId + '"]');
    if(bar){
      bar.querySelectorAll('button[data-mode]').forEach(function(button){
        const selected = button.dataset.mode === active;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    screen.querySelectorAll('.p1-mode-section[data-p1-mode]').forEach(function(node){
      const visible = node.dataset.p1Mode.split(' ').includes(active);
      node.hidden = !visible;
      node.setAttribute('aria-hidden', String(!visible));
    });

    screen.querySelectorAll('.grid').forEach(function(grid){
      const sections = Array.from(grid.children).filter(function(child){
        return child.classList && child.classList.contains('p1-mode-section');
      });
      grid.classList.toggle('p1-grid-hidden', sections.length > 0 && sections.every(function(child){ return child.hidden; }));
    });
  }

  function salesCards(screen){
    const result = [];
    Array.from(screen.children).forEach(function(child){
      if(child.classList.contains('grid')){
        Array.from(child.children).forEach(function(item){ if(item.classList.contains('card')) result.push(item); });
      }else if(child.classList.contains('card')) result.push(child);
    });
    return result;
  }

  function organiseSales(){
    const screen = document.getElementById('screen-sales');
    if(!screen || !screen.children.length) return;

    salesCards(screen).forEach(function(card){
      const title = heading(card);
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;

      if(/add item sale|edit sale|daily quick entry/.test(title)) setSectionMode(card, 'today');
      else if(/monthly profit entry|edit monthly profit|monthly manual profit records|monthly profit records/.test(title)) setSectionMode(card, 'monthly');
      else if(/advanced sales|billing/.test(title)) setSectionMode(card, 'billing');
      else if(/daily records|sales records/.test(title)) setSectionMode(card, 'history');
    });

    const modes = {
      label: 'Sales workspace',
      items: [['today','Today'],['monthly','Monthly'],['billing','Billing'],['history','History']]
    };
    const profit = screen.querySelector('#vy660ProfitCard');
    const insertionPoint = profit && profit.nextSibling ? profit.nextSibling : screen.firstChild;
    makeModeBar(screen, 'sales', modes, insertionPoint);
    if(screen.querySelector('h2') && /edit monthly profit/i.test(screen.textContent)) saveMode('sales', 'monthly');
    applyMode(screen, 'sales', modes);
  }

  function organiseStock(){
    const screen = document.getElementById('screen-stock');
    if(!screen || !screen.children.length) return;

    Array.from(screen.children).forEach(function(node){
      if(!node.classList.contains('card')) return;
      const title = heading(node);
      node.classList.remove('p1-mode-section');
      node.removeAttribute('data-p1-mode');
      node.hidden = false;
      if(/stock manager|stock alerts/.test(title)) setSectionMode(node, 'manage');
      else if(/inventory workspace/.test(title)) setSectionMode(node, 'tools');
      else if(/saved stock records/.test(title)) setSectionMode(node, 'records');
    });

    const modes = {
      label: 'Stock workspace',
      items: [['manage','Manage'],['tools','Tools'],['records','Records']]
    };
    makeModeBar(screen, 'stock', modes, screen.querySelector('.stats')?.nextSibling || screen.firstChild);
    applyMode(screen, 'stock', modes);
  }

  function organiseBusiness(){
    const screen = document.getElementById('screen-business');
    const shell = screen && screen.querySelector('.vx621-business-shell');
    if(!screen || !shell) return;

    Array.from(shell.children).forEach(function(node){
      node.classList.remove('p1-mode-section');
      node.removeAttribute('data-p1-mode');
      node.hidden = false;
      const title = heading(node);
      if(node.classList.contains('vx621-group')){
        if(/daily business/.test(title)) setSectionMode(node, 'daily');
        else if(/accounting|compliance/.test(title)) setSectionMode(node, 'accounts');
        else if(/documents|communication/.test(title)) setSectionMode(node, 'documents');
      }else if(node.classList.contains('vx621-recent')) setSectionMode(node, 'activity');
    });

    const modes = {
      label: 'Business workspace',
      items: [['daily','Daily'],['accounts','Accounts'],['documents','Documents'],['activity','Activity']]
    };
    const kpis = shell.querySelector('.vx621-kpis');
    let bar = shell.querySelector(':scope > .p1-modebar[data-screen="business"]');
    if(!bar){
      bar = document.createElement('div');
      bar.className = 'p1-modebar';
      bar.dataset.screen = 'business';
      bar.setAttribute('role','tablist');
      bar.setAttribute('aria-label',modes.label);
      bar.innerHTML = modes.items.map(function(item){ return '<button type="button" role="tab" data-mode="' + item[0] + '">' + item[1] + '</button>'; }).join('');
      bar.addEventListener('click',function(event){
        const button=event.target.closest('button[data-mode]');
        if(!button) return;
        saveMode('business',button.dataset.mode);
        applyMode(screen,'business',modes);
      });
      shell.insertBefore(bar,kpis && kpis.nextSibling ? kpis.nextSibling : shell.firstChild);
    }
    applyMode(screen, 'business', modes);
  }

  function settingsGroup(card){
    const value = text(card.querySelector('.settings-kicker')) + ' ' + heading(card);
    if(/account|business profile|shop details/.test(value)) return 'account';
    if(/business admin|company|app lock|inside app lock|security/.test(value)) return 'business';
    if(/appearance|performance|motion/.test(value)) return 'appearance';
    if(/data safety|backup/.test(value)) return 'data';
    if(/support|legal|app update/.test(value)) return 'legal';
    return '';
  }

  function organiseSettings(){
    const screen = document.getElementById('screen-settings');
    const stack = screen && screen.querySelector('.settings-stack');
    if(!screen || !stack) return;

    Array.from(stack.children).forEach(function(card){
      if(card.id === 'appLegalFooter') return;
      card.classList.remove('p1-mode-section');
      card.removeAttribute('data-p1-mode');
      card.hidden = false;
      const group = settingsGroup(card);
      if(group) setSectionMode(card, group);
    });

    const modes = {
      label: 'Settings sections',
      items: [['account','Account'],['business','Business'],['appearance','Appearance'],['data','Data'],['legal','Legal']]
    };
    makeModeBar(screen, 'settings', modes, stack);
    applyMode(screen, 'settings', modes);
  }

  function improveSemantics(root){
    root.querySelectorAll('button:not([type])').forEach(function(button){ button.type = 'button'; });
    root.querySelectorAll('.scroll,.vx621-table-wrap,.p611-table').forEach(function(scroller){
      if(!scroller.hasAttribute('tabindex')) scroller.tabIndex = 0;
      if(!scroller.hasAttribute('aria-label')) scroller.setAttribute('aria-label','Scrollable records');
    });
    root.querySelectorAll('input[type="number"]').forEach(function(input){ input.inputMode = 'decimal'; });
  }

  function organise(){
    scheduled = false;
    organiseSales();
    organiseStock();
    organiseBusiness();
    organiseSettings();
    improveSemantics(document);
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(organise);
  }

  ['renderSales','renderStock','renderBusiness','renderSettings'].forEach(function(name){
    const original = window[name];
    if(typeof original !== 'function' || original.__productionUiP1) return;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      schedule();
      return result;
    };
    wrapped.__productionUiP1 = true;
    window[name] = wrapped;
  });

  const observer = new MutationObserver(function(mutations){
    if(mutations.some(function(mutation){ return mutation.addedNodes.length > 0; })) schedule();
  });
  observer.observe(document.querySelector('main') || document.body, {childList:true, subtree:true});

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true});
  else schedule();

  window.VyaparProductionUI = {
    version: VERSION,
    phase: 1,
    refresh: schedule,
    setView: function(screen, mode){ saveMode(screen, mode); schedule(); }
  };
})();
