# Vyapar AI Web 6.5.5 — Photo-driven repair

Web-only patch based on the supplied desktop screenshots.

## Fixed
- Giant black lock shapes in Home quick actions and the top navigation are now small outlined lock SVGs with explicit dimensions and no fill.
- Legal footer is appended and visually ordered after the main content instead of appearing above Sales / Settings.
- Privacy / Terms / Refund / Delete Account links have real spacing and wrapping.
- `From: Gupta Legacy` is centered, smaller, italic/bold, and remains the final footer line; the More-sheet signature is also centered.
- Light mode now forces Home overview, quick actions, stats, Settings sections, Business Admin rows, app-lock surfaces, backup/data-safety surfaces and the account card to light surfaces with dark readable text.
- Desktop navigation no longer lets lock icons consume label width; Business/Stock labels remain aligned.
- Pro account identity stays metallic silver with shine + verified tick.
- Business account identity stays metallic gold with shine + verified tick.
- Free accounts keep the normal avatar and no verified tick, matching the subscription requirement.
- Paid identity styling is reinforced in both light and dark themes.
- Web-only DOM stabilizer keeps the legal footer last after re-renders and normalizes generated lock SVG dimensions.

## Scope
Only the web bundle was changed. Android native/WebView files were not modified.
