package com.linhub.android.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DestinationLoadPolicyTest {
    @Test
    fun `快照新鲜度严格遵守TTL和时钟顺序`() {
        assertTrue(isLoadedSnapshotFresh(10_000L, 39_999L, 30_000L))
        assertFalse(isLoadedSnapshotFresh(10_000L, 40_000L, 30_000L))
        assertFalse(isLoadedSnapshotFresh(10_000L, 9_999L, 30_000L))
        assertFalse(isLoadedSnapshotFresh(null, 11_000L, 30_000L))
    }

    @Test
    fun `相同文件结果在新鲜期内直接复用`() {
        val key = mediaResultKey("all", "  报告  ")

        assertTrue(
            shouldReuseMediaResult(
                currentResultKey = key,
                requestedResultKey = mediaResultKey("all", "报告"),
                loadedAtEpochMillis = 10_000L,
                nowEpochMillis = 39_999L,
                ttlMillis = 30_000L,
            ),
        )
    }

    @Test
    fun `过期条件变化和时钟回拨都必须重新加载`() {
        val key = mediaResultKey("all", "")

        assertFalse(shouldReuseMediaResult(key, key, 10_000L, 40_000L, 30_000L))
        assertFalse(
            shouldReuseMediaResult(
                key,
                mediaResultKey("upload", ""),
                10_000L,
                11_000L,
                30_000L,
            ),
        )
        assertFalse(shouldReuseMediaResult(key, key, 10_000L, 9_999L, 30_000L))
        assertFalse(shouldReuseMediaResult(key, key, null, 11_000L, 30_000L))
    }

    @Test
    fun `离线时继续使用同条件的过期结果`() {
        val key = mediaResultKey("all", "")

        assertTrue(
            shouldReuseMediaResult(
                currentResultKey = key,
                requestedResultKey = key,
                loadedAtEpochMillis = null,
                nowEpochMillis = 99_000L,
                ttlMillis = 30_000L,
                allowExpired = true,
            ),
        )
        assertFalse(
            shouldReuseMediaResult(
                currentResultKey = key,
                requestedResultKey = mediaResultKey("upload", ""),
                loadedAtEpochMillis = null,
                nowEpochMillis = 99_000L,
                ttlMillis = 30_000L,
                allowExpired = true,
            ),
        )
    }
}
