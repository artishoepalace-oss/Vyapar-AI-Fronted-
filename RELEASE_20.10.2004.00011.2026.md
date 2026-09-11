# Vyapar AI 20.10.2004.00011.2026

- Fix the second startup deadlock confirmed by the 39-second Android 8.1 launch recording.
- Run a startup fail-safe before every other bundled app module so a later runtime error cannot leave the opaque loader forever.
- Add a 9-second JavaScript startup deadline with a safe recovery screen instead of an infinite logo screen.
- Add a 10-second native Android hard deadline that removes both native and HTML startup covers even if the normal coordinator stalls.
- Remove the dependency on WebView VisualStateCallback for dismissing the native startup cover.
- Downlevel the packaged Android JavaScript to ES5 for older Android System WebView compatibility.
- Keep saved business data protected; startup recovery does not clear or overwrite local records.
- Preserve login, business, sales, stock, backup, navigation and in-app update functionality.
