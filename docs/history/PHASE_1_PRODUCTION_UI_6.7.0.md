# Vyapar AI 6.7.0-phase.1

Production-readiness Phase 1 establishes a simpler, consistent UI foundation without deleting, replacing or renaming business features, routes, formulas, storage keys or plan gates.

## Baseline

- Input version: `6.6.0.1.1`
- Input archive SHA-256: `b37d724d04aeb04c7cea69058755de187dfdec407af1b0b687ccd26993a8be09`
- Phase version: `6.7.0-phase.1`
- Android versionCode: `67001`
- Backend version remains: `2.5.2`

The output from this phase is the required baseline for Phase 2.

## What changed

### One visual system

- Added a final shared production UI layer for Web and Android assets.
- Unified the dark navy Liquid Glass palette, borders, spacing, shadows and control sizes.
- Reduced oversized cards, excessive glow and inconsistent blue surfaces.
- Added a readable light-mode counterpart with the same information hierarchy.
- Standardised headers, forms, buttons, tables, dialogs and the More sheet.
- Added reduced-motion support and compact responsive rules down to 320 px.

### Simpler screens with all features retained

- **Sales:** `Today`, `Monthly`, `Billing`, `History` views.
- **Stock:** `Manage`, `Tools`, `Records` views.
- **Business:** `Daily`, `Accounts`, `Documents`, `Activity` views.
- **App Settings:** `Account`, `Business`, `Appearance`, `Data`, `Legal` views.

These are presentation filters only. Existing forms, advanced tools, record tables, bulk actions, plan locks and onclick handlers remain in the same application and appear under the relevant view.

### Stable Android navigation

- Navigation remains exactly `Home`, `Business`, `Sales`, `Stock`, `More`.
- The sliding glass indicator is visually disabled.
- Navigation is tap-only, equal-width and safe-area aware.
- The bottom content inset prevents long pages and calculator controls from sitting behind the navigation bar.
- Navigation hides while the Android keyboard is open.

## Preserved invariants

- No edit to `app.js` business logic in either Web or Android assets.
- No change to profit formulas or the 6.6.0.1 single-source finance repair.
- No change to login, Email OTP visibility, Google sign-in or password login logic.
- No change to subscription verification, Razorpay, backup/restore or account deletion logic.
- No change to feature gating: Business/Stock remain Business-plan gated; AI Upload/Insights remain Pro-or-higher.
- No feature file removed from the baseline archive.
- Existing localStorage data schema remains compatible.
- Footer remains limited to Settings and legal pages as previously specified.

## New files

- `web/production-ui-670p1.css`
- `web/production-ui-670p1.js`
- `android-app/app/src/main/assets/production-ui-670p1.css`
- `android-app/app/src/main/assets/production-ui-670p1.js`
- `phase-manifest.json`

## Validation completed

- All JavaScript files passed syntax checks.
- All JSON files parsed successfully.
- Every local CSS/JS/image reference in both entry HTML files resolves to an included file.
- The new Web and Android production UI files are byte-identical.
- The production stylesheet has balanced CSS blocks.
- Critical feature inventory is present in both Web and Android application logic.
- The original Web and Android `app.js` files are byte-identical to the 6.6.0.1.1 baseline, confirming that Phase 1 did not alter business logic.
- Baseline file count: 120. Phase 1 file count: 126. No baseline file was removed.

Android assembly and real-device visual/provider testing are intentionally not marked complete in this phase. The supplied archive has no Gradle wrapper, and a signed production build still requires the later release-candidate verification phase.

## Phase roadmap

1. **Phase 1 — UI foundation:** visual system, task-based screen organisation, stable navigation.
2. **Phase 2 — Core workflows:** simplify sale, stock, billing and business forms; improve validation and empty/error/success states without removing fields.
3. **Phase 3 — Finance and data integrity:** regression-test every yearly/monthly/daily profit path, ledgers, reports, migration and backup/restore.
4. **Phase 4 — Android integrations:** OTP/Google login, Razorpay/UPI intents, Drive, camera/file picker, printer and native back/keyboard behavior.
5. **Phase 5 — Release candidate:** performance, accessibility, device matrix, signed AAB/APK configuration and final regression checklist.

Each phase must start from the immediately previous phase ZIP. A phase is not a signed production release until Phase 5 device/provider verification passes.
