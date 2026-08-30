package work.patternflow.audio

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * The console editor, inside the app: a WebView onto the panel's own
 * /audio-in page. Not a copy of the editor - THE editor, served by the
 * firmware, with the capture running behind it. Boxes, curves, damping,
 * the live phone monitor - all of it, one screen away from Start.
 */
class EditorActivity : Activity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.settings.javaScriptEnabled = true
        // The page lays out at desktop width; start zoomed to fit and let
        // pinch do the rest.
        web.settings.useWideViewPort = true
        web.settings.loadWithOverviewMode = true
        web.settings.builtInZoomControls = true
        web.settings.displayZoomControls = false
        web.webViewClient = WebViewClient()
        setContentView(web)
        val host = intent.getStringExtra("host") ?: "patternflow.local"
        web.loadUrl("http://$host/audio-in")
    }
}
