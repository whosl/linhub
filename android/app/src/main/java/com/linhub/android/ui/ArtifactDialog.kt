package com.linhub.android.ui

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.view.doOnLayout
import com.linhub.android.core.model.Artifact
import com.linhub.android.ui.markdown.MarkdownText
import java.io.ByteArrayInputStream
import java.util.UUID
import kotlinx.coroutines.delay
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private enum class ArtifactTab { Preview, Code }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtifactDialog(
    artifact: Artifact,
    loading: Boolean,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    onSave: (Uri, String) -> Unit,
    onOpenLink: (String) -> Unit,
) {
    var version by remember(artifact.id, artifact.currentVersion) {
        mutableStateOf(artifact.currentVersion)
    }
    val current = artifact.versions.firstOrNull { it.version == version }
        ?: artifact.versions.lastOrNull()
        ?: return
    val previewable = artifact.kind in setOf("html", "react", "svg", "markdown", "mermaid")
    var tab by remember(artifact.id) {
        mutableStateOf(if (previewable) ArtifactTab.Preview else ArtifactTab.Code)
    }
    var versionMenu by remember { mutableStateOf(false) }
    val runLanguage = artifact.runnableLanguage()
    var running by remember(artifact.id, version) { mutableStateOf(false) }
    var runRequest by remember(artifact.id, version) { mutableStateOf(0) }
    var runOutput by remember(artifact.id, version) { mutableStateOf<String?>(null) }
    val downloadLauncher = rememberLauncherForActivityResult(
        // text/plain 会让 DocumentsUI 把 `demo.js` 实际保存为 `demo.js.txt`。
        // Artifact 已通过受控扩展名表达格式，使用通用 MIME 才能跨 Provider 保留文件名。
        ActivityResultContracts.CreateDocument(ARTIFACT_DOWNLOAD_MIME_TYPE),
    ) { uri ->
        uri?.let { onSave(it, current.content) }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            Scaffold(
                contentWindowInsets = WindowInsets(0),
                topBar = {
                    TopAppBar(
                        title = {
                            Text(
                                artifact.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Rounded.Close, contentDescription = "关闭作品")
                            }
                        },
                        actions = {
                            if (artifact.versions.size > 1) {
                                Box {
                                    TextButton(onClick = { versionMenu = true }) {
                                        Text("v$version")
                                        Icon(Icons.Rounded.ExpandMore, contentDescription = null)
                                    }
                                    DropdownMenu(
                                        expanded = versionMenu,
                                        onDismissRequest = { versionMenu = false },
                                    ) {
                                        artifact.versions.asReversed().forEach { item ->
                                            DropdownMenuItem(
                                                text = { Text("版本 ${item.version}") },
                                                onClick = {
                                                    version = item.version
                                                    versionMenu = false
                                                },
                                                trailingIcon = if (item.version == version) {
                                                    {
                                                        Icon(
                                                            Icons.Rounded.CheckCircle,
                                                            contentDescription = "当前版本",
                                                        )
                                                    }
                                                } else {
                                                    null
                                                },
                                            )
                                        }
                                    }
                                }
                            }
                            IconButton(
                                onClick = {
                                    downloadLauncher.launch(artifact.downloadFileName())
                                },
                            ) {
                                Icon(Icons.Rounded.Download, contentDescription = "下载作品")
                            }
                            IconButton(onClick = onShare, enabled = !loading) {
                                if (loading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.padding(7.dp),
                                        strokeWidth = 2.dp,
                                    )
                                } else {
                                    Icon(Icons.Rounded.Share, contentDescription = "分享作品")
                                }
                            }
                        },
                    )
                },
            ) { padding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                ) {
                    if (previewable) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            TextButton(onClick = { tab = ArtifactTab.Preview }) {
                                Icon(Icons.Rounded.Visibility, contentDescription = null)
                                Text("预览", modifier = Modifier.padding(start = 6.dp))
                            }
                            TextButton(onClick = { tab = ArtifactTab.Code }) {
                                Icon(Icons.Rounded.Code, contentDescription = null)
                                Text("代码", modifier = Modifier.padding(start = 6.dp))
                            }
                        }
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clipToBounds(),
                    ) {
                        // AndroidView/WebView 放进 AnimatedContent 后，过渡图层会短暂保留旧坐标，
                        // 造成越过标签栏绘制且触摸命中偏移。按标签 keyed 重建可保持原生 View
                        // 的布局与触摸坐标一致；作品面板和其余纯 Compose 动画不受影响。
                        key(tab) {
                            if (tab == ArtifactTab.Preview && previewable) {
                                ArtifactPreview(artifact, current.content, onOpenLink)
                            } else {
                            Column(Modifier.fillMaxSize()) {
                                if (runLanguage != null) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Button(
                                            onClick = {
                                                runOutput = null
                                                running = true
                                                runRequest += 1
                                            },
                                            enabled = !running,
                                        ) {
                                            if (running) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(16.dp),
                                                    strokeWidth = 2.dp,
                                                )
                                            } else {
                                                Text("运行")
                                            }
                                        }
                                        Text(
                                            if (runLanguage == "python") {
                                                "Python · 最长 120 秒 · 仅允许 Pyodide CDN"
                                            } else {
                                                "JavaScript · 最长 15 秒 · 禁止网络和本地文件"
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                runOutput?.let { output ->
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 4.dp),
                                        color = MaterialTheme.colorScheme.surfaceVariant,
                                        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
                                    ) {
                                        SelectionContainer {
                                            Text(
                                                output,
                                                modifier = Modifier.padding(12.dp),
                                                fontFamily = FontFamily.Monospace,
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        }
                                    }
                                }
                                SelectionContainer {
                                    LazyColumn(
                                        modifier = Modifier.weight(1f),
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                                    ) {
                                        item {
                                            Text(
                                                current.content,
                                                fontFamily = FontFamily.Monospace,
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        }
                                    }
                                }
                                if (running && runLanguage != null) {
                                    key(runRequest) {
                                        ArtifactSandboxRunner(
                                            code = current.content,
                                            language = runLanguage,
                                            onResult = { result ->
                                                running = false
                                                runOutput = result.fold(
                                                    onSuccess = { it.ifBlank { "（无输出）" } },
                                                    onFailure = { "运行失败：${it.message ?: "未知错误"}" },
                                                )
                                            },
                                        )
                                    }
                                }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun ArtifactSandboxRunner(
    code: String,
    language: String,
    onResult: (Result<String>) -> Unit,
) {
    val channel = remember { "__LINHUB_DONE_${UUID.randomUUID().toString().replace("-", "")}" }
    var finished by remember { mutableStateOf(false) }
    val finish: (Result<String>) -> Unit = { result ->
        if (!finished) {
            finished = true
            onResult(result)
        }
    }
    val timeoutMillis = if (language == "python") 120_000L else 15_000L
    LaunchedEffect(Unit) {
        delay(timeoutMillis)
        finish(Result.failure(IllegalStateException("运行超时（${timeoutMillis / 1000} 秒）")))
    }
    val document = remember(code, language, channel) {
        buildSandboxDocument(code, language, channel)
    }
    AndroidView(
        modifier = Modifier
            .size(1.dp)
            .alpha(0.01f),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(AndroidColor.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.setSupportMultipleWindows(false)
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean = true

                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): WebResourceResponse? {
                        val url = request?.url ?: return blockedWebResource()
                        val pyodideResource = language == "python" &&
                            url.scheme == "https" && url.host == "cdn.jsdelivr.net" &&
                            url.path.orEmpty().startsWith("/pyodide/")
                        return if (pyodideResource) null else blockedWebResource()
                    }
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                        if (consoleMessage?.message() != channel) return true
                        evaluateJavascript("window.__linhubOutput || ''") { encoded ->
                            val output = runCatching { Json.decodeFromString<String>(encoded) }
                                .getOrElse { encoded.trim('"') }
                            finish(Result.success(output.take(MAX_RUN_OUTPUT_CHARS)))
                        }
                        return true
                    }
                }
                loadDataWithBaseURL(
                    "https://runner.invalid/",
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

private fun blockedWebResource(): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "UTF-8",
    ByteArrayInputStream(ByteArray(0)),
)

internal fun buildSandboxDocument(code: String, language: String, channel: String): String {
    val source = Json.encodeToString(code)
    val csp = if (language == "python") {
        "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; " +
            "connect-src https://cdn.jsdelivr.net"
    } else {
        "default-src 'none'; script-src 'unsafe-inline'"
    }
    val runner = if (language == "python") {
        """
        <script>
        window.__linhubFinish = message => {
          window.__linhubOutput = message;
          console.info("$channel");
        };
        </script>
        <script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"
          onerror="window.__linhubFinish('Error: Pyodide 运行时加载失败')"></script>
        <script>
        (async () => {
          const signal = console.info.bind(console); const code = $source; let output = "";
          try {
            if (typeof loadPyodide !== "function") throw new Error("Pyodide 运行时不可用");
            const pyodide = await loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"});
            await pyodide.loadPackagesFromImports(code);
            pyodide.setStdout({batched:s => output += s + "\n"});
            pyodide.setStderr({batched:s => output += s + "\n"});
            const result = await pyodide.runPythonAsync(code);
            if (result !== undefined && result !== null) output += String(result) + "\n";
          } catch (error) { output += "Error: " + String(error); }
          window.__linhubOutput = output || "（无输出）"; signal("$channel");
        })();
        </script>
        """.trimIndent()
    } else {
        """
        <script>
        (async () => {
          const signal = console.info.bind(console); const logs = [];
          ["log","info","warn","error"].forEach(name => console[name] = (...args) =>
            logs.push(args.map(value => { try { return typeof value === "object" ? JSON.stringify(value) : String(value); } catch (_) { return String(value); } }).join(" ")));
          try {
            const result = await (async () => { ${code.replace("</script>", "<\\/script>", ignoreCase = true)} })();
            if (result !== undefined) logs.push(String(result));
          } catch (error) { logs.push("Error: " + String(error)); }
          window.__linhubOutput = logs.join("\n") || "（无输出）"; signal("$channel");
        })();
        </script>
        """.trimIndent()
    }
    return "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" " +
        "content=\"$csp\"></head><body>$runner</body></html>"
}

private fun Artifact.runnableLanguage(): String? = when (language?.trim()?.lowercase()) {
    "python", "py" -> "python"
    "javascript", "js", "node", "nodejs" -> "javascript"
    else -> null
}

private const val MAX_RUN_OUTPUT_CHARS = 100_000
private const val ARTIFACT_DOWNLOAD_MIME_TYPE = "application/octet-stream"

@Composable
private fun ArtifactPreview(
    artifact: Artifact,
    content: String,
    onOpenLink: (String) -> Unit,
) {
    when (artifact.kind) {
        "markdown" -> ArtifactMarkdownPreview(content, onOpenLink)
        "html", "react", "svg", "mermaid" -> ArtifactWebPreview(
            document = artifact.previewDocument(content),
        )
    }
}

@Composable
internal fun ArtifactMarkdownPreview(
    content: String,
    onOpenLink: (String) -> Unit = {},
) {
    val context = LocalContext.current
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp),
    ) {
        item {
            MarkdownText(
                markdown = content,
                onLink = onOpenLink,
                onCopyCode = { code ->
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE)
                        as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("LinHub 作品代码", code))
                },
            )
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun ArtifactWebPreview(document: String) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(AndroidColor.WHITE)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.setSupportMultipleWindows(false)
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean = true
                }
            }
        },
        update = { webView ->
            if (webView.tag != document) {
                webView.tag = document
                // AndroidView 的首次 update 可能发生在高度仍为 0 时；此时加载会让
                // WebView 把 100vh/百分比高度冻结为 0，SVG 等内容最终完全不可见。
                webView.doOnLayout {
                    if (webView.tag == document) {
                        webView.loadDataWithBaseURL(
                            "https://artifact.invalid/",
                            document,
                            "text/html",
                            "UTF-8",
                            null,
                        )
                    }
                }
            }
        },
        onRelease = { webView ->
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.destroy()
        },
    )
}

