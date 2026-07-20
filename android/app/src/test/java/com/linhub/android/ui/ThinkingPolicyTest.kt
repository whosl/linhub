package com.linhub.android.ui

import com.linhub.android.core.model.Model
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ThinkingPolicyTest {
    @Test
    fun `non reasoning model omits thinking parameters`() {
        val config = thinkingRequestConfig(model(provider = "openai", slug = "gpt-4.1"), "high")

        assertFalse(config.extendedThinking)
        assertNull(config.effort)
    }

    @Test
    fun `unsupported effort falls back to provider recommendation`() {
        val model = model(
            provider = "anthropic",
            slug = "claude-sonnet-5",
            reasoning = true,
        )

        assertEquals("max", resolveThinkingEffort(model, "minimal"))
        assertEquals(listOf("low", "medium", "high", "xhigh", "max"), supportedThinkingEfforts(model))
    }

    @Test
    fun `google 3_5 flash recommendation matches web policy`() {
        val model = model(provider = "google", slug = "gemini-3.5-flash", reasoning = true)

        assertEquals("medium", recommendedThinkingEffort(model))
        assertTrue(thinkingRequestConfig(model, "medium").extendedThinking)
    }

    @Test
    fun `deepseek generic reasoning model defaults to medium`() {
        val model = model(provider = "deepseek", slug = "deepseek-chat", reasoning = true)

        assertEquals("medium", recommendedThinkingEffort(model))
    }

    private fun model(
        provider: String,
        slug: String,
        reasoning: Boolean = false,
    ) = Model(
        id = "model-$slug",
        providerId = "provider-$provider",
        providerKind = provider,
        slug = slug,
        displayName = slug,
        capabilities = if (reasoning) listOf("reasoning") else emptyList(),
    )
}
