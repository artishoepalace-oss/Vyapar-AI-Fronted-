# Vyapar AI 8.6.3.2026 — Graphite / Maroon UI

## Screenshot-driven dark UI repair
- Replaced remaining navy/blue dark-mode containers with neutral graphite and gunmetal surfaces.
- Home Shop Progress, Quick Access, Business tools, Sales mode controls, Stock surfaces and Settings cards now share one dark hierarchy.
- Blue screen-accent variables are redirected to neutral silver/grey values in dark mode.
- Form fields and Settings search use graphite instead of blue.
- Selected mode controls and active bottom navigation use raised graphite with white/silver content.

## Destructive actions
- Bright destructive red is replaced with a deeper maroon/burgundy treatment.
- Cancel/delete/destructive actions remain clearly distinct without dominating the screen.

## Top bar and profile
- Removed the top-bar light/dark toggle from the app shell.
- Replaced it with a compact profile shortcut that opens Account & plan.
- Profile treatment is plan-aware for presentation only: Business uses gold accents, Pro uses silver accents, Free/no-plan uses neutral grey.
- Existing subscription entitlement and authentication logic are unchanged.

## Account card
- Account & plan card is no longer blue in dark mode.
- Business plan gets a restrained gold metallic accent, Pro gets silver, Free/no-plan stays graphite grey.
- Backup, restore and normal account actions use neutral graphite; destructive actions use maroon.

## Navigation
- Bottom navigation is now a true floating rounded dock with horizontal margins and safe-area spacing.
- Page content receives additional bottom clearance so the dock does not cover forms/cards.

## Light mode
- Existing verified light-mode surfaces are preserved.
- Only the new profile shortcut receives a matching light-mode treatment.

## Version
- versionName: `8.6.3.2026`
- versionCode: `8632026`
