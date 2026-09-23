# Vyapar AI 20.10.2004.00038.2026

- On legacy and low-memory Android WebViews, move only the incoming screen by about 23px for 250ms. This reduces full-screen layer composition while keeping Home, Business, Sales, Stock and More destination directions.
- Defer page decoration, theme cleanup and More focus until the moving surface settles. Make the More entrance 245ms and exit 190ms on that device tier; align the selected navbar capsule to 280ms.
- Keep the existing full-width two-page slide on faster devices. Preserve rapid taps, Back, popup dismissal, drafts, scroll positions and reduced-motion preferences; ensure transition timers do not end a late-starting animation early.

Android version code: `2010200438`. Application ID, data formats, features and original signing identity are unchanged.

Validation: 77 automated regressions; browser checks for page directions, rapid taps, Back, popup focus, low-memory navigation, reduced motion and responsive geometry; CPU-throttled Android 8 style WebView profile. Browser accounts and network responses are mocked. Actual frame rate depends on the device, WebView and background load.
