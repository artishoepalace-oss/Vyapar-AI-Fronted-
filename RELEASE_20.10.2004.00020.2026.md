# Vyapar AI 20.10.2004.00020.2026

- Rework the Choose an option selector into the same compact bottom-sheet visual system used by More and business forms, with a subtle selected state instead of the large boxed row.
- Standardize app overlays and popups onto one dark surface, top radius, handle, compact header and close-button treatment.
- Keep the five-tab navbar visible and outside popup coverage; sheets finish above it instead of covering or disabling it.
- Reduce card, nested-container and field border contrast to an almost-borderless look and remove leftover popup/card shadows.
- Preserve existing select change handlers, save/edit actions, business logic and overlay motion.

Validation: automated bundle/runtime tests run in GitHub Actions. Real-device Android checks should confirm navbar clearance, keyboard resize and sheet scrolling.

Android version code: 2010200420. Update from 00019 through App Settings or install the signed APK over the existing app.
