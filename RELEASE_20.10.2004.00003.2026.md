# Vyapar AI 20.10.2004.00003.2026 — Butter Motion 20/20

## Motion and responsiveness
- Unified Telegram-inspired animation ownership for page, dialog, sheet, toast, navbar and press feedback.
- Removed fast-close popup open/close double-animation race.
- Removed legacy high-specificity keyframe conflicts that could restart screen or sheet motion.
- Transform-only page transitions reduce flicker and visual jitter.
- Rapid navigation cancels obsolete motion before starting the latest transition.
- Web Animations path is used where available with requestAnimationFrame fallback for older Android WebViews.
- Runtime CSS reduced to two bundled stylesheets to reduce first-paint switching and duplicate style authority.

## Timing
- Page transition: 205 ms; Lite/legacy class about 148 ms.
- Dialog open: 185 ms.
- Sheet open: 220 ms.
- Dialog close: 120 ms.
- Sheet close: 145 ms.
- Press feedback: 78 ms.

## Validation
- Full regression suite: 20/20 passed, 0 failed.
- Web and Android combined bundles remain synchronized.
- No feature, route, auth flow, finance logic or plan gate intentionally removed.

Version name: `20.10.2004.00003.2026`  
Version code: `2010200403`
