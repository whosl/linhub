package com.linhub.android.core.cache

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class UserDao {
    @Query("SELECT * FROM cached_users LIMIT 1")
    abstract fun observe(): Flow<UserEntity?>

    @Query("SELECT * FROM cached_users LIMIT 1")
    abstract suspend fun get(): UserEntity?

    @Upsert
    abstract suspend fun upsert(user: UserEntity)

    @Query("DELETE FROM cached_users")
    abstract suspend fun clear()
}

@Dao
abstract class ModelDao {
    @Query("SELECT * FROM cached_models ORDER BY sort_order ASC, display_name COLLATE NOCASE ASC")
    abstract fun observeAll(): Flow<List<ModelEntity>>

    @Query(
        "SELECT * FROM cached_models " +
            "WHERE enabled = 1 ORDER BY sort_order ASC, display_name COLLATE NOCASE ASC",
    )
    abstract fun observeEnabled(): Flow<List<ModelEntity>>

    @Query("SELECT * FROM cached_models WHERE id = :id LIMIT 1")
    abstract suspend fun get(id: String): ModelEntity?

    @Upsert
    abstract suspend fun upsert(model: ModelEntity)

    @Upsert
    protected abstract suspend fun upsertAllInternal(models: List<ModelEntity>)

    @Query("DELETE FROM cached_models")
    protected abstract suspend fun clearInternal()

    @Transaction
    open suspend fun replaceAll(models: List<ModelEntity>) {
        clearInternal()
        if (models.isNotEmpty()) upsertAllInternal(models)
    }
}

@Dao
abstract class ConversationDao {
    @Query(
        "SELECT * FROM cached_conversations " +
            "WHERE is_listed = 1 AND (:includeArchived OR archived = 0) " +
            "ORDER BY pinned DESC, updated_at_epoch_millis DESC, id ASC",
    )
    abstract fun observeIndex(includeArchived: Boolean = false): Flow<List<ConversationEntity>>

    @Query(
        "SELECT * FROM cached_conversations " +
            "WHERE project_id = :projectId " +
            "ORDER BY pinned DESC, updated_at_epoch_millis DESC, id ASC",
    )
    abstract fun observeProject(projectId: String): Flow<List<ConversationEntity>>

    @Query("SELECT * FROM cached_conversations WHERE id = :id LIMIT 1")
    abstract fun observe(id: String): Flow<ConversationEntity?>

    @Query("SELECT * FROM cached_conversations WHERE id = :id LIMIT 1")
    abstract suspend fun get(id: String): ConversationEntity?

    @Upsert
    abstract suspend fun upsert(conversation: ConversationEntity)

    @Upsert
    protected abstract suspend fun upsertAllInternal(conversations: List<ConversationEntity>)

    @Query("UPDATE cached_conversations SET is_listed = 0")
    protected abstract suspend fun markAllUnlistedInternal()

    @Query("DELETE FROM cached_conversations WHERE id = :id")
    abstract suspend fun delete(id: String)

    @Query(
        "DELETE FROM cached_conversations " +
            "WHERE is_listed = 0 AND cached_at_epoch_millis < :cutoffEpochMillis",
    )
    abstract suspend fun pruneUnlistedBefore(cutoffEpochMillis: Long): Int

    @Transaction
    open suspend fun replaceIndex(conversations: List<ConversationEntity>) {
        markAllUnlistedInternal()
        if (conversations.isNotEmpty()) {
            upsertAllInternal(conversations.map { it.copy(isListed = true) })
        }
    }
}

@Dao
abstract class MessageDao {
    @Query(
        "SELECT * FROM cached_messages WHERE conversation_id = :conversationId " +
            "ORDER BY created_at_epoch_millis ASC, id ASC",
    )
    abstract fun observeTree(conversationId: String): Flow<List<MessageEntity>>

    @Query(
        "SELECT * FROM cached_messages " +
            "WHERE conversation_id = :conversationId AND parent_id IS :parentId " +
            "ORDER BY created_at_epoch_millis ASC, id ASC",
    )
    abstract suspend fun children(conversationId: String, parentId: String?): List<MessageEntity>

    @Query("SELECT * FROM cached_messages WHERE id = :id LIMIT 1")
    abstract suspend fun get(id: String): MessageEntity?

    @Upsert
    abstract suspend fun upsert(message: MessageEntity)

    @Upsert
    protected abstract suspend fun upsertAllInternal(messages: List<MessageEntity>)

    @Query(
        "DELETE FROM cached_messages " +
            "WHERE conversation_id = :conversationId " +
            "AND detail_generation != :generation AND status != 'streaming'",
    )
    protected abstract suspend fun deleteOldGenerationInternal(
        conversationId: String,
        generation: Long,
    )

    @Query("UPDATE cached_messages SET feedback = :feedback WHERE id = :id")
    abstract suspend fun updateFeedback(id: String, feedback: String?): Int

