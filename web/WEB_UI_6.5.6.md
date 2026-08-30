# Vyapar AI Web 6.5.6 — Single legal footer

- Removed the legacy `productionLegalFooter` renderer that duplicated the legal links.
- Kept one canonical footer only: `#appLegalFooter`.
- Footer order is now: © 2026 Vyapar AI. All Rights Reserved. · Terms · Privacy · Refund · Delete Account.
- `From: Gupta Legacy` remains centered beneath the legal links.
- Added a CSS safety rule so the obsolete production footer cannot reappear from stale web code.
- Web-only patch; Android assets were not changed.
