# Scroll Position Control — Android 7–16

- Added **Settings → Navigation → Auto Scroll to Top**.
- Default: **OFF**.
- OFF: each app section remembers its last in-session scroll position and navigation no longer force-jumps to the top.
- ON: preserves the prior navigation behavior and moves a section to the top after navigation.
- Existing feature-specific `scrollIntoView` actions (for example focusing a form after an explicit button press) remain intact.
- No business, authentication, payment, stock, sales, or accounting logic was removed.
