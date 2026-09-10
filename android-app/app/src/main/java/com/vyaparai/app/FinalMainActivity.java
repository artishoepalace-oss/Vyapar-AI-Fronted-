package com.vyaparai.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/** Final Android shell plus the secure GitHub update bridge. */
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
            // Replace the base AndroidApp bridge with a subclass that preserves all
            // existing methods and adds only updater operations.
            webView.addJavascriptInterface(new FinalAndroidApp(), "AndroidApp");
        }
    }

    public class FinalAndroidApp extends AndroidApp {
        @JavascriptInterface public void checkForAppUpdate(boolean manual) {
            if (updateManager != null) updateManager.checkForUpdate(manual);
        }
        @JavascriptInterface public void downloadAndInstallUpdate(String manifestJson) {
            if (updateManager != null) updateManager.downloadAndInstall(manifestJson);
        }
        @JavascriptInterface public String getUpdateManifestUrl() {
            return UpdateManager.UPDATE_MANIFEST_URL;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (updateManager != null) updateManager.onResume();
    }

    @Override protected void onDestroy() {
        if (updateManager != null) { updateManager.destroy(); updateManager = null; }
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
