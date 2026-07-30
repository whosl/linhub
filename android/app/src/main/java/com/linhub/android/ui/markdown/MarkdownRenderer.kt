package com.linhub.android.ui.markdown

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import com.linhub.android.ui.Checkbox
import com.linhub.android.ui.CircularProgressIndicator
import com.linhub.android.ui.Surface
import com.linhub.android.ui.HorizontalDivider
import com.linhub.android.ui.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.linhub.android.ui.ArtifactSandboxRunner
import java.io.ByteArrayInputStream
import kotlinx.coroutines.delay

@Composable
fun MarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
    onLink: (String) -> Unit = {},
    onCopyCode: ((String) -> Unit)? = null,
) {
    val document = remember(markdown) { MarkdownEngine.parse(markdown) }
    if (document.canRenderAsCompactText()) {
        CompactMarkdownText(document, modifier, onLink)
        return
    }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        document.blocks.forEachIndexed { index, block ->
            MarkdownBlockView(
                block = block,
                key = index.toString(),
                onLink = onLink,
                onCopyCode = onCopyCode,
            )
        }
    }
}

/**
 * 常见模型回复通常只包含标题、段落和一层普通列表。把这些内容合并成单个 Text，
 * 可以显著减少长会话滚动时首次组合、测量和绘制的节点数；代码、表格、任务列表、
 * 公式等需要独立交互或布局的块仍使用完整渲染器。
 */
