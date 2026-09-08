# Vyapar AI 8.6.1.2026 — Flat Black / Universal Popup Release

## Runtime flow validated by design
App → Login → Home / Journey popup → Home → Business → Sales → Stock → More.

## Changes
- Removed active Liquid Glass / liquid-lens / convex optical presentation layers from the production bundle.
- Replaced navy/dark-blue shell with true black (`#000`) and neutral black surfaces.
- Kept dense blur only on the sticky top bar and fixed five-tab bottom navigation.
- Light mode now uses white / system-gray surfaces with the same component geometry.
- Added iOS-blue primary actions plus semantic green, orange, purple and red action colors that work on black.
- Unified dialogs, sheets, account/security modals, subscription prompts, update prompts, delete confirmations, and Shop Journey into one opaque iPhone-inspired popup language.
- More sheet keeps one live instance and uses the same universal popup surface.
- Login success handoff shortened and theme-matched to prevent visible white/navy flicker during reload.
- Old liquid presentation coordinators no longer execute in the production combined CSS/JS bundle.

## Version
- versionName: 8.6.1.2026
- versionCode: 8612026
