# Vyapar AI 6.5.1 — Android UI stabilization

Implemented on 2026-08-29.

- Android-first login layout with `Login with Password` and `Login with OTP` labels.
- OTP send buttons reflow below the email field on narrow Android screens.
- Link-style Create account / Forgot password actions without filled blue boxes.
- Visible login success loading state before the app opens.
- Stronger light-mode text/input/menu contrast.
- Bulk action controls converted to hidden three-dot menus; destructive all-record actions are removed from the compact menu. Accounting transactions keep Cancel semantics instead of hard delete.
- Bottom navigation changed to tap-first behavior and redundant screen-mutation nav rerenders removed.
- Pro plan uses metallic silver illumination; Business uses metallic gold illumination.
- Paid account avatars use matching silver/gold shine and verified ticks only when a paid entitlement is present.
- `From: Gupta Legacy` added as the final signature on auth, app footer, More sheet, legal pages, and public invoice.
- Android WebView assets synchronized with the corrected current web runtime.
- Version bumped to 6.5.1 / 65100.

Validation completed:

- `node --check` passed for all web JavaScript files.
- `node --check` passed for all Android bundled JavaScript files.
- Android index local asset references all resolve.
- Android Gradle/version metadata matches root `version.json` (compileSdk 34, targetSdk 34, 6.5.1 / 65100).

A full Gradle APK compile was not run in this sandbox because Gradle/Android SDK tooling is not installed here; the repository workflow is configured to install Gradle 8.7 and Android SDK 34 before building.
