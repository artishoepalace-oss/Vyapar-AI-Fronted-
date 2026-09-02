# Vyapar AI Frontend Structure

This folder is organized for easier reading/editing **without changing application behavior**.

- `index.html` — app shell and screen mount points.
- `assets/images/` — logos, footer artwork, subscription artwork.
- `assets/styles/` — all visual layers. Load order is preserved in `index.html`.
- `assets/scripts/` — all JavaScript behavior. Load order is preserved in `index.html`.
- `pages/legal/` — Privacy, Terms, Refund and Delete Account pages.
- `pages/invoice/` — public invoice page.
- `version.json` — frontend version metadata.

## Where to edit common areas

- Login / secure startup: `assets/scripts/auth.js`, `assets/scripts/android-session-flow-647.js`, `assets/styles/android-session-flow-647.css`, `assets/styles/security-ui-643.css`.
- Header / global layout: `assets/styles/app.css`, with final responsive polish in `assets/styles/professional-ui-682.css`.
- Home, Sales, Stock, Analytics, Calculator, Subscription, Settings, Business core render logic: `assets/scripts/app.js`.
- Settings UI layer: `assets/scripts/settings-center-675.js`, `assets/styles/settings-center-675.css`.
- Sales visual layer: `assets/scripts/sales-theme-660.js`, `assets/styles/sales-theme-660.css`.
- Business/workflow extensions: `assets/scripts/workflow-ui-670p2.js`, `assets/scripts/commercial-ui-6702026.js` and matching CSS.

> Note: the main screens share state and functions inside `app.js`. They were intentionally not split into separate modules because doing so would be a behavioral refactor rather than a file-only organization change.
