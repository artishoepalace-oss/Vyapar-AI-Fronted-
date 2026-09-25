# Vyapar AI 20.10.2004.00051.2026

- Build on the released 00050 app and integrate the hand-sketched **More** page directly into the existing Android/WebView navigation.
- Keep the five existing destinations unchanged: Insights, AI Upload, Calculator, Plans and App Settings, including the current plan locks and routing behavior.
- Rework More into one compact black/grey/white panel aligned to the bottom navigation, with a small handle, clear title, separated list rows, circular neutral icons and right chevrons.
- Open the list upward from the More button with lightweight bottom-to-top staggered row motion; existing motion code remains responsible for panel open/close, Back and interrupted navigation.
- Keep the navbar mounted and visible below the panel with a clear gap; the full-screen transparent overlay still blocks accidental taps behind the popup.
- Preserve accounting, authentication, subscriptions, backup, stored business data, three-dot selection behavior and all 00050 popup/tool organization.

Android versionCode: `2010200451`. Application ID and original signing identity are unchanged.

Validation is performed by the main Android GitHub Actions workflow before the APK/ZIP release is published.
