package com.linhub.android.ui.markdown

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.ByteArrayInputStream

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun MermaidBlock(code: String) {
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val document = remember(code, darkTheme) { mermaidDocument(code, darkTheme) }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 220.dp, max = 420.dp),
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
                            val url = request?.url ?: return blockedResponse()
                            return if (isAllowedIsolatedPreviewRequest(url.scheme, url.host)) {
                                null
                            } else {
                                blockedResponse()
                            }
                        }
                    }
                }
            },
            update = { webView ->
                if (webView.tag != document) {
                    webView.tag = document
                    webView.loadDataWithBaseURL(
                        "https://mermaid.invalid/",
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

internal fun mermaidDocument(code: String, darkTheme: Boolean): String {
    val background = if (darkTheme) "#121212" else "#ffffff"
    val foreground = if (darkTheme) "#e7e7e7" else "#222222"
    val theme = if (darkTheme) "dark" else "neutral"
    return """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-linhub-mermaid' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data:" />
          <style>
            html,body{margin:0;min-height:100%;background:$background;color:$foreground;font-family:system-ui,sans-serif}
            body{display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}
            .mermaid{min-width:max-content}
            .error{white-space:pre-wrap;color:#d95c5c;font:12px ui-monospace,monospace}
          </style>
          <script type="module" nonce="linhub-mermaid">
            try {
              const {default: mermaid} = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
              mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'$theme',fontFamily:'system-ui'});
              await mermaid.run({querySelector:'.mermaid'});
            }
            catch (error) { document.body.innerHTML='<pre class="error">Mermaid 渲染失败：'+String(error)+'</pre>'; }
          </script>
        </head>
        <body><pre class="mermaid">${code.escapeMermaidHtml()}</pre></body>
        </html>
    """.trimIndent()
}

private fun String.escapeMermaidHtml(): String = replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")

private fun blockedResponse(): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "UTF-8",
    403,
    "Blocked",
    emptyMap(),
    ByteArrayInputStream(ByteArray(0)),
)
