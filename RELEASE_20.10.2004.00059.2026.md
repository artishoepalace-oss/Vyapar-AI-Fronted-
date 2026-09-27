# Vyapar AI 20.10.2004.00059.2026 — Navbar Outside Reflection

- Remove the white gradient wash from inside the bottom navigation bar while retaining its thin, crisp rim.
- Place a centered reflection immediately below the bar, spanning 50% of its width and fading horizontally and downward over 8px.
- Keep the reflection within the existing bottom clearance and prevent it from intercepting taps.
- Keep the existing five-tab layout, active capsule, top bar, popup placement and Android 8+ motion behavior.
- Synchronize the web and Android UI bundles and update app/cache metadata.

## Build
- versionName: `20.10.2004.00059.2026`
- versionCode: `2010200459`
- minSdk: `26` (Android 8.0)
- compileSdk / targetSdk: `34`
- Java: `17`

## Release validation
The existing GitHub Actions workflow verifies shared bundles and regression tests, checks responsive navigation and workspace flows in Chromium, builds the APK with the existing signing key, verifies its signature, and publishes the APK and source ZIP.
