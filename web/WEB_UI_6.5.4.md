# Vyapar AI Web 6.5.4

Web-only paid account identity fix.

- Pro account avatar renders in metallic silver with a moving shine.
- Business account avatar renders in metallic gold with a moving shine.
- A verified tick is rendered beside the account name only for an authenticated Pro or Business entitlement.
- Free accounts keep the normal blue avatar and do not show a verified tick.
- Account-card rendering now applies the paid identity directly instead of depending only on a post-render decorator.
- The decorator now trusts the account card's current runtime plan first, preventing it from removing a valid tick after a re-render.
- Paid-plan normalization accepts case differences and avoids showing paid identity for expired/failed/inactive subscriptions; cancelled subscriptions remain paid until their current end date when available.
- Cache-busting was updated for the changed web files.

Android project/assets were not modified.
