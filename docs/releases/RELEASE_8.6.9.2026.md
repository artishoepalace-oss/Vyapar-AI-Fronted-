# Vyapar AI 8.6.9.2026

Startup stability release based on the 8.6.9 startup-fixed source.

## Highlights
- Removes startup/login flicker during saved-session restoration.
- Keeps one consistent startup logo guard until the destination screen is ready.
- Prevents the login form from flashing before Home when a valid session exists.
- Preserves Password and Email OTP auth tabs and existing account flows.
- Keeps the newer Android launcher/build resource fix intact.
- Rebuilds Android frontend bundles from the corrected source.

## Validation
- Startup regression suite passed.
- Login/auth UI tests passed.
- Finance/data-integrity tests passed.
- Android bundled JavaScript syntax validation passed.

Version: **8.6.9.2026**  
Version code: **8692026**
