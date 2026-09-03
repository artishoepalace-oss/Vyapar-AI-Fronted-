const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const webAuth = read('web', 'assets', 'scripts', 'auth.js');
const androidAuth = read('frontend-source', 'android', 'scripts', 'auth.js');
const webPlatformJs = read('web', 'assets', 'scripts', 'platform-android.js');
const androidPlatformJs = read('frontend-source', 'android', 'scripts', 'platform-android.js');
const webPlatformCss = read('web', 'assets', 'styles', 'platform-android.css');
const androidPlatformCss = read('frontend-source', 'android', 'styles', 'platform-android.css');
const webIndex = read('web', 'index.html');
const androidIndex = read('android-app', 'app', 'src', 'main', 'assets', 'index.html');

assert.equal(webAuth, androidAuth, 'Web and Android auth implementations must stay synchronized');
assert.equal(webPlatformJs, androidPlatformJs, 'Web and Android auth tab helpers must stay synchronized');
assert.equal(webPlatformCss, androidPlatformCss, 'Web and Android platform auth styles must stay synchronized');

assert.doesNotMatch(webAuth, /class=["']auth-help["']/, 'Login markup must not render a version label');
assert.doesNotMatch(webPlatformJs, /auth-help|Vyapar AI\s+\d+\.\d+/, 'Android helper must not restore a login version label');
assert.match(webAuth, /id="login-otp-code"/, 'OTP input must remain available');
assert.match(webAuth, /--auth-viewport-height/, 'Auth layout must track the visible viewport');
assert.match(webAuth, /auth-keyboard-open/, 'Auth layout must handle the software keyboard');
assert.match(webPlatformCss, /overflow-y:auto!important/, 'Android auth must remain vertically scrollable');
assert.doesNotMatch(webPlatformCss, /\bzoom\s*:/, 'Android auth must not use CSS zoom because it breaks WebView input geometry');

assert.match(webIndex, /assets\/scripts\/vyapar-app\.js\?v=20260903-combined1/, 'Web must load the combined script');
assert.match(webIndex, /assets\/styles\/vyapar-core\.css\?v=20260903-combined1/, 'Web must load the combined core styles');
assert.match(androidIndex, /assets\/scripts\/vyapar-app\.js\?v=20260903-optimized2/, 'Android must load the combined script');
assert.match(androidIndex, /assets\/styles\/vyapar-core\.css\?v=20260903-optimized2/, 'Android must load the combined core styles');
assert.match(androidIndex, /assets\/styles\/vyapar-ui\.css\?v=20260903-optimized2/, 'Android must load the combined UI styles');

console.log('login-auth-ui: all checks passed');
