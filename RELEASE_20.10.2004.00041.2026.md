# Vyapar AI 20.10.2004.00041.2026

- Correct middle-screen tab placement on Business, Sales, Stock and other workspaces: reset the inherited sticky `top` offset after switching the selector to relative positioning, removing the large blank gap shown above the bar.
- Restore 44px tab touch targets while keeping the 52px graphite track; align the thumb vertically with each equal-width tab and preserve left/right inset.
- Keep existing tab destinations, selected-state persistence, dark styling and the five-icon bottom navigation unchanged.
- Add automated checks for selected tab geometry, viewport fit and summary-to-tab spacing on mobile widths.

Application ID, stored data and original signing identity remain unchanged. Android version code: `2010200441`.

Release and APK status are determined by the main Android GitHub Actions workflow and are not assumed before validation finishes.
