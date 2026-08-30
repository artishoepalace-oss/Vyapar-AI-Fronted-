package com.vyaparai.app;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.tasks.Task;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int STORAGE_PERMISSION_REQUEST_CODE = 1002;
    private static final int APP_PERMISSION_REQUEST_CODE = 1003;
    private static final int DRIVE_AUTH_REQUEST_CODE = 1004;
    private static final int DEVICE_AUTH_REQUEST_CODE = 1005;
    private static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 1006;
    private static final int GOOGLE_SIGN_IN_REQUEST_CODE = 1007;

    private static final String DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String DRIVE_NAME = "Vyapar AI Backup.json";
    private static final String PREFS = "vyapar_ai_native";
    private static final String PREF_DRIVE_CONNECTED = "drive_connected";
    private static final String PREF_LAST_AUTO_BACKUP = "last_auto_backup";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingName;
    private String pendingMime;
    private byte[] pendingBytes;
    private byte[] pendingDriveBytes;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private AuthorizationClient authorizationClient;
    private PermissionRequest pendingWebPermissionRequest;

    @Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Keyboard will overlay the app instead of resizing/pushing
    // the WebView and bottom navigation bar.
    getWindow().setSoftInputMode(
            android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
    );

    webView = new WebView(this);
        // Keep WebView on the hardware accelerated render path for the Liquid Glass UI.
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true);
        }
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);

        webView.addJavascriptInterface(new AndroidDownloads(), "AndroidDownloads");
        webView.addJavascriptInterface(new AndroidApp(), "AndroidApp");
        authorizationClient = Identity.getAuthorizationClient(this);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (request == null) return;
                runOnUiThread(() -> {
                    boolean wantsCamera = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsCamera = true;
                    }
                    if (!wantsCamera) { request.deny(); return; }
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                            checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        return;
                    }
                    pendingWebPermissionRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, APP_PERMISSION_REQUEST_CODE);
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                            "application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv",
                            "application/json", "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel.sheet.macroEnabled.12"
                    });
                    startActivityForResult(Intent.createChooser(intent, "Select business file"), FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST_CODE);
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalIfNeeded(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalIfNeeded(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.postDelayed(() -> {
                    view.evaluateJavascript("window.onNativeAppReady && window.onNativeAppReady();", null);
                }, 250);
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.postDelayed(() -> webView.evaluateJavascript(
                    "window.onNativeAppResume && window.onNativeAppResume();", null), 500);
        }
    }

    public class AndroidApp {
        @JavascriptInterface
        public String getVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public long getVersionCode() {
            try {
                android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    return info.getLongVersionCode();
                }
                return info.versionCode;
            } catch (Exception e) {
                return 0L;
            }
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            if (url == null) return;
            final String safe = url.trim();
            if (!safe.toLowerCase(java.util.Locale.US).startsWith("https://")) return;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(safe)));
                } catch (Exception e) {
                    toast("Unable to open update link");
                }
            });
        }

        @JavascriptInterface
        public void startGoogleSignIn() {
            runOnUiThread(() -> beginGoogleSignIn());
        }

        @JavascriptInterface
        public void requestRecommendedPermissions() {
            // Camera is intentionally NOT requested here. It is requested lazily
            // only when the user starts barcode scanning in the WebView.
            runOnUiThread(this::requestNotificationPermissionIfNeeded);
        }

        private void requestNotificationPermissionIfNeeded() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, APP_PERMISSION_REQUEST_CODE);
            }
        }

        @JavascriptInterface
        public boolean isGoogleDriveConnected() {
            return getPreferences(0).getBoolean(PREF_DRIVE_CONNECTED, false);
        }

        @JavascriptInterface
        public void connectGoogleDrive() {
            runOnUiThread(() -> authorizeDrive(null));
        }

        @JavascriptInterface
        public void disconnectGoogleDrive() {
            getPreferences(0).edit().putBoolean(PREF_DRIVE_CONNECTED, false).apply();
            runOnUiThread(() -> toast("Google Drive backup disconnected"));
        }

        @JavascriptInterface
        public void backupBase64ToGoogleDrive(String base64) {
            if (base64 == null || base64.isEmpty()) return;
            byte[] bytes;
            try {
                bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            } catch (Exception e) {
                return;
            }
            final byte[] data = bytes;
            runOnUiThread(() -> authorizeDrive(data));
        }

        @JavascriptInterface
        public void autoBackupToGoogleDrive(String base64) {
            if (!getPreferences(0).getBoolean(PREF_DRIVE_CONNECTED, false)) return;
            if (base64 == null || base64.isEmpty()) return;
            long now = System.currentTimeMillis();
            long last = getPreferences(0).getLong(PREF_LAST_AUTO_BACKUP, 0L);
            if (now - last < 12L * 60L * 60L * 1000L) return;
            byte[] data;
            try {
                data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            } catch (Exception e) {
                return;
            }
            authorizeDrive(data);
        }

        @JavascriptInterface
        public void authenticateDevice() {
            runOnUiThread(() -> {
                try {
                    KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                    if (km == null || !km.isDeviceSecure()) {
                        notifyWeb("window.onNativeBiometricResult && window.onNativeBiometricResult(false);");
                        toast("Set a device screen lock / fingerprint first");
                        return;
                    }
                    Intent intent = km.createConfirmDeviceCredentialIntent(
                            "Unlock Vyapar AI",
                            "Confirm fingerprint, PIN, pattern or device credential"
                    );
                    if (intent == null) {
                        notifyWeb("window.onNativeBiometricResult && window.onNativeBiometricResult(false);");
                        return;
                    }
                    startActivityForResult(intent, DEVICE_AUTH_REQUEST_CODE);
                } catch (Exception e) {
                    notifyWeb("window.onNativeBiometricResult && window.onNativeBiometricResult(false);");
                }
            });
        }

        @JavascriptInterface
        public String getPairedBluetoothPrinters() {
            JSONArray out = new JSONArray();
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                        checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    runOnUiThread(() -> requestPermissions(
                            new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                            BLUETOOTH_PERMISSION_REQUEST_CODE));
                    return out.toString();
                }
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) return out.toString();
                Set<BluetoothDevice> devices = adapter.getBondedDevices();
                for (BluetoothDevice device : devices) {
                    JSONObject row = new JSONObject();
                    row.put("name", device.getName() == null ? "Bluetooth Printer" : device.getName());
                    row.put("address", device.getAddress());
                    out.put(row);
                }
            } catch (Exception ignored) {}
            return out.toString();
        }

        @JavascriptInterface
        public void printEscPosBase64(String address, String base64) {
            if (address == null || base64 == null || address.trim().isEmpty() || base64.isEmpty()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                    checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> {
                    requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, BLUETOOTH_PERMISSION_REQUEST_CODE);
                    toast("Allow Bluetooth, then tap ESC/POS again");
                });
                return;
            }
            final String target = address.trim();
            final byte[] payload;
            try {
                payload = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            } catch (Exception e) {
                toast("Invalid print data");
                return;
            }
            io.execute(() -> {
                BluetoothSocket socket = null;
                try {
                    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                    if (adapter == null || !adapter.isEnabled()) throw new Exception("Bluetooth is off");
                    BluetoothDevice device = adapter.getRemoteDevice(target);
                    UUID spp = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
                    socket = device.createRfcommSocketToServiceRecord(spp);
                    adapter.cancelDiscovery();
                    socket.connect();
                    OutputStream out = socket.getOutputStream();
                    out.write(payload);
                    out.flush();
                    runOnUiThread(() -> {
                        toast("Thermal print sent");
                        notifyWeb("window.onNativeThermalPrintResult && window.onNativeThermalPrintResult(true);");
                    });
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        toast("Thermal printer connection failed");
                        notifyWeb("window.onNativeThermalPrintResult && window.onNativeThermalPrintResult(false);");
                    });
                } finally {
                    if (socket != null) try { socket.close(); } catch (Exception ignored) {}
                }
            });
        }
    }

    private void beginGoogleSignIn() {
        String clientId = "";
        try {
            clientId = getString(R.string.google_web_client_id).trim();
        } catch (Exception ignored) {}

        if (clientId.isEmpty() || !clientId.contains(".apps.googleusercontent.com")) {
            notifyGoogleSignInFailure("Google OAuth client ID is not configured in this APK build.");
            return;
        }

        try {
            GoogleSignInOptions options = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(clientId)
                    .build();
            GoogleSignInClient client = GoogleSignIn.getClient(this, options);
            startActivityForResult(client.getSignInIntent(), GOOGLE_SIGN_IN_REQUEST_CODE);
        } catch (Exception e) {
            notifyGoogleSignInFailure("Unable to open Google sign-in.");
        }
    }

    private void notifyGoogleSignInFailure(String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("success", false);
            payload.put("message", message == null ? "Google sign-in failed" : message);
            notifyWeb("window.onNativeGoogleSignInResult && window.onNativeGoogleSignInResult(" + payload.toString() + ");");
        } catch (Exception ignored) {
            notifyWeb("window.onNativeGoogleSignInResult && window.onNativeGoogleSignInResult({success:false,message:'Google sign-in failed'});");
        }
    }

    private void authorizeDrive(byte[] data) {
        if (data != null) pendingDriveBytes = data;
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_FILE_SCOPE)))
                .build();

        authorizationClient.authorize(request)
                .addOnSuccessListener(result -> handleDriveAuthorizationResult(result))
                .addOnFailureListener(error -> {
                    pendingDriveBytes = null;
                    toast("Google Drive authorization was not completed");
                });
    }

    private void handleDriveAuthorizationResult(AuthorizationResult result) {
        if (result.hasResolution()) {
            try {
                startIntentSenderForResult(
                        result.getPendingIntent().getIntentSender(),
                        DRIVE_AUTH_REQUEST_CODE,
                        null, 0, 0, 0
                );
            } catch (Exception e) {
                pendingDriveBytes = null;
                toast("Could not open Google Drive permission screen");
            }
            return;
        }

        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            pendingDriveBytes = null;
            toast("Google Drive access token was unavailable");
            return;
        }

        getPreferences(0).edit().putBoolean(PREF_DRIVE_CONNECTED, true).apply();
        byte[] data = pendingDriveBytes;
        pendingDriveBytes = null;
        if (data != null) uploadDriveBackup(token, data);
        notifyDriveStatus(true);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == GOOGLE_SIGN_IN_REQUEST_CODE) {
            try {
                Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
                GoogleSignInAccount account = task.getResult(ApiException.class);
                String idToken = account == null ? null : account.getIdToken();
                if (idToken == null || idToken.trim().isEmpty()) {
                    notifyGoogleSignInFailure("Google did not return a secure ID token.");
                    return;
                }
                JSONObject payload = new JSONObject();
                payload.put("success", true);
                payload.put("idToken", idToken);
                payload.put("email", account.getEmail());
                payload.put("name", account.getDisplayName());
                payload.put("googleId", account.getId());
                notifyWeb("window.onNativeGoogleSignInResult && window.onNativeGoogleSignInResult(" + payload.toString() + ");");
            } catch (ApiException e) {
                if (e.getStatusCode() == 12501) {
                    notifyGoogleSignInFailure("Google sign-in was cancelled.");
                } else {
                    notifyGoogleSignInFailure("Google sign-in failed (code " + e.getStatusCode() + ").");
                }
            } catch (Exception e) {
                notifyGoogleSignInFailure("Google sign-in failed.");
            }
            return;
        }

        if (requestCode == DEVICE_AUTH_REQUEST_CODE) {
            boolean ok = resultCode == RESULT_OK;
            notifyWeb("window.onNativeBiometricResult && window.onNativeBiometricResult(" + (ok ? "true" : "false") + ");");
            return;
        }

        if (requestCode == DRIVE_AUTH_REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                try {
                    AuthorizationResult result = authorizationClient.getAuthorizationResultFromIntent(data);
                    handleDriveAuthorizationResult(result);
                } catch (ApiException e) {
                    pendingDriveBytes = null;
                    toast("Google Drive authorization failed");
                }
            } else {
                pendingDriveBytes = null;
                toast("Google Drive permission was cancelled");
            }
            return;
        }

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        }
    }

    private void uploadDriveBackup(String token, byte[] bytes) {
        io.execute(() -> {
            try {
                String fileId = getPreferences(0).getString("drive_file_id", "");
                if (fileId.isEmpty()) {
                    fileId = createDriveFile(token, bytes);
                    if (fileId != null) {
                        getPreferences(0).edit().putString("drive_file_id", fileId).apply();
                    }
                } else {
                    boolean updated = updateDriveFile(token, fileId, bytes);
                    if (!updated) {
                        fileId = createDriveFile(token, bytes);
                        if (fileId != null) getPreferences(0).edit().putString("drive_file_id", fileId).apply();
                    }
                }

                if (fileId == null || fileId.isEmpty()) throw new Exception("Drive upload failed");
                getPreferences(0).edit().putLong(PREF_LAST_AUTO_BACKUP, System.currentTimeMillis()).apply();
                runOnUiThread(() -> {
                    notifyDriveStatus(true);
                    notifyWeb("window.premiumToast && window.premiumToast('Backup saved successfully','success');");
                    toast("Google Drive backup saved");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    notifyWeb("window.premiumToast && window.premiumToast('Backup could not be saved','error');");
                    toast("Google Drive backup failed");
                });
            }
        });
    }

    private String createDriveFile(String token, byte[] bytes) throws Exception {
        String boundary = "----VyaparAI" + System.currentTimeMillis();
        URL url = new URL("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "multipart/related; boundary=" + boundary);

        String metadata = "{\"name\":\"" + DRIVE_NAME + "\",\"mimeType\":\"application/json\"}";
        try (OutputStream out = conn.getOutputStream()) {
            writeString(out, "--" + boundary + "\r\n");
            writeString(out, "Content-Type: application/json; charset=UTF-8\r\n\r\n");
            writeString(out, metadata + "\r\n");
            writeString(out, "--" + boundary + "\r\n");
            writeString(out, "Content-Type: application/json\r\n\r\n");
            out.write(bytes);
            writeString(out, "\r\n--" + boundary + "--\r\n");
        }
        int code = conn.getResponseCode();
        String body = readResponse(conn, code);
        conn.disconnect();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        String marker = "\"id\":\"";
        int start = body.indexOf(marker);
        if (start < 0) return null;
        start += marker.length();
        int end = body.indexOf('"', start);
        return end > start ? body.substring(start, end) : null;
    }

    private boolean updateDriveFile(String token, String fileId, byte[] bytes) throws Exception {
        URL url = new URL("https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=media");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("PATCH");
        conn.setDoOutput(true);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
        int code = conn.getResponseCode();
        readResponse(conn, code);
        conn.disconnect();
        return code >= 200 && code < 300;
    }

    private String readResponse(HttpURLConnection conn, int code) throws Exception {
        InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            return sb.toString();
        }
    }

    private void writeString(OutputStream out, String value) throws Exception {
        out.write(value.getBytes(StandardCharsets.UTF_8));
    }

    private void notifyWeb(String js) {
        if (webView == null || js == null) return;
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void notifyDriveStatus(boolean connected) {
        if (webView == null) return;
        String js = "window.onNativeDriveStatus && window.onNativeDriveStatus(" + (connected ? "true" : "false") + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void toast(String message) {
        Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
    }

    public class AndroidDownloads {
        @JavascriptInterface
        public void saveBase64(String name, String mime, String base64) {
            try {
                String safeName = sanitizeName(name);
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                saveToDownloads(safeName, mime == null || mime.isEmpty() ? "application/octet-stream" : mime, bytes);
            } catch (Exception e) {
                runOnUiThread(() -> toast("Download failed"));
            }
        }
    }

    private void saveToDownloads(String name, String mime, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Vyapar AI");
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Unable to create download");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new Exception("Unable to open download");
                out.write(bytes);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(uri, done, null, null);
            runOnUiThread(() -> toast("Saved to Downloads/Vyapar AI"));
        } else {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                pendingName = name; pendingMime = mime; pendingBytes = bytes;
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_REQUEST_CODE);
                return;
            }
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Vyapar AI");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Unable to create Downloads folder");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
            runOnUiThread(() -> toast("Saved to Downloads/Vyapar AI"));
        }
    }

    private String sanitizeName(String name) {
        String clean = name == null ? "vyapar-ai-download" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
        return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == APP_PERMISSION_REQUEST_CODE && pendingWebPermissionRequest != null) {
            PermissionRequest request = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else request.deny();
            return;
        }
        if (requestCode == STORAGE_PERMISSION_REQUEST_CODE && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            try { saveToDownloads(pendingName, pendingMime, pendingBytes); }
            catch (Exception e) { toast("Download failed"); }
            finally { pendingName = null; pendingMime = null; pendingBytes = null; }
            return;
        }
        if (requestCode == STORAGE_PERMISSION_REQUEST_CODE) {
            toast("Storage permission is required to save the file");
            pendingName = null; pendingMime = null; pendingBytes = null;
            return;
        }
        if (requestCode == BLUETOOTH_PERMISSION_REQUEST_CODE) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            toast(granted ? "Bluetooth permission granted" : "Bluetooth permission is required for direct thermal printing");
        }
    }

    private boolean openExternalIfNeeded(String url) {
        if (url == null) return false;
        String safeUrl = url.trim();
        String lower = safeUrl.toLowerCase(java.util.Locale.US);

        // Razorpay sends intent:// links in Android WebViews. These must be parsed
        // as Android intents; feeding them back to WebView causes ERR_UNKNOWN_URL_SCHEME.
        if (lower.startsWith("intent:")) {
            openAndroidIntent(safeUrl);
            return true;
        }

        // Always consume UPI/deep-link schemes, even when no compatible app is
        // installed. Returning false would make WebView display an Android error.
        if (isPaymentScheme(lower)) {
            openPaymentIntent(safeUrl);
            return true;
        }

        if (lower.startsWith("mailto:")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(safeUrl)));
            } catch (Exception ignored) {
                toast("No email app is available");
            }
            return true;
        }
        // Keep the app's local asset pages in the WebView; external HTTPS pages
        // are opened by the system browser only when they are not Razorpay checkout.
        return false;
    }

    private boolean isPaymentScheme(String lower) {
        return lower.startsWith("upi:") ||
                lower.startsWith("tez:") ||
                lower.startsWith("phonepe:") ||
                lower.startsWith("paytmmp:") ||
                lower.startsWith("gpay:") ||
                lower.startsWith("bhim:") ||
                lower.startsWith("credpay:") ||
                lower.startsWith("amazonpay:") ||
                lower.startsWith("mobikwik:");
    }

    private void openPaymentIntent(String url) {
        try {
            Intent paymentIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            paymentIntent.addCategory(Intent.CATEGORY_BROWSABLE);

            // A chooser keeps generic upi:// links app-neutral and lets the user
            // use any installed UPI app. App-specific links open directly.
            if (url.toLowerCase(java.util.Locale.US).startsWith("upi:")) {
                if (paymentIntent.resolveActivity(getPackageManager()) == null) {
                    notifyPaymentLaunchFailed();
                    return;
                }
                startActivity(Intent.createChooser(paymentIntent, "Pay with UPI"));
            } else {
                // startActivity itself does not require package visibility. This
                // keeps Razorpay app-specific links working beyond the known PSPs.
                startActivity(paymentIntent);
            }
        } catch (ActivityNotFoundException | SecurityException ignored) {
            notifyPaymentLaunchFailed();
        }
    }

    private void openAndroidIntent(String url) {
        try {
            Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            String fallbackUrl = intent.getStringExtra("browser_fallback_url");
            Uri paymentData = intent.getData();
            String packageName = intent.getPackage();

            if (!isTrustedPaymentIntent(paymentData, packageName)) {
                notifyPaymentLaunchFailed();
                return;
            }

            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);

            try {
                startActivity(intent);
                return;
            } catch (ActivityNotFoundException | SecurityException ignored) {
                // Continue to Razorpay's HTTPS fallback, when one is present.
            }

            // Razorpay may include an HTTPS fallback. Keep it inside checkout and
            // never load arbitrary non-HTTPS fallbacks in the WebView.
            if (fallbackUrl != null && fallbackUrl.toLowerCase(java.util.Locale.US).startsWith("https://")) {
                final String safeFallback = fallbackUrl;
                webView.post(() -> webView.loadUrl(safeFallback));
                return;
            }
        } catch (Exception ignored) {
            // The checkout remains open so another method can still be selected.
        }

        notifyPaymentLaunchFailed();
    }

    private boolean isTrustedPaymentIntent(Uri data, String packageName) {
        if (data != null && isPaymentScheme(data.toString().toLowerCase(java.util.Locale.US))) {
            return true;
        }

        if (packageName == null) return false;
        return packageName.equals("com.google.android.apps.nbu.paisa.user") ||
                packageName.equals("com.phonepe.app") ||
                packageName.equals("net.one97.paytm") ||
                packageName.equals("in.org.npci.upiapp");
    }

    private void notifyPaymentLaunchFailed() {
        toast("No compatible UPI app found. Choose another payment method.");
        notifyWeb("window.onNativePaymentLaunchFailed && window.onNativePaymentLaunchFailed();");
    }

    private boolean backPressBusy = false;
    private long lastHomeBackAt = 0L;
    private int homeBackCount = 0;

    @Override
    public void onBackPressed() {
        if (webView == null || backPressBusy) return;
        backPressBusy = true;
        webView.evaluateJavascript("(window.handleNativeBackPress ? window.handleNativeBackPress() : false)", value -> {
            boolean consumed = "true".equalsIgnoreCase(value);
            if (consumed) { homeBackCount=1; backPressBusy=false; return; }
            long now=System.currentTimeMillis();
            if(now-lastHomeBackAt>2200L) homeBackCount=0;
            lastHomeBackAt=now; homeBackCount++;
            if(homeBackCount>=3){ backPressBusy=false; finish(); return; }
            if(homeBackCount<=2){
                webView.evaluateJavascript("window.setTab && window.setTab('home',false);",null);
                backPressBusy=false; return;
            }
            Toast.makeText(MainActivity.this,"Press back again to exit",Toast.LENGTH_SHORT).show();
            backPressBusy=false;
        });
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
