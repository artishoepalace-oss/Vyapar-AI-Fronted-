# Vyapar AI 8.6.2.2026 — Dark Mode & UI Stability

## Screenshot-driven fixes
- Dark mode is now true black with neutral graphite surfaces instead of navy/blue containers.
- Blue is reserved for primary actions and the active navigation state.
- Home, Shop Progress, Business, Sales and Stock card hierarchies use consistent dark surfaces.
- Business workspace nested cards, KPI blocks and action areas are visually normalized.
- Top bar is more compact and keeps dense blur without the oversized floating-card look.
- Bottom navigation is compact, black, safe-area aware and no longer covers the final page content.
- Native Android status and navigation bars are true black in dark mode.
- Light mode remains unchanged by the new dark-only stability layer.

## Login and settings
- Removed the obsolete local password-lock presentation from login.
- Login with Password is available alongside Email OTP instead of being shown as locked/disabled.
- Removed lock toggle/status UI from Settings while preserving account password and other settings behavior.
- Security copy now describes sign-in/privacy rather than an app-lock state.

## Stability
- Added a final UI coordinator to remove stale theme optics and keep native system bars synchronized with the selected theme.
- Shortened the Android boot guard to reduce launch interference while keeping the black first-paint protection.
- Existing business, accounting, sales, stock, subscription and navigation logic is preserved.

## Version
- versionName: `8.6.2.2026`
- versionCode: `8622026`
