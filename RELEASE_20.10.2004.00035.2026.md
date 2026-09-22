# Vyapar AI 20.10.2004.00035.2026

- Match More popup icons and arrows to the logo/nav burgundy (`#80011f`). Preserve white text, dark surfaces, rounded corners and navbar clearance.
- Give More a softer 480ms entrance and 320ms exit. Lite mode scales duration, and reduced-motion mode remains immediate.
- Dismissing a popup during its entrance continues from its visible position and opacity, avoiding a snap. Repeated dismissal still resolves once.
- Keep one Add Stock Item action in Stock Manager. Remove the redundant lower empty-stock block and its legacy button injector. Stock Alerts, search, reorder indicators and records remain available after adding stock.

Android version code: `2010200435`. Saved-data formats, application ID and signing identity are preserved.

Release gates: shared-bundle/runtime validation, automated regressions including interrupted popup dismissal, mobile navigation and workspace browser checks, and focused More/Stock checks. Browser account/network responses are mocked.
