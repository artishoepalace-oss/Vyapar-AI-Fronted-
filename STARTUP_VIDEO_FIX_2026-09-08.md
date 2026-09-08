# Startup fixes from XRecorder_20260908_01.mp4

Source: supplied ZIP, Android version **8.6.9.2026 / 8692026**. Version number retained.

All 668 video frames were decoded and reviewed in sequence. Adjacent-frame image comparisons located the main transitions; frame times come from the recording timestamps (variable frame rate).

| Recording interval | Observed issue | Change |
| --- | --- | --- |
| 2.62–4.48 s | Logo fades away into an empty dark screen | Retain a native logo cover until the destination is ready to draw; match native and HTML artwork and 112dp/CSS-pixel sizing. |
| 4.48–7.36 s | Login form appears while an existing session is being checked | Keep the form hidden until authentication chooses the login destination. |
| 7.36–15.07 s | A second, differently styled session loader appears | Reuse a single opaque logo guard; remove competing 650ms, 2400ms and 9-second dismissal paths. |
| 15.07–16.70 s | Login reappears before the saved session opens Home | Resolve authentication before revealing the destination, with no cross-fade through the login form. |
| During login | Tab labels and Password availability change | Current auth owns the tabs; legacy security/UI helpers no longer fight over them. |

The saved-session check now has a 6-second deadline covering `/auth/me`, optional token refresh, the retried request and response-body reading. Existing cached local access is retained only for availability failures. Explicit 401/403 rejection clears the rejected session. A late response cannot switch screens or restore rejected tokens. This is a network-wait limit after JavaScript starts, **not a promise that every device launches within six seconds**.

The web payment SDK loads asynchronously; its existing wait-on-checkout helper is preserved. Account, billing, inventory, finance, subscriptions and navigation features remain in the source. Repeated self-triggered auth/class mutations were reduced. Android source mirrors and compiled JavaScript bundles include the same fixes; platform-specific app code is preserved.

The native cover is dismissed through `WebView.postVisualStateCallback`, after the destination DOM has been prepared. The API is available from level 23, matching the project minimum. See [Android WebView API reference](https://developer.android.com/reference/android/webkit/WebView#postVisualStateCallback(long,%20android.webkit.WebView.VisualStateCallback)).

## Verification

Passed:

- `node --test tests/startup-session.test.js tests/login-auth-ui.test.js tests/phase3-integrity.test.js tests/phase31-ui-hotfix.test.js`
- 14 startup regression groups: guest, valid session, slow cached/uncached session, rejected session, token refresh, hung/late refresh, late `/me`, no AbortController, response-body timeout, stable Password tab, native readiness notification and startup source invariants.
- Existing finance/data-integrity suite: 9 groups for both platforms, including restore, stock, ledger, returns, duplicate safety and subscription protection.
- Rebuilt Android bundles and parsed both shipped JavaScript bundles with `node --check`.

Limits: startup behavior tests use Node VM with an isolated DOM model and fake clock; they do not measure physical-device performance or render CSS. Local browser preview was blocked by the browser security policy. Android SDK/Gradle were not available here, so this ZIP contains updated source, **not a newly built or device-tested APK**.

## Device checks after building

1. Force-stop and open with a valid saved session: one logo, then Home; no login flash.
2. Open with slow/no network and cached data: bounded session wait, then the existing local-access behavior.
3. Open without a saved account: one logo, then login; Password/Email OTP remain selectable.
4. Confirm expired-session login, successful password/OTP login, signup and return from Google sign-in.
