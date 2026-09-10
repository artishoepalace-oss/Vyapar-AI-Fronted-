# Vyapar AI 20.10.2004.00010.2026

- Fix startup hanging on Android 8.x / older Android System WebView builds.
- Build the Android runtime JavaScript down to an ES2017-compatible bundle before packaging the APK.
- Keep the web runtime unchanged while preserving Android/Web source-of-truth parity before packaging.
- Retain the startup storage watchdog and native splash release fallback from 00009.
- Preserve existing login, business data, backup, navigation and in-app updater functionality.
- Publish as a permanently signed Android update for in-place installation.
