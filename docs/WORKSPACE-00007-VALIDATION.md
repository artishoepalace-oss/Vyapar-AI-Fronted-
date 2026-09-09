# Workspace and data validation — 00007

## Scope

Built on the previously delivered 00006 source. The supplied screenshots show oversized/inconsistent tool grids, repeated yearly graphs, raw file controls and compact Telegram navigation as the requested reference. This package implements the requested UI and data-flow changes while keeping existing business modules and accounting engines.

## Verification

Run from the project root:

```sh
node tools/build-frontend-bundles.mjs
node tools/build-frontend-bundles.mjs --check
node tools/validate-runtime.mjs
node --test tests/*.test.js
```

**Final result: 51/51 automated tests passed.** Both generated bundles reproduce from source, JavaScript parses, 67 local references per platform resolve, and the native CI patch applies cleanly.

Automated checks include:

- Existing accounting precedence, reversals, stock/ledger rebuild idempotency, auth/session handling, rapid navigation, popup cancellation, reduced motion, Business search/category visibility and PDF totals/pagination/native callbacks.
- Migration and simulated reopen with **100,001 records**; all IDs retained and no full-record copy in localStorage.
- Transaction abort / quota and clone-error rejection; prior committed snapshot retained, failed migration retains the legacy copy, retry succeeds, and obsolete chunk tails are removed.
- Startup remains covered while data loads; inaccessible primary storage cannot be overwritten with empty defaults.
- Android-style FileReader without Blob.text, UTF-8 BOM and UTF-16 decoding, malformed/encrypted backup rejection and legacy password-backup restore.
- All-year profit aggregation compared against the existing authoritative engine for accounting overrides, latest daily/manual rows, returns, expenses and negative results.
- Bounded chart markup across 100 years, annual pagination, import preview without mutation, failed import rollback, duplicate-file confirmation and product-import rollback preserving unrelated data.
- Shared Android/web generated assets, local asset references, JavaScript syntax and the existing native CI patch application.

`tests/indexeddb-double.cjs` is an asynchronous transaction double with injected aborts. These tests verify application orchestration; they do not substitute for IndexedDB tests inside Android WebView. Test durations are host-only measurements, not device frame-rate claims.

## Storage behavior and limits

The primary database is `vyapar_ai_data_v2`, with manifests and 1,000-record chunks. The next snapshot, obsolete-tail cleanup and its manifest commit in one transaction. Two rotating slots retain the prior committed snapshot. The legacy full JSON copy is replaced by a small profile/settings shell only after a successful database commit. No user database is deleted by migration.

Ordinary saves are queued and failures show a retry/export banner. Restores and file imports wait for a successful commit before replacing the live state. Cloud startup and push decisions wait for local hydration. If an established database cannot be read, the app stays covered with a reopen action rather than treating the device as empty.

Device capacity and memory remain finite. Full state is still hydrated into memory, and each save snapshots all top-level arrays. Large files are limited to **64 MB** with an explicit error. This release removes the old silent 50,000-record cutoff; it does not promise unlimited storage, incremental server sync or protection against uninstall/OS storage clearing. External backups remain necessary.

## Remaining device verification

The available browser could not open the local app, and no Android SDK/emulator/device was available. This version has not been compiled or measured on an Android device. Pixel-perfect layout and smoothness are not claimed.

On the target Oppo/Android device:

1. Upgrade from 00006 with existing records; wait for startup and verify totals before/after app restart.
2. Check 320/360/412 px layouts, active nav icons, top-bar spacing, keyboard opening, More-sheet clearance and fast repeated navigation.
3. Open each Business category and Sales/Stock tools; verify actions and idle-panel visibility.
4. Search Settings, clear/Escape, and open a result. Confirm the light-mode option is absent.
5. Switch profit years and views, compare negative months, use history paging, edit goals and export CSV.
6. Review/import JSON and CSV, repeat/cancel a file, scan a label, and check photo permission/provider behavior.
7. Restore plain and password backups from Downloads and Drive providers; reject a wrong password or unrelated JSON without data changes. Test actual low-space behavior with a disposable test dataset.
8. Generate/download invoice PDFs and backups on Android 8/9 and Android 10+; verify saved files in Downloads/Vyapar AI, permissions, long invoices and duplicate filenames.

Live OTP/Google sign-in, Razorpay, AI scanning and Drive services were not called for this change. Existing integration code is retained.

API references used for the implementation: [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction) and [FileReader text reading](https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsText).
