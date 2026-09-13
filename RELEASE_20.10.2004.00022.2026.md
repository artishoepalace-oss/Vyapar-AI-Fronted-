# Vyapar AI 20.10.2004.00022.2026

- Unified bottom-attached popups, including option choosers, with matching side margins, dark surfaces and upward motion. Navbar remains mounted underneath the overlay.
- Removed cross buttons from sheets that have a handle. Tap the handle, swipe it downward, tap outside, or use Android Back to dismiss. Confirmations retain their explicit actions.
- Reduced outlines on cards, small containers and controls while retaining focus and validation indicators.
- Left-aligned performance labels without changing amount alignment. Refined year-history rows, aligned their arrows, and hid unnecessary single-page pagination.
- Centered Home metric symbols. Removed the redundant All tools shortcut, Business introduction card and Settings introduction.
- Matched the Account password destination name to its actual controls.
- Simplified the update prompt. Full versions, release notes, download status and release link remain in Settings > App updates.

Existing sales, stock, accounting, records, authentication and installation logic remain in place. Install this signed update over the existing app; do not uninstall first.

Validation: frontend bundle parity and 60 automated checks; mobile-browser form save/edit/draft/navigation checks; chooser, nested popup, handle dismissal, history and update UI checks at 320, 360 and 412 px. Physical-device verification is still required for device-specific behaviour.
