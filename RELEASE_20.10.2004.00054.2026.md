# Vyapar AI 20.10.2004.00054.2026

- Keep the universal black/grey/white/burgundy palette across app pages, dialogs, forms and bottom sheets.
- Keep More as one organized sheet with one visible dismiss handle; no duplicate More surface or duplicate drag line.
- Replace the high-cost repeated screen-ID palette selectors with equivalent class-scoped selectors so the 412px Chromium/WebView transition path does not stall.
- Add paint containment to incoming page layers during motion, then restore normal styles after the transition.
- Preserve existing navigation, plan gates, accounting, stock, sales, reports, invoice and settings behavior.

Validation target: automated Node checks, Chromium navigation at 320/360/412px, workspace popup checks, signed Android release build.
