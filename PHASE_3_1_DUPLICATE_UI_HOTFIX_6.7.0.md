# Vyapar AI 6.7.0-phase.3.1 — Phase 3.1 Hotfix

Base: `6.7.0-phase.3`  
Android versionCode: `67004`

## Fixed

- **Monthly Manual Profit Records**: removed the legacy Year-filter injector that raced with the Stage 2 filter. Only one canonical **Year** selector is rendered now.
- **App Update popup**: removed the browser/WebView `confirm()` flow from the active update checker. Update availability now uses one Vyapar AI in-app modal.
- **Double update popup protection**: concurrent automatic/manual checks share one in-flight request, and the update modal is single-instance.
- **Automatic update checks**: stay silent for optional updates. Required updates can still surface the single in-app modal.

No business feature, navigation item, data schema, or finance formula was removed or changed.
