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

`index.html` loads exactly two local stylesheets and one local JavaScript bundle. Each bundle has readable `SOURCE` section markers and retains the original source order. Razorpay remains an external vendor script, downloads asynchronously, and is readiness-guarded before checkout.

Run `node tools/build-frontend-bundles.mjs` from the project root after editing a source module. Generated files are written only to the packaged `assets/styles/` and `assets/scripts/` runtime directories.

## Source modules

- Login / secure startup: `frontend-source/android/scripts/auth.js`, `frontend-source/android/scripts/android-session-flow-647.js` and matching source styles.
- Header / global layout: `frontend-source/android/styles/app.css`, with final responsive polish in `frontend-source/android/styles/professional-ui-682.css`.
- Home, Sales, Stock, Analytics, Calculator, Subscription, Settings and Business core render logic: `frontend-source/android/scripts/app.js`.
- Settings UI layer: `frontend-source/android/scripts/settings-center-675.js` and its matching source style.
- Sales visual layer: `frontend-source/android/scripts/sales-theme-660.js` and its matching source style.
- Business/workflow extensions: `frontend-source/android/scripts/workflow-ui-670p2.js`, `frontend-source/android/scripts/commercial-ui-6702026.js` and matching source styles.
- Android performance layers: `frontend-source/android/scripts/performance-android7-16.js`, `frontend-source/android/styles/performance-android7-16.css` and the final compositor safeguards in `frontend-source/android/styles/performance-final-850.css`.

> Source modules live outside `android-app/app/src/main/assets/`, so they remain editable without being duplicated inside the APK. Login, Home, Business, Sales, Stock, Settings and every existing route still use the same functions, state keys, handlers and plan gates; only runtime delivery is consolidated.
