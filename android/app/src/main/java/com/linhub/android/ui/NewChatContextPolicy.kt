package com.linhub.android.ui

internal data class HeaderNewChatContext(
    val projectId: String? = null,
    val temporaryProjectChat: Boolean = false,
)

/** 与 Web ChatHeader 一致：项目空状态的加号用于退出项目，其余项目会话的加号继承项目。 */
internal fun resolveHeaderNewChatContext(
    hasSelectedConversation: Boolean,
    selectedConversationProjectId: String?,
    pendingProjectId: String?,
    availableProjectIds: Set<String>,
): HeaderNewChatContext = when {
    !hasSelectedConversation && pendingProjectId in availableProjectIds -> {
        HeaderNewChatContext(temporaryProjectChat = true)
    }
    hasSelectedConversation && selectedConversationProjectId in availableProjectIds -> {
        HeaderNewChatContext(projectId = selectedConversationProjectId)
    }
    else -> HeaderNewChatContext()
}
