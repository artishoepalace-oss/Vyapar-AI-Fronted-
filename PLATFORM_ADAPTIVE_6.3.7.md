# Vyapar AI 6.3.7 — Platform-Adaptive UI

## Android
- Android WebView uses its own `android-app/app/src/main/assets/` presentation layer.
- Touch-first 5-item bottom navigation: Home, Business, Sales, Stock, More.
- Stock navigation indicator is positioned synchronously on render to remove the one-frame Home flash.
- Navigation swipe uses cached geometry + requestAnimationFrame rendering, horizontal gesture lock, reduced blur, and GPU-composited transforms.
- Subscription/upgrade/payment dialogs are device-width bottom sheets capped to the usable screen height and safe-area padding.
- Login is compact, centered-logo, Password/Email OTP + Google + account creation flow with dark/light theme support.

## Web
- Web uses its own `web/` presentation layer and is no longer copied over Android assets during CI.
- Desktop uses website-scale layout/navigation; mobile web uses phone-responsive layout.
- Subscription dialogs are centered desktop cards and mobile bottom sheets.
- Login keeps the same auth functions/context while scaling independently for desktop and mobile browser.

## Backend
- Render backend 2.5.2 adds `POST /auth/refresh` compatibility for the frontend 401 retry interceptor.
- Existing login/OTP/Google/subscription/Razorpay routes remain intact.

## Verification
- JavaScript syntax checks: web, Android assets, backend.
- CSS parse checks and duplicate static HTML ID checks.
- Chromium layout checks at 390x844 (Android/mobile) and 1366x900 (desktop) for login and subscription geometry.
- Android 390x844 login: zero horizontal overflow; centered logo; default sign-in card fits without vertical overflow.
- Subscription: Android/mobile bottom sheet stays within viewport; desktop dialog stays centered and bounded.
- compileSdk/targetSdk 34; versionName 6.3.7; versionCode 63700.
