# Vyapar AI 20.10.2004.00057.2026 — Physics Motion

- Raise the Android minimum to Android 8.0 / API 26 and keep compileSdk / targetSdk 34.
- Upgrade the existing single motion controller to an adaptive damped-spring system instead of adding a competing animation layer.
- Keep native Android WebView touch/fling scrolling as the scroll physics authority; no fake JavaScript scrolling engine is introduced.
- Add spring-settled Home / Business / Sales / Stock / More navigation, nav capsule motion and workspace selector motion.
- Add velocity-aware bottom-sheet drag dismissal with resistance, release velocity and spring-back when the dismiss threshold is not reached.
- Improve tactile button/card feedback with transform-only motion and disable nonessential motion while a low-end device is actively scrolling.
- Preserve reduced-motion support and retain compact single-surface navigation for Android 8 / low-RAM devices.
- Preserve authentication, accounting, sales, stock, subscription, backup, invoice and stored business data behavior.

## Build
- versionName: `20.10.2004.00057.2026`
- versionCode: `2010200457`
- minSdk: `26` (Android 8.0)
- compileSdk / targetSdk: `34`
- Java: `17`

## Release validation
GitHub Actions rebuilds the shared web/Android bundles, runs `npm run verify`, executes Chromium navigation/workspace checks, builds the signed release APK with the existing app signing key, verifies the APK signature and publishes the APK + source ZIP to the GitHub Release.
