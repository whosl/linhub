package com.linhub.android.ui

import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.SkillRunSnapshot
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SkillRunPolicyTest {
    @Test
    fun terminalStatusesMatchDurableRunContract() {
        listOf("completed", "success", "failed", "error", "cancelled", "stopped")
            .forEach { assertTrue(it.isTerminalSkillRunStatus()) }
        listOf("queued", "running", "waiting_input", null)
            .forEach { assertFalse(it.isTerminalSkillRunStatus()) }
    }

    @Test
    fun progressIsClampedAndCompletionWins() {
        assertEquals(0, normalizeSkillRunProgress(-1, "running"))
        assertEquals(42, normalizeSkillRunProgress(42, "running"))
        assertEquals(100, normalizeSkillRunProgress(120, "running"))
        assertEquals(100, normalizeSkillRunProgress(25, "completed"))
    }

    @Test
    fun terminalRunKeepsPollingUntilCompletionReceiptSettles() {
        assertFalse(isSettledSkillRun("completed", "pending"))
        assertFalse(isSettledSkillRun("failed", "generating"))
        assertTrue(isSettledSkillRun("completed", "completed"))
        assertTrue(isSettledSkillRun("cancelled", "failed"))
    }

    @Test
    fun streamReconnectBackoffIsBounded() {
        assertEquals(1_500L, nextSkillRunReconnectDelay(750L, 10_000L))
        assertEquals(10_000L, nextSkillRunReconnectDelay(8_000L, 10_000L))
        assertEquals(0L, nextSkillRunReconnectDelay(750L, 0L))
    }

    @Test
    fun cachedSnapshotOnlyFillsAnEmptyMatchingRun() {
        val cached = runSnapshot("run-1", progress = 25)
        val live = runSnapshot("run-1", progress = 80)

        assertEquals(cached, selectSkillRunSnapshot("run-1", null, cached))
        assertEquals(live, selectSkillRunSnapshot("run-1", live, cached))
        assertEquals(null, selectSkillRunSnapshot("run-2", null, cached))
    }

    @Test
    fun perRunStateFlowIgnoresUnrelatedTaskUpdates() = runBlocking {
        val source = MutableStateFlow<Map<String, SkillRunCardUiState>>(emptyMap())
        val observed = async(start = CoroutineStart.UNDISPATCHED) {
            source.selectSkillRunCardState("run-1").take(2).toList()
        }

        source.value = mapOf(
            "run-2" to SkillRunCardUiState(snapshot = runSnapshot("run-2", 40)),
        )
        val target = SkillRunCardUiState(snapshot = runSnapshot("run-1", 60))
        source.value = source.value + ("run-1" to target)

        assertEquals(listOf(SkillRunCardUiState(), target), observed.await())
    }

    @Test
    fun completionMessageIsIdempotentlyUpserted() {
        val original = message("receipt", "旧内容")
        val updated = message("receipt", "新内容")
        val other = message("other", "保留")
        assertEquals(
            listOf(updated, other),
            upsertSkillRunCompletionMessage(listOf(original, other), updated),
        )
        assertEquals(
            listOf(other, updated),
            upsertSkillRunCompletionMessage(listOf(other), updated),
        )
    }

    private fun message(id: String, text: String) = ChatMessage(
        id = id,
        conversationId = "conversation",
        role = "assistant",
        parts = emptyList(),
        createdAt = text,
    )

    private fun runSnapshot(id: String, progress: Int) = SkillRunSnapshot(
        id = id,
        conversationId = "conversation",
        kind = "deep-research",
        skillName = "深度调研",
        status = "running",
        stageLabel = "执行中",
        progress = progress,
        createdAt = "2026-07-23T00:00:00Z",
        updatedAt = "2026-07-23T00:00:01Z",
    )
}
