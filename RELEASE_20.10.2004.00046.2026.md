# Vyapar AI 20.10.2004.00046.2026

## Three-dot record menu redesign
- Replace the plain text ellipsis with a circular vertical-three-dot SVG trigger.
- Match the supplied graphite menu: 245px popup, 18px corners, 48px option rows, icon tiles, divider, burgundy expanded state and red destructive action.
- Keep existing Select All / Clear / Delete or Cancel logic and the app's current confirmations/data protection. Labels are presented as Select all, Deselect all and the existing destructive action.
- Opening the menu starts an invisible 10-second idle close. Touching a menu option disables that idle close for the current session, so selection actions keep the popup open until the user closes it, taps outside or presses Escape.
- Preserve viewport-aware above/below positioning so record menus stay clear of the bottom navigation.

## QA
- Shared Android/web bundle tests cover SVG and ARIA markup, option icons/divider, timer behavior and final style order.
- Responsive browser QA opens the actual Stock record menu and verifies circular geometry, menu semantics, persistent Select all/Deselect all interaction and manual closing.
- Android versionCode 2010200446. Signed APK and source ZIP are published by the main workflow after browser, frontend and signature checks succeed.
