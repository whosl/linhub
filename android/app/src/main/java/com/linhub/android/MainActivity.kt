package com.linhub.android

import android.Manifest
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.http.SslError
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.linhub.android.ui.theme.LinHubTheme
import com.linhub.android.ui.design.LinHubOrb
import java.io.File
import org.json.JSONObject

/**
 * LinHub Android 是生产 Web 的轻量系统壳。业务界面和会话状态由 WebView 统一承载，
 * 原生层只负责系统返回、文件选择、下载、录音权限和 App Links；侧栏手势由网页统一识别。
 */
class MainActivity : ComponentActivity() {
    private var webView: WebView? = null
    private var pendingAudioPermission: PermissionRequest? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        migrateLegacyNativeSession()
        enableEdgeToEdge()
        setContent {
            LinHubTheme {
                LinHubWebShell(
                    savedInstanceState = savedInstanceState,
                    initialUrl = resolveInitialUrl(intent),
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        webView?.loadUrl(versionedWebUrl(resolveInitialUrl(intent)))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView?.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingAudioPermission?.deny()
        pendingAudioPermission = null
        webView?.apply {
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            removeAllViews()
            destroy()
        }
        webView = null
        super.onDestroy()
    }

    @Composable
    private fun LinHubWebShell(
        savedInstanceState: Bundle?,
        initialUrl: String,
    ) {
        var chooserCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
        var progress by remember { mutableIntStateOf(0) }
        var shellState by remember { mutableStateOf<WebShellState>(WebShellState.Loading) }

        val fileChooser = rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val callback = chooserCallback
            chooserCallback = null
            callback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }
        val audioPermission = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted ->
            pendingAudioPermission?.let { request ->
                if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                else request.deny()
            }
            pendingAudioPermission = null
        }

        BackHandler {
            handleBack()
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars),
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    createWebView(
                        context = context,
                        onChooseFiles = { params, callback ->
                            chooserCallback?.onReceiveValue(null)
                            chooserCallback = callback
                            val intent = params.createIntent().apply {
                                addCategory(Intent.CATEGORY_OPENABLE)
                            }
                            runCatching { fileChooser.launch(intent) }
                                .onFailure {
                                    chooserCallback = null
                                    callback.onReceiveValue(null)
                                    Toast.makeText(context, "无法打开文件选择器", Toast.LENGTH_SHORT).show()
                                }
                            true
                        },
                        onProgress = { progress = it },
                        onNavigationStarted = {
                            progress = 0
                            shellState = WebShellState.Loading
                        },
                        onPageVisible = {
                            if (shellState !is WebShellState.Failed) {
                                shellState = WebShellState.Ready
                            }
                        },
                        onFailure = { failure -> shellState = failure },
                        onRequestAudio = { request ->
                            if (!isFirstParty(request.origin)) {
                                request.deny()
                            } else if (
                                ContextCompat.checkSelfPermission(
                                    this@MainActivity,
                                    Manifest.permission.RECORD_AUDIO,
                                ) == PackageManager.PERMISSION_GRANTED
                            ) {
                                request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                            } else {
                                pendingAudioPermission?.deny()
                                pendingAudioPermission = request
                                audioPermission.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        },
                    ).also { created ->
                        webView = created
                        val cacheCleared = created.clearCacheAfterAppUpgrade(context)
                        val restored = !cacheCleared &&
                            savedInstanceState?.let(created::restoreState) != null
                        if (!restored) created.loadUrl(versionedWebUrl(initialUrl))
                    }
                },
            )

