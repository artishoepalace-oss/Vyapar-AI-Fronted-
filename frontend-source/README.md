# Frontend source

`android/scripts/` and `android/styles/` are the editable sources for **both web and Android**.

The exact order is declared in `tools/build-frontend-bundles.mjs`. Run `npm run build` at the repository root to regenerate both platforms; `npm run verify` detects stale bundles, broken references and behavior regressions.

Use `scripts/business-tool-search.js` for Business search behavior, `styles/surface-hierarchy-20102004.css` for the final visual hierarchy, and the existing feature module for its domain logic. Keep dependencies in their current order. Versioned filenames often contain active fixes and are not disposable.

Runtime directories contain generated bundles plus HTML, legal pages and images. Historical standalone mirrors have been removed. The root README contains the source map.

`android/scripts/invoice-pdf.js` owns offline PDF generation and save coordination. `vendor/pdf-lib.min.js` is PDF-Lib 1.17.1 (MIT); the builder copies it and its license to each runtime. Update both vendor files together and run the verification suite.
