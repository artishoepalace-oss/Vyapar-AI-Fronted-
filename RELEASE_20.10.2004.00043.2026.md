# Vyapar AI 20.10.2004.00043.2026

## Invoice, Sales & Stock UI
- Saved invoices: searchable bill list, details and grouped PDF, print, thermal, Bluetooth ESC/POS and share actions in the existing mobile sheet.
- Sales: live total and estimated item profit preview, input constraints and clearer form presentation.
- Stock: low-stock alerts only, search saved manual stock records, visible-row selection.
- Business: remove duplicate Sales, Stock, invoice and order shortcuts while retaining their original modules, permissions and all accounting data.
- Keep the v00042 middle-bar sliding behavior, black/graphite styling and five-item bottom navigation.

## Compatibility and verification
- Source code and data schemas remain unchanged for the accounting ledger, PDF generator, transaction posting and stock movement engines.
- Five focused UI regression tests plus the existing automated frontend suite and shared Android/web bundle check run during the main-branch APK build.

## Release
Android versionCode 2010200443; signed APK and source ZIP are created by the main-branch release workflow after verification, using the existing original app-signing key.
