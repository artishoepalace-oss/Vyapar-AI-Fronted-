# Vyapar AI 20.10.2004.00012.2026

- Restore the proven Vyapar AI 20.10.2004.00008.2026 startup and login runtime behavior.
- Remove the later startup watchdog, fail-safe overlay and whole-bundle legacy rewrite that were added while debugging the loader.
- Keep the secure GitHub in-app updater, update popup, signed APK verification, download/install flow and Settings update controls.
- Keep Render authentication/backend behavior unchanged.
- In-app update checks remain separate from the login/startup owner and must not gate the login screen.
- Preserve existing business, sales, stock, backup, navigation, UI and local-data behavior from the proven runtime.
