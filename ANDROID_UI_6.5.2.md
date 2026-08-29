# Vyapar AI 6.5.2 Android UI follow-up

- Rounded loading/splash logos for Android WebView startup.
- Centered and reduced the More-sheet “From: Gupta Legacy” signature.
- Bulk-selection checkbox columns stay hidden until the three-dot menu is activated.
- Three-dot labels are now “Select All” and “Clear Selected”; destructive bulk action remains available where supported.
- Sales and Monthly Profit rows keep Edit but remove the paired row Delete button. Bulk delete remains available from the three-dot selection flow.
- Change Password now uses the refresh-aware authenticated fetch path, avoiding stale-token password-update failures.
- Light/dark switching applies immediately without a full screen rerender and uses a smoother surface transition.
- Business header now reads “Business Workspace” without the old 6.2.1 suffix.
- Version bumped to 6.5.2 / 65200.
