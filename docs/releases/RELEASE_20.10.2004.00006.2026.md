# Vyapar AI 20.10.2004.00006.2026

Business categories previously appeared together because the category organiser did not discover groups nested inside the search wrapper. This release fixes that regression and gives invoice export a direct local PDF path.

- Compact Business tools in two columns on typical phones; Daily, Accounts, Documents and Activity show their own content. Search works across categories and clearing restores the selected category.
- Offline A4/A5 and 58/80 mm invoice PDFs with wrapped descriptions, repeated headers, page numbers, saved totals, correct discount schema handling and optional duplicate copies. The PDF engine loads only on export.
- A prominent Download PDF action opens the saved invoices view. Android saves into Downloads/Vyapar AI and confirms completion through a native callback. Older Android requests storage only when needed; repeated exports do not overwrite files.
- A short first-use permission introduction appears after sign-in. Continue requests notifications; Not now dismisses it. Camera, printer and legacy storage access are requested when used.
- Logo artwork moves upward within a fixed white frame, using approximately 2:3 top/bottom space around the shop body. The native launch cover, HTML launch view, header and sign-in use the same optical direction.
- One source tree generates both platform bundles; the original cleanup of duplicate files is retained. Native download IO runs on the existing background executor.

Android version code: **2010200406**. Backend version unchanged.

Validation: 35 automated tests pass; bundled JavaScript parses, runtime references resolve, and Android/web generated files match. A4, A5 and 58 mm sample PDFs were generated using the shipped exporter, rendered with Poppler, and visually reviewed. Native permission and save callbacks were tested using bridge doubles; these are not Android device tests.

APK compilation, physical Android layout, keyboard interaction and frame smoothness remain unverified in this environment. See `docs/COMPACT-PDF-VALIDATION.md` for the remaining device checks.
