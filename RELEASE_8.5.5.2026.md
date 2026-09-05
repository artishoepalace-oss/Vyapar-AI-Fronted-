# Vyapar AI 8.5.5.2026

Android visual-stability release from `main`, based on the supplied screen recordings and login screenshot.

- Fixed the neon yellow/green bottom-navigation paint glitch seen after switching to dark mode. The nav now has one authoritative neutral glass background and iOS-blue active lens in both themes.
- Removed overlapping 8.5.2/8.5.3/8.5.4 theme bloom/ripple/wipe layers. Theme switching now uses one short full-screen curtain handoff, with no app-generated tap dot.
- Fixed More sheet ghosting: selecting Insights, AI Upload, Calculator, Plans or App Settings closes the sheet before destination navigation, and duplicate/stale sheets are removed.
- Made More and Your Shop Journey sheets less see-through so destination content cannot visibly bleed through them.
- Reduced page-switch flicker by suppressing the local tab loader and making 8.5.5 the final page-motion owner.
- Unified Settings with the same shell and Apple-style curve hierarchy used by the rest of the app.
- Improved Login/Create Account/OTP layout: stronger selected-tab contrast, balanced segmented control, responsive email + Get OTP row, rounded fields and consistent dark/light glass materials.
- Added a 1.5-second startup watchdog so the old secure-session poll cannot leave a second loading surface visible for several seconds.
- Circular app identity everywhere: Android launcher, roundIcon, Android 12+ splash, Android 7-11 launch surface, header, login, password gate and in-app loaders.
- Preserved authentication, accounting, sales, stock, subscription, backup/restore and business data logic.

Note: white circles produced by Android screen-recorder/developer “Show taps” are OS overlays, not app UI. The app-side WebView tap highlight is disabled in this release.
