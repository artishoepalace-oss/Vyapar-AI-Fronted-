# Vyapar AI Android 6.5.7

Android-only screenshot fixes. The `/web` bundle was not modified.

- Light-mode **Aaj ki Jeet / Shop Progress** card now uses a true light surface with readable text, stats and streak panel.
- More-sheet legal block is ordered and centered: copyright, legal links, then **From: Gupta Legacy** on its own centered row.
- Change Password now asks for the **current password** and sends `currentPassword` with the new password to the authenticated password endpoint. This fixes the impossible flow where the backend could report “Current password incorrect” although the UI never provided a current-password field.
- Android Light ↔ Dark switching now uses the WebView View Transitions API when available, with a hardware-friendly crossfade fallback and reduced-motion support.
- Android app version: **6.5.7 (65700)**.
