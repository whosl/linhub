package com.linhub.android.core.cache

import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.MessageUsage
import com.linhub.android.core.model.Model as ApiModel
import com.linhub.android.core.model.Subscription
import com.linhub.android.core.model.User
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

object CacheJsonCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }
    private val stringListSerializer = ListSerializer(String.serializer())
    private val messagePartsSerializer = ListSerializer(JsonObject.serializer())

    fun encodeStrings(value: List<String>): String = json.encodeToString(stringListSerializer, value)

    fun decodeStrings(value: String): List<String> =
        runCatching { json.decodeFromString(stringListSerializer, value) }.getOrDefault(emptyList())

    fun encodeMessageParts(value: List<JsonObject>): String =
        json.encodeToString(messagePartsSerializer, value)

    fun decodeMessageParts(value: String): List<JsonObject> =
        runCatching { json.decodeFromString(messagePartsSerializer, value) }.getOrDefault(emptyList())

    fun searchableText(parts: List<JsonObject>): String = parts.asSequence()
        .mapNotNull { it["text"]?.jsonPrimitive?.contentOrNull }
        .filter { it.isNotBlank() }
        .joinToString("\n")
}

fun User.toCacheEntity(cachedAtEpochMillis: Long = EpochTime.now()): UserEntity {
    val activeSubscription = subscription
    return UserEntity(
        id = id,
        email = email,
        name = name,
        avatarUrl = avatarUrl,
        role = role,
        createdAtEpochMillis = EpochTime.parseIso(createdAt),
        balanceCents = balance,
        defaultModelId = defaultModelId,
        subscriptionPlanId = activeSubscription?.planId,
        subscriptionPlanName = activeSubscription?.planName,
        subscriptionModelTier = activeSubscription?.modelTier,
        subscriptionStartedAtEpochMillis = activeSubscription?.startedAt?.let(EpochTime::parseIso),
        subscriptionExpiresAtEpochMillis = activeSubscription?.expiresAt?.let(EpochTime::parseIso),
        subscriptionUsedQuotaCents = activeSubscription?.usedQuotaCents,
        subscriptionMonthlyQuotaCents = activeSubscription?.monthlyQuotaCents,
        cachedAtEpochMillis = cachedAtEpochMillis,
    )
}

fun UserEntity.toDomain(): User = User(
    id = id,
    email = email,
    name = name,
    avatarUrl = avatarUrl,
    role = role,
    createdAt = EpochTime.formatIso(createdAtEpochMillis),
    balance = balanceCents,
    defaultModelId = defaultModelId,
    subscription = subscriptionPlanId?.let { planId ->
        Subscription(
            planId = planId,
            planName = subscriptionPlanName.orEmpty(),
            modelTier = subscriptionModelTier ?: "free",
            startedAt = EpochTime.formatIso(subscriptionStartedAtEpochMillis ?: 0),
            expiresAt = EpochTime.formatIso(subscriptionExpiresAtEpochMillis ?: 0),
            usedQuotaCents = subscriptionUsedQuotaCents ?: 0,
            monthlyQuotaCents = subscriptionMonthlyQuotaCents ?: 0,
        )
    },
)

fun ApiModel.toCacheEntity(cachedAtEpochMillis: Long = EpochTime.now()): ModelEntity = ModelEntity(
    id = id,
    providerId = providerId,
    providerKind = providerKind,
    slug = slug,
    displayName = displayName,
    description = description,
    capabilitiesJson = CacheJsonCodec.encodeStrings(capabilities),
    enabled = enabled,
    inputPricePerM = inputPricePerM,
    outputPricePerM = outputPricePerM,
    pricePerImage = pricePerImage,
    contextWindow = contextWindow,
    maxOutputTokens = maxOutputTokens,
    tier = tier,
    sortOrder = sortOrder,
    cachedAtEpochMillis = cachedAtEpochMillis,
)

fun ModelEntity.toDomain(): ApiModel = ApiModel(
    id = id,
    providerId = providerId,
    providerKind = providerKind,
    slug = slug,
    displayName = displayName,
    description = description,
    capabilities = CacheJsonCodec.decodeStrings(capabilitiesJson),
    enabled = enabled,
    inputPricePerM = inputPricePerM,
    outputPricePerM = outputPricePerM,
    pricePerImage = pricePerImage,
    contextWindow = contextWindow,
    maxOutputTokens = maxOutputTokens,
    tier = tier,
    sortOrder = sortOrder,
)

fun Conversation.toCacheEntity(
    cachedAtEpochMillis: Long = EpochTime.now(),
    isListed: Boolean = true,
): ConversationEntity = ConversationEntity(
    id = id,
    title = title,
    projectId = projectId,
    skillId = skillId,
    modelId = modelId,
    styleId = styleId,
    pinned = pinned,
    archived = archived,
    currentLeafId = currentLeafId,
    searchMatchLeafId = searchMatchLeafId,
    createdAtEpochMillis = EpochTime.parseIso(createdAt),
    updatedAtEpochMillis = EpochTime.parseIso(updatedAt),
    isListed = isListed,
    cachedAtEpochMillis = cachedAtEpochMillis,
)

fun ConversationEntity.toDomain(): Conversation = Conversation(
    id = id,
    title = title,
    projectId = projectId,
    skillId = skillId,
    modelId = modelId,
    styleId = styleId,
    pinned = pinned,
    archived = archived,
    currentLeafId = currentLeafId,
    searchMatchLeafId = searchMatchLeafId,
    createdAt = EpochTime.formatIso(createdAtEpochMillis),
    updatedAt = EpochTime.formatIso(updatedAtEpochMillis),
)

fun ChatMessage.toCacheEntity(
    detailGeneration: Long = 0,
    cachedAtEpochMillis: Long = EpochTime.now(),
): MessageEntity = MessageEntity(
    id = id,
    conversationId = conversationId,
    parentId = parentId,
    role = role,
    partsJson = CacheJsonCodec.encodeMessageParts(parts),
    plainText = CacheJsonCodec.searchableText(parts),
    modelId = modelId,
    createdAtEpochMillis = EpochTime.parseIso(createdAt),
    feedback = feedback,
    usageInputTokens = usage?.inputTokens,
    usageOutputTokens = usage?.outputTokens,
    usageCostCents = usage?.costCents,
    quotedText = quotedText,
    status = status,
    detailGeneration = detailGeneration,
    cachedAtEpochMillis = cachedAtEpochMillis,
)

fun MessageEntity.toDomain(): ChatMessage = ChatMessage(
    id = id,
    conversationId = conversationId,
    parentId = parentId,
    role = role,
    parts = CacheJsonCodec.decodeMessageParts(partsJson),
    modelId = modelId,
    createdAt = EpochTime.formatIso(createdAtEpochMillis),
    feedback = feedback,
    usage = usageInputTokens?.let { inputTokens ->
        MessageUsage(
            inputTokens = inputTokens,
            outputTokens = usageOutputTokens ?: 0,
            costCents = usageCostCents ?: 0,
        )
    },
    quotedText = quotedText,
    status = status,
)
