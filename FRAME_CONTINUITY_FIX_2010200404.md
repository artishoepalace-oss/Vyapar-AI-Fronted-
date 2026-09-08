# Vyapar AI 20.10.2004.00004.2026 — Frame Continuity Fix

- Replaces hard page swaps with a retained outgoing + incoming compositor handoff.
- Preserves logical destination state while outgoing pixels finish the transition.
- Rapid taps settle the previous handoff before the next one begins.
- Uses Web Animations when available and double-requestAnimationFrame fallback on older Android WebViews.
- Keeps popup/sheet animation ownership single and interrupt-safe.
- Full regression target: 20/20.
