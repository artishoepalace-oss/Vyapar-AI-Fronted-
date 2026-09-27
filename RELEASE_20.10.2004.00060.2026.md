# Vyapar AI 20.10.2004.00060.2026

- Fix Settings > Business controls so Company, Staff & Security, Business Settings, Notifications & Audit, and Data Management use one shared popup flow. The old inline module host stays parked, preventing a popup and a second module page from appearing together.
- Keep the active Business workspace host isolated while a Settings popup is open, then restore it when the popup closes so later Business actions continue targeting the correct host.
- Add an editable Name row to Settings > Account & plan with a dedicated pencil action, inline validation, Save/Cancel controls, and persistent app display-name storage.
- Make the top profile shortcut prefer the user-edited display name while leaving authentication, subscription verification, business records, accounting, and backend identity unchanged.
- Add Chromium release-gate coverage for name editing, profile-chip refresh, single-popup ownership, zero inline duplication, Settings tab retention, and Business-host restoration.

Android version code: `2010200460`. Application ID, minSdk 26, target/compile SDK 34, financial data formats, entitlements, and original signing requirements are unchanged.
