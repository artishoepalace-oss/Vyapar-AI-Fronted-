# Vyapar AI 20.10.2004.00058.2026 — Physical UI, Popup & Invoice Share

- Refine the Android 8+ motion system with sampled damped-spring panel entrances while keeping page navigation critically damped with no reversal/overshoot.
- Keep native WebView touch/fling scrolling as the scrolling physics authority; no fake JavaScript scroll engine is added.
- Rework the three-dot action popover with a compact iOS-inspired physical surface, spring scale/translation, stable 44px trigger, safe action spacing and no stuck touch focus ring.
- Refine page/form sheets, More and app-update popups with one black/graphite material hierarchy, safe-area clearance, 24px outer corners, protected inner padding and static top reflections.
- Add low-cost optical reflections to the top bar, bottom navigation and active capsule without live blur/filter animation.
- Use a 24px panel / 18px card / 14px control corner hierarchy and explicit text-safe inner insets to prevent labels or controls from being clipped by rounded edges.
- Improve Settings subpage padding and synchronize stale internal section headings with the canonical Settings route names.
- Keep Business / Sales / Stock workspace labels and routing stable; existing requested middle-bar destinations remain unchanged.
- Preserve offline A4/A5 and 58/80mm invoice PDF generation, wrapping, repeated headers, saved totals, GST breakdown, page numbering and optional duplicate copies.
- Add PDF attachment sharing through the Android share sheet plus dedicated WhatsApp / WhatsApp Business sharing. The existing public invoice message/link share remains available separately.
- Extend the existing read-only content provider with a canonical-path-checked PDF share route; no broad file permission or new Android dependency is introduced.
- Preserve authentication, accounting, subscription, backup, sales, stock, invoice, update and stored business-data behavior.

## Build
- versionName: `20.10.2004.00058.2026`
- versionCode: `2010200458`
- minSdk: `26` (Android 8.0)
- compileSdk / targetSdk: `34`
- Java: `17`

## Release validation
GitHub Actions rebuilds shared web/Android bundles, runs the full Node regression suite, performs responsive Chromium navbar/page/workspace checks, validates Android release metadata, builds the signed APK with the existing signing key, verifies its signature and publishes the APK plus source ZIP.
