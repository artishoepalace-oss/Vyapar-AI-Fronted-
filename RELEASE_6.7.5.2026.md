# Vyapar AI v6.7.5.2026

- Fixed the Android Settings duplication shown in the 2026-09-01 screen recording.
- The modern App Settings directory is now the only content visible on the Settings home screen.
- Legacy `.settings-stack` cards are hard-hidden even when older Android CSS forces `display:block!important`.
- Opening Account, Business profile, Business & security, Appearance, Backup & data, Legal & support, or App updates shows only that selected subpage.
- Prevented Settings refreshes from briefly exposing the old stacked layout.
- Preserved the single Settings footer/logo at the bottom of the directory and all existing settings functionality.
