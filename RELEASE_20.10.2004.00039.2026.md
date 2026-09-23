# Vyapar AI 20.10.2004.00039.2026

- Fix the scroll jump reproduced from the supplied recording: restore each destination's vertical position instantly before its horizontal page slide. The automatic scroll-to-top preference still works.
- Keep the app header pinned while scrolling. Let the viewport own vertical scrolling instead of creating a second scrolling container on the body.
- Clip page slides without widening the mobile viewport or moving the bottom navigation. Keep horizontal scrolling available inside wide record tables.
- Lock the background at its current position while More and other popups are open, then restore normal touch scrolling on dismissal. Release that lock before measuring the next page when a popup closes into navigation.
- Retain the short incoming-only animation for legacy and low-memory devices, and use that bounded path on WebViews without overflow-clip support.

Android version code: `2010200439`. Application ID, stored-data formats and original signing identity are unchanged.

Validation: 80 automated regressions; navigation checks at 320, 360, 383, 412 and 768px; workspace checks at 320, 360 and 412px. Browser touch regressions cover scrolled-page navigation, sideways page drags, horizontal table scrolling, popup background locking, pinned headers and viewport width throughout a slide. Existing direction, rapid-tap, Back and reduced-motion checks remain release gates. Account/network responses are mocked. These checks do not establish frame-rate guarantees on every physical device.
