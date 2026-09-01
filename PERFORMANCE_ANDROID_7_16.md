# Android 7–16 Performance Pass

Base: Android 7–16 single-loading build.

## Changes
- Native WebView stays hardware accelerated; scrollbars and zoom work are disabled.
- Native bridge exposes exact Android API + RAM class for runtime performance tier selection.
- Android 7–8 / low-RAM devices use static translucent surfaces instead of expensive live backdrop blur.
- Android 9–11 use capped blur; Android 12–16 retain higher-quality glass with bounded blur.
- While scrolling, live blur/decorative animation is temporarily paused and restored after scroll idle.
- Continuous requestAnimationFrame FPS polling was replaced by short sampling bursts.
- Large subscription artwork is lazy/async decoded.
- Existing screens, business logic, navigation, payments, auth and data formats are unchanged.
