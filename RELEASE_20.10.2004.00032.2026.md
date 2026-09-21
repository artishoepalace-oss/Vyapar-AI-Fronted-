# Vyapar AI 20.10.2004.00032.2026

- Round the More popup's bottom corners to match its 26px top corners. The existing 16px content inset keeps the approximately golden-ratio proportion.
- Match all five right-side arrows to the popup's warm golden-yellow icons (`#d4af55`).
- Retain the full-width sheet, space above the navbar, scroll behavior, dismissal gestures and existing animations.

This is a scoped visual update. App features, saved-data formats, application ID and signing identity are preserved. Android version code: `2010200432`.

Release gates: shared-bundle/runtime verification, the existing 68 automated tests, and the existing mobile navigation and workspace browser checks. Account and network responses in browser checks are mocked.
