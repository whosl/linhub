package com.linhub.android.ui

import com.linhub.android.core.model.UploadedAttachment
import com.linhub.android.data.ChatTranscript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class SendFailurePolicyTest {
    @Test
    fun `unaccepted first send restores text quote and attachments`() {
        val attachment = attachment("att-1")
        val result = restoreUnacceptedSend(
            current = LinHubUiState(
                startingNewConversation = true,
                transcripts = mapOf(NEW_CHAT_KEY to ChatTranscript(error = "连接失败")),
            ),
            attemptedDraft = "不要丢失这条消息",
            attemptedQuote = "引用内容",
            attemptedAttachments = listOf(attachment),
            error = "连接失败",
        )

        assertEquals("不要丢失这条消息", result.draft)
        assertEquals("引用内容", result.quotedText)
        assertEquals(listOf(attachment), result.pendingAttachments)
        assertEquals("连接失败", result.message)
        assertFalse(result.startingNewConversation)
    }

    @Test
    fun `draft typed while connecting is preserved after attempted text`() {
        val attachment = attachment("att-1")
        val result = restoreUnacceptedSend(
            current = LinHubUiState(
                draft = "连接期间输入的新草稿",
                pendingAttachments = listOf(attachment),
                startingNewConversation = true,
            ),
            attemptedDraft = "原始发送内容",
            attemptedQuote = null,
            attemptedAttachments = listOf(attachment),
            error = "连接失败",
        )

        assertEquals("原始发送内容\n\n连接期间输入的新草稿", result.draft)
        assertEquals(1, result.pendingAttachments.size)
    }

    private fun attachment(id: String) = UploadedAttachment(
        id = id,
        name = "e2e.txt",
        mimeType = "text/plain",
        size = 8,
        createdAt = "2026-07-11T00:00:00Z",
    )
}
