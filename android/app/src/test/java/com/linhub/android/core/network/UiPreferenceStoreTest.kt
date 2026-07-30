package com.linhub.android.core.network

import com.linhub.android.core.model.ThemeMode
import com.linhub.android.core.model.FontSizePreset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UiPreferenceStoreTest {
    @Test
    fun `thinking overrides discard invalid model ids and effort values`() {
        val decoded = decodeThinkingEfforts(
            """{"model-a":"high","model-b":"turbo","":"low"}""",
        )

        assertEquals(mapOf("model-a" to "high"), decoded)
    }

    @Test
    fun `malformed thinking preferences fall back to empty map`() {
        assertTrue(decodeThinkingEfforts("not-json").isEmpty())
        assertTrue(decodeThinkingEfforts(null).isEmpty())
    }

    @Test
    fun `theme preference decodes supported values and defaults to system`() {
        assertEquals(ThemeMode.LIGHT, decodeThemeMode("light"))
        assertEquals(ThemeMode.DARK, decodeThemeMode("dark"))
        assertEquals(ThemeMode.SYSTEM, decodeThemeMode("system"))
        assertEquals(ThemeMode.SYSTEM, decodeThemeMode("sepia"))
        assertEquals(ThemeMode.SYSTEM, decodeThemeMode(null))
    }

    @Test
    fun `font size preference decodes five presets and defaults to medium size`() {
        assertEquals(FontSizePreset.EXTRA_SMALL, decodeFontSizePreset("extra-small"))
        assertEquals(FontSizePreset.SMALL, decodeFontSizePreset("small"))
        assertEquals(FontSizePreset.MEDIUM, decodeFontSizePreset("medium"))
        assertEquals(FontSizePreset.LARGE, decodeFontSizePreset("large"))
        assertEquals(FontSizePreset.EXTRA_LARGE, decodeFontSizePreset("extra-large"))
        assertEquals(FontSizePreset.MEDIUM, decodeFontSizePreset("enormous"))
        assertEquals(FontSizePreset.MEDIUM, decodeFontSizePreset(null))
    }

    @Test
    fun `font size preset scales increase monotonically around current small size`() {
        assertEquals(1f, FontSizePreset.SMALL.scale)
        assertEquals(
            FontSizePreset.entries.map(FontSizePreset::scale).sorted(),
            FontSizePreset.entries.map(FontSizePreset::scale),
        )
    }

    @Test
    fun `project ui preferences discard blank ids and keep stable order`() {
        assertEquals(
            linkedSetOf("project-b", "project-a"),
            sanitizeProjectIds(linkedSetOf("project-b", "", "project-a", "  ").map(String::trim).toSet()),
        )
    }

    @Test
    fun `billing order retry reuses only the same valid pending operation`() {
        val key = "android-12345678-1234-1234-1234-123456789abc"

        assertEquals(
            key,
            reusableBillingOrderIdempotencyKey("recharge:5000:-", "recharge:5000:-", key),
        )
        assertEquals(
            null,
            reusableBillingOrderIdempotencyKey("recharge:10000:-", "recharge:5000:-", key),
        )
        assertEquals(
            null,
            reusableBillingOrderIdempotencyKey("recharge:5000:-", "recharge:5000:-", "bad"),
        )
    }
}