    @Query("UPDATE cached_messages SET status = :status WHERE id = :id")
    abstract suspend fun updateStatus(id: String, status: String): Int

    @Query("DELETE FROM cached_messages WHERE conversation_id = :conversationId")
    abstract suspend fun deleteForConversation(conversationId: String)

    @Query(
        "DELETE FROM cached_messages WHERE status != 'streaming' AND conversation_id NOT IN (" +
            "SELECT id FROM cached_conversations " +
            "ORDER BY updated_at_epoch_millis DESC, id ASC LIMIT :maxConversationDetails)",
    )
    abstract suspend fun pruneConversationDetails(maxConversationDetails: Int): Int

    @Transaction
    open suspend fun replaceSnapshot(
        conversationId: String,
        generation: Long,
        messages: List<MessageEntity>,
    ) {
        if (messages.isNotEmpty()) {
            upsertAllInternal(messages.map { it.copy(detailGeneration = generation) })
        }
        deleteOldGenerationInternal(conversationId, generation)
    }
}

@Dao
abstract class SyncStateDao {
    @Query("SELECT * FROM cache_sync_state WHERE `key` = :key LIMIT 1")
    abstract fun observe(key: String): Flow<SyncStateEntity?>

    @Query("SELECT * FROM cache_sync_state WHERE `key` = :key LIMIT 1")
    abstract suspend fun get(key: String): SyncStateEntity?

    @Upsert
    abstract suspend fun upsert(state: SyncStateEntity)

    @Query("DELETE FROM cache_sync_state WHERE `key` = :key")
    abstract suspend fun delete(key: String)

    @Query(
        "DELETE FROM cache_sync_state WHERE " +
            "COALESCE(last_success_at_epoch_millis, last_attempt_at_epoch_millis, 0) < :cutoffEpochMillis",
    )
    abstract suspend fun pruneBefore(cutoffEpochMillis: Long): Int

    @Transaction
    open suspend fun recordAttempt(key: String, nowEpochMillis: Long = EpochTime.now()) {
        val current = get(key) ?: SyncStateEntity(key)
        upsert(current.copy(lastAttemptAtEpochMillis = nowEpochMillis, lastError = null))
    }

    @Transaction
    open suspend fun recordSuccess(
        key: String,
        ttlMillis: Long,
        nowEpochMillis: Long = EpochTime.now(),
        nextCursor: String? = null,
        endReached: Boolean = false,
    ): SyncStateEntity {
        val current = get(key) ?: SyncStateEntity(key)
        val next = current.copy(
            lastAttemptAtEpochMillis = nowEpochMillis,
            lastSuccessAtEpochMillis = nowEpochMillis,
            staleAfterEpochMillis = EpochTime.addClamped(nowEpochMillis, ttlMillis),
            generation = current.generation + 1,
            nextCursor = nextCursor,
            endReached = endReached,
            lastError = null,
        )
        upsert(next)
        return next
    }

    @Transaction
    open suspend fun recordFailure(
        key: String,
        error: String,
        nowEpochMillis: Long = EpochTime.now(),
    ) {
        val current = get(key) ?: SyncStateEntity(key)
        upsert(
            current.copy(
                lastAttemptAtEpochMillis = nowEpochMillis,
                lastError = error,
            ),
        )
    }
}

@Dao
abstract class CachedPayloadDao {
    @Query("SELECT * FROM cached_payloads WHERE `key` = :key LIMIT 1")
    abstract suspend fun get(key: String): CachedPayloadEntity?

    @Upsert
    abstract suspend fun upsert(payload: CachedPayloadEntity)

    @Query("SELECT * FROM cached_payloads WHERE `key` LIKE :prefix || '%' ORDER BY cached_at_epoch_millis ASC")
    abstract suspend fun listPrefix(prefix: String): List<CachedPayloadEntity>

    @Query("DELETE FROM cached_payloads WHERE `key` = :key")
    abstract suspend fun delete(key: String)

    @Query("DELETE FROM cached_payloads WHERE `key` LIKE :prefix || '%'")
    abstract suspend fun deletePrefix(prefix: String)

    @Query(
        "DELETE FROM cached_payloads " +
            "WHERE `key` NOT LIKE 'operation:%' AND cached_at_epoch_millis < :cutoffEpochMillis",
    )
    abstract suspend fun pruneBefore(cutoffEpochMillis: Long): Int

    @Query(
        "DELETE FROM cached_payloads WHERE `key` IN (" +
            "SELECT `key` FROM cached_payloads WHERE `key` NOT LIKE 'operation:%' " +
            "ORDER BY cached_at_epoch_millis DESC, `key` ASC LIMIT -1 OFFSET :maxEntries)",
    )
    abstract suspend fun pruneToLimit(maxEntries: Int): Int
}