            when (val state = shellState) {
                WebShellState.Loading -> WebLoadingOverlay(progress)
                WebShellState.Ready -> if (progress in 1..99) {
                    LinearProgressIndicator(
                        progress = { progress / 100f },
                        modifier = Modifier.fillMaxWidth(),
                        color = ComposeColor(0xFFC96442),
                        trackColor = ComposeColor.Transparent,
                    )
                }
                is WebShellState.Failed -> WebFailureOverlay(
                    state = state,
                    onRetry = {
                        if (state.requiresActivityRecreate) {
                            recreate()
                        } else {
                            shellState = WebShellState.Loading
                            webView?.apply {
                                clearCache(true)
                                loadUrl(versionedWebUrl(initialUrl))
                            }
                        }
                    },
                    onOpenBrowser = {
                        runCatching {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(initialUrl)))
                        }.onFailure {
                            Toast.makeText(
                                this@MainActivity,
                                "无法打开系统浏览器",
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    },
                )
            }
        }

        DisposableEffect(Unit) {
            onDispose {
                chooserCallback?.onReceiveValue(null)
                chooserCallback = null
            }
        }
    }

    @Suppress("SetJavaScriptEnabled")
    private fun createWebView(
        context: Context,
        onChooseFiles: (WebChromeClient.FileChooserParams, ValueCallback<Array<Uri>>) -> Boolean,
        onProgress: (Int) -> Unit,
        onNavigationStarted: () -> Unit,
        onPageVisible: () -> Unit,
        onFailure: (WebShellState.Failed) -> Unit,
        onRequestAudio: (PermissionRequest) -> Unit,
    ): WebView {
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            flush()
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        return WebView(context).apply {
            setBackgroundColor(Color.rgb(250, 249, 245))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportMultipleWindows(false)
                builtInZoomControls = false
                displayZoomControls = false
                safeBrowsingEnabled = true
                userAgentString = "$userAgentString LinHubAndroid/${BuildConfig.VERSION_NAME}"
            }
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
            addJavascriptInterface(BlobDownloadBridge(context), "LinHubAndroid")

            webViewClient = object : WebViewClient() {
                private var navigationGeneration = 0

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    navigationGeneration += 1
                    Log.d(WEB_SHELL_LOG_TAG, "navigation started generation=$navigationGeneration url=$url")
                    onNavigationStarted()
                }

                override fun onPageFinished(view: WebView, url: String) {
                    Log.d(WEB_SHELL_LOG_TAG, "navigation finished generation=$navigationGeneration url=$url")
                    // HTML 成功但关键 JS chunk 404/不兼容时，WebView 不会触发网络错误，
                    // 页面会长期停在空白或单个启动字母。用延迟健康检查把它转为可恢复错误。
                    val generation = navigationGeneration
                    waitForRenderedPage(
                        view = view,
                        isCurrentNavigation = {
                            navigationGeneration == generation && view.url == url
                        },
                        onRendered = onPageVisible,
                        onTimedOut = {
                            onFailure(
                                webFailure(
                                    "页面没有完成渲染",
                                    "可能是缓存了不完整的网页资源，或系统 WebView 版本过旧。",
                                ),
                            )
                        },
                    )
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest,
                    error: WebResourceError,
                ) {
                    if (!request.isForMainFrame) return
                    onFailure(
                        webFailure(
                            "无法连接 LinHub",
                            webNetworkErrorMessage(error.errorCode, error.description.toString()),
                        ),
                    )
                }

                override fun onReceivedHttpError(
                    view: WebView?,
                    request: WebResourceRequest,
                    errorResponse: WebResourceResponse,
                ) {
                    if (!request.isForMainFrame || errorResponse.statusCode < 400) return
                    onFailure(
                        webFailure(
                            "LinHub 服务暂时不可用",
                            "服务器返回 HTTP ${errorResponse.statusCode}，请稍后重试。",
                        ),
                    )
                }

                override fun onReceivedSslError(
                    view: WebView?,
                    handler: SslErrorHandler,
                    error: SslError,
                ) {
                    handler.cancel()
                    onFailure(
                        webFailure(
                            "安全连接失败",
                            "无法验证 lin.wenzhuolin.xyz 的 HTTPS 证书，请检查系统时间和网络。",
                        ),
                    )
                }

                override fun onRenderProcessGone(
                    view: WebView?,
                    detail: RenderProcessGoneDetail?,
                ): Boolean {
                    onFailure(
                        webFailure(
                            "网页渲染进程已停止",
                            if (detail?.didCrash() == true) {
                                "系统 WebView 渲染进程崩溃，请重新载入应用。"
                            } else {
                                "系统回收了 WebView 渲染进程，请重新载入应用。"
                            },
                            requiresActivityRecreate = true,
                        ),
                    )
                    return true
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = openOutsideIfNeeded(request.url)

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                    openOutsideIfNeeded(Uri.parse(url))
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    onProgress(newProgress)
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams,
                ): Boolean = onChooseFiles(fileChooserParams, filePathCallback)

                override fun onPermissionRequest(request: PermissionRequest) {
                    val onlyAudio = request.resources.isNotEmpty() && request.resources.all {
                        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                    }
                    if (onlyAudio) runOnUiThread { onRequestAudio(request) }
                    else request.deny()
                }
            }
            setDownloadListener(firstPartyDownloadListener(context, this))
        }
    }

    private fun WebView.openOutsideIfNeeded(uri: Uri): Boolean {
        if (uri.scheme == "about") return false
        if (isFirstParty(uri)) {
            val versioned = versionedWebUrl(uri.toString())
            if (versioned != uri.toString()) {
                loadUrl(versioned)
                return true
            }
            return false
        }
        val supported = uri.scheme in setOf("http", "https", "mailto", "tel")
        if (!supported) return true
        return runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        }.getOrElse {
            Toast.makeText(this@MainActivity, "无法打开外部链接", Toast.LENGTH_SHORT).show()
            true
        }
    }

    private fun WebView.clearCacheAfterAppUpgrade(context: Context): Boolean {
        val preferences = context.getSharedPreferences(
            WEB_SHELL_PREFERENCES,
            Context.MODE_PRIVATE,
        )
        val current = "${BuildConfig.VERSION_CODE}:${BuildConfig.VERSION_NAME}:${BuildConfig.API_BASE_URL}"
        if (preferences.getString(WEB_CACHE_VERSION_KEY, null) == current) return false
        clearCache(true)
        clearFormData()
        preferences.edit().putString(WEB_CACHE_VERSION_KEY, current).apply()
        return true
    }

    private fun webFailure(
        title: String,
        detail: String,
        requiresActivityRecreate: Boolean = false,
    ) = WebShellState.Failed(
        title = title,
        detail = detail,
        webViewVersion = WebView.getCurrentWebViewPackage()?.versionName ?: "未知",
        requiresActivityRecreate = requiresActivityRecreate,
    )

    private fun waitForRenderedPage(
        view: WebView,
        isCurrentNavigation: () -> Boolean,
        onRendered: () -> Unit,
        onTimedOut: () -> Unit,
    ) {
        val startedAt = SystemClock.elapsedRealtime()
        val check = object : Runnable {
            override fun run() {
                if (!isCurrentNavigation() || !view.isAttachedToWindow) return
                view.evaluateJavascript(WEB_RENDER_HEALTH_CHECK) { rendered ->
                    Log.d(WEB_SHELL_LOG_TAG, "render health result=$rendered url=${view.url}")
                    if (!isCurrentNavigation() || !view.isAttachedToWindow) return@evaluateJavascript
                    when {
                        rendered == "true" -> onRendered()
                        SystemClock.elapsedRealtime() - startedAt >= WEB_RENDER_WATCHDOG_MS ->
                            onTimedOut()
                        else -> view.postDelayed(this, WEB_RENDER_POLL_INTERVAL_MS)
                    }
                }
            }
        }
        view.post(check)
    }

    private fun firstPartyDownloadListener(
        context: Context,
        source: WebView,
    ) = DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
        val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
        if (url.startsWith("blob:")) {
            val script = """
                (async () => {
                  try {
                    const response = await fetch(${JSONObject.quote(url)});
                    const blob = await response.blob();
                    const dataUrl = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.onerror = () => reject(reader.error);
                      reader.readAsDataURL(blob);
                    });
                    window.LinHubAndroid.saveBase64(
                      ${JSONObject.quote(fileName)},
                      ${JSONObject.quote(mimeType ?: "application/octet-stream")},
                      dataUrl
                    );
                  } catch (_) {
                    window.LinHubAndroid.reportDownloadFailure();
                  }
                })();
            """.trimIndent()
            source.evaluateJavascript(script, null)
            return@DownloadListener
        }
        if (!isFirstParty(Uri.parse(url))) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                .onFailure {
                    Toast.makeText(context, "无法打开下载链接", Toast.LENGTH_SHORT).show()
                }
            return@DownloadListener
        }
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setMimeType(mimeType)
            setTitle(fileName)
            setDescription("LinHub 正在下载文件")
            setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
            )
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            addRequestHeader("User-Agent", userAgent ?: source.settings.userAgentString)
            CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
        }
        runCatching {
            context.getSystemService(DownloadManager::class.java).enqueue(request)
        }.onSuccess {
            Toast.makeText(context, "已开始下载 $fileName", Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(context, "下载失败，请稍后重试", Toast.LENGTH_SHORT).show()
        }
    }

    private fun handleBack() {
        val current = webView ?: run {
            finish()
            return
        }
        current.evaluateJavascript(
            """
            (() => {
              const close = document.querySelector('button[aria-label="关闭侧栏"]');
              if (close) { close.click(); return true; }
              return false;
            })()
            """.trimIndent(),
        ) { handled ->
            if (handled != "true") {
                if (current.canGoBack()) current.goBack() else finish()
            }
        }
    }

    private fun resolveInitialUrl(intent: Intent?): String {
        val uri = intent?.data ?: return BuildConfig.API_BASE_URL
        if (isFirstParty(uri)) return uri.toString()
        if (uri.scheme == "linhub" && uri.host == "share") {
            val artifactId = uri.pathSegments
                .dropWhile { it != "artifact" }
                .drop(1)
                .firstOrNull()
            if (!artifactId.isNullOrBlank()) {
                return "${BuildConfig.API_BASE_URL}share/artifact/${Uri.encode(artifactId)}"
            }
        }
        return BuildConfig.API_BASE_URL
    }

    /**
     * EdgeOne 曾缓存过引用已删除 Next.js chunk 的旧 HTML。所有 Android 主框架导航
     * 都携带壳版本作为缓存键：新 APK 首次请求必定回源，同时不影响 API 和静态资源。
     */
    private fun versionedWebUrl(url: String): String {
        val uri = Uri.parse(url)
        if (!isFirstParty(uri)) return url
        if (uri.getQueryParameter(WEB_SHELL_VERSION_QUERY) == BuildConfig.VERSION_NAME) return url
        val builder = uri.buildUpon().clearQuery()
        uri.queryParameterNames
            .filterNot { it == WEB_SHELL_VERSION_QUERY }
            .forEach { name ->
                uri.getQueryParameters(name).forEach { value ->
                    builder.appendQueryParameter(name, value)
                }
            }
        return builder.appendQueryParameter(WEB_SHELL_VERSION_QUERY, BuildConfig.VERSION_NAME)
            .build()
            .toString()
    }

    /**
     * 旧原生客户端保存的是 Better Auth bearer 插件返回的已签名 token；它与会话
     * Cookie 的值相同。升级到 WebView 壳时只迁移一次，随后清理旧存储，避免用户
     * 在网页中退出后又被旧 token 自动登录。
     */
    private fun migrateLegacyNativeSession() {
        val sessionStore = (application as? LinHubApplication)?.container?.sessionStore ?: return
        val token = sessionStore.currentToken() ?: return
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        val secure = BuildConfig.API_BASE_URL.startsWith("https://")
        val cookieName = if (secure) {
            "__Secure-better-auth.session_token"
        } else {
            "better-auth.session_token"
        }
        val existing = cookies.getCookie(BuildConfig.API_BASE_URL).orEmpty()
        if (!existing.split(';').any { it.trim().startsWith("$cookieName=") }) {
            val attributes = buildString {
                append("$cookieName=$token; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800")
                if (secure) append("; Secure")
            }
            cookies.setCookie(BuildConfig.API_BASE_URL, attributes)
            cookies.flush()
        }
        sessionStore.clear()
    }

    private fun isFirstParty(uri: Uri): Boolean {
        val base = Uri.parse(BuildConfig.API_BASE_URL)
        return uri.scheme.equals(base.scheme, ignoreCase = true) &&
            uri.host.equals(base.host, ignoreCase = true) &&
            normalizedPort(uri) == normalizedPort(base)
    }

    private fun normalizedPort(uri: Uri): Int = when {
        uri.port != -1 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> 443
        uri.scheme.equals("http", ignoreCase = true) -> 80
        else -> -1
    }
}

