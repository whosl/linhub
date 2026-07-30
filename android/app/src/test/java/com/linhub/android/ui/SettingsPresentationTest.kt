package com.linhub.android.ui

import java.time.Instant
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsPresentationTest {
    private val now = Instant.parse("2026-07-13T04:30:00Z")

    @Test
    fun `记忆时间与 Web 相同按分钟小时和天显示`() {
        assertEquals("刚刚", formatSettingsRelativeTime("2026-07-13T04:29:40Z", now))
        assertEquals("12 分钟前", formatSettingsRelativeTime("2026-07-13T04:18:00Z", now))
        assertEquals("3 小时前", formatSettingsRelativeTime("2026-07-13T01:20:00Z", now))
        assertEquals("10 天前", formatSettingsRelativeTime("2026-07-03T04:30:00Z", now))
    }

    @Test
    fun `超过三十天显示中文数字日期`() {
        assertEquals(
            "2026/6/1",
            formatSettingsRelativeTime(
                timestamp = "2026-06-01T00:00:00Z",
                now = now,
                zoneId = ZoneOffset.UTC,
            ),
        )
    }

    @Test
    fun `未来时间和无效时间安全处理`() {
        assertEquals("刚刚", formatSettingsRelativeTime("2026-07-14T00:00:00Z", now))
        assertEquals("", formatSettingsRelativeTime("invalid", now))
    }
}
