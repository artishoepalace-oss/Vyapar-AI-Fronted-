# Vyapar AI 20.10.2004.00047.2026

- Middle workspace bars use opaque light grey tracks and solid selected capsules. Remove blur, gradients and reflection layers while retaining equal tab widths, pill corners and existing navbar layout.
- Capsule motion uses a 205ms transform transition without width animation.
- Business Daily / Accounts / Documents / Activity now use the shared motion controller, matching the direction-aware Sales/Stock workspace transitions. Repeated taps cancel stale animations; reduced-motion preferences remain respected.
- Preserve the supplied circular three-dot design, Select all / Deselect all / Delete selected, invisible 10-second idle close, and disabled timeout after an option interaction. Existing confirmations and accounting safeguards remain in place.
- Return keyboard focus when an idle menu closes. Confirmation clicks retain the current selection-menu session when cancelling.

## Validation
- 101 frontend tests pass; web and Android bundles rebuild and runtime checks pass.
- Release workflow checks actual Business animation direction, rapid switching cleanup, solid computed surfaces, menu idle timeout and persistent interaction at 320/360/412px before building the signed APK.
- Physical Android devices and live payment services are not covered by these browser checks.

Android versionCode: 2010200447.
