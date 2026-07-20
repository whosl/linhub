package com.linhub.android.ui

import com.linhub.android.core.model.KnowledgeDocument
import java.time.Duration
import java.time.Instant

internal enum class KnowledgeDocumentTone {
    Success,
    Warning,
    Error,
}

internal data class KnowledgeDocumentPresentation(
    val metadata: String,
    val statusLabel: String,
    val tone: KnowledgeDocumentTone,
)

internal fun knowledgeDocumentPresentation(
    document: KnowledgeDocument,
    now: Instant = Instant.now(),
): KnowledgeDocumentPresentation {
    val tone = when (document.status) {
        "ready" -> KnowledgeDocumentTone.Success
        "processing" -> KnowledgeDocumentTone.Warning
        else -> KnowledgeDocumentTone.Error
    }
    val metadata = buildList {
        add(formatKnowledgeBytes(document.size))
        formatKnowledgeRelativeTime(document.createdAt, now)?.let(::add)
        when (tone) {
            KnowledgeDocumentTone.Success -> add("${document.chunkCount} 个片段")
            KnowledgeDocumentTone.Error -> document.errorMessage
                ?.trim()
                ?.takeIf(String::isNotEmpty)
                ?.let(::add)
            KnowledgeDocumentTone.Warning -> Unit
        }
    }.joinToString(" · ")
    return KnowledgeDocumentPresentation(
        metadata = metadata,
        statusLabel = when (tone) {
            KnowledgeDocumentTone.Success -> "就绪"
            KnowledgeDocumentTone.Warning -> "解析中"
            KnowledgeDocumentTone.Error -> "解析失败"
        },
        tone = tone,
    )
}

private fun formatKnowledgeBytes(size: Long): String = when {
    size >= 1024L * 1024L -> formatKnowledgeTenths(size * 10 / (1024L * 1024L), "MB")
    size >= 1024L -> formatKnowledgeTenths(size * 10 / 1024L, "KB")
    else -> "$size B"
}

private fun formatKnowledgeTenths(value: Long, unit: String): String =
    "${value / 10}.${value % 10} $unit"

private fun formatKnowledgeRelativeTime(value: String, now: Instant): String? = runCatching {
    val elapsedSeconds = Duration.between(Instant.parse(value), now).seconds.coerceAtLeast(0L)
    when {
        elapsedSeconds < 60L -> "刚刚"
        elapsedSeconds < 3_600L -> "${elapsedSeconds / 60L} 分钟前"
        elapsedSeconds < 86_400L -> "${elapsedSeconds / 3_600L} 小时前"
        elapsedSeconds < 2_592_000L -> "${elapsedSeconds / 86_400L} 天前"
        elapsedSeconds < 31_536_000L -> "${elapsedSeconds / 2_592_000L} 个月前"
        else -> "${elapsedSeconds / 31_536_000L} 年前"
    }
}.getOrNull()
