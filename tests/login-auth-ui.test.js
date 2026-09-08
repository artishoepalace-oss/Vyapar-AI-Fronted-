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

assert.match(webAuth, /class="auth-brand-row"/, 'Login must use the chat-approved left-aligned brand row');
assert.match(webAuth, />Password<\/button>/, 'Login must expose the Password tab');
assert.match(webAuth, />Email OTP<\/button>/, 'Login must expose the Email OTP tab');
assert.match(webAuth, /id="form-signup-otp"/, 'Create Account must include an Email OTP flow');
assert.match(webAuth, /id="signup-password-confirm"/, 'Create Account password flow must confirm the password');
assert.match(webAuth, /id="auth-back-login"/, 'Create Account must provide a back-to-sign-in control');
assert.match(webAuth, /switchLoginMode\("otp"\)/, 'Email OTP must be the default login method');

const authUi = read('frontend-source', 'android', 'styles', 'auth-chat-867.css');
assert.match(authUi, /--auth-bg:#090909!important/, 'Auth background must be black');
assert.match(authUi, /background:#343434!important/, 'Selected tabs must use graphite grey');
assert.match(authUi, /background:#ececec!important/, 'Primary auth action must use the light monochrome fill');
assert.doesNotMatch(authUi, /\b(?:blue|teal|navy)\b/i, 'Auth-specific UI must not introduce blue/teal/navy styling');

assert.match(webIndex, /assets\/scripts\/vyapar-app\.js\?v=[^"\s]+/, 'Web must load the combined script');
assert.match(webIndex, /assets\/styles\/vyapar-core\.css\?v=[^"\s]+/, 'Web must load the combined core styles');
assert.match(androidIndex, /assets\/scripts\/vyapar-app\.js\?v=[^"\s]+/, 'Android must load the combined script');
assert.match(androidIndex, /assets\/styles\/vyapar-core\.css\?v=[^"\s]+/, 'Android must load the combined core styles');
assert.match(androidIndex, /assets\/styles\/vyapar-ui\.css\?v=[^"\s]+/, 'Android must load the combined UI styles');

console.log('login-auth-ui: all checks passed');
