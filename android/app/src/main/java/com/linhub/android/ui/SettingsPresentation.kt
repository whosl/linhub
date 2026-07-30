package com.linhub.android.ui

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal fun formatSettingsRelativeTime(
    timestamp: String,
    now: Instant = Instant.now(),
    zoneId: ZoneId = ZoneId.systemDefault(),
): String = runCatching {
    val updated = Instant.parse(timestamp)
    val minutes = Duration.between(updated, now).toMinutes().coerceAtLeast(0L)
    when {
        minutes < 1L -> "刚刚"
        minutes < 60L -> "$minutes 分钟前"
        minutes < 1_440L -> "${minutes / 60L} 小时前"
        minutes < 43_200L -> "${minutes / 1_440L} 天前"
        else -> DateTimeFormatter
            .ofPattern("yyyy/M/d", Locale.CHINA)
            .withZone(zoneId)
            .format(updated)
    }
}.getOrDefault("")
