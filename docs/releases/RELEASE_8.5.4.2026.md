# Vyapar AI 8.5.4.2026

Unified Apple/iOS visual shell and transition stability release from `main`.

- Android `versionName`: `8.5.4.2026`
- Android `versionCode`: `8542026`
- Removed the visible theme-switch dot/bloom. Light/dark now uses one zero-radius full-screen reveal with the old ripple/bloom layers suppressed.
- Fixed light-mode bottom navigation: the active tab and the moving glass lens now use a clear iOS blue instead of a washed-out white highlight.
- Unified Apple-style corner hierarchy across major cards, sheets, controls, Settings, Home growth surfaces and forms.
- Header app logo is now circular and its dark border/shadow artifact is removed.
- Settings stays visually inside the same Vyapar AI shell and its internal pages use directional slide motion instead of feeling like a separate app.
- Your Shop Journey receives the same Apple bottom-sheet material, curves and spring open/close motion.
- Login/Create Account now follows the same rounded liquid-glass system in both themes.
- Fixed login white flash by applying the saved light/dark background before the frontend bundles load.
- Consolidated post-login loading into one compact handoff and suppresses duplicate app/tab/startup loaders after authentication.
- Reduced page-change flicker by making 8.5.4 the only local workspace animation owner and bypassing the tiny tab loader for Home/Business/Sales/Stock/Settings switches.
- Preserves existing authentication, subscriptions, accounting, sales calculations, backup/restore, business data and Android long-press stability logic.
