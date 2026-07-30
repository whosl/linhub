package com.linhub.android.ui

import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.McpServer

internal data class ResolvedStyleSelection(
    val defaultStyleId: String,
    val selectedStyleId: String,
)

internal fun resolveStyleSelection(
    styles: List<ChatStyle>,
    requestedDefaultStyleId: String,
    requestedSelectedStyleId: String,
): ResolvedStyleSelection {
    val available = styles.mapTo(mutableSetOf(), ChatStyle::id)
    val defaultStyleId = requestedDefaultStyleId.takeIf { it in available }
        ?: "style-normal".takeIf { it in available }
        ?: styles.firstOrNull()?.id
        ?: "style-normal"
    return ResolvedStyleSelection(
        defaultStyleId = defaultStyleId,
        selectedStyleId = requestedSelectedStyleId.takeIf { it in available } ?: defaultStyleId,
    )
}

/**
 * 每个非空结果替换对应 scope；请求失败的 scope 保留旧值，避免一次局部刷新清空设置页。
 */
internal fun mergeMcpServersByScope(
    existing: List<McpServer>,
    userServers: List<McpServer>?,
    globalServers: List<McpServer>?,
): List<McpServer> = buildList {
    addAll(userServers ?: existing.filter { it.scope == "user" })
    addAll(globalServers ?: existing.filter { it.scope == "global" })
    addAll(existing.filter { it.scope != "user" && it.scope != "global" })
}.distinctBy(McpServer::id)

internal fun validSelectedMcpServerIds(
    selectedIds: List<String>,
    servers: List<McpServer>,
): List<String> {
    val enabledIds = servers.asSequence()
        .filter(McpServer::enabled)
        .mapTo(mutableSetOf(), McpServer::id)
    return selectedIds.filter(enabledIds::contains).distinct()
}

/** 空列表表示默认全选；点选条目后排他选择，再点同一条目恢复默认。 */
internal fun exclusiveToolSelection(currentIds: List<String>, selectedId: String): List<String> =
    if (currentIds.size == 1 && currentIds.single() == selectedId) {
        emptyList()
    } else {
        listOf(selectedId)
    }
