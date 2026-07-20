package com.linhub.android.ui

import com.linhub.android.core.model.Model
import com.linhub.android.core.model.ModelsResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatConfigurationRefreshPolicyTest {
    @Test
    fun `仍可用的显式模型选择不会被聚焦刷新覆盖`() {
        val first = model("first")
        val selected = model("selected")
        val state = LinHubUiState(
            models = listOf(first, selected),
            selectedModelId = selected.id,
        )

        val refreshed = state.withRefreshedModels(
            ModelsResponse(models = listOf(first, selected), defaultModelId = first.id),
        )

        assertEquals(selected.id, refreshed.selectedModelId)
        assertEquals(first.id, refreshed.defaultModelId)
    }

    @Test
    fun `当前模型被停用后回退到新的服务端默认模型`() {
        val removed = model("removed", capabilities = listOf("chat", "reasoning"))
        val fallback = model(
            "chat-fallback",
            capabilities = listOf("chat", "reasoning"),
        )
        val state = LinHubUiState(
            models = listOf(removed),
            selectedModelId = removed.id,
            thinkingEffort = "high",
            modelThinkingEfforts = mapOf(fallback.id to "medium"),
        )

        val refreshed = state.withRefreshedModels(
            ModelsResponse(models = listOf(fallback), defaultModelId = fallback.id),
        )

        assertEquals(fallback.id, refreshed.selectedModelId)
        assertEquals(fallback.id, refreshed.defaultModelId)
        assertEquals("medium", refreshed.thinkingEffort)
    }

    @Test
    fun `图像模型不能成为聊天默认模型`() {
        val image = model("image", capabilities = listOf("image-generation"))
        val chat = model("chat")

        val refreshed = LinHubUiState().withRefreshedModels(
            ModelsResponse(models = listOf(image, chat), defaultModelId = image.id),
        )

        assertEquals(chat.id, refreshed.defaultModelId)
        assertEquals(chat.id, refreshed.selectedModelId)
    }

    @Test
    fun `没有可聊天模型时清空失效选择`() {
        val image = model("image", capabilities = listOf("image-generation"))
        val refreshed = LinHubUiState(selectedModelId = "removed").withRefreshedModels(
            ModelsResponse(models = listOf(image), defaultModelId = image.id),
        )

        assertNull(refreshed.defaultModelId)
        assertNull(refreshed.selectedModelId)
    }

    private fun model(
        id: String,
        capabilities: List<String> = listOf("chat"),
    ) = Model(
        id = id,
        providerId = "provider",
        providerKind = "openai",
        slug = id,
        displayName = id,
        capabilities = capabilities,
        contextWindow = 128_000,
    )
}
