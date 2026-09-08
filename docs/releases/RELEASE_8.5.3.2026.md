# Vyapar AI 8.5.3.2026

Apple Liquid Glass refinement and page-switch stability release from `main`.

- Android `versionName`: `8.5.3.2026`
- Android `versionCode`: `8532026`
- Fixed the visible page-switch flicker/flash between Home, Business, Sales and Stock by removing the competing legacy transition and using one compositor-only directional transition.
- Bottom-tab switching now bypasses the tiny intermediate loader so the page does not blink during normal workspace navigation.
- Rebuilt the bottom navigation active state around one real moving refractive glass lens instead of separate per-tab blue tiles.
- Tightened the floating navbar height, capsule radius, side curves, icon spacing and light/dark material for a more iOS-like proportion.
- Added a lens sheen that travels with the active tab while keeping navigation tap-only.
- Reworked the light/dark transition so the destination sun/moon icon changes immediately, the target material expands radially from the appearance button, and the actual theme commits only after the reveal covers the screen.
- Removed the previous theme icon/surface timing mismatch and suppressed duplicate older theme-ripple/crossfade effects during the new transition.
- Refined the More sheet with stronger Apple-style floating curves, more transparent dark material, softer grouped rows, spring open/close motion and a lighter backdrop.
- Preserved a translucent no-live-blur fallback for Android 7/8 and low-RAM devices to avoid the hangs caused by expensive continuous backdrop sampling.
- Existing authentication, subscriptions, accounting, sales calculations, backup/restore, business data, destructive-action colors and the 8.5.1 long-press WebView stability patch are preserved.