private fun Artifact.downloadFileName(): String {
    return artifactDownloadFileName(title = title, kind = kind, language = language)
}

private val ARTIFACT_LANGUAGE_EXTENSION_ALIASES = mapOf(
    "javascript" to "js",
    "typescript" to "ts",
    "markdown" to "md",
    "python" to "py",
    "c++" to "cpp",
    "c#" to "cs",
)

internal fun artifactDownloadFileName(
    title: String,
    kind: String,
    language: String?,
): String {
    val safeTitle = title.trim().replace(Regex("[\\\\/:*?\"<>|]+"), "_")
        .ifBlank { "artifact" }
    val extension = when (kind) {
        "html" -> "html"
        "react" -> "tsx"
        "svg" -> "svg"
        "markdown" -> "md"
        "mermaid" -> "mmd"
        else -> safeArtifactFileExtension(language)
    }
    return "$safeTitle.$extension"
}

internal fun safeArtifactFileExtension(raw: String?, fallback: String = "txt"): String {
    val normalized = raw?.trim()?.lowercase().orEmpty()
    val mimeTail = normalized.substringAfterLast('/').takeIf { normalized.contains('/') }
    val candidate = ARTIFACT_LANGUAGE_EXTENSION_ALIASES[normalized]
        ?: mimeTail?.let(ARTIFACT_LANGUAGE_EXTENSION_ALIASES::get)
        ?: mimeTail
        ?: normalized
    return candidate
        .trimStart('.')
        .replace(Regex("[^a-z0-9]+"), "")
        .take(16)
        .ifBlank { fallback }
}

