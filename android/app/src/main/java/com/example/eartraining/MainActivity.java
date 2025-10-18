package com.example.eartraining;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    
    private WebView webView;
    private static final String TAG = "EarTraining";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        webView = findViewById(R.id.webview);
        
        // Configure WebView settings
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        
        // Enable audio features
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);
        webView.setWebChromeClient(new android.webkit.WebChromeClient());
        
        // Set WebView client to handle navigation within the app
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + errorCode + " - " + description);
                Toast.makeText(MainActivity.this, "Error loading: " + description, Toast.LENGTH_LONG).show();
            }
            
            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page loaded: " + url);
                Toast.makeText(MainActivity.this, "App loaded successfully!", Toast.LENGTH_SHORT).show();
                
                // Enable audio context after page load
                enableAudioContext();
            }
        });
        
        // Set WebChromeClient for better audio support
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Grant audio permissions if requested
                String[] resources = request.getResources();
                for (String resource : resources) {
                    if (resource.equals("android.webkit.resource.AUDIO_CAPTURE")) {
                        request.grant(resources);
                        return;
                    }
                }
                request.deny();
            }
        });
        
        // Load the local HTML file
        String url = "file:///android_asset/index.html";
        Log.i(TAG, "Loading URL: " + url);
        webView.loadUrl(url);
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
        // Request audio focus when app resumes
        requestAudioFocus();
    }
    
    @Override
    protected void onPause() {
        super.onPause();
        // Abandon audio focus when app pauses
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
                // For older Android versions
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
        // Run JavaScript to enable audio context after user interaction
        webView.postDelayed(() -> {
            String js = "if (window.audioContext && window.audioContext.state === 'suspended') { " +
                         "  window.audioContext.resume().then(() => console.log('Audio context resumed')); " +
                         "} else if (window.AudioModule && window.AudioModule.prototype.audioContext) { " +
                         "  window.AudioModule.prototype.audioContext.resume().then(() => console.log('AudioModule context resumed')); " +
                         "} " +
                         "// Also try to initialize audio on first user interaction " +
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