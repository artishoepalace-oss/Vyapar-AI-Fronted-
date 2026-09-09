# Prior UI and source cleanup — 8 September 2026

This is the earlier 00004 cleanup record. See [the current 00006 fixes and verification](COMPACT-PDF-VALIDATION.md).

Based only on the supplied `Vyapar-AI-Fronted--main (4).zip`.
App version remains `20.10.2004.00004.2026`, Android code `2010200404`.

## User-facing changes

- Business tools have a labeled local search. Matching ignores case and repeated spaces, supports multiple words and category titles, and filters existing cards rather than rebuilding their content.
- Clear and Escape reset the search; an empty-result explanation and live result count help keyboard and screen-reader users. Original action handlers and plan checks are retained.
- Business headings and descriptions explain the task in short language; old implementation/version explanations removed from that flow.
- Flat tool surfaces, consistent rounded corners, restrained separation and readable secondary text. Narrow screens use one tool column and a two-column financial summary.
- Screen buttons, business actions, settings rows and most text/select inputs have a 44px minimum height. Focus outlines are visible.
- Cosmetic normalization avoids re-adding an existing danger class and rewriting unchanged plan/profile metadata.

## Code and files

- Canonical shared source stays under `frontend-source/android/`; generated bundles stay under each platform's runtime assets.
- The builder writes both web and Android outputs deterministically; `--check` fails on stale bundles without writing.
- Added build/verify/preview commands, source map, and dependency-free runtime reference/syntax validation.
- Removed 141 unused standalone and legacy mirror copies: 3,653,445 uncompressed bytes. Every removed CSS/JS filename still has its canonical source module.
- Moved 60 old root notes, the original README and the obsolete 6.7.1 import workflow into documentation. The old workflow required missing `.release` inputs; its content is retained for reference.
- Updated active Android workflow paths and syntax checks for the actual shipped bundles. Cache query suffix refreshed; Android version/signing unchanged.
- Legal URLs, images, app features, native integrations, accounting engines, state keys and entitlement checks retained.

## Verification

- Input baseline: 20 tests passed, zero failed.
- Updated regression suite: 23 tests passed, zero failed, including three behavioral search tests.
- Both platforms' generated bundle bytes match and reproduce from source.
- Both shipped JavaScript bundles pass Node syntax checks.
- 67 local HTML/CSS references per platform resolve to existing files.
- Existing suites cover startup/session rejection and restoration, auth flows, rapid navigation, scroll retention, popup cancellation, reduced motion, settings, and finance integrity.

## Limits

No APK build or physical-device test was run. The available cloud browser could not open the local app (`ERR_BLOCKED_BY_CLIENT`), and downloading local Chromium timed out. Pixel layout, mobile keyboard behavior and frame smoothness therefore still need device/browser verification. Live OTP/Google, payments, Drive and backend services were not exercised.

The financial core remains a large historical module. This cleanup gives it one source of truth and preserves its behavior; it is not a rewrite of every legacy layer.
