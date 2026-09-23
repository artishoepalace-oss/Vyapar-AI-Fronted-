# Vyapar AI 20.10.2004.00042.2026

## Middle-bar sliding behavior
- Retain the live Overview / Compare / History / Plan tab bar while refreshing dashboard contents, allowing the selection capsule to slide rather than jumping after DOM recreation.
- Keep selected ARIA state in sync with the active dashboard view and preserve year, comparison, history, and plan workflows.
- Animate selection movement even when equal-width button measurements differ by a fraction of a pixel; smoothly interpolate thumb width changes without animating button layout.
- Keep the existing black/graphite theme, 44px tap targets, five-icon bottom dock, and reduced-motion fallback.

## Release
Android versionCode 2010200442; signed APK and source ZIP are built by the main-branch release workflow after automated verification.
