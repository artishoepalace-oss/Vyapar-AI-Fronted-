package com.vyaparai.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

/**
 * Final Android 7-16 shell for Vyapar AI 8.0.0.2026.
 *
 * MainActivity remains the authoritative feature implementation. This thin
 * subclass only aligns the first WebView compositor frame with the branded
 * dark-blue launch surface and applies a few safe rendering flags before the
 * first frame is drawn. No business/auth/payment logic is changed.
 */
public class FinalMainActivity extends MainActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Keep the system window on the same dark surface used by launch_screen
        // before MainActivity creates the WebView.
        getWindow().setStatusBarColor(android.graphics.Color.rgb(6, 19, 38));
        getWindow().setNavigationBarColor(android.graphics.Color.rgb(6, 23, 45));

        super.onCreate(savedInstanceState);

        // super.onCreate finishes before Android draws the first activity frame,
        // so enforcing the same launch color here also protects future shell
        // changes without duplicating MainActivity's feature code.
        WebView webView = findWebView(getWindow().getDecorView());
        if (webView != null) {
            webView.setBackgroundColor(android.graphics.Color.rgb(6, 23, 45));
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }
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
