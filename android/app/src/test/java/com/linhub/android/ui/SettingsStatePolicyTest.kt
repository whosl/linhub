package com.linhub.android.ui

import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.McpServer
import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsStatePolicyTest {
    @Test
    fun `missing custom default and selected style fall back to built in normal`() {
        val result = resolveStyleSelection(
            styles = listOf(style("style-normal"), style("style-concise")),
            requestedDefaultStyleId = "style-deleted",
            requestedSelectedStyleId = "style-deleted",
        )

        assertEquals("style-normal", result.defaultStyleId)
        assertEquals("style-normal", result.selectedStyleId)
    }

    @Test
    fun `partial mcp refresh preserves failed scope including disabled servers`() {
        val existing = listOf(
            server("user-old", "user", enabled = false),
            server("global-old", "global"),
        )

        val merged = mergeMcpServersByScope(
            existing = existing,
            userServers = null,
            globalServers = listOf(server("global-new", "global")),
        )

        assertEquals(listOf("user-old", "global-new"), merged.map(McpServer::id))
        assertEquals(false, merged.first().enabled)
    }

    @Test
    fun `selected mcp ids only retain unique enabled servers`() {
        val selected = validSelectedMcpServerIds(
            selectedIds = listOf("enabled", "disabled", "missing", "enabled"),
            servers = listOf(
                server("enabled", "user"),
                server("disabled", "global", enabled = false),
            ),
        )

        assertEquals(listOf("enabled"), selected)
    }

    @Test
    fun `tool scope defaults to all then switches to one exclusive selection`() {
        assertEquals(listOf("kb-one"), exclusiveToolSelection(emptyList(), "kb-one"))
        assertEquals(listOf("kb-two"), exclusiveToolSelection(listOf("kb-one"), "kb-two"))
        assertEquals(emptyList<String>(), exclusiveToolSelection(listOf("kb-two"), "kb-two"))
    }

    private fun style(id: String) = ChatStyle(
        id = id,
        name = id,
        description = "",
        builtIn = true,
    )

    private fun server(id: String, scope: String, enabled: Boolean = true) = McpServer(
        id = id,
        scope = scope,
        name = id,
        url = "https://example.com/$id",
        enabled = enabled,
    )
}
