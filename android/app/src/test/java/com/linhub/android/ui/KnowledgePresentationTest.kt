package com.linhub.android.ui

import com.linhub.android.core.model.KnowledgeDocument
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class KnowledgePresentationTest {
    private val now = Instant.parse("2026-07-13T12:00:00Z")

    @Test
    fun `就绪文档显示体积相对时间片段数和成功状态`() {
        assertEquals(
            KnowledgeDocumentPresentation(
                metadata = "4.0 MB · 15 天前 · 220 个片段",
                statusLabel = "就绪",
                tone = KnowledgeDocumentTone.Success,
            ),
            knowledgeDocumentPresentation(
                document(status = "ready", size = 4L * 1024L * 1024L, chunks = 220),
                now,
            ),
        )
    }

    @Test
    fun `解析中文档不提前宣称片段数`() {
        assertEquals(
            KnowledgeDocumentPresentation(
                metadata = "152.3 KB · 2 小时前",
                statusLabel = "解析中",
                tone = KnowledgeDocumentTone.Warning,
            ),
            knowledgeDocumentPresentation(
                document(
                    status = "processing",
                    size = 156_000,
                    chunks = 99,
                    createdAt = "2026-07-13T10:00:00Z",
                ),
                now,
            ),
        )
    }

    @Test
    fun `失败文档保留服务端错误并显示失败状态`() {
        assertEquals(
            KnowledgeDocumentPresentation(
                metadata = "8.0 KB · 刚刚 · 文档没有可提取文本",
                statusLabel = "解析失败",
                tone = KnowledgeDocumentTone.Error,
            ),
            knowledgeDocumentPresentation(
                document(
                    status = "error",
                    size = 8_192,
                    chunks = 0,
                    createdAt = "2026-07-13T12:00:00Z",
                    error = "文档没有可提取文本",
                ),
                now,
            ),
        )
    }

    private fun document(
        status: String,
        size: Long,
        chunks: Int,
        createdAt: String = "2026-06-28T12:00:00Z",
        error: String? = null,
    ) = KnowledgeDocument(
        id = "doc-1",
        knowledgeBaseId = "kb-1",
        name = "参考资料.pdf",
        mimeType = "application/pdf",
        size = size,
        status = status,
        chunkCount = chunks,
        errorMessage = error,
        createdAt = createdAt,
    )
}
