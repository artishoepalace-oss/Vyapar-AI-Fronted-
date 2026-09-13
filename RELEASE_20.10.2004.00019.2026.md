# Vyapar AI 20.10.2004.00019.2026

- Form, Shop Journey and More popups extend to the bottom of the app and overlay the navbar. The navbar remains mounted in its original position; it is not hidden or removed.
- Remove the extra navbar gap and use rounded top corners with a bottom edge attached to the viewport.
- Keep one compact form header. Suppress the duplicate legacy title, Business Platform badge and Platform Home button even when the module wraps or replaces its header.
- Use the shorter Orders & Documents title and a concise Shop Journey introduction.
- Preserve the destination of Sales and Stock tools when accounting setup saves and refreshes the pages during opening. Empty workspace placeholders are not opened as forms.
- Retain upward entry animation, Back/Close, live drafts and the original save/edit functions.

Validation: 60 automated tests plus mobile browser checks for layout, popup coverage, duplicate headers, form routing, saves and edits. Real-device keyboard and animation behavior should be checked after updating.

Android version code: 2010200419. Update from 00018 through App Settings or install the signed APK over the existing app.
