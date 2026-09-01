# Vyapar AI — Single Visual Startup Loader (Android 7–16)

This patch keeps one continuous branded startup experience across supported Android versions.

## Startup flow

- Android 7–11: the native starting window uses the same dark-blue gradient and centered Vyapar AI logo as the WebView loader.
- Android 12–16+: the mandatory system splash uses the same brand background/logo and exits immediately into the WebView loader.
- WebView: its initial compositor background is dark blue, preventing a white or black frame before HTML paints.
- HTML/CSS: `#appLoader` uses the same launch gradient and remains the only animated loading state.

## Files changed

- `android-app/app/src/main/res/drawable/launch_screen.xml`
- `android-app/app/src/main/res/values/styles.xml`
- `android-app/app/src/main/res/values-v31/styles.xml`
- `android-app/app/src/main/java/com/vyaparai/app/MainActivity.java`
- `android-app/app/src/main/assets/index.html`
- `android-app/app/src/main/assets/app.css`
- `android-app/app/src/main/assets/native-shell-hotfix-6712026.css`

No business logic, navigation, authentication, payments, data model, or feature modules were changed.
