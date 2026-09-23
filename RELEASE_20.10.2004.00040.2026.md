# Vyapar AI 20.10.2004.00040.2026 — Black & Grey Middle Bar

- Replace the independently filled middle-page tab buttons with one continuous black rounded track and a single sliding graphite capsule.
- Apply to the existing Business (Daily, Accounts, Documents, Activity), Sales (Today, Monthly, Billing, History), Stock (Manage, Tools, Records), Insights, AI Upload, Calculator and Settings workspace selectors.
- Keep the active destination, underlying tab callbacks, content, stored business records and five-tab bottom navigation unchanged.
- Use measured button coordinates rather than assumed equal pixel widths. Recalculate after selection, screen changes and resize; omit motion on first render, reflow and reduced-motion devices.
- Keep controls 44px high with no sideways viewport overflow, including narrow 320px screens. Use CSS transform for the moving thumb, not layout animation.

Application ID and Android signing requirements are unchanged. Version code: `2010200440`.

Validation is performed by the Android GitHub Actions workflow (frontend build, automated regressions, responsive Chromium checks and signed APK compilation). Do not assume release success until the workflow finishes and the APK is attached.
