package com.linhub.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.ui.markdown.MarkdownBlock
import com.linhub.android.ui.markdown.MarkdownCodeBlock
import com.linhub.android.ui.markdown.MarkdownText
import java.io.File
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MediaPreviewDialog(
    state: MediaPreviewUiState,
    downloading: Boolean,
    onDismiss: () -> Unit,
    onDownload: (Uri) -> Unit,
    onOpenConversation: (() -> Unit)?,
    onOpenLink: (String) -> Unit,
) {
    val asset = state.asset
    val downloadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(
            asset.mimeType.takeIf(String::isNotBlank) ?: "application/octet-stream",
        ),
        onResult = { destination -> destination?.let(onDownload) },
    )

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
                            Column {
                                Text(asset.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${mediaPreviewKindLabel(asset.kind)} · ${formatPreviewBytes(asset.size)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        },
                        actions = {
                            onOpenConversation?.let { open ->
                                IconButton(onClick = open) {
                                    Icon(Icons.AutoMirrored.Rounded.Chat, contentDescription = "打开关联会话")
                                }
                            }
                            IconButton(
                                onClick = { downloadLauncher.launch(asset.name) },
                                enabled = !downloading,
                            ) {
                                if (downloading) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                    )
                                } else {
                                    Icon(Icons.Rounded.Download, contentDescription = "下载文件")
                                }
                            }
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Rounded.Close, contentDescription = "关闭预览")
                            }
                        },
                    )
                },
            ) { padding ->
                MediaPreviewContent(
                    state = state,
                    onOpenLink = onOpenLink,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                )
            }
        }
    }
}

@Composable
private fun MediaPreviewContent(
    state: MediaPreviewUiState,
    onOpenLink: (String) -> Unit,
    modifier: Modifier,
) {
    val asset = state.asset
    when {
        asset.isPreviewImage() -> Box(
            modifier = modifier.background(androidx.compose.ui.graphics.Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(mediaPreviewUrl(asset.url))
                    .crossfade(true)
                    .build(),
                contentDescription = asset.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
        }
        state.loading -> CenteredPreviewMessage(modifier) {
            CircularProgressIndicator(strokeWidth = 2.dp)
        }
        state.error != null -> CenteredPreviewMessage(modifier) {
            Text(state.error, color = MaterialTheme.colorScheme.error)
        }
        asset.isPreviewPdf() && state.bytes != null -> PdfDocumentPreview(
            bytes = state.bytes,
            modifier = modifier,
        )
        asset.isPreviewTextLike() || asset.isOfficeLike() -> {
            val text = asset.extractedText ?: state.bytes?.decodePreviewText().orEmpty()
            if (text.isBlank()) {
                CenteredPreviewMessage(modifier) {
                    Text("当前文件没有可显示的文本预览，可下载原文件查看。")
                }
            } else {
                TextDocumentPreview(
                    asset = asset,
                    text = text,
                    modifier = modifier,
                    onOpenLink = onOpenLink,
                )
            }
        }
        else -> CenteredPreviewMessage(modifier) {
            Text("当前格式无法直接预览，可下载原文件查看。")
        }
    }
}

@Composable
private fun CenteredPreviewMessage(
    modifier: Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier.padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

@Composable
internal fun TextDocumentPreview(
    asset: MediaAsset,
    text: String,
    modifier: Modifier,
    onOpenLink: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val displayText = remember(text) {
        if (text.length <= MAX_PREVIEW_CHARS) text else {
            text.take(MAX_PREVIEW_CHARS) + "\n\n……预览已截断，请下载原文件查看完整内容。"
        }
    }
    val copyToClipboard = { code: String ->
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("LinHub 文件代码", code))
    }
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
    ) {
        if (asset.isRichPreviewText()) {
            MarkdownText(
                markdown = displayText,
                onLink = onOpenLink,
                onCopyCode = copyToClipboard,
            )
        } else {
            MarkdownCodeBlock(
                block = MarkdownBlock.Code(
                    language = mediaPreviewLanguage(asset),
                    literal = displayText,
                ),
                onCopyCode = copyToClipboard,
                showRunButton = false,
            )
        }
    }
}

