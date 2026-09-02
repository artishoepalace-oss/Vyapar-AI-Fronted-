# Vyapar AI 8.0.0.2026

- Android versionCode: `8002026`
- Base version: `6.8.3.2026`
- Release branch: `main`
- Backend compatibility: `2.5.2`

## Changes

- Removed the visible version label from the login page on Web and Android.
- Prevented older UI layers from injecting a login version label again.
- Fixed software-keyboard, viewport, safe-area, scrolling and OTP-field clipping issues.
- Removed CSS zoom from the Android WebView auth layout to keep input hitboxes aligned.
- Made login-method selection tap-only to prevent accidental swipe changes.

No business feature, data schema, accounting rule or subscription flow was removed.
