# Vyapar AI 20.10.2004.00065.2026

## WebView zoom / scale stability fix

- Disable Android WebView overview auto-fit. The responsive app already declares a device-width viewport, so overview mode could rescale the whole interface when a temporarily wide table, form or transition layer was measured.
- Keep the existing responsive wide viewport, but retain native zoom protection: built-in zoom controls off, visible zoom controls off, support zoom off and text zoom fixed at 100%.
- Lock the main app viewport to scale 1.0 so pinch, double-tap or browser auto-scaling cannot change app geometry.
- Preserve the v00064 navbar/top-bar contract, page physics, normal vertical scrolling, horizontal table overflow, forms, accounting, billing, stock, Settings and saved data.

## Regression coverage

- Assert Android overview mode stays disabled.
- Assert native WebView zoom controls remain disabled.
- Assert the packaged/web entry viewport keeps minimum and maximum scale at 1.0 with user scaling disabled.
- Existing frontend bundle, responsive Chromium, Android build, signing and publication gates remain authoritative.
- Release identity regex assertions are synchronized to 00065 before the publish gate.

## Release identity

- versionName: `20.10.2004.00065.2026`
- versionCode: `2010200465`
- minSdk: `26`
- package/signing identity: unchanged
