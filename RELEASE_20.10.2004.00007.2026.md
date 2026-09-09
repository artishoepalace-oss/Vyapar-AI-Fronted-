# Vyapar AI 20.10.2004.00007.2026

The previous workspace used inconsistent tool cards, rendered every historical year at once and relied on a full-state localStorage write. Backup files also depended on Blob.text and could be accepted without enough validation.

This release adds:

- Consistent compact Business, Sales and Stock cards, shorter descriptions, and hidden idle tool panels.
- Telegram-inspired bar proportions with five navigation destinations, clear active icons and corrected bottom spacing.
- Settings search and dark-only appearance. Motion settings remain available.
- A year-based profit dashboard: Overview, Compare, History and Plan. One monthly chart, negative-profit support, paginated annual history, exact monthly values and CSV export. Goals, investment, ROI, payback, indicative value and 10-year targets remain accessible.
- Chunked IndexedDB snapshots with atomic commit, a retained prior snapshot, startup hydration, visible save failures and guarded legacy migration. No 50,000-record truncation; record tables render 40 rows at a time and search all records.
- Separate Import / Scan tabs, photo preview, review-before-import, repeat-file confirmation and staged imports that do not change live records on save failure.
- One compatible reader for plain/password backup files, UTF-8/UTF-16 and Android file providers. Backup shape validation, account/plan preservation and awaited local commit. Generic binary MIME files are accepted by the Android document picker.
- Cloud decisions wait for device hydration. Account refresh and cloud restore no longer write full records back into localStorage. Product import rollback preserves unrelated business data.
- Removed repeated footer/metric updates that triggered unnecessary observer work.

Version code: **2010200407**. Backend reference: **2.5.2**. Existing accounting posting, subscriptions, auth, invoice PDF, printer and permission flows are retained.

Automated checks: **51 passed, 0 failed**. Validation details: `docs/WORKSPACE-00007-VALIDATION.md`. Physical Android layout, file-provider behavior, APK compilation for this version and frame smoothness have not been verified in this environment.
