# Vyapar AI

Android business app and web frontend for sales, stock, billing and shop accounts.
Current app identity: **20.10.2004.00005.2026** (`2010200405`). The authoritative values are in `version.json` and `android-app/app/build.gradle`.

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

## This cleanup

- Shorter Business page explanations and a local tool search with clear, no-result and keyboard-reset behavior.
- Flat, consistent tool cards; readable text; 44px action/input targets; visible focus; single-column tools on phones.
- One deterministic build writes both platform bundles. `--check` detects source edits that have not been built.
- 141 unused duplicate source/runtime files removed (3,653,445 bytes); historical notes moved into documentation folders.
- Original version, account data keys, navigation destinations, entitlements, startup and accounting behavior retained.

See [validation and limitations](docs/UI-CLEANUP.md) and the [exact cleanup list](docs/cleanup-manifest.json). Full historical feature documentation is in [the archived README](docs/history/README-legacy.md).
