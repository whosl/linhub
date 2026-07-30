package com.linhub.android.ui

import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ThemeMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class WorkspaceShellPolicyTest {
    @Test
    fun `streaming chat changes do not invalidate app host`() {
        val initial = LinHubUiState(
            draft = "第一帧",
            quotedText = "引用",
            startingNewConversation = true,
        )

        repeat(100) { frame ->
            assertEquals(
                appHostState(initial),
                appHostState(
                    initial.copy(
                        draft = "流式帧 $frame",
                        quotedText = null,
                        startingNewConversation = false,
                    ),
                ),
            )
        }
    }

    @Test
    fun `global effects invalidate app host`() {
        val initial = LinHubUiState()

        assertNotEquals(
            appHostState(initial),
            appHostState(initial.copy(message = "操作完成")),
        )
        assertNotEquals(
            appHostState(initial),
            appHostState(initial.copy(pendingShareUrl = "https://example.com/share")),
        )
    }

    @Test
    fun `streaming chat changes do not invalidate workspace shell`() {
        val initial = LinHubUiState(
            draft = "第一帧",
            quotedText = "引用",
            message = null,
            startingNewConversation = true,
        )
        val streamingUpdate = initial.copy(
            draft = "第二帧",
            quotedText = null,
            message = "工具状态已更新",
            startingNewConversation = false,
        )

        assertEquals(workspaceShellState(initial), workspaceShellState(streamingUpdate))
    }

    @Test
    fun `drawer visible changes invalidate workspace shell`() {
        val initial = LinHubUiState()

        assertNotEquals(
            workspaceShellState(initial),
            workspaceShellState(initial.copy(destination = WorkspaceDestination.Billing)),
        )
        assertNotEquals(
            workspaceShellState(initial),
            workspaceShellState(initial.copy(selectedConversationId = "conversation-1")),
        )
        assertNotEquals(
            workspaceShellState(initial),
            workspaceShellState(
                initial.copy(
                    themeMode = ThemeMode.DARK,
                    fontSizePreset = FontSizePreset.LARGE,
                ),
            ),
        )
    }

    @Test
    fun `one hundred streaming frames keep an equal workspace shell projection`() {
        val initial = LinHubUiState()
        repeat(100) { frame ->
            assertEquals(
                workspaceShellState(initial),
                workspaceShellState(
                    initial.copy(
                        draft = "流式帧 $frame",
                        message = "工具事件 $frame",
                    ),
                ),
            )
        }
    }
}
