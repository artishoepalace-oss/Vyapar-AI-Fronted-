# Vyapar AI 20.10.2004.00044.2026

## App-wide rounded UI
- Align the top header and bottom five-tab navigation left/right ends to a full pill shape, preserving their widths, height, icons and active animation.
- Use the same rounded outer shape for all middle page selectors and their animated selection capsules, without reimplementing navigation or scroll logic.
- Standardize the outer container corner radius to 26px and nested cards to 24px across the app's existing screens and popup sheets. Keep content responsive and preserve menu visibility.
- Make search controls full-pill while retaining search icons, keyboard focus and existing search functionality.
- Change the existing three-dot record menu triggers to true 44x44 circles everywhere, including monthly records.
- Preserve all 20.10.2004.00043.2026 invoice, sales and stock improvements, active app data, financial calculations, permissions, and the existing black/graphite theme.

## Build & QA
The same global-radius CSS is bundled into Android and web after all previous source styles. Four focused regression checks were added. The main workflow runs npm verification, browser geometry/flows, signed APK compilation, signature verification and publishes an APK plus source ZIP after success.

Android versionCode 2010200444.
