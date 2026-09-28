# Vyapar AI 20.10.2004.00063.2026

## Master-plan UI / UX physics pass

- Add one final shared visual contract after the historical component styles so Home, Business, Sales, Stock, More, Settings, forms and overlays resolve to the same spacing, sizing and surface hierarchy.
- Remove decorative navbar/top-bar reflection, shimmer, glossy gradients and outer glow. Chrome is now solid black/graphite with no decorative rim, reflection or glow; selected state remains burgundy and the active capsule stays one measured physical object.
- Lock header and bottom navigation to the same 367px centerline with the existing responsive 8px viewport safety margin. Keep five equal navigation cells and the existing 68x42 active capsule geometry.
- Replace full-viewport page travel with a short 12-20px directional compositor handoff. Direction remains understandable without carousel-like movement or large layout exposure.
- Reduce spring overshoot and press compression so buttons, cards, sheets and menus feel physical without bouncing, glittering or distorting text.
- Keep native WebView scrolling as the scroll authority. Low-memory/Android 8 paths use shorter 12-16px motion and simplified solid surfaces.
- Standardize minimum 44px touch targets, min-width handling, text wrapping, table overflow, form widths, popup surfaces and nested-card treatment to reduce clipping and alignment drift.
- Keep the existing single overlay manager, accounting engine, sales/stock posting rules, invoice/PDF pipeline, subscription gating, authentication, backup, stored data model and package/signing identity.
- Update browser QA to require no decorative navbar reflection/gloss, stable top/bottom geometry, restrained page motion, single logical destination during transitions and clean low-memory fallbacks.

## Release identity

- versionName: `20.10.2004.00063.2026`
- versionCode: `2010200463`
- minSdk: `26` (Android 8.0)
- compileSdk / targetSdk: `34`

This release intentionally prioritizes alignment, interaction stability, legibility and deterministic business behavior over visual effects.
