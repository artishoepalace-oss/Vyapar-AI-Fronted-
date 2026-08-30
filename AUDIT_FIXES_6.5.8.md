# Vyapar AI 6.5.8 — Audit Stability Release

This release applies the low-risk fixes from the 2:59 app walkthrough audit without removing existing features.

## Fixed
- Financial clarity: manual/historical yearly profit stays separate from transaction-derived margin.
- Insights: transaction revenue/profit/expenses are labelled separately from declared yearly profit.
- Navigation: disabled the heavy full-screen tab loader that caused blank/flicker transitions.
- Android launch: dark native window/WebView background removes the white startup flash.
- Update check: stores update metadata without re-rendering the whole app or jumping the page.
- Settings update copy: removed production/Render implementation wording from the user UI.
- Sales: regular save actions use the primary action style; monthly records get a safe year filter.
- Bulk actions: ambiguous Clear labels are presented as Deselect All.
- Stock: improved first-use empty state and Add Stock Item CTA.
- Footer: supplied Vyapar AI grey PNG mark is used in the legal footer/More sheet.
- Readability: clearer field states, larger touch targets, hidden ornamental Android scrollbars.

## Preserved
No existing business, sales, stock, calculator, AI upload, plans, settings, backup, security, payment, reporting, or accounting module was removed.
