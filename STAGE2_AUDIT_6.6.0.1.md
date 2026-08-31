# Vyapar AI 6.6.0.1 — Stage 2 audit repair

This patch is a consolidation/stability release, not a feature-expansion release.

## Critical fixes
- One canonical `state` object now backs the legacy app and Business Platform overlays, fixing the split-state persistence/data-sync defect.
- Home/Sales/Business summary use a shared finance resolver with per-day source priority to avoid duplicate sale counting: accounting transaction → Daily Quick Entry → item-wise sale. Monthly manual profit remains additive by design.
- Monthly Profit year filter now reads the actual month cell after bulk-selection columns are inserted; selecting 2026/2025/etc no longer hides valid rows.
- Android bottom navigation safe area is increased so calculator `0`, `.`, `=` and table endings remain reachable.

## High-priority UX fixes
- Business page no longer repeats Stock-related and Sales-related discovery groups; those modules remain in their dedicated workspaces.
- Internal Business Platform version pills are hidden from production UI.
- Footer is compact with one logo and Privacy / Terms / Refund / Delete Account links.
- Android native white select popup is replaced by a themed in-app selection sheet.
- User-facing table dates are shown as `31 Aug 2026` while stored values remain ISO.
- Monthly table is explicitly labelled `Monthly Manual Profit Records`; live totals explain their sources.

## Additional audit fixes
- Sales empty state distinguishes item-wise sales from Daily Quick Entry.
- Shop Journey sheet height and close control reduced; backdrop/layer separation improved.
- Report cards follow the same dark Liquid Glass surface tokens.
- Light-mode calculator contrast raised.
- OTP code controls reveal only after a successful OTP request; duplicate CTA language reduced.
- Auth swipe switching is disabled; tap switching remains.
- Visible scrollbars are suppressed on Android while scrolling remains enabled.
- Repeated non-lock PRO/BUSINESS badges are reduced.
