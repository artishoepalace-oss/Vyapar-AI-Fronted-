# Telegram-inspired motion and logo fixes

Base: the supplied `Vyapar-AI-Fronted--main (2).zip`.
Version unchanged: **20.10.2004.00001.2026**, Android versionCode **2010200401**.

## Recording review

All 990 decoded frames of `XRecorder_20260908_02.mp4` were reviewed in chronological contact sheets, with timestamped overview frames. Observed problems:

- Around 2–6 seconds: rounded native logo changes to larger square artwork.
- Around 9–13 seconds: Home, Business, Sales and Stock transitions cut abruptly.
- Around 15–18 seconds: More backdrop and sheet motion do not feel coordinated.
- Around 22–25 seconds: Shop Journey appears and disappears abruptly.
- Around 27–38 seconds: navigation opens at an incorrect scroll position, then visibly travels to another position.
- Header visibility changes while scrolling.

## Implemented changes

- One motion coordinator serves the existing navigator, including all main and More destinations. Page entry slides follow navigation direction (290ms; 232ms in Lite mode). No duplicate page DOM or copied inputs.
- Restore each page's saved scroll position synchronously before the first transition frame. The existing Auto Scroll to Top setting remains optional. Removed competing asynchronous scroll resets.
- Keep five navigation buttons mounted between page changes; update active state, accessibility labels and plan locks in place. Navigation remains tap-only, with the real routes and plan gates.
- Settings subpages slide forward/back, remembering the settings list position. Native Back checks dialogs first and does not close hidden Settings pages.
- Animate login/create-account/password/OTP forms and task view switches; add button press/release feedback, input focus transitions and expandable-section entry.
- Coordinate dialog backdrop and panel entry; animate exits for More, Shop Journey, confirmations, password changes, subscriptions, update prompts, permissions, account dialogs and custom selects. Block repeated clicks during dismissal; restore focus and trap keyboard focus inside open dialogs.
- Use the existing padded, rounded launcher artwork consistently in Android's cover and Web/Android logo assets. Correct header/login image fit. Fade the native cover only after WebView reports a committed destination frame.
- Keep the supplied black/graphite surface hierarchy. Round the floating five-item dock and simplify More into separated list rows. Keep long Shop Journey content scrollable above the dock.
- Respect the system reduced-motion preference. Auto/Lite modes retain short animations on older devices; no continuous decorative animation or per-frame JavaScript loop was introduced.

## Validation

Passed:

- `node --test tests/motion-navigation.test.js tests/startup-session.test.js tests/login-auth-ui.test.js tests/phase3-integrity.test.js tests/phase31-ui-hotfix.test.js`
- 11 new motion/navigation cases cover both shipped platforms, rapid navigation, blocked routes, same-page taps, retained drafts, remembered scroll, optional auto-top, reduced motion, style restoration and one-time dialog resolution.
- Existing startup suite: 14 groups. Existing integrity suite: 9 groups including ledger, returns, stock, restore, finance precedence and platform parity.
- Both runtime bundles pass `node --check`.
- Android bundle rebuild is reproducible; new standalone CSS is copied by the build script. The existing web bundle retains its own platform-specific modules.

The supplied ZIP removed old `web/assets/scripts/*.js` aliases; regression tests now read the matching section from the actual shipped bundle when an alias is absent.

## Verification still required on a device

No Android SDK/Gradle or permitted local browser preview was available in this environment. This is a source ZIP, not a compiled APK. Physical-device frame pacing, keyboard/safe-area rendering and live account/payment/Drive flows were not exercised. The tests above verify JavaScript behavior and existing business invariants; they do not establish a measured frame rate or guarantee the absence of all visual glitches.
