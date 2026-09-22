# Vyapar AI 20.10.2004.00037.2026

- Make the full-width page slide and More popup entrance a little faster: 460ms, down from 600ms. More closes in 340ms instead of 440ms; its backdrop fades in over 300ms.
- Keep the smooth easing curve, Home → Business → Sales → Stock direction logic, reverse slides, and right-to-left entry for every More destination.
- Preserve continuous rapid-tap handling, native Back, stable bars, rounded burgundy More styling, resize cleanup, drafts and scroll preferences. Lite mode uses shorter durations and reduced motion remains immediate.
- Bound browser-check waits and allow a newer main build to supersede an outdated run. All validation and signing gates still run before publishing.

Android version code: `2010200437`. Application ID, data formats, features and signing identity are unchanged.

Validation: automated regressions; rendered-frame checks for all main-tab directions and More destinations at 320/360/412px; Back, rapid taps, resize and reduced motion; five-width navbar checks; existing Stock, Sales, Billing, Insights, Upload, Calculator and Settings browser flows. Browser account/network responses are mocked. Physical-device frame rates depend on hardware and WebView version.