private sealed interface WebShellState {
    data object Loading : WebShellState
    data object Ready : WebShellState
    data class Failed(
        val title: String,
        val detail: String,
        val webViewVersion: String,
        val requiresActivityRecreate: Boolean = false,
    ) : WebShellState
}

@Composable
private fun WebLoadingOverlay(progress: Int) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            LinHubOrb()
            Text(
                text = if (progress in 1..99) "正在打开 LinHub · $progress%" else "正在打开 LinHub",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        if (progress in 1..99) {
            LinearProgressIndicator(
                progress = { progress / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter),
                color = ComposeColor(0xFFC96442),
                trackColor = ComposeColor.Transparent,
            )
        }
    }
}

@Composable
private fun WebFailureOverlay(
    state: WebShellState.Failed,
    onRetry: () -> Unit,
    onOpenBrowser: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            LinHubOrb()
            Text(
                text = state.title,
                color = MaterialTheme.colorScheme.onBackground,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = state.detail,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                text = "系统 WebView ${state.webViewVersion}",
                color = MaterialTheme.colorScheme.outline,
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(2.dp))
            Button(
                onClick = onRetry,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ComposeColor(0xFFC96442),
                ),
            ) {
                Text(if (state.requiresActivityRecreate) "重新载入应用" else "重试")
            }
            OutlinedButton(
                onClick = onOpenBrowser,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("在系统浏览器中打开")
            }
        }
    }
}

