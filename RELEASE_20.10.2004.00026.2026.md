# 20.10.2004.00026.2026 — Fixed capsule navigation

Android versionCode: `2010200426`.

- Replaces the previous 72px navbar with the supplied 367×50px black shell.
- Uses one fixed 68×42px grey capsule, 4px vertical inset and 390ms transform animation.
- All five tabs share one padded track, identical 42px content boxes, 21×20px SVG icon boxes and 8px labels. The app's existing SVG symbols remain in use.
- Centers the capsule on the selected button's actual DOM rectangle, preserving identical capsule dimensions across Home, Business, Sales, Stock and More.
- Keeps a 6px common track inset at full size. At viewports of 367px or less the shell fits within 8px screen margins and the track uses 12px insets, maintaining end clearance on 320–367px phones. The capsule remains 68×42px.
- Preserves the existing navigation handlers, subscription access checks, More popup, back handling and accessibility state. Hidden destinations such as Settings select More.
- Remeasures without animation on resize, with resize/orientation fallback for WebViews lacking ResizeObserver. Respects reduced-motion preferences.
- Regenerates identical web/Android bundles and updates both entry-page cache keys, version.json and Gradle release identity.

## Verification

- Runtime bundle parity, JavaScript syntax and local asset references pass.
- 60 existing regression tests pass; five added navigation tests pass using measured DOM rectangle doubles, including fractional/unequal cells, More restoration, locked tabs and both resize paths.
- `tools/qa-capsule-navigation.cjs` provides a browser check at 320, 360, 383 and 412px, including screenshots, rapid taps, More→Back, resize and reduced motion. It was not run to completion here: Chromium was unavailable and its download failed.
- Physical Android rendering and frame smoothness are not verified in this environment.

The repository release workflow builds the APK with the original app signing key, verifies its signature, and publishes the APK together with a source ZIP. Install the APK over the existing app to retain local records; the source ZIP is for development.
