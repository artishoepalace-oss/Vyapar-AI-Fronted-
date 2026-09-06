# Vyapar AI 8.6.4.2026 — Premium Tier UI

## Premium visual system
- Removed the remaining blue UI language from the Android app.
- Free / no subscription uses neutral graphite-grey accents.
- Pro uses restrained silver accents.
- Business uses restrained gold accents.
- Destructive actions use deep maroon instead of bright red.
- Dark mode keeps a true-black shell with graphite surfaces and stronger text contrast.
- Light mode keeps clean white surfaces with the same plan-aware accent logic.

## Screenshot-driven repairs
- Account & Plan card no longer uses a blue background; it now follows the active plan tier.
- Settings icons, search, Business tools, Home Quick Access, Sales segmented controls, Plans, Insights, Calculator and More sheet are normalized away from blue.
- More sheet icons and close control use graphite with plan-aware accent touches.
- Calculator display, total and special keys use neutral graphite / tier accents; Clear is deep maroon.
- Insights goal/progress styling follows the active plan tier.

## Navigation and motion
- Bottom navigation is a viewport-safe floating dock with five equal tabs.
- Fixed the left-side clipping/shift visible on Sales, Insights, Calculator and Plans.
- Added safe bottom padding so the dock does not cover page content.
- Motion is limited to short transform/opacity/background transitions for a Telegram-like lightweight feel.
- Reduced startup guard to 650 ms and disabled the heavy tab loader.
- Low-end/perf-lite mode keeps the same layout while dropping expensive blur/shadow work.

## Branding
- Added a new black + deep-maroon Vyapar AI mark for in-app headers, login/loading and dynamically inserted logos.
- Android launcher icon now uses a matching black/maroon vector mark instead of the old white square artwork.
- Top bar keeps the profile shortcut instead of the light/dark button.
- Profile shortcut remains plan-aware: graphite (Free), silver (Pro), gold (Business).

## Safety
- Subscription styling is cosmetic only and does not change entitlement verification.
- Existing authentication, accounting, sales, stock, cloud backup and business logic are preserved.

## Version
- versionName: `8.6.4.2026`
- versionCode: `8642026`
