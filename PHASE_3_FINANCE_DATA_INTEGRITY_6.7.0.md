# Vyapar AI 6.7.0-phase.3

Production-readiness Phase 3 hardens finance, ledger, import and backup behavior on the exact Phase 2 baseline. It preserves every existing feature, route, record and plan gate while removing verified double-counting and stale-state failure modes.

## Baseline

- Input version: `6.7.0-phase.2`
- Input archive SHA-256: `6c622e26309e4200dbe324ff8ce3af754892570f38d25193a8942387ea07193a`
- Phase version: `6.7.0-phase.3`
- Android versionCode: `67003`
- Backend version remains: `2.5.2`

The output from this phase is the required baseline for Phase 4.

## Finance policy retained and clarified

For each calendar day, only the highest-authority sales source is counted:

1. Posted accounting Sale / Sale Return transactions
2. Daily Quick Entry final total
3. Item-wise sale records

Manual monthly profit remains additive to the selected granular daily profit. Expenses remain separate, and net profit remains resolved profit minus expenses. No parallel or replacement finance engine was introduced.

## What changed

### One canonical application state

- Added a Web/Android state bridge so legacy code using lexical `state` and later modules using `window.state` always reference the same object.
- Backup restore, encrypted restore and import rollback assignments now stay synchronized with every platform module.
- Prevented stale pre-restore records from being merged back after a restore or rollback.

### Ledger rebuild correctness

- Separated an invoice or purchase's original received/paid amount from later linked payments during accounting rebuild.
- Linked Payment In and Payment Out transactions now post exactly once after repair/rebuild.
- Added safe inference for older records that predate `initialReceivedPaid`.
- Repeated accounting rebuilds are idempotent for Cash, Accounts Receivable, Accounts Payable, stock and balanced ledger totals.
- Sale returns still reverse revenue and COGS, restore stock and block over-return quantities.
- Estimates and other non-posting documents remain ledger- and stock-neutral.

### Daily, monthly and yearly totals

- Saving Daily Quick Entry for an existing date updates the latest row instead of adding another final total.
- Historical duplicate daily rows are retained; the latest row is authoritative in both fallback and final finance resolution.
- Saving or importing monthly manual profit updates the latest row for that month.
- Historical duplicate monthly rows are retained; only the latest value is added to resolved profit.
- The current-day profit card follows the same latest-final-total rule.

### Import and date integrity

- Added real calendar validation, including leap-year handling, to sale entry, daily entry, imported sales and finance aggregation.
- Invalid dates such as `2026-02-29` or month 13 are rejected or ignored instead of entering reports.
- Quoted CSV fields, including product names containing commas, remain supported.
- A named stock item with quantity zero remains valid and can still trigger out-of-stock workflows.
- Transactional sale/stock imports remain append operations by design; manual monthly profit remains an update operation.

### Backup and account safety

- Encrypted restore now enforces the same 10 MB input cap as normal restore.
- Encrypted envelopes are validated for version, salt, IV, ciphertext bytes and bounded payload size before decryption.
- Both normal and encrypted restore preserve the current authenticated subscription and plan.
- Advanced arrays and unknown forward-compatible fields continue to survive state normalization.

## Preserved invariants

- No feature, route, field, action, record table, navigation item or subscription gate was removed.
- Navigation remains `Home`, `Business`, `Sales`, `Stock`, `More`.
- No storage key or destructive data migration was introduced.
- Existing encryption format remains version 1 with PBKDF2-SHA256 and AES-GCM.
- Authentication, Razorpay, account deletion, cloud/provider hooks and backend code are unchanged.
- Phase 1 and Phase 2 UI layers remain included in their existing load order.

## Validation completed

Run the permanent suite with:

```bash
node tests/phase3-integrity.test.js
```

The suite executes the real Web and Android source and covers:

- canonical state assignments and restore synchronization;
- normal and encrypted backup restore with account/plan protection;
- envelope rejection for malformed encrypted backups;
- quoted CSV, zero-stock and invalid-calendar import cases;
- latest-row Daily Quick Entry and monthly manual profit behavior;
- accounting-over-daily-over-item precedence;
- linked customer and supplier payments;
- Sale Return, COGS reversal, stock restoration and over-return blocking;
- non-posting document neutrality;
- repeated accounting rebuild idempotency and debit/credit balance;
- Web/Android finance and workflow asset parity.

All 9 Phase 3 regression groups pass for both targets. All JavaScript syntax, JSON parsing, local HTML references, release metadata and baseline no-removal checks are also required before packaging.

## Release status

This is a phase-complete source archive, not a signed production release. Android assembly, physical-device testing and live payment/auth/provider verification remain later release-gate work.

## Next phase

Phase 4 starts only from this Phase 3 ZIP and should focus on runtime reliability and performance: offline/error states, long-list behavior, accessibility regression, Android build checks and provider failure handling without changing the finance policy established here.
