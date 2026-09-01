(() => {
  'use strict';

  function closeOtherHelp(except){
    document.querySelectorAll('.cu-help.is-open').forEach((node) => {
      if(node === except) return;
      node.classList.remove('is-open');
      const btn = node.querySelector('.cu-help-button');
      if(btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function positionPanel(help){
    const btn = help.querySelector('.cu-help-button');
    const panel = help.querySelector('.cu-help-panel');
    if(!btn || !panel) return;

    panel.style.left = '12px';
    panel.style.top = '12px';
    panel.style.right = 'auto';

    const rect = btn.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    const gap = 10;

    let left = rect.left;
    const maxLeft = Math.max(12, vw - panelRect.width - 12);
    left = Math.min(Math.max(12, left), maxLeft);

    let top = rect.bottom + gap;
    let above = false;
    if(top + panelRect.height > vh - 12 && rect.top - gap - panelRect.height >= 12){
      top = rect.top - gap - panelRect.height;
      above = true;
    }
    if(top + panelRect.height > vh - 12){
      top = Math.max(12, vh - panelRect.height - 12);
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.setProperty('--cu-tip-arrow-left', `${Math.max(16, Math.min(panelRect.width - 26, rect.left + rect.width / 2 - left - 6))}px`);
    panel.classList.toggle('cu-help-panel-above', above);
  }

  function patchPanels(){
    document.querySelectorAll('.cu-help-panel').forEach((panel) => {
      if(panel.dataset.vy671Patched === '1') return;
      panel.dataset.vy671Patched = '1';
      panel.addEventListener('click', (e) => e.stopPropagation());
    });

    document.querySelectorAll('.cu-help').forEach((help) => {
      if(help.dataset.vy671Ready === '1') return;
      help.dataset.vy671Ready = '1';
      const btn = help.querySelector('.cu-help-button');
      if(!btn) return;
      btn.addEventListener('click', () => {
        requestAnimationFrame(() => {
          if(help.classList.contains('is-open')){
            closeOtherHelp(help);
            positionPanel(help);
          }
        });
      }, true);
    });
  }

  function loadScrollPreference(){
    if(!document.querySelector('link[data-vy673-scroll]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='scroll-position-673.css?v=20260901-67301';
      link.dataset.vy673Scroll='1';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-vy673-scroll]')){
      const script=document.createElement('script');
      script.src='scroll-position-673.js?v=20260901-67301';
      script.defer=true;
      script.dataset.vy673Scroll='1';
      document.head.appendChild(script);
    }
  }

  const observer = new MutationObserver(() => patchPanels());

  function start(){
    loadScrollPreference();
    patchPanels();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
      document.querySelectorAll('.cu-help.is-open').forEach(positionPanel);
    }, { passive: true });
    window.addEventListener('scroll', () => {
      document.querySelectorAll('.cu-help.is-open').forEach(positionPanel);
    }, { passive: true });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
