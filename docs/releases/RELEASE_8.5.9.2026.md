# Vyapar AI 8.5.9.2026

## Liquid Glass V2 + More popup glitch fix

- Rebuilt top bar and bottom navigation as layered optical glass instead of plain transparency.
- Added moving neutral highlight, internal caustic edges, stronger depth, saturation and refraction-like film.
- Android 7–8/low-RAM fallback keeps the glass identity using lightweight gradients instead of expensive live blur.
- Rebuilt More as one coherent liquid sheet with safer scroll behavior, compact two-column layout and full-width App Settings action.
- Removed duplicate legacy More capture handlers when the 8.5.9 coordinator is active, preventing double close/navigation and popup flicker.
- Added one final More close/navigation owner with clean exit animation and restored scroll state.
- Existing business features, authentication, accounting logic, plan gating, fixed top bar and five-tab navigation remain unchanged.

## Build

- Version name: 8.5.9.2026
- Version code: 8592026
- minSdk: 23
- compileSdk / targetSdk: 34
- Java: 17
