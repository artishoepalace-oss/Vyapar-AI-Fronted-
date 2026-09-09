# Vyapar AI

Android business app and web frontend for sales, stock, billing and shop accounts.
Current app identity: **20.10.2004.00006.2026** (`2010200406`). The authoritative values are in `version.json` and `android-app/app/build.gradle`.

## Start here

No npm dependencies are needed for frontend development. Use Node.js 18+; Python 3 is needed only for the preview server.

```sh
npm run build     # Generate both Android and web bundles
npm run verify    # Check source/output parity, references, JS syntax and tests
npm run preview   # Open http://localhost:8080
```

Build the Android app using the existing GitHub Actions workflow or Android SDK/JDK setup in `docs/history/COMPLETE_BUILD_README.md`.

## Where to edit

| Area | Source |
| --- | --- |
| App screens, actions and accounting integrations | `frontend-source/android/scripts/app.js` |
| Invoice PDF generation and local download | `frontend-source/android/scripts/invoice-pdf.js` |
| Local PDF dependency + MIT license | `frontend-source/vendor/` |
| Business tool search | `frontend-source/android/scripts/business-tool-search.js` |
| Login and session restoration | `frontend-source/android/scripts/auth.js`, `android-session-flow-647.js` |
| Settings navigation and search | `frontend-source/android/scripts/settings-center-675.js` |
| Final surfaces, readable controls and business layout | `frontend-source/android/styles/surface-hierarchy-20102004.css` |
| Navigation and popup motion | `frontend-source/android/scripts/motion-20102004.js` and matching stylesheet |
| Ordered bundle build | `tools/build-frontend-bundles.mjs` |
| Entry HTML | `web/index.html` and `android-app/app/src/main/assets/index.html` |
| Native WebView and device integrations | `android-app/app/src/main/` |
| Optional Firebase functions | `backend-firebase-functions/` |
| Historical notes | `docs/history/`, `docs/releases/` |

The `android` source directory is shared by both platforms. Its name is retained for compatibility with the existing tests and build tooling. Edit those source modules, then run `npm run build`; do not edit generated `vyapar-*.css` or `vyapar-app.js` directly. Their source markers preserve execution order and make bundled errors traceable.

The original financial engines and feature modules remain in place. Do not remove an older named layer solely because its version is old; many contain active behavior. There is no separate legacy source mirror to maintain.

## Current improvements

- Working category tabs and compact Business tools, with search across categories.
- Direct offline invoice PDF downloads: A4/A5 and 58/80mm, paginated items, saved totals and native save confirmation.
- A short first-use permission introduction and approximately 2:3 optical logo spacing.
- One deterministic build for web and Android. A local PDF dependency is included; no install step is needed.
- Original cleanup retained: 141 redundant files removed, historical notes archived and source modules preserved.

See [current changes and verification](docs/COMPACT-PDF-VALIDATION.md), [sample PDFs](docs/examples/), and the [prior cleanup record](docs/UI-CLEANUP.md). Physical Android UI and smoothness verification are still required before distributing an APK.
