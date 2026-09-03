# Vyapar AI Frontend Structure

This folder is organized for easier reading/editing **without changing application behavior**.

- `index.html` — app shell and screen mount points.
- `assets/images/` — logos, footer artwork, subscription artwork.
- `assets/styles/vyapar-core.css` — combined base, login and feature styles.
- `assets/styles/vyapar-ui.css` — combined production, platform, theme and legal-page styles.
- `assets/scripts/vyapar-app.js` — combined local JavaScript in the original execution order.
- `pages/legal/` — Privacy, Terms, Refund and Delete Account pages.
- `pages/invoice/` — public invoice page.
- `version.json` — frontend version metadata.

## Runtime bundles

`index.html` loads exactly two local stylesheets and one local JavaScript bundle. Each bundle has readable `SOURCE` section markers and retains the original source order. Razorpay remains an external vendor script.

Run `node tools/build-frontend-bundles.mjs` from the project root after editing a source module. The generated bundle is written both beside this file and inside the appropriate `assets/` directory.

## Source modules

- Login / secure startup: `assets/scripts/auth.js`, `assets/scripts/android-session-flow-647.js`, `assets/styles/android-session-flow-647.css`, `assets/styles/security-ui-643.css`.
- Header / global layout: `assets/styles/app.css`, with final responsive polish in `assets/styles/professional-ui-682.css`.
- Home, Sales, Stock, Analytics, Calculator, Subscription, Settings, Business core render logic: `assets/scripts/app.js`.
- Settings UI layer: `assets/scripts/settings-center-675.js`, `assets/styles/settings-center-675.css`.
- Sales visual layer: `assets/scripts/sales-theme-660.js`, `assets/styles/sales-theme-660.css`.
- Business/workflow extensions: `assets/scripts/workflow-ui-670p2.js`, `assets/scripts/commercial-ui-6702026.js` and matching CSS.

> The source modules remain available for safe maintenance. Login, Home, Business, Sales, Stock, Settings and every existing route still use the same functions, state keys, handlers and plan gates; only runtime delivery is consolidated.
