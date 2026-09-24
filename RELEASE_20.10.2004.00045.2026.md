# Vyapar AI 20.10.2004.00045.2026

## Global rounded UI follow-up
- Apply the existing 999px pill radius to matching top and bottom navigation bars, middle page tab tracks and selection capsules wherever present. Preserve all five nav destinations, thumb animations and safe-area geometry.
- Extend the 26px outer-panel and 24px inset-card rounding to remaining nested Home, Business, Sales, Stock, Analytics, Upload, Calculator, Settings/More, Subscription, invoicing, login and account views as well as modal and bottom-sheet surfaces.
- Match search wrappers/fields to the same pill silhouette across the app, including saved invoice and manual stock searches; retain the existing search functions, focus styling and form validation.
- Convert existing three-dot record/tool overflow controls to 44x44 circular tap targets, including Monthly Profit and table record menus. Do not alter selection, deletion, or popup operation.
- Keep v00044's two-column business summary and full-width Customer Due panel even on 320px phones, previous invoice and stock improvements, all saved data and underlying calculations.

## QA and release
- The new final CSS source is last in both Android and web UI bundles. Automated regression tests, real browser responsive checks at multiple viewport widths, and the signed Android APK build/signature verification run in the main-branch release workflow.
- Android versionCode 2010200445. The APK and source ZIP become available when the main-branch workflow succeeds.
