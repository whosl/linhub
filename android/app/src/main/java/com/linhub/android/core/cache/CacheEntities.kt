package com.linhub.android.core.cache

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "cached_users")
data class UserEntity(
    @PrimaryKey val id: String,
    val email: String,
    val name: String,
    @ColumnInfo(name = "avatar_url") val avatarUrl: String?,
    val role: String,
    @ColumnInfo(name = "created_at_epoch_millis") val createdAtEpochMillis: Long,
    @ColumnInfo(name = "balance_cents") val balanceCents: Int,
    @ColumnInfo(name = "default_model_id") val defaultModelId: String?,
    @ColumnInfo(name = "subscription_plan_id") val subscriptionPlanId: String?,
    @ColumnInfo(name = "subscription_plan_name") val subscriptionPlanName: String?,
    @ColumnInfo(name = "subscription_model_tier") val subscriptionModelTier: String?,
    @ColumnInfo(name = "subscription_started_at_epoch_millis")
    val subscriptionStartedAtEpochMillis: Long?,
    @ColumnInfo(name = "subscription_expires_at_epoch_millis")
    val subscriptionExpiresAtEpochMillis: Long?,
    @ColumnInfo(name = "subscription_used_quota_cents") val subscriptionUsedQuotaCents: Int?,
    @ColumnInfo(name = "subscription_monthly_quota_cents") val subscriptionMonthlyQuotaCents: Int?,
    @ColumnInfo(name = "cached_at_epoch_millis") val cachedAtEpochMillis: Long,
)

@Entity(
    tableName = "cached_models",
    indices = [
        Index(value = ["enabled", "sort_order"]),
        Index(value = ["provider_id"]),
    ],
)
data class ModelEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "provider_id") val providerId: String,
    @ColumnInfo(name = "provider_kind") val providerKind: String,
    val slug: String,
    @ColumnInfo(name = "display_name") val displayName: String,
    val description: String?,
    @ColumnInfo(name = "capabilities_json") val capabilitiesJson: String,
    val enabled: Boolean,
    @ColumnInfo(name = "input_price_per_m") val inputPricePerM: Int,
    @ColumnInfo(name = "output_price_per_m") val outputPricePerM: Int,
    @ColumnInfo(name = "price_per_image") val pricePerImage: Int?,
    @ColumnInfo(name = "context_window") val contextWindow: Int,
    @ColumnInfo(name = "max_output_tokens") val maxOutputTokens: Int?,
    val tier: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "cached_at_epoch_millis") val cachedAtEpochMillis: Long,
)

@Entity(
    tableName = "cached_conversations",
    indices = [
        Index(value = ["is_listed", "archived", "pinned", "updated_at_epoch_millis"]),
        Index(value = ["project_id", "updated_at_epoch_millis"]),
    ],
)
data class ConversationEntity(
    @PrimaryKey val id: String,
    val title: String,
    @ColumnInfo(name = "project_id") val projectId: String?,
    @ColumnInfo(name = "skill_id") val skillId: String?,
    @ColumnInfo(name = "model_id") val modelId: String?,
    @ColumnInfo(name = "style_id") val styleId: String?,
    val pinned: Boolean,
    val archived: Boolean,
    @ColumnInfo(name = "current_leaf_id") val currentLeafId: String?,
    @ColumnInfo(name = "search_match_leaf_id") val searchMatchLeafId: String?,
    @ColumnInfo(name = "created_at_epoch_millis") val createdAtEpochMillis: Long,
    @ColumnInfo(name = "updated_at_epoch_millis") val updatedAtEpochMillis: Long,
    @ColumnInfo(name = "is_listed") val isListed: Boolean = true,
    @ColumnInfo(name = "cached_at_epoch_millis") val cachedAtEpochMillis: Long,
)

@Entity(
    tableName = "cached_messages",
    foreignKeys = [
        ForeignKey(
            entity = ConversationEntity::class,
            parentColumns = ["id"],
            childColumns = ["conversation_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["conversation_id", "created_at_epoch_millis", "id"]),
        Index(value = ["conversation_id", "parent_id", "created_at_epoch_millis"]),
    ],
)
data class MessageEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "conversation_id") val conversationId: String,
    @ColumnInfo(name = "parent_id") val parentId: String?,
    val role: String,
    @ColumnInfo(name = "parts_json") val partsJson: String,
    @ColumnInfo(name = "plain_text") val plainText: String,
    @ColumnInfo(name = "model_id") val modelId: String?,
    @ColumnInfo(name = "created_at_epoch_millis") val createdAtEpochMillis: Long,
    val feedback: String?,
    @ColumnInfo(name = "usage_input_tokens") val usageInputTokens: Int?,
    @ColumnInfo(name = "usage_output_tokens") val usageOutputTokens: Int?,
    @ColumnInfo(name = "usage_cost_cents") val usageCostCents: Int?,
    @ColumnInfo(name = "quoted_text") val quotedText: String?,
    val status: String,
    @ColumnInfo(name = "detail_generation") val detailGeneration: Long = 0,
    @ColumnInfo(name = "cached_at_epoch_millis") val cachedAtEpochMillis: Long,
)

@Entity(tableName = "cache_sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,
    @ColumnInfo(name = "last_attempt_at_epoch_millis") val lastAttemptAtEpochMillis: Long? = null,
    @ColumnInfo(name = "last_success_at_epoch_millis") val lastSuccessAtEpochMillis: Long? = null,
    @ColumnInfo(name = "stale_after_epoch_millis") val staleAfterEpochMillis: Long? = null,
    val generation: Long = 0,
    @ColumnInfo(name = "next_cursor") val nextCursor: String? = null,
    @ColumnInfo(name = "end_reached") val endReached: Boolean = false,
    @ColumnInfo(name = "last_error") val lastError: String? = null,
) {
    fun isStale(nowEpochMillis: Long = EpochTime.now()): Boolean =
        staleAfterEpochMillis == null || nowEpochMillis >= staleAfterEpochMillis
}

/** 小型工作区域快照；按账户分库，避免为频繁变化的 API DTO 重复设计宽表。 */
@Entity(tableName = "cached_payloads")
data class CachedPayloadEntity(
    @PrimaryKey val key: String,
    @ColumnInfo(name = "payload_json") val payloadJson: String,
    @ColumnInfo(name = "cached_at_epoch_millis") val cachedAtEpochMillis: Long,
)