private sealed interface PdfPreviewState {
    data object Loading : PdfPreviewState
    data class Ready(val file: File, val pageCount: Int) : PdfPreviewState
    data class Error(val message: String) : PdfPreviewState
}

@Composable
private fun PdfDocumentPreview(bytes: ByteArray, modifier: Modifier) {
    val context = LocalContext.current
    var previewState by remember(bytes) { mutableStateOf<PdfPreviewState>(PdfPreviewState.Loading) }
    LaunchedEffect(bytes) {
        previewState = withContext(Dispatchers.IO) {
            var file: File? = null
            runCatching {
                file = File.createTempFile("linhub-preview-", ".pdf", context.cacheDir)
                val pdfFile = requireNotNull(file)
                pdfFile.writeBytes(bytes)
                val pageCount = ParcelFileDescriptor.open(
                    pdfFile,
                    ParcelFileDescriptor.MODE_READ_ONLY,
                ).use { descriptor -> PdfRenderer(descriptor).use(PdfRenderer::getPageCount) }
                require(pageCount > 0) { "PDF 没有可显示的页面" }
                PdfPreviewState.Ready(pdfFile, pageCount)
            }.getOrElse { error ->
                file?.delete()
                PdfPreviewState.Error(error.message ?: "无法打开 PDF")
            }
        }
    }
    val ready = previewState as? PdfPreviewState.Ready
    DisposableEffect(ready?.file) {
        onDispose { ready?.file?.delete() }
    }
    when (val current = previewState) {
        PdfPreviewState.Loading -> CenteredPreviewMessage(modifier) {
            CircularProgressIndicator(strokeWidth = 2.dp)
        }
        is PdfPreviewState.Error -> CenteredPreviewMessage(modifier) {
            Text(current.message, color = MaterialTheme.colorScheme.error)
        }
        is PdfPreviewState.Ready -> LazyColumn(
            modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(count = current.pageCount, key = { it }) { pageIndex ->
                PdfPage(file = current.file, pageIndex = pageIndex)
            }
        }
    }
}

@Composable
private fun PdfPage(file: File, pageIndex: Int) {
    var bitmap by remember(file, pageIndex) { mutableStateOf<Bitmap?>(null) }
    var error by remember(file, pageIndex) { mutableStateOf<String?>(null) }
    LaunchedEffect(file, pageIndex) {
        runCatching {
            withContext(Dispatchers.IO) {
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                    PdfRenderer(descriptor).use { renderer ->
                        renderer.openPage(pageIndex).use { page ->
                            val desiredScale = maxOf(1f, PDF_RENDER_WIDTH.toFloat() / page.width)
                            val boundedScale = minOf(
                                desiredScale,
                                PDF_MAX_DIMENSION.toFloat() / page.width,
                                PDF_MAX_DIMENSION.toFloat() / page.height,
                            )
                            val targetWidth = (page.width * boundedScale).roundToInt().coerceAtLeast(1)
                            val targetHeight = (page.height * boundedScale).roundToInt().coerceAtLeast(1)
                            Bitmap.createBitmap(
                                targetWidth,
                                targetHeight,
                                Bitmap.Config.ARGB_8888,
                            ).also { rendered ->
                                rendered.eraseColor(AndroidColor.WHITE)
                                page.render(
                                    rendered,
                                    null,
                                    null,
                                    PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY,
                                )
                            }
                        }
                    }
                }
            }
        }.onSuccess { bitmap = it }
            .onFailure { error = it.message ?: "第 ${pageIndex + 1} 页渲染失败" }
    }
    DisposableEffect(bitmap) {
        val rendered = bitmap
        onDispose { rendered?.recycle() }
    }
    Surface(modifier = Modifier.fillMaxWidth(), tonalElevation = 1.dp) {
        when {
            bitmap != null -> Image(
                bitmap = requireNotNull(bitmap).asImageBitmap(),
                contentDescription = "PDF 第 ${pageIndex + 1} 页",
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(requireNotNull(bitmap).width.toFloat() / requireNotNull(bitmap).height),
                contentScale = ContentScale.Fit,
            )
            error != null -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.72f),
                contentAlignment = Alignment.Center,
            ) { Text(requireNotNull(error), color = MaterialTheme.colorScheme.error) }
            else -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.72f),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator(strokeWidth = 2.dp) }
        }
    }
}

