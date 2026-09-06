/* Vyapar AI 8.6.0.2026 — final HIG blur coordinator. */
(function(){
  'use strict';
  const root=document.documentElement;root.classList.add('vy860-hig-ios');
  function setThemeButtonState(){const button=document.getElementById('themeToggle');if(!button)return;const isLight=root.classList.contains('theme-light')||document.body.classList.contains('theme-light');button.setAttribute('aria-label',isLight?'Switch to dark mode':'Switch to light mode');button.setAttribute('title',isLight?'Dark mode':'Light mode');if(button.textContent!=='Theme')button.textContent='Theme'}
  function decorateNav(){document.querySelectorAll('.nav button[data-tab]').forEach(function(button){if(!button.dataset.androidTab)button.dataset.androidTab=button.dataset.tab;button.setAttribute('data-label',(button.textContent||'').trim())});setThemeButtonState()}
  function decorateMore(){const sheet=document.getElementById('androidMoreSheet');if(!sheet)return;const settingsItem=sheet.querySelector('.android-sheet-item[data-tab="settings"]');if(settingsItem)settingsItem.classList.add('is-full')}
  function cleanupLegacyLiquidBits(){document.querySelectorAll('.android-nav-glass-indicator').forEach(function(node){node.remove()})}
  const previousSetTab=typeof window.setTab==='function'?window.setTab:null;if(previousSetTab&&!previousSetTab.__vy860Wrapped){const wrapped=function(){const result=previousSetTab.apply(this,arguments);requestAnimationFrame(function(){decorateNav();cleanupLegacyLiquidBits();decorateMore()});return result};wrapped.__vy860Wrapped=true;window.setTab=wrapped}
  const observer=new MutationObserver(function(){decorateNav();decorateMore();cleanupLegacyLiquidBits()});
  function init(){decorateNav();decorateMore();cleanupLegacyLiquidBits();if(document.body)observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
