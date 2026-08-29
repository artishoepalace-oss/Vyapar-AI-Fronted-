# Google Drive Backup Setup

Vyapar AI now uses Google's Android authorization flow for optional Google Drive backup. The app requests the narrow `drive.file` scope and stores one backup file named `Vyapar AI Backup.json` in the user's Drive.

## Required Google Cloud setup

1. Open Google Cloud Console and create/select the project used by Vyapar AI.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen with the real Vyapar AI app name, logo, privacy policy and developer information.
4. Add the Android OAuth client for package:
   `com.vyaparai.app`
5. Add the SHA-1 certificate fingerprint for the certificate used to build the Android APK/AAB. For Google Play distribution, configure the certificate/fingerprint that matches the Play signing setup as appropriate.
6. Keep the `drive.file` scope declared for the OAuth consent configuration.

The app does not ask for broad access to all Drive files. Users explicitly connect Google Drive from Settings, then the app can update the backup file it created.

## Automatic backup behavior

- No Google Drive permission is requested before the user chooses to connect Drive.
- After connection, the app can save a backup when the app is opened/resumed.
- A native throttle prevents repeated automatic uploads more often than once every 12 hours.
- Manual `Back Up to Google Drive Now` is available in Settings.
- Device backup remains available separately.
