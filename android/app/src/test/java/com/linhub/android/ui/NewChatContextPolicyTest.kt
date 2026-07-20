package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class NewChatContextPolicyTest {
    private val projects = setOf("project-a", "project-b")

    @Test
    fun `project empty state header starts a temporary chat`() {
        assertEquals(
            HeaderNewChatContext(temporaryProjectChat = true),
            resolveHeaderNewChatContext(
                hasSelectedConversation = false,
                selectedConversationProjectId = null,
                pendingProjectId = "project-a",
                availableProjectIds = projects,
            ),
        )
    }

    @Test
    fun `existing project conversation header preserves project context`() {
        assertEquals(
            HeaderNewChatContext(projectId = "project-b"),
            resolveHeaderNewChatContext(
                hasSelectedConversation = true,
                selectedConversationProjectId = "project-b",
                pendingProjectId = null,
                availableProjectIds = projects,
            ),
        )
    }

    @Test
    fun `missing project falls back to a normal chat`() {
        assertEquals(
            HeaderNewChatContext(),
            resolveHeaderNewChatContext(
                hasSelectedConversation = false,
                selectedConversationProjectId = null,
                pendingProjectId = "deleted-project",
                availableProjectIds = projects,
            ),
        )
    }
}
