# Vyapar AI 20.10.2004.00036.2026

- Slide the entire page right-to-left when moving forward through Home, Business, Sales and Stock; use left-to-right when returning to an earlier tab. Both pages move together across one viewport with a softer 600ms curve.
- Fix legacy CSS that suppressed page transforms. Page slides now use compositor CSS transitions that also work through the existing WebView styling.
- Keep the visible slide continuous during rapid navbar taps, then open the latest requested destination. Native Back uses the same navigation handling. Header and navbar stay stationary, and temporary page layers are cleaned up after completion or resize.
- Give More a 600ms entrance and 440ms exit. Close the sheet before opening Insights, AI Upload, Calculator, Plans or App Settings; every More destination enters from the right. Interrupted sheet dismissal continues from the visible frame.
- Preserve burgundy accents, rounded popup corners, navbar clearance, the single Stock Manager entry, drafts, stock/account features and existing scroll preferences. Lite mode scales durations and reduced-motion mode skips animation.

Android version code: `2010200436`. Application ID, saved-data formats and signing identity are unchanged.

Release checks include automated runtime regressions, rendered-frame checks for all 12 main-tab directions and five More destinations at 320/360/412px, rapid taps, Back, resize, reduced motion, navbar geometry at five widths, and the existing workspace-flow browser gate. Browser account/network responses are mocked; these checks do not replace testing on every physical Android device.
