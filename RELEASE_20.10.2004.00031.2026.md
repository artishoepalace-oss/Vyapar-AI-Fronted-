# Vyapar AI 20.10.2004.00031.2026

This update applies the mobile UI review across Home, Business, Sales, Stock, Insights, Upload, Calculator, Plans and Settings.

- Align card spacing, borders, corners, headings and tool actions. Keep the matching black header/navbar, circular logo/avatar and fixed sliding capsule; improve contrast for its burgundy icon and label.
- Remove duplicate bottom spacing and clipped section surfaces. Keep sheets above the visible navbar, lock navigation while a form is open, and place save feedback above the bar.
- Replace generic form launchers with specific actions. Make the empty-stock action open the working entry form and remove unused empty-list controls.
- Use neutral table rows, bounded spacing and a horizontal-scroll hint. Show transaction amounts earlier while keeping headings, selection, cancellation and data aligned.
- Show current-month profit in Home's snapshot, explain the health score, and make Customer Due span the Business summary.
- Label current-year comparisons as recorded-so-far versus a full prior year. Improve chart-label legibility and selected scan-mode visibility.
- Add Change file / Remove file controls that clear stale import previews without changing saved records.
- Separate Calculator and Business views while preserving their inputs. Collapse history, enlarge the equals key, and display scientific-calculation errors without an uncaught exception.
- Show subscription copy based on verified plan status, distinguish silver Pro and gold Business cards, and move password settings into Your account.

Validation: shared Android/web bundle and runtime checks; 68 automated tests; Chromium navigation/alignment checks at 320, 360, 383, 412 and 768px; workspace save, billing, import-preview, calculator, popup and layout checks at 320, 360 and 412px. The browser checks use disposable records and mocked account/network responses. Physical-device behavior and live payment, sign-in and cloud integrations require device/service testing.

The Android build retains the existing application and signing identity. Version code: `2010200431`. Existing saved-data formats and accounting rules are preserved.
