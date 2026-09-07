# Vyapar AI 8.6.7.2026 — Android Installer/Launcher Icon Mask Fix

## What the screenshot proved
The Home-page logo was no longer the problem. The screenshot is Android Package Installer, which renders the native application icon and applies its own circular/adaptive mask. The storefront foreground was still too large for that Android safe zone, so the right-side door and edge were being cut off.

## Fix
- Kept the supplied black/silver storefront artwork unchanged.
- Added a dedicated Android adaptive-icon safe-zone foreground wrapper.
- The storefront now renders at roughly 56% of the 108dp adaptive canvas, leaving enough breathing room for Android circle/squircle masks.
- Rebuilt the legacy round-icon wrapper with a real 72dp outer circle and a centered 44dp storefront mark.
- This targets the exact icon shown by Package Installer, launcher/home screen and Android app info.
- The in-app Home/header logo remains unchanged.
- No business logic, accounting, login, subscription, backup, sales, stock or stored data behavior changed.

## Version
- `versionName`: **8.6.7.2026**
- `versionCode`: **8672026**
