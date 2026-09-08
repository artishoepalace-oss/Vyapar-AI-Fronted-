# Play Store / Play Protect Security Notes

The Android project has been tightened for Play distribution:

- No `REQUEST_INSTALL_PACKAGES` permission.
- No APK self-install/update logic.
- No dynamic code loading.
- No cleartext network traffic.
- Legacy external-storage write permission is limited to Android 9 and below.
- Broad `READ_EXTERNAL_STORAGE` permission has been removed.
- Camera and notification access are requested only through runtime permission flows.
- Google Drive uses the narrow `drive.file` authorization scope.
- Release version is now 1.1.0 / versionCode 2.

A Play Protect warning cannot be guaranteed to disappear by changing source code alone. If a sideloaded/debug/unsigned APK is being flagged, distribute a properly signed release through Google Play and use Play Console's app-signing/integrity protections. If Google incorrectly classifies the app, use the official Play Protect appeal process.
