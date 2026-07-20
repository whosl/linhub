package com.linhub.android.core.cache

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DurableOperationCacheTest {
    @Test
    fun pruningOrdinarySnapshots_keepsPendingOperationPayloads() = runBlocking(Dispatchers.IO) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(
            context,
            LinHubCacheDatabase::class.java,
        ).build()
        try {
            val now = 10_000_000_000L
            repeat(201) { index ->
                database.cachedPayloadDao().upsert(
                    CachedPayloadEntity(
                        key = "ordinary:$index",
                        payloadJson = "{}",
                        cachedAtEpochMillis = now,
                    ),
                )
            }
            val operationKey = "operation:message-image:msg-e2e"
            database.cachedPayloadDao().upsert(
                CachedPayloadEntity(
                    key = operationKey,
                    payloadJson = "{\"operationKey\":\"durable\"}",
                    cachedAtEpochMillis = 1L,
                ),
            )

            database.pruneCache(nowEpochMillis = now)

            assertNotNull(database.cachedPayloadDao().get(operationKey))
            assertEquals(
                listOf(operationKey),
                database.cachedPayloadDao().listPrefix("operation:").map(CachedPayloadEntity::key),
            )
        } finally {
            database.close()
        }
    }
}
