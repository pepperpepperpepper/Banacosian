package wtf.uhoh.banacos;

import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String TAG = "Banacos";

    // The bundled web app is served from src/main/assets/ via a virtual, secure-context
    // https origin. Loading from this origin (instead of file://) means every root-absolute
    // path ("/js/...", "/staff/...", "/css/...") and ES-module import resolves unchanged,
    // and we avoid the unsafe setAllowUniversalAccessFromFileURLs workaround.
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        // A single root ("/") asset handler maps https://appassets.androidplatform.net/<path>
        // to src/main/assets/<path>. Requests to any other host (e.g. the solfege dataset on
        // ear.uh-oh.wtf) return null here and proceed as normal network requests.
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                // AssetsPathHandler serves files, not directories, so an in-app link to a
                // directory URL ("/solfege/", "/ledger/", "/") 404s. Map any trailing-slash
                // path to its index.html before handing it to the loader.
                String path = url.getPath();
                if (path != null && path.endsWith("/")) {
                    url = url.buildUpon().path(path + "index.html").build();
                }
                return assetLoader.shouldInterceptRequest(url);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + errorCode + " - " + description + " @ " + failingUrl);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page loaded: " + url);
                enableAudioContext();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                String[] resources = request.getResources();
                for (String resource : resources) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        request.grant(resources);
                        return;
                    }
                }
                request.deny();
            }
        });

        Log.i(TAG, "Loading app from " + APP_ORIGIN);
        webView.loadUrl(APP_ORIGIN + "/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        requestAudioFocus();
    }

    @Override
    protected void onPause() {
        super.onPause();
        abandonAudioFocus();
    }

    private void requestAudioFocus() {
        try {
            android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.media.AudioFocusRequest focusRequest = new android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new android.media.AudioAttributes.Builder()
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                        .build())
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(focusChange -> {
                        if (focusChange == android.media.AudioManager.AUDIOFOCUS_LOSS) {
                            // Handle audio focus loss
                        }
                    })
                    .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(null, android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error requesting audio focus: " + e.getMessage());
        }
    }

    private void abandonAudioFocus() {
        try {
            android.media.AudioManager audioManager = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                audioManager.abandonAudioFocusRequest(null);
            } else {
                audioManager.abandonAudioFocus(null);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error abandoning audio focus: " + e.getMessage());
        }
    }

    private void enableAudioContext() {
        webView.postDelayed(() -> {
            String js = "if (window.audioContext && window.audioContext.state === 'suspended') { " +
                         "  window.audioContext.resume().then(() => console.log('Audio context resumed')); " +
                         "} else if (window.AudioModule && window.AudioModule.prototype.audioContext) { " +
                         "  window.AudioModule.prototype.audioContext.resume().then(() => console.log('AudioModule context resumed')); " +
                         "} " +
                         "document.addEventListener('click', function initAudioOnInteraction() { " +
                         "  if (window.AudioModule) { " +
                         "    window.AudioModule.prototype.initializeAudio(); " +
                         "  } " +
                         "  document.removeEventListener('click', initAudioOnInteraction); " +
                         "}, { once: true });";
            webView.evaluateJavascript(js, null);
            Log.i(TAG, "Audio context enable script executed");
        }, 1000);
    }
}
