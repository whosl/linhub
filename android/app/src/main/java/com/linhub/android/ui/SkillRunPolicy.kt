package com.linhub.android.ui

import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.SkillRunSnapshot
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

data class SkillRunCardUiState(
    val snapshot: SkillRunSnapshot? = null,
    val loading: Boolean = false,
    val mutating: Boolean = false,
    val error: String? = null,
)

/** 每张卡只观察自己的 runId；其他任务的高频进度不会触发这条 Flow。 */
internal fun Flow<Map<String, SkillRunCardUiState>>.selectSkillRunCardState(
    id: String,
): Flow<SkillRunCardUiState> = map { states -> states[id] ?: SkillRunCardUiState() }
    .distinctUntilChanged()

internal fun String?.isTerminalSkillRunStatus(): Boolean = this in setOf(
    "completed",
    "success",
    "failed",
    "error",
    "cancelled",
    "stopped",
)

internal fun isSettledSkillRun(status: String, receiptStatus: String): Boolean =
    status.isTerminalSkillRunStatus() && receiptStatus in setOf("completed", "failed")

internal fun normalizeSkillRunProgress(progress: Int, status: String): Int = when {
    status == "completed" || status == "success" -> 100
    progress < 0 -> 0
    progress > 100 -> 100
    else -> progress
}

internal fun nextSkillRunReconnectDelay(currentMillis: Long, maxMillis: Long): Long {
    if (maxMillis <= 0L) return 0L
    return (currentMillis.coerceAtLeast(1L) * 2L).coerceAtMost(maxMillis)
}

/** 缓存只能填补空状态；已经到达的网络快照永远优先，避免慢 Room 读取回写旧进度。 */
internal fun selectSkillRunSnapshot(
    expectedId: String,
    current: SkillRunSnapshot?,
    cached: SkillRunSnapshot?,
): SkillRunSnapshot? = when {
    current != null -> current
    cached?.id == expectedId -> cached
    else -> null
}

internal fun upsertSkillRunCompletionMessage(
    messages: List<ChatMessage>,
    incoming: ChatMessage,
): List<ChatMessage> {
    val index = messages.indexOfFirst { it.id == incoming.id }
    if (index < 0) return messages + incoming
    return messages.toMutableList().apply { set(index, incoming) }
}
