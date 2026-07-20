package com.linhub.android.ui

import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.ConversationPatch

/**
 * 只撤销失败请求仍然拥有的字段，避免并发会话操作互相覆盖。
 *
 * 例如置顶与归档并行时，置顶失败不能把已经成功的归档状态一并恢复成旧值；
 * 同一字段连续切换时，旧请求失败也不能覆盖更新请求的结果。
 */
internal fun rollbackConversationPatch(
    current: Conversation,
    previous: Conversation,
    attempted: Conversation,
    patch: ConversationPatch,
): Conversation {
    var next = current
    if (patch.title != null && current.title == attempted.title) {
        next = next.copy(title = previous.title)
    }
    if (patch.pinned != null && current.pinned == attempted.pinned) {
        next = next.copy(pinned = previous.pinned)
    }
    if (patch.archived != null && current.archived == attempted.archived) {
        next = next.copy(archived = previous.archived)
    }
    if (patch.currentLeafId != null && current.currentLeafId == attempted.currentLeafId) {
        next = next.copy(currentLeafId = previous.currentLeafId)
    }
    if (patch.modelId != null && current.modelId == attempted.modelId) {
        next = next.copy(modelId = previous.modelId)
    }
    if (patch.projectIdSpecified && current.projectId == attempted.projectId) {
        next = next.copy(projectId = previous.projectId)
    }
    return next
}
