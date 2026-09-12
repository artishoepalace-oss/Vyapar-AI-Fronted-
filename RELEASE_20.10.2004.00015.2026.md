# Vyapar AI 20.10.2004.00015.2026

- GitHub latest-release update popup and App Settings update page.
- Native APK download progress, verification, Android install permission and installer confirmation.
- Retry after network errors or cancelled installation; one shared update controller.
- Corrected top-bar logo, title and profile alignment; consistent five-item navbar shapes and icon baselines.
- Vertically centered, left-aligned Help & legal action labels.
- Signed release build using the existing ANDROID_* repository secrets.

Validation: 60/60 regression checks passed locally; Home, Help & legal, update Settings and update popup verified at 320, 360 and 412px in Chromium. Web and Android assets are synchronized.

Android versionCode: 2010200415. Package: com.anuj.guptalegacy.vyaparai.

Install the APK over the existing app using Android's confirmation screen. Compatible updates require the same signing certificate as the installed app. Do not uninstall to resolve a signing mismatch; uninstalling can remove local records.

Physical-device installation has not been verified in this session. Browser QA screenshots under docs/qa-updates use fixture data and a mocked future release.
