package com.linhub.android.ui

import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ThemeMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AppAppearancePolicyTest {
    @Test
    fun `streaming ui changes do not change root appearance projection`() {
        val initial = LinHubUiState(
            draft = "第一帧",
            message = null,
            themeMode = ThemeMode.DARK,
            fontSizePreset = FontSizePreset.MEDIUM,
        )
        val streamingUpdate = initial.copy(
            draft = "第二帧",
            message = "流式状态已更新",
        )

        assertEquals(appAppearance(initial), appAppearance(streamingUpdate))
    }

    @Test
    fun `theme or font size changes invalidate root appearance projection`() {
        val initial = LinHubUiState()

        assertNotEquals(
            appAppearance(initial),
            appAppearance(initial.copy(themeMode = ThemeMode.DARK)),
        )
        assertNotEquals(
            appAppearance(initial),
            appAppearance(initial.copy(fontSizePreset = FontSizePreset.EXTRA_LARGE)),
        )
    }
}
