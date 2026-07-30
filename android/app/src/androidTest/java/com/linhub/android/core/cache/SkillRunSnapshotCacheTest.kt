package com.linhub.android.core.cache

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.linhub.android.core.model.SkillRunSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SkillRunSnapshotCacheTest {
    @Test
    fun snapshotSurvivesDatabaseReopenAndRemainsAccountIsolated() = runBlocking(Dispatchers.IO) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val accountA = "skill-run-cache-account-a"
        val accountB = "skill-run-cache-account-b"
        val key = "skill-run:run-cache-device"
        val snapshot = SkillRunSnapshot(
            id = "run-cache-device",
            conversationId = "conversation-cache-device",
            kind = "ppt-studio",
            skillName = "PPT 工作室",
            status = "running",
            stageLabel = "生成演示文稿",
            progress = 73,
            sourceCount = 9,
            createdAt = "2026-07-23T00:00:00Z",
            updatedAt = "2026-07-23T00:00:01Z",
        )

        CacheDatabaseManager(context).use { manager ->
            manager.deleteFor(accountA)
            manager.deleteFor(accountB)
            manager.databaseFor(accountA).cachedPayloadDao().upsert(
                CachedPayloadEntity(
                    key = key,
                    payloadJson = CachePayloadCodec.encode(snapshot),
                    cachedAtEpochMillis = 1L,
                ),
            )
        }

        CacheDatabaseManager(context).use { manager ->
            try {
                val reopened = manager.databaseFor(accountA).cachedPayloadDao().get(key)
                assertEquals(
                    snapshot,
                    CachePayloadCodec.decodeOrNull<SkillRunSnapshot>(reopened?.payloadJson.orEmpty()),
                )

                assertNull(manager.databaseFor(accountB).cachedPayloadDao().get(key))
            } finally {
                manager.deleteFor(accountA)
                manager.deleteFor(accountB)
            }
        }
    }
}