private fun Artifact.previewDocument(content: String): String = when (kind) {
    "html" -> content
    "react" -> buildReactPreviewDocument(content)
    "svg" -> buildSvgPreviewDocument(content)
    "mermaid" -> """<!doctype html><html><head><meta name="viewport" content="width=device-width"><script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';mermaid.initialize({startOnLoad:true,securityLevel:'strict'});</script><style>body{margin:0;padding:20px;font-family:system-ui;background:white}</style></head><body><pre class="mermaid">${content.escapeHtml()}</pre></body></html>"""
    else -> ""
}

internal fun buildSvgPreviewDocument(content: String): String =
    """<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>html,body{margin:0;background:white}body{padding:20px;box-sizing:border-box}svg{display:block;max-width:100%;height:auto;margin:0 auto}</style></head><body>${ensureSvgViewBox(content)}</body></html>"""

internal fun ensureSvgViewBox(content: String): String {
    val openTag = Regex("<svg\\b[^>]*>", RegexOption.IGNORE_CASE).find(content) ?: return content
    if (Regex("\\bviewBox\\s*=", RegexOption.IGNORE_CASE).containsMatchIn(openTag.value)) {
        return content
    }
    fun dimension(name: String): String? = Regex(
        "\\b$name\\s*=\\s*[\\\"']\\s*([0-9]+(?:\\.[0-9]+)?)",
        RegexOption.IGNORE_CASE,
    ).find(openTag.value)?.groupValues?.getOrNull(1)
    val width = dimension("width") ?: return content
    val height = dimension("height") ?: return content
    val insertAt = openTag.range.last
    return content.substring(0, insertAt) +
        " viewBox=\"0 0 $width $height\"" +
        content.substring(insertAt)
}

private fun buildReactPreviewDocument(source: String): String {
    val escaped = source
        .replace(Regex("^import\\s+[^;]+;?\\s*$", RegexOption.MULTILINE), "")
        .replace(Regex("export\\s+default\\s+"), "const __default = ")
        .replace(Regex("^export\\s+", RegexOption.MULTILINE), "")
        .replace(Regex("</script>", RegexOption.IGNORE_CASE), "<\\/script>")
    return """<!doctype html><html><head><meta name="viewport" content="width=device-width"><script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script><script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script><script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script><style>body{margin:0;font-family:system-ui}</style></head><body><div id="root"></div><script type="text/babel" data-presets="react,typescript">const {useState,useEffect,useMemo,useCallback,useRef,useReducer,useContext}=React;$escaped
const __candidates=[typeof App!=="undefined"&&App,typeof Component!=="undefined"&&Component].filter(Boolean);const __Comp=(typeof __default!=="undefined"&&__default)||__candidates[0];if(__Comp){ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__Comp));}else{document.getElementById("root").innerHTML='<p style="padding:16px;color:#888">未找到可渲染的组件</p>';}</script></body></html>"""
}

private fun String.escapeHtml(): String = replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
