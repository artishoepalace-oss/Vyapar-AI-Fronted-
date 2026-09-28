# Vyapar AI 20.10.2004.00064.2026

## Ocean-depth product-system refinement

This release refines the existing Vyapar AI architecture instead of creating replacement screens, duplicate popup systems, a second accounting engine or parallel invoice flows.

### v00062 navigation restored exactly
- Restore the v20.10.2004.00062 bottom-navigation source as the canonical Home / Business / Sales / Stock / More chrome.
- Restore its 367×50 shell, five equal measured destinations, 68×42 moving capsule, burgundy active icon/label, graphite-silver capsule material, inset rim treatment and restrained external reflection.
- Restore the matching v00062 browser QA contract, including edge clearance, optical centering, rapid-tap stability, Back behavior, responsive widths and reduced-motion handling.
- Prevent the later master-system layer from restyling the navbar or top bar.

### One semantic Vyapar AI design vocabulary
- Add shared semantic surface, text, separator, interaction, status, spacing, radius, typography, motion and elevation tokens.
- Keep content surfaces solid and legible while letting navigation remain its own floating material layer.
- Add role contracts for Metric, Action, Record, Alert, Document and Settings cards without creating duplicate page components.
- Keep minimum 44px interactive targets, safe wrapping and bounded table/form overflow.

### Unified physics and interaction behavior
- Keep native WebView scrolling authoritative.
- Expose MICRO, SNAPPY, FLUID, HEAVY and DOCUMENT motion profiles from the existing motion owner.
- Add component physics metadata for navigation, buttons, cards, menus, sheets, pages and documents.
- Restrict card compression to genuinely interactive cards; static financial cards no longer pretend to be buttons.
- Preserve reduced-motion and low-end Android fallbacks.

### Business-engine hardening
- Centralize deterministic tax calculation behind one `VyaparTaxEngine` service used by the authoritative Business Platform transaction path.
- Preserve the legacy exclusive-price GST result for existing records while adding opt-in tax-inclusive line support without double-taxing the selling price.
- Preserve CGST/SGST versus IGST split by business state / state of supply and keep CESS handling deterministic.
- Preserve HSN/SAC, description and tax-inclusive metadata on transaction line items.
- Respect Composition Scheme by preventing GST collection in the shared calculation path when that setting is enabled.
- Add derived document states: DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED, REFUNDED and PARTIALLY_REFUNDED.
- Keep status derivation based on saved business facts rather than decorative labels.
- Add optional transaction mutation/idempotency keys so a retried authoritative business event can return its existing transaction instead of creating a duplicate.

### Existing business workflows preserved
- Keep the existing linked Estimate / Proforma / Sale Order / Purchase Order / Delivery Challan conversion workflow; no InvoiceV2 or parallel document system is introduced.
- Keep sale/purchase returns linked to their original transaction where possible, including over-return protection.
- Preserve ledger posting, stock movements, receivable/payable settlement, reversal/cancellation and accounting rebuild behavior.
- Preserve POS, customers, suppliers, products, expenses, Udhaar, reports, GST settings, invoice PDF/thermal generation, Bluetooth/ESC-POS, WhatsApp/share, backup/restore, authentication, Google login, OTP, subscriptions and Android native bridges.

### Regression gates
- Validate v00062 navbar geometry and optics separately from the shared content design layer.
- Validate semantic motion contains no production `transition: all` rule.
- Validate inclusive GST extraction, same-state GST split, document state derivation and transaction idempotency against the real accounting runtime.
- Existing ledger balance, return limits, non-posting documents, rebuild idempotency, popup, workspace, responsive and Android build/signature gates remain enabled.

## Release identity
- versionName: `20.10.2004.00064.2026`
- versionCode: `2010200464`
- minSdk: `26`
- package/signing identity: unchanged
