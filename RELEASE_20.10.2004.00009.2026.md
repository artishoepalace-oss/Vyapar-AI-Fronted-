# Vyapar AI 20.10.2004.00009.2026

- Add secure GitHub-based in-app updates with an approved update manifest.
- Add automatic and manual update checks in Settings.
- Add native APK download progress and Android installer handoff.
- Verify SHA-256, package identity, versionCode and signing certificate before installation.
- Add Android 8+ unknown-app install permission recovery and private FileProvider delivery.
- Add optional mandatory updates and minimum-supported-version enforcement.
- Add permanent signing support for future in-place updates.
- Fix the startup/storage path that could leave the app permanently covered by the Vyapar AI loading screen.
- Add a 12-second storage startup watchdog and a visible safe recovery state without overwriting saved business data.
- Release the web startup guard when IndexedDB/storage initialization fails instead of leaving a permanent splash.
- Preserve existing business, login, backup and navigation functionality.
