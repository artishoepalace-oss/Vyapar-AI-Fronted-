# Vyapar AI 6.7.0-phase.2

Production-readiness Phase 2 makes high-frequency sale, stock, POS and accounting workflows clearer and safer. It is additive to Phase 1 and retains every existing feature, field, route, formula, storage key and plan gate.

## Baseline

- Input version: `6.7.0-phase.1`
- Input archive SHA-256: `0b96538bb5b5821f3626c5fb6124cea26c62f20151cf5e00137802048d745a67`
- Phase version: `6.7.0-phase.2`
- Android versionCode: `67002`
- Backend version remains: `2.5.2`

The output from this phase is the required baseline for Phase 3.

## What changed

### Sales and profit entry

- Added concise guidance and visible required-field markers to item sales, daily totals and manual monthly profit.
- Added inline field errors with focus and screen-reader announcements instead of relying only on generic alerts.
- Added live, unsaved previews for sale revenue, cost, profit and margin; daily totals; and manual monthly profit/loss.
- Kept the existing authoritative save functions and single-source finance resolution unchanged.

### Stock

- Added explicit item/quantity validation and a live status preview for available quantity, low-stock threshold and reorder state.
- Kept zero quantity valid so an out-of-stock record and alert can still be created.
- Preserved all inventory workspace tools, records, catalog, barcode, godown, transfer and report routes.

### Fast Billing / POS

- Added a three-step visual guide, persistent field labels and inline product/quantity/discount feedback.
- Added a pre-check requiring a customer for credit checkout, preventing the legacy POS path from beginning stock/invoice mutation before reporting the missing customer.
- Checkout now validates the saved cart rather than incorrectly revalidating the cleared product-search input.
- Success feedback appears only when the cart or invoice state actually changes.

### Business transactions and cash/bank

- Reorganised the transaction editor into clear basics and a collapsible advanced section.
- Retained tax, CESS, account, linked document, state, currency, exchange rate, notes, reverse charge, E-Way Bill, wholesale, secondary-unit and loyalty controls.
- Required markers adapt to the selected transaction type; returns and payments automatically expose linked-document details when relevant.
- Added live subtotal, discount, tax and balance previews without posting data.
- Added labelled cash/bank account fields and inline validation while leaving the balanced-ledger posting engine authoritative.

### Production feedback and accessibility

- Added accessible success/error announcements, clearer empty-table states and 44 px primary action targets.
- Added a short double-tap guard for save/checkout actions.
- Added reduced-motion and mobile single-column rules.
- Kept Web and Android Phase 2 assets byte-identical.

## Preserved invariants

- No edit to Web or Android `app.js` business logic.
- No finance formula, data schema, localStorage key or migration change.
- No route, tool, field, action, subscription gate or record table removed.
- Navigation remains exactly `Home`, `Business`, `Sales`, `Stock`, `More`.
- Business and Stock remain Business-plan gated; AI Upload and Insights remain Pro-or-higher.
- Authentication, Razorpay, backup/restore, account deletion and external provider logic are unchanged.
- Phase 1 remains included and is loaded before the Phase 2 override.

## New files

- `web/workflow-ui-670p2.css`
- `web/workflow-ui-670p2.js`
- `android-app/app/src/main/assets/workflow-ui-670p2.css`
- `android-app/app/src/main/assets/workflow-ui-670p2.js`
- `PHASE_2_CORE_WORKFLOWS_6.7.0.md`

## Validation completed

- All 31 JavaScript files passed syntax checks.
- All 5 JSON files parsed successfully.
- Every local CSS, JavaScript and image reference in both entry HTML files resolves to an included file.
- Phase 2 assets load after Phase 1 assets in Web and Android.
- Web and Android Phase 2 CSS/JavaScript files are byte-identical and their CSS blocks are balanced.
- Eight focused validation smoke cases passed, including valid/invalid sales, monthly loss, zero stock, transaction amount and credit POS customer checks.
- Twenty critical feature groups remain present in each target, including authentication, subscription, backup, products, parties, expenses, accounting and reports.
- Both Web and Android `app.js` files remain byte-identical to their Phase 1 versions.
- Phase 1 file count: 126. Phase 2 file count: 131. Removed baseline files: 0.

## Release status

This is a phase-complete source archive, not a signed production release. Android assembly, real-device checks and live provider verification remain scheduled for later phases.

## Next phase

Phase 3 starts only from this Phase 2 ZIP and focuses on finance/data-integrity regression: daily/monthly/yearly profit resolution, transaction ledger balance, reports, migrations, import and backup/restore round trips.
