# Vyapar AI 20.10.2004.00013.2026

- Keep the proven v20.10.2004.00008.2026 startup/auth bridge unchanged.
- Move GitHub in-app update methods to a separate `VyaparUpdater` JavaScript bridge instead of replacing `AndroidApp`.
- Delay automatic updater initialization until the startup session is ready.
- Preserve the existing update popup, signed APK verification, download/install flow and Settings update controls.
- Keep business data, Render authentication/backend behavior, navigation, backup, sales and stock logic unchanged.