private fun MediaAsset.extension(): String =
    name.substringAfterLast('.', missingDelimiterValue = "").lowercase()

private fun MediaAsset.isPreviewImage(): Boolean =
    mimeType.startsWith("image/") || extension() in setOf("png", "jpg", "jpeg", "gif", "webp")

private fun MediaAsset.isPreviewPdf(): Boolean =
    mimeType == "application/pdf" || extension() == "pdf"

private fun MediaAsset.isOfficeLike(): Boolean =
    extension() in setOf("docx", "pptx", "xlsx", "xls")

private fun MediaAsset.isPreviewTextLike(): Boolean =
    mimeType.startsWith("text/") || extension() in PREVIEW_TEXT_EXTENSIONS

private fun MediaAsset.isRichPreviewText(): Boolean =
    extension() in setOf("md", "markdown", "csv", "tsv") || isOfficeLike()

internal fun mediaPreviewLanguage(asset: MediaAsset): String =
    MEDIA_PREVIEW_LANGUAGES[asset.extension()] ?: "text"

private fun ByteArray.decodePreviewText(): String = toString(Charsets.UTF_8)

private fun mediaPreviewKindLabel(kind: String): String = when (kind) {
    "upload" -> "上传"
    "generated" -> "生成"
    "edited" -> "编辑"
    else -> kind
}

private fun formatPreviewBytes(size: Long): String = when {
    size >= 1024L * 1024L -> "${size / (1024L * 1024L)} MB"
    size >= 1024L -> "${size / 1024L} KB"
    else -> "$size B"
}

private fun mediaPreviewUrl(url: String): String = when {
    url.startsWith("/") -> com.linhub.android.BuildConfig.API_BASE_URL.trimEnd('/') + url
    else -> url
}

private val PREVIEW_TEXT_EXTENSIONS = setOf(
    "txt", "md", "markdown", "json", "xml", "yaml", "yml", "log", "csv", "tsv",
    "js", "jsx", "ts", "tsx", "py", "java", "kt", "kts", "go", "rs", "c", "cpp",
    "h", "css", "sql", "sh", "rb", "php", "vue", "svelte",
)

private val MEDIA_PREVIEW_LANGUAGES = mapOf(
    "js" to "javascript",
    "jsx" to "jsx",
    "ts" to "typescript",
    "tsx" to "tsx",
    "py" to "python",
    "java" to "java",
    "kt" to "kotlin",
    "kts" to "kotlin",
    "go" to "go",
    "rs" to "rust",
    "c" to "c",
    "cpp" to "cpp",
    "h" to "c",
    "css" to "css",
    "sql" to "sql",
    "sh" to "bash",
    "rb" to "ruby",
    "php" to "php",
    "vue" to "vue",
    "svelte" to "svelte",
    "json" to "json",
    "xml" to "xml",
    "yaml" to "yaml",
    "yml" to "yaml",
    "csv" to "csv",
    "tsv" to "tsv",
    "txt" to "text",
    "log" to "text",
)

private const val MAX_PREVIEW_CHARS = 250_000
private const val PDF_RENDER_WIDTH = 1_080
private const val PDF_MAX_DIMENSION = 4_096
