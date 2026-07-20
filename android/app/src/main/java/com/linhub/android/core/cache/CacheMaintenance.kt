package com.linhub.android.core.cache

import androidx.room.withTransaction

data class CachePruneResult(
    val unlistedConversations: Int,
    val messageDetails: Int,
    val syncStates: Int,
    val payloads: Int,
)

suspend fun LinHubCacheDatabase.pruneCache(
    nowEpochMillis: Long = EpochTime.now(),
): CachePruneResult = withTransaction {
    val unlistedCutoff = nowEpochMillis - UNLISTED_CONVERSATION_RETENTION_MILLIS
    val payloadCutoff = nowEpochMillis - PAYLOAD_RETENTION_MILLIS
    CachePruneResult(
        unlistedConversations = conversationDao().pruneUnlistedBefore(unlistedCutoff),
        messageDetails = messageDao().pruneConversationDetails(MAX_CACHED_CONVERSATION_DETAILS),
        syncStates = syncStateDao().pruneBefore(payloadCutoff),
        payloads = cachedPayloadDao().pruneBefore(payloadCutoff) +
            cachedPayloadDao().pruneToLimit(MAX_CACHED_PAYLOADS),
    )
}

private const val MAX_CACHED_CONVERSATION_DETAILS = 50
private const val MAX_CACHED_PAYLOADS = 200
private const val UNLISTED_CONVERSATION_RETENTION_MILLIS = 30L * 24 * 60 * 60 * 1_000
private const val PAYLOAD_RETENTION_MILLIS = 90L * 24 * 60 * 60 * 1_000
