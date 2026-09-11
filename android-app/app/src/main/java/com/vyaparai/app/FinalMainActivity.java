package com.vyaparai.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * Final Android shell plus the secure GitHub update bridge.
 *
 * IMPORTANT: MainActivity's existing "AndroidApp" JavaScript bridge owns
 * startup/auth/readiness. The updater intentionally uses its own bridge name
 * so it can never replace or race the proven startup bridge.
 */
public class FinalMainActivity extends MainActivity {
    private UpdateManager updateManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        getWindow().setStatusBarColor(android.graphics.Color.BLACK);
        getWindow().setNavigationBarColor(android.graphics.Color.BLACK);
        super.onCreate(savedInstanceState);

        WebView webView = findWebView(getWindow().getDecorView());
        if (webView != null) {
            webView.setBackgroundColor(android.graphics.Color.BLACK);
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            updateManager = new UpdateManager(this, webView);
            // Never overwrite MainActivity's AndroidApp bridge. Inject updater
            // operations under an independent name so startup remains identical
            // to the proven v20.10.2004.00008.2026 runtime.
            webView.addJavascriptInterface(new UpdateBridge(), "VyaparUpdater");
        }
    }

    public class UpdateBridge {
        @JavascriptInterface
        public void checkForAppUpdate(boolean manual) {
            if (updateManager != null) updateManager.checkForUpdate(manual);
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String manifestJson) {
            if (updateManager != null) updateManager.downloadAndInstall(manifestJson);
        }

        @JavascriptInterface
        public String getUpdateManifestUrl() {
            return UpdateManager.UPDATE_MANIFEST_URL;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updateManager != null) updateManager.onResume();
    }

    @Override
    protected void onDestroy() {
        if (updateManager != null) {
            updateManager.destroy();
            updateManager = null;
        }
        super.onDestroy();
    }

    private WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView candidate = findWebView(group.getChildAt(i));
            if (candidate != null) return candidate;
        }
        return null;
    }
}
