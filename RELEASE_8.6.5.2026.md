# Vyapar AI 8.6.5.2026 — Monochrome Black UI + Storefront Logo Hotfix

## Branding
- Replaced the previous in-app/header/loading/launcher mark with the supplied black-and-silver storefront **V** logo.
- Removed the old white logo tile treatment so the new mark sits cleanly on the black shell.
- Updated launcher and Android splash artwork to the same storefront identity.

## Blue → black UI repair
- Removed the residual navy/blue surfaces visible in **Account & plan**, **Business profile**, **App updates**, custom select sheets and other settings pages.
- Dark inputs, cards, sheets and update actions now use black/graphite surfaces with neutral grey borders.
- More-sheet icons and selected rows are neutral graphite/silver instead of bright blue.
- Business plan gold and destructive deep-maroon actions remain semantic exceptions.
- Light mode also uses neutral black/grey primary actions instead of blue.

## Bottom navigation
- Fixed the dock being shifted/clipped off the **left side** on narrow Android screens.
- Navigation is now pinned to the viewport with explicit left/right bounds, five equal columns and no inherited translate/width offsets.
- Runtime coordinator moves the dock to `body` so transformed/layout ancestors cannot shift fixed positioning.

## Android native controls
- Changed Android `colorAccent` / activated-control tint from blue to neutral silver.
- Existing custom select behavior remains intact but now renders as a black graphite bottom sheet.

## Safety
- UI/branding hotfix only. No accounting, subscription entitlement, auth, backup, sales, stock or data schema logic was removed or changed.

## Version
- `versionName`: **8.6.5.2026**
- `versionCode`: **8652026**
