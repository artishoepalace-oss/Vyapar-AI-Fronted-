# Startup loading-screen hotfix — 2026-09-11

This hotfix keeps the existing 20.10.2004.00009.2026 feature set and fixes an indefinite startup-cover condition.

Changes:
- If durable IndexedDB storage is unavailable, the opaque HTML boot guard is released so the existing recovery dialog is visible instead of leaving the logo on screen forever.
- A 12-second durable-storage startup watchdog shows a safe recovery dialog without overwriting saved records.
- Startup does not render an empty workspace when durable storage has not become ready.
- The startup recovery path explicitly releases the WebView startup frame when storage initialization fails.
- No feature, navigation, business logic, updater capability, or stored-record schema was removed.

Validation from the prepared hotfix source:
- `npm run verify`: 52/52 tests passed.
- Web/Android bundle parity check passed.
- JavaScript parse and local asset reference checks passed.

Branch release identity remains `20.10.2004.00009.2026` / `2010200409`.
