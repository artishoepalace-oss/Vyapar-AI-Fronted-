# Vyapar AI

Android business app and web frontend for sales, stock, billing and shop accounts.
Current app identity is defined authoritatively by `version.json` and `android-app/app/build.gradle` (currently **20.10.2004.00009.2026** / `2010200409`).

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

- Business, Sales and Stock share compact tool cards with shorter descriptions and consistent actions. Business categories and cross-category search remain available.
- Telegram-inspired compact top/bottom bar proportions, five navigation destinations, visible active icons and one bottom content inset.
- Dark-only Settings with search, multiword matching, clear/Escape and empty results.
- Profit dashboard with a year selector, Overview / Compare / History / Plan, signed profit charts, annual history pages, monthly details, CSV export, goals and investment metrics.
- IndexedDB is the primary device store. Record arrays are saved in chunks inside atomic snapshot transactions; startup waits for hydration. Legacy local data migrates after a successful commit. Save failures remain visible.
- Full-list search and 40-row pages for daily, sales, monthly and stock lists. No silent 50,000-record clipping.
- Import / Scan tabs, styled file pickers, label-photo preview, import preview, repeat-file confirmation and staged imports with rollback on failed save.
- Shared plain/password backup reader supports Android FileReader, UTF-8/UTF-16 and legacy backup envelopes. Invalid backups cannot replace live data or the authenticated account.
- Prior offline invoice PDF downloads, once-only permission introduction, optical logo spacing and Telegram-style motion are retained.

See [current validation and device checks](docs/WORKSPACE-00007-VALIDATION.md). Source and Android/web assets are included; this ZIP is not a compiled APK.

## New focused modules

| Responsibility | Source under `frontend-source/android/` |
| --- | --- |
| Atomic local storage and migration | `scripts/data-store.js` |
| Backup reading, validation and decryption | `scripts/file-io.js` |
| One-pass historical profit aggregation | `scripts/profit-history.js` |
| Profit dashboard and export | `scripts/insights-workspace.js` |
| File review, staged import and scanner UI | `scripts/upload-workspace.js` |
| Full-list search and record pagination | `scripts/record-pages.js` |
| Storage startup barrier and status | `scripts/workspace-startup.js` |
| Final responsive workspace controls | `styles/workspace-v7.css` |

Storage remains limited by device space and memory. Data is still loaded into memory at startup; this is not an unlimited server database. Keep external backups. Automated large-data tests use transaction doubles; Android WebView performance and physical-device storage still require verification.
