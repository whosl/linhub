package com.linhub.android.ui

import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.ConversationPatch
import org.junit.Assert.assertEquals
import org.junit.Test

class ConversationPatchPolicyTest {
    @Test
    fun `失败时只恢复本次修改的字段`() {
        val previous = conversation(pinned = false, archived = false)
        val attempted = previous.copy(pinned = true)
        val current = attempted.copy(archived = true)

        val result = rollbackConversationPatch(
            current = current,
            previous = previous,
            attempted = attempted,
            patch = ConversationPatch(pinned = true),
        )

        assertEquals(false, result.pinned)
        assertEquals(true, result.archived)
    }

    @Test
    fun `旧请求失败不覆盖同字段的更新操作`() {
        val previous = conversation(pinned = false)
        val attempted = previous.copy(pinned = true)
        val current = attempted.copy(pinned = false)

        val result = rollbackConversationPatch(
            current = current,
            previous = previous,
            attempted = attempted,
            patch = ConversationPatch(pinned = true),
        )

        assertEquals(false, result.pinned)
    }

    @Test
    fun `移出项目失败恢复原项目并保留并发归档`() {
        val previous = conversation(projectId = "project-1", archived = false)
        val attempted = previous.copy(projectId = null)
        val current = attempted.copy(archived = true)

        val result = rollbackConversationPatch(
            current = current,
            previous = previous,
            attempted = attempted,
            patch = ConversationPatch(projectId = null, projectIdSpecified = true),
        )

        assertEquals("project-1", result.projectId)
        assertEquals(true, result.archived)
    }

    @Test
    fun `不属于失败请求的字段保持当前值`() {
        val previous = conversation(title = "旧标题", modelId = "model-1")
        val attempted = previous.copy(title = "新标题")
        val current = attempted.copy(modelId = "model-2")

        val result = rollbackConversationPatch(
            current = current,
            previous = previous,
            attempted = attempted,
            patch = ConversationPatch(title = "新标题"),
        )

        assertEquals("旧标题", result.title)
        assertEquals("model-2", result.modelId)
    }

    private fun conversation(
        title: String = "会话",
        projectId: String? = null,
        modelId: String? = null,
        pinned: Boolean = false,
        archived: Boolean = false,
    ) = Conversation(
        id = "conversation-1",
        title = title,
        projectId = projectId,
        modelId = modelId,
        pinned = pinned,
        archived = archived,
        currentLeafId = "message-1",
        createdAt = "2026-07-11T00:00:00.000Z",
        updatedAt = "2026-07-11T00:00:00.000Z",
    )
}