private fun webNetworkErrorMessage(errorCode: Int, description: String): String = when (errorCode) {
    WebViewClient.ERROR_HOST_LOOKUP -> "找不到服务器，请检查 DNS 或网络连接。"
    WebViewClient.ERROR_CONNECT -> "无法连接服务器，请检查网络后重试。"
    WebViewClient.ERROR_TIMEOUT -> "连接超时，请切换网络后重试。"
    WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> "HTTPS 安全握手失败，请检查系统时间。"
    else -> description.ifBlank { "网页加载失败，请检查网络后重试。" }
}

private const val WEB_SHELL_PREFERENCES = "linhub_web_shell"
private const val WEB_SHELL_LOG_TAG = "LinHubWebShell"
private const val WEB_CACHE_VERSION_KEY = "cache_version"
private const val WEB_RENDER_WATCHDOG_MS = 12_000L
private const val WEB_RENDER_POLL_INTERVAL_MS = 300L
private val WEB_RENDER_HEALTH_CHECK =
    """
    (() => {
      const body = document.body;
      if (!body) return false;
      const text = (body.innerText || '').trim();
      const hasMeaningfulText = text.length > 1 && text !== 'L';
      const hasInteraction = Boolean(body.querySelector(
        'button, a[href], input, textarea, select, main, [role="dialog"], [role="main"]'
      ));
      const styles = [...body.ownerDocument.querySelectorAll('link[rel="stylesheet"]')];
      const stylesReady = styles.length === 0 || styles.every(link => {
        if (!link.sheet) return false;
        try { return link.sheet.cssRules.length > 0; } catch (_) { return true; }
      });
      return stylesReady && (hasMeaningfulText || hasInteraction);
    })()
    """.trimIndent()
