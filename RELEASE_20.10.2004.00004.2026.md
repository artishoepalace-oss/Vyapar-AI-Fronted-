# Vyapar AI 20.10.2004.00004.2026 — Frame Continuity Motion Fix

## Telegram-style navigation continuity
- Fixes the hard page swap visible in frame-by-frame comparison.
- Keeps the outgoing screen visually retained while the destination enters.
- Animates outgoing and incoming screens together using compositor-friendly transforms.
- Rapid tab taps settle/cancel the previous handoff before the next transition starts.
- Older Android WebViews use a double-requestAnimationFrame fallback so start/end poses cannot collapse into one paint.
- Existing dialog, sheet, toast, press feedback and reduced-motion behavior are preserved without double animation.

## Validation
- Full regression suite: 20/20 passed, 0 failed.
- Web and Android generated bundles synchronized.
- No feature, route, auth flow, finance logic or plan gate intentionally removed.

Version name: `20.10.2004.00004.2026`  
Version code: `2010200404`
