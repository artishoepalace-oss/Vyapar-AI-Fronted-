# Vyapar AI 20.10.2004.00062.2026

- Fix the transaction popup heading/field-label lifecycle so headings are rebuilt after renderer refreshes instead of leaving unlabeled controls.
- Replace technical transaction option names such as SALE_RETURN and PAYMENT_IN with readable names while preserving the original transaction values and accounting behavior.
- Simplify transaction entry around one clear **Transaction details** section; keep tax, document link, currency, notes and advanced controls under a single **More details** disclosure.
- Use context-specific field names for Sale, Purchase, Returns and Payments, and remove redundant item/quantity/settled inputs from simple money-in/money-out forms.
- Replace the large four-metric explanation panel with a compact live amount view; item transactions show Total, Due and current stock context, while validation errors stay next to the relevant field.
- Add responsive QA that checks visible headings, friendly transaction names, type-specific labels, collapsed advanced controls, and automatic repair after a simulated renderer refresh.

Android version code: `2010200462`. Authentication, subscription entitlements, accounting records, stock posting rules, package identity, Android 8+ minimum support, and the original app signing identity are unchanged.
