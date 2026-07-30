package com.linhub.android.ui

import com.linhub.android.core.model.MediaAsset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaPreviewPolicyTest {
    @Test
    fun `PDF 即使已有抽取文本也会下载原文件用于逐页渲染`() {
        assertTrue(asset("report.pdf", "application/pdf", "已抽取").needsPreviewBytes())
        assertTrue(asset("report.pdf", "application/octet-stream", "已抽取").needsPreviewBytes())
    }

    @Test
    fun `文本已有抽取内容时不重复下载`() {
        assertFalse(asset("notes.md", "text/markdown", "# 标题").needsPreviewBytes())
        assertTrue(asset("notes.md", "text/markdown", null).needsPreviewBytes())
    }

    @Test
    fun `轻量列表中的 Office 正文只在打开时读取元数据`() {
        val office = asset(
            "large-report.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            null,
            extractedTextAvailable = true,
        )

        assertTrue(office.needsPreviewMetadata())
        assertFalse(office.needsPreviewBytes())
    }

    @Test
    fun `PDF 仍优先逐页渲染而不是加载提取文本`() {
        val pdf = asset(
            "report.pdf",
            "application/pdf",
            null,
            extractedTextAvailable = true,
        )

        assertTrue(pdf.needsPreviewBytes())
        assertFalse(pdf.needsPreviewMetadata())
    }

    @Test
    fun `图片继续交给鉴权图片加载器`() {
        assertFalse(asset("photo.png", "image/png", null).needsPreviewBytes())
    }

    @Test
    fun `原始文本预览语言与 Web 代码块映射一致`() {
        assertEquals("kotlin", mediaPreviewLanguage(asset("Main.kt", "text/plain", "fun main() {}")))
        assertEquals("typescript", mediaPreviewLanguage(asset("types.ts", "text/plain", "type A = 1")))
        assertEquals("python", mediaPreviewLanguage(asset("run.py", "text/plain", "print(1)")))
        assertEquals("text", mediaPreviewLanguage(asset("README", "text/plain", "plain")))
    }

    private fun asset(
        name: String,
        mimeType: String,
        extractedText: String?,
        extractedTextAvailable: Boolean = false,
    ) = MediaAsset(
        id = "asset-test",
        ownerId = "user-test",
        kind = "upload",
        name = name,
        mimeType = mimeType,
        size = 128,
        url = "/api/media/asset-test",
        extractedTextAvailable = extractedTextAvailable,
        extractedText = extractedText,
        createdAt = "2026-07-11T00:00:00.000Z",
    )
}
