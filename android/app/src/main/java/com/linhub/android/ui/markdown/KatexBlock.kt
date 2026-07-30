package com.linhub.android.ui.markdown

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import com.linhub.android.ui.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun KatexBlock(latex: String) {
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val document = remember(latex, darkTheme) { katexDocument(latex, darkTheme) }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 112.dp, max = 260.dp),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxWidth(),
            factory = { context ->
                WebView(context).apply {
                    setBackgroundColor(if (darkTheme) AndroidColor.rgb(18, 18, 18) else AndroidColor.WHITE)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = false
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: WebResourceRequest?,
                        ): Boolean = true

                        override fun shouldInterceptRequest(
                            view: WebView?,
                            request: WebResourceRequest?,
                        ): WebResourceResponse? {
                            val url = request?.url ?: return blockedKatexResponse()
                            return if (isAllowedIsolatedPreviewRequest(url.scheme, url.host)) {
                                null
                            } else {
                                blockedKatexResponse()
                            }
                        }
                    }
                }
            },
            update = { webView ->
                if (webView.tag != document) {
                    webView.tag = document
                    webView.loadDataWithBaseURL(
                        "https://katex.invalid/",
                        document,
                        "text/html",
                        "UTF-8",
                        null,
                    )
                }
            },
            onRelease = { webView ->
                webView.stopLoading()
                webView.loadUrl("about:blank")
                webView.destroy()
            },
        )
    }
}

private fun katexDocument(latex: String, darkTheme: Boolean): String {
    val encoded = Base64.encodeToString(latex.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    val background = if (darkTheme) "#121212" else "#ffffff"
    val foreground = if (darkTheme) "#e7e7e7" else "#222222"
    return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net data:" />
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css" />
          <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"></script>
          <style>
            html,body{margin:0;min-height:100%;background:$background;color:$foreground;font-family:system-ui,sans-serif}
            body{display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;overflow:auto}
            #formula{min-width:max-content;font-size:1.05rem}
            .error{white-space:pre-wrap;color:#d95c5c;font:12px ui-monospace,monospace}
          </style>
        </head>
        <body><div id="formula">公式渲染中…</div>
          <script>
            window.addEventListener('load', function () {
              try {
                const bytes = Uint8Array.from(atob('$encoded'), c => c.charCodeAt(0));
                const latex = new TextDecoder().decode(bytes);
                katex.render(latex, document.getElementById('formula'), {
                  displayMode: true, throwOnError: true, strict: 'warn', trust: false
                });
              } catch (error) {
                document.getElementById('formula').className='error';
                document.getElementById('formula').textContent='公式渲染失败：'+String(error);
              }
            });
          </script>
        </body>
        </html>
    """.trimIndent()
}

private fun blockedKatexResponse(): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "UTF-8",
    403,
    "Blocked",
    emptyMap(),
    ByteArrayInputStream(ByteArray(0)),
)
