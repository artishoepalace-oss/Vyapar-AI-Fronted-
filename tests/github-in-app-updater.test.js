'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(file, 'utf8');
const manifest = read(path.join(root, 'android-app/app/src/main/AndroidManifest.xml'));
const gradle = read(path.join(root, 'android-app/app/build.gradle'));
const mainActivity = read(path.join(root, 'android-app/app/src/main/java/com/vyaparai/app/MainActivity.java'));
const finalActivity = read(path.join(root, 'android-app/app/src/main/java/com/vyaparai/app/FinalMainActivity.java'));
const nativeActivity = `${mainActivity}\n${finalActivity}`;
const updater = read(path.join(root, 'android-app/app/src/main/java/com/vyaparai/app/UpdateManager.java'));
const updaterJs = read(path.join(root, 'frontend-source/android/scripts/github-updater-20102004.js'));
const builder = read(path.join(root, 'tools/build-frontend-bundles.mjs'));
const workflow = read(path.join(root, '.github/workflows/publish-in-app-update.yml'));
const updateJson = JSON.parse(read(path.join(root, 'update.json')));
const currentVersion = JSON.parse(read(path.join(root, 'version.json')));
const webBundle = read(path.join(root, 'web/assets/scripts/vyapar-app.js'));
const androidBundle = read(path.join(root, 'android-app/app/src/main/assets/assets/scripts/vyapar-app.js'));
const webStyle = read(path.join(root, 'web/assets/styles/vyapar-ui.css'));
const androidStyle = read(path.join(root, 'android-app/app/src/main/assets/assets/styles/vyapar-ui.css'));

assert.match(manifest, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
assert.match(manifest, /androidx\.core\.content\.FileProvider/);
assert.match(manifest, /@xml\/update_file_paths/);
assert.match(gradle, /androidx\.core:core:1\.13\.1/);
assert.match(gradle, /ANDROID_KEYSTORE_FILE/);
assert.match(gradle, /signingConfigs/);
assert.match(finalActivity, /new UpdateManager\(this, webView\)/);
assert.match(finalActivity, /checkForAppUpdate\(boolean manual\)/);
assert.match(finalActivity, /downloadAndInstallUpdate\(String manifestJson\)/);
assert.match(finalActivity, /updateManager\.onResume\(\)/);
assert.match(nativeActivity, /webView\.addJavascriptInterface/);

assert.match(updater, /raw\.githubusercontent\.com\/artishoepalace-oss\/Vyapar-AI-Fronted-\/main\/update\.json/);
assert.match(updater, /Downloaded APK checksum does not match/);
assert.match(updater, /Update signing certificate does not match/);
assert.match(updater, /activity\.getPackageName\(\)\.equals\(d\.packageName\)/);
assert.match(updater, /FileProvider\.getUriForFile/);
assert.match(updater, /ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
assert.match(updater, /private static final long MAX\s*=/);
assert.match(updater, /releases\/download\//);

assert.match(updaterJs, /window\.fs607CheckUpdate = checkForUpdate/);
assert.match(updaterJs, /Automatic update checks/);
assert.match(updaterJs, /Download & install/);
assert.match(updaterJs, /CHECK_INTERVAL = 12 \* 60 \* 60 \* 1000/);
assert.match(updaterJs, /AndroidApp\.downloadAndInstallUpdate/);
assert(builder.includes("'github-updater-20102004.js'"));
assert(builder.includes("'github-updater-20102004.css'"));

assert.equal(updateJson.appId, 'com.anuj.guptalegacy.vyaparai');
assert.equal(updateJson.channel, 'stable');
assert(Number.isInteger(Number(updateJson.versionCode)));
assert(Number(updateJson.versionCode) <= Number(currentVersion.versionCode), 'approved update cannot be newer than checked-in app identity');
assert.match(updateJson.sha256, /^[a-f0-9]{64}$/);
assert.match(updateJson.apkUrl, /^https:\/\/github\.com\/artishoepalace-oss\/Vyapar-AI-Fronted-\/releases\/download\//);

for (const secret of ['ANDROID_KEYSTORE_BASE64','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD','ANDROID_STORE_PASSWORD']) {
  assert(workflow.includes(`secrets.${secret}`), `signed update workflow missing ${secret}`);
}
assert.match(workflow, /assembleRelease/);
assert.match(workflow, /apksigner/);
assert.match(workflow, /sha256sum/);
assert.match(workflow, /Publish approved update manifest to main/);
assert.match(workflow, /git push origin HEAD:main/);
assert.match(workflow, /Release\/tag .* already exists|Release\/tag/);

assert(webBundle.includes('SCRIPT SOURCE: github-updater-20102004.js'));
assert(webStyle.includes('STYLE SOURCE: github-updater-20102004.css'));
assert.strictEqual(webBundle, androidBundle);
assert.strictEqual(webStyle, androidStyle);

console.log('✓ Secure GitHub in-app updater, signed publisher and runtime sync checks passed');