private const val WEB_SHELL_VERSION_QUERY = "linhub_app"

private class BlobDownloadBridge(context: Context) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun saveBase64(fileName: String, mimeType: String, dataUrl: String) {
        Thread {
            runCatching {
                val payload = dataUrl.substringAfter(',', missingDelimiterValue = "")
                require(payload.isNotBlank())
                val bytes = Base64.decode(payload, Base64.DEFAULT)
                val safeName = fileName
                    .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_")
                    .take(180)
                    .ifBlank { "linhub-download" }
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType)
                        put(
                            MediaStore.Downloads.RELATIVE_PATH,
                            "${Environment.DIRECTORY_DOWNLOADS}/LinHub",
                        )
                    }
                    val uri = requireNotNull(
                        appContext.contentResolver.insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                            values,
                        ),
                    )
                    appContext.contentResolver.openOutputStream(uri).use { output ->
                        requireNotNull(output).write(bytes)
                    }
                } else {
                    val directory = requireNotNull(
                        appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    ).resolve("LinHub").apply { mkdirs() }
                    File(directory, safeName).writeBytes(bytes)
                }
                showToast("已下载 $safeName")
            }.onFailure {
                showToast("下载失败，请稍后重试")
            }
        }.start()
    }

    @JavascriptInterface
    fun reportDownloadFailure() {
        showToast("下载失败，请稍后重试")
    }

    private fun showToast(message: String) {
        mainHandler.post {
            Toast.makeText(appContext, message, Toast.LENGTH_SHORT).show()
        }
    }
}

internal const val BENCHMARK_SCENARIO_EXTRA =
    "com.linhub.android.extra.BENCHMARK_SCENARIO"
internal const val BENCHMARK_STREAMING_TRIGGER_EXTRA =
    "com.linhub.android.extra.BENCHMARK_STREAMING_TRIGGER"
