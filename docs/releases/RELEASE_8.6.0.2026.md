# Vyapar AI 8.6.0.2026

## iOS HIG Blur + Stronger Blue UI

- Preserved all 8.5.9 Liquid Glass V2 glitch fixes and layered the new HIG presentation system after them.
- Rebuilt the top bar as a stronger iOS-style frosted blue header with a circular logo and compact theme control.
- Reworked the five-tab bottom navigation into a docked blur bar attached to the bottom edge, with clearer icon-first hierarchy and blue active states.
- Applied Apple-style continuous corner scaling to cards, grouped Settings surfaces, inputs, buttons, modal panels and utility containers.
- Refined More into a rounded iOS bottom sheet with stronger blur, blue icon tiles, two-column grouping and full-width App Settings action.
- Added old-WebView fallback surfaces so devices without backdrop-filter still get intentional dark-blue panels instead of broken transparency.
- Applied the HIG blur layer to both Android bundled UI and web entrypoint without changing business logic, accounting, auth, plan gating or feature flow.

## Build

- Version name: 8.6.0.2026
- Version code: 8602026
- minSdk: 23
- compileSdk / targetSdk: 34
- Java: 17