@Composable
private fun CompactMarkdownText(
    document: MarkdownDocument,
    modifier: Modifier,
    onLink: (String) -> Unit,
) {
    val typography = MaterialTheme.typography
    val bodyStyle = typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 26.sp)
    val linkColor = MaterialTheme.colorScheme.primary
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant
    val annotated = remember(document, typography, linkColor, codeBackground, onLink) {
        buildAnnotatedString {
            document.blocks.forEachIndexed { blockIndex, block ->
                if (blockIndex > 0) {
                    append("\n")
                    withStyle(SpanStyle(fontSize = 6.sp)) { append("\n") }
                }
                when (block) {
                    is MarkdownBlock.Paragraph -> appendCompactParagraph(
                        style = bodyStyle,
                        content = block.content,
                        linkColor = linkColor,
                        codeBackground = codeBackground,
                        onLink = onLink,
                    )
                    is MarkdownBlock.Heading -> appendCompactParagraph(
                        style = when (block.level) {
                            1 -> typography.headlineMedium.copy(
                                fontFamily = FontFamily.Default,
                                fontSize = 24.sp,
                                lineHeight = 31.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            2 -> typography.titleLarge.copy(
                                fontSize = 20.sp,
                                lineHeight = 28.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            3 -> typography.titleMedium.copy(
                                fontSize = 18.sp,
                                lineHeight = 25.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            else -> typography.titleSmall.copy(
                                fontSize = 16.sp,
                                lineHeight = 23.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        },
                        content = block.content,
                        linkColor = linkColor,
                        codeBackground = codeBackground,
                        onLink = onLink,
                    )
                    is MarkdownBlock.ListBlock -> block.items.forEachIndexed { itemIndex, item ->
                        if (itemIndex > 0) append("\n")
                        append(if (block.ordered) "${block.startNumber + itemIndex}. " else "• ")
                        appendInlines(
                            content = (item.single() as MarkdownBlock.Paragraph).content,
                            linkColor = linkColor,
                            codeBackground = codeBackground,
                            onLink = onLink,
                        )
                    }
                    else -> error("不支持压缩渲染的 Markdown 块：${block::class.simpleName}")
                }
            }
        }
    }
    Text(
        text = annotated,
        modifier = modifier.fillMaxWidth(),
        style = bodyStyle,
    )
}

private fun MarkdownDocument.canRenderAsCompactText(): Boolean =
    blocks.size > 1 && blocks.all { block ->
        when (block) {
            is MarkdownBlock.Paragraph,
            is MarkdownBlock.Heading,
            -> true
            is MarkdownBlock.ListBlock -> block.items.all { item ->
                item.size == 1 &&
                    item.single() is MarkdownBlock.Paragraph &&
                    item.asTaskListItem() == null
            }
            else -> false
        }
    }

private fun AnnotatedString.Builder.appendCompactParagraph(
    style: TextStyle,
    content: List<MarkdownInline>,
    linkColor: Color,
    codeBackground: Color,
    onLink: (String) -> Unit,
) {
    withStyle(
        SpanStyle(
            color = style.color,
            fontSize = style.fontSize,
            fontWeight = style.fontWeight,
            fontStyle = style.fontStyle,
            fontFamily = style.fontFamily,
            letterSpacing = style.letterSpacing,
        ),
    ) {
        appendInlines(content, linkColor, codeBackground, onLink)
    }
}

@Composable
private fun MarkdownBlockView(
    block: MarkdownBlock,
    key: String,
    onLink: (String) -> Unit,
    onCopyCode: ((String) -> Unit)?,
) {
    when (block) {
        is MarkdownBlock.Paragraph -> InlineText(block.content, onLink)
        is MarkdownBlock.Heading -> InlineText(
            content = block.content,
            onLink = onLink,
            style = when (block.level) {
                1 -> MaterialTheme.typography.headlineMedium.copy(
                    fontFamily = FontFamily.Default,
                    fontSize = 24.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                2 -> MaterialTheme.typography.titleLarge.copy(
                    fontSize = 20.sp,
                    lineHeight = 28.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                3 -> MaterialTheme.typography.titleMedium.copy(
                    fontSize = 18.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                else -> MaterialTheme.typography.titleSmall.copy(
                    fontSize = 16.sp,
                    lineHeight = 23.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            },
        )
        is MarkdownBlock.Code -> if (block.language.equals("mermaid", ignoreCase = true)) {
            MermaidBlock(block.literal)
        } else {
            MarkdownCodeBlock(block, onCopyCode)
        }
        is MarkdownBlock.Quote -> QuoteBlock(block, key, onLink, onCopyCode)
        is MarkdownBlock.ListBlock -> ListBlock(block, key, onLink, onCopyCode)
        is MarkdownBlock.Table -> TableBlock(block, onLink)
        is MarkdownBlock.Math -> KatexBlock(block.latex)
        is MarkdownBlock.Footnotes -> FootnotesBlock(block, key, onLink, onCopyCode)
        MarkdownBlock.Divider -> HorizontalDivider()
    }
}

@Composable
private fun InlineText(
    content: List<MarkdownInline>,
    onLink: (String) -> Unit,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyLarge.copy(
        fontSize = 15.sp,
        lineHeight = 26.sp,
    ),
) {
    val linkColor = MaterialTheme.colorScheme.primary
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant
    val annotated = remember(content, linkColor, codeBackground, onLink) {
        buildAnnotatedString {
            appendInlines(content, linkColor, codeBackground, onLink)
        }
    }
    Text(text = annotated, style = style)
}

private fun AnnotatedString.Builder.appendInlines(
    content: List<MarkdownInline>,
    linkColor: Color,
    codeBackground: Color,
    onLink: (String) -> Unit,
) {
    content.forEach { inline ->
        when (inline) {
            is MarkdownInline.Text -> append(inline.value)
            is MarkdownInline.Raw -> append(inline.value)
            is MarkdownInline.Code -> withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    background = codeBackground,
                ),
            ) { append(inline.value) }
            is MarkdownInline.Emphasis -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                appendInlines(inline.content, linkColor, codeBackground, onLink)
            }
            is MarkdownInline.Strong -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                appendInlines(inline.content, linkColor, codeBackground, onLink)
            }
            is MarkdownInline.Strike -> withStyle(
                SpanStyle(textDecoration = TextDecoration.LineThrough),
            ) { appendInlines(inline.content, linkColor, codeBackground, onLink) }
            is MarkdownInline.Link -> withLink(
                LinkAnnotation.Url(
                    url = normalizeAutolinkDestination(inline.destination),
                    styles = TextLinkStyles(
                        style = SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline),
                    ),
                    linkInteractionListener = LinkInteractionListener {
                        onLink(normalizeAutolinkDestination(inline.destination))
                    },
                ),
            ) { appendInlines(inline.content, linkColor, codeBackground, onLink) }
            is MarkdownInline.Image -> withLink(
                LinkAnnotation.Url(
                    url = inline.destination,
                    styles = TextLinkStyles(style = SpanStyle(color = linkColor)),
                    linkInteractionListener = LinkInteractionListener { onLink(inline.destination) },
                ),
            ) {
                append("[")
                appendInlines(inline.description, linkColor, codeBackground, onLink)
                append("]")
            }
            is MarkdownInline.Math -> withStyle(
                SpanStyle(
                    fontFamily = FontFamily.Serif,
                    fontStyle = FontStyle.Italic,
                    color = linkColor,
                ),
            ) {
                append(LatexUnicodeFormatter.format(inline.latex))
            }
            is MarkdownInline.Footnote -> withStyle(
                SpanStyle(
                    color = linkColor,
                    fontWeight = FontWeight.SemiBold,
                    baselineShift = BaselineShift.Superscript,
                ),
            ) { append("[${inline.label}]") }
            MarkdownInline.SoftBreak -> append("\n")
            MarkdownInline.HardBreak -> append("\n")
        }
    }
}

@Composable
internal fun MarkdownCodeBlock(
    block: MarkdownBlock.Code,
    onCopyCode: ((String) -> Unit)?,
    showRunButton: Boolean = true,
) {
    val source = remember(block.literal) { block.literal.trimEnd() }
    val languageLabel = block.language?.takeIf(String::isNotBlank) ?: "text"
    val runLanguage = markdownRunnableLanguage(block.language).takeIf { showRunButton }
    val lineCount = remember(source) { markdownCodeLineCount(source) }
    val collapsible = lineCount > CODE_COLLAPSE_THRESHOLD_LINES
    var collapsed by remember(source) { mutableStateOf(collapsible) }
    var copied by remember(source) { mutableStateOf(false) }
    var running by remember(source) { mutableStateOf(false) }
    var runRequest by remember(source) { mutableStateOf(0) }
    var runOutput by remember(source) { mutableStateOf<String?>(null) }
    var showHtmlPreview by remember(source) { mutableStateOf(false) }
    val keywordColor = MaterialTheme.colorScheme.primary
    val stringColor = MaterialTheme.colorScheme.tertiary
    val numberColor = MaterialTheme.colorScheme.secondary
    val commentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f)
    val highlightedCode = remember(
        block.language,
        block.literal,
        keywordColor,
        stringColor,
        numberColor,
        commentColor,
    ) {
        buildAnnotatedString {
            append(source)
            CodeSyntaxHighlighter.highlight(block.language, source).forEach { token ->
                val style = when (token.kind) {
                    SyntaxTokenKind.Keyword -> SpanStyle(
                        color = keywordColor,
                        fontWeight = FontWeight.SemiBold,
                    )
                    SyntaxTokenKind.String -> SpanStyle(color = stringColor)
                    SyntaxTokenKind.Number -> SpanStyle(color = numberColor)
                    SyntaxTokenKind.Comment -> SpanStyle(
                        color = commentColor,
                        fontStyle = FontStyle.Italic,
                    )
                }
                addStyle(style, token.start, token.endExclusive)
            }
        }
    }
    LaunchedEffect(copied) {
        if (copied) {
            delay(1_500)
            copied = false
        }
    }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.animateContentSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(36.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                    .padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    languageLabel,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (runLanguage != null) {
                    Row(
                        modifier = Modifier
                            .clickable(
                                enabled = !running,
                                role = Role.Button,
                            ) {
                                if (runLanguage == "html") {
                                    showHtmlPreview = !showHtmlPreview
                                } else {
                                    runOutput = null
                                    running = true
                                    runRequest += 1
                                }
                            }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (running) {
                            CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp)
                        } else {
                            Icon(
                                Icons.Rounded.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(13.dp),
                            )
                        }
                        Text(
                            if (runLanguage == "html") {
                                if (showHtmlPreview) "收起预览" else "预览"
                            } else {
                                "运行"
                            },
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (onCopyCode != null) {
                    Row(
                        modifier = Modifier
                            .clickable(role = Role.Button) {
                                onCopyCode(block.literal)
                                copied = true
                            }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                            contentDescription = if (copied) "已复制代码" else "复制代码",
                            modifier = Modifier.size(13.dp),
                            tint = if (copied) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                        Text(
                            if (copied) "已复制" else "复制",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(
                        if (collapsed) {
                            Modifier
                                .heightIn(max = CODE_COLLAPSED_MAX_HEIGHT)
                                .clipToBounds()
                        } else {
                            Modifier
                        },
                    ),
            ) {
                Text(
                    text = highlightedCode,
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(14.dp),
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        lineHeight = 21.sp,
                    ),
                )
            }
            AnimatedVisibility(showHtmlPreview && runLanguage == "html") {
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    HtmlCodePreview(source)
                }
            }
            runOutput?.let { output ->
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .padding(start = 14.dp, end = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "输出",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        IconButton(
                            onClick = { runOutput = null },
                            modifier = Modifier.size(32.dp),
                        ) {
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = "关闭运行输出",
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                    androidx.compose.foundation.text.selection.SelectionContainer {
                        Text(
                            output,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 224.dp)
                                .verticalScroll(rememberScrollState())
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 12.sp,
                                lineHeight = 19.sp,
                            ),
                        )
                    }
                }
            }
            if (collapsible) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { collapsed = !collapsed }
                        .padding(vertical = 7.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = null,
                        modifier = Modifier
                            .size(14.dp)
                            .then(
                                if (!collapsed) {
                                    Modifier.graphicsLayer { rotationZ = 180f }
                                } else {
                                    Modifier
                                },
                            ),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        if (collapsed) "展开全部 $lineCount 行" else "收起",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (running && runLanguage != null && runLanguage != "html") {
                key(runRequest) {
                    ArtifactSandboxRunner(
                        code = source,
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

internal fun markdownRunnableLanguage(raw: String?): String? = when (raw?.trim()?.lowercase()) {
    "python", "py" -> "python"
    "javascript", "js" -> "javascript"
    "html" -> "html"
    else -> null
}

internal fun markdownCodeLineCount(source: String): Int =
    if (source.isEmpty()) 1 else source.count { it == '\n' } + 1

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HtmlCodePreview(source: String) {
    AndroidView(
        modifier = Modifier
            .fillMaxWidth()
            .height(288.dp),
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(AndroidColor.WHITE)
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
                    ): WebResourceResponse = blockedPreviewResource()
                }
            }
        },
        update = { webView ->
            if (webView.tag != source) {
                webView.tag = source
                webView.loadDataWithBaseURL(
                    "https://preview.invalid/",
                    source,
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

private fun blockedPreviewResource(): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "UTF-8",
    ByteArrayInputStream(ByteArray(0)),
)

private const val CODE_COLLAPSE_THRESHOLD_LINES = 24
private val CODE_COLLAPSED_MAX_HEIGHT = 430.dp

@Composable
private fun QuoteBlock(
    quote: MarkdownBlock.Quote,
    key: String,
    onLink: (String) -> Unit,
    onCopyCode: ((String) -> Unit)?,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min),
    ) {
        Box(
            Modifier
                .width(3.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp)),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            quote.blocks.forEachIndexed { index, child ->
                MarkdownBlockView(child, "$key-q$index", onLink, onCopyCode)
            }
        }
    }
}

@Composable
private fun ListBlock(
    list: MarkdownBlock.ListBlock,
    key: String,
    onLink: (String) -> Unit,
    onCopyCode: ((String) -> Unit)?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        list.items.forEachIndexed { index, item ->
            val task = item.asTaskListItem()
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                if (task != null) {
                    Checkbox(
                        checked = task.checked,
                        onCheckedChange = null,
                        modifier = Modifier.width(28.dp),
                    )
                } else {
                    Text(
                        if (list.ordered) "${list.startNumber + index}." else "•",
                        modifier = Modifier.width(28.dp),
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontSize = 15.sp,
                            lineHeight = 26.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    (task?.blocks ?: item).forEachIndexed { blockIndex, child ->
                        MarkdownBlockView(child, "$key-$index-$blockIndex", onLink, onCopyCode)
                    }
                }
            }
        }
    }
}

private data class TaskListItem(
    val checked: Boolean,
    val blocks: List<MarkdownBlock>,
)

private fun List<MarkdownBlock>.asTaskListItem(): TaskListItem? {
    val paragraph = firstOrNull() as? MarkdownBlock.Paragraph ?: return null
    val firstInline = paragraph.content.firstOrNull() as? MarkdownInline.Text ?: return null
    val match = Regex("^\\[([ xX])]\\s+").find(firstInline.value) ?: return null
    val remaining = firstInline.value.removeRange(match.range)
    val content = buildList {
        if (remaining.isNotEmpty()) add(MarkdownInline.Text(remaining))
        addAll(paragraph.content.drop(1))
    }
    val updatedParagraph = paragraph.copy(content = content)
    return TaskListItem(
        checked = match.groupValues[1].equals("x", ignoreCase = true),
        blocks = listOf(updatedParagraph) + drop(1),
    )
}

@Composable
private fun FootnotesBlock(
    footnotes: MarkdownBlock.Footnotes,
    key: String,
    onLink: (String) -> Unit,
    onCopyCode: ((String) -> Unit)?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider()
        Text(
            "脚注",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        footnotes.entries.forEachIndexed { index, entry ->
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Text(
                    "[${entry.label}]",
                    modifier = Modifier.width(36.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    entry.blocks.forEachIndexed { blockIndex, block ->
                        MarkdownBlockView(
                            block,
                            "$key-footnote-$index-$blockIndex",
                            onLink,
                            onCopyCode,
                        )
                    }
                }
            }
        }
    }
}

private fun normalizeAutolinkDestination(destination: String): String {
    val boundary = AUTOLINK_BOUNDARIES.asSequence()
        .map(destination::indexOf)
        .filter { it >= 0 }
        .minOrNull()
    val trimmed = boundary?.let(destination::take) ?: destination
    return trimmed.trimEnd(')', ',', '.', ';', '!', '?')
}

private val AUTOLINK_BOUNDARIES = listOf(
    "%EF%BC%89",
    "%EF%BC%8C",
    "%E3%80%82",
    "%EF%BC%9B",
    "%EF%BC%9A",
    "）",
    "，",
    "。",
    "；",
    "：",
)

@Composable
private fun TableBlock(table: MarkdownBlock.Table, onLink: (String) -> Unit) {
    val columnCount = maxOf(table.header.size, table.rows.maxOfOrNull(List<List<MarkdownInline>>::size) ?: 0)
    if (columnCount == 0) return
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val cellWidth = maxOf(128.dp, maxWidth / columnCount)
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            color = Color.Transparent,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
            ) {
                if (table.header.isNotEmpty()) {
                    TableRow(
                        cells = table.header,
                        columnCount = columnCount,
                        cellWidth = cellWidth,
                        onLink = onLink,
                        header = true,
                    )
                    if (table.rows.isNotEmpty()) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
                table.rows.forEachIndexed { index, row ->
                    TableRow(
                        cells = row,
                        columnCount = columnCount,
                        cellWidth = cellWidth,
                        onLink = onLink,
                        header = false,
                    )
                    if (index < table.rows.lastIndex) {
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun TableRow(
    cells: List<List<MarkdownInline>>,
    columnCount: Int,
    cellWidth: androidx.compose.ui.unit.Dp,
    onLink: (String) -> Unit,
    header: Boolean,
) {
    Row(
        modifier = if (header) {
            Modifier.background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
        } else {
            Modifier
        },
    ) {
        repeat(columnCount) { index ->
            Box(
                modifier = Modifier
                    .width(cellWidth)
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                val content = cells.getOrNull(index).orEmpty()
                InlineText(
                    content = if (header) {
                        listOf(MarkdownInline.Strong(content))
                    } else {
                        content
                    },
                    onLink = onLink,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontSize = 14.sp,
                        lineHeight = 21.sp,
                    ),
                )
            }
        }
    }
}
