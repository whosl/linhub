package com.linhub.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.JsonObject

@Serializable
data class Subscription(
    val planId: String,
    val planName: String,
    val modelTier: String,
    val startedAt: String,
    val expiresAt: String,
    val usedQuotaCents: Int = 0,
    val monthlyQuotaCents: Int = 0,
)

@Serializable
data class User(
    val id: String,
    val email: String,
    val name: String,
    val avatarUrl: String? = null,
    val role: String = "user",
    val createdAt: String,
    val balance: Int = 0,
    val defaultModelId: String? = null,
    val subscription: Subscription? = null,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class Model(
    val id: String,
    val providerId: String,
    val providerKind: String,
    val slug: String,
    val displayName: String,
    val description: String? = null,
    val capabilities: List<String> = emptyList(),
    val enabled: Boolean = true,
    val inputPricePerM: Int = 0,
    val outputPricePerM: Int = 0,
    val pricePerImage: Int? = null,
    val contextWindow: Int = 0,
    val maxOutputTokens: Int? = null,
    val tier: String = "free",
    val sortOrder: Int = 0,
)

@Serializable
data class Provider(
    val id: String,
    val kind: String,
    val name: String,
    val baseUrl: String? = null,
    val apiKeyMasked: String? = null,
    val enabled: Boolean = true,
    val storeEnabled: Boolean = true,
)

@Serializable
data class RemoteModel(
    val slug: String,
    val displayName: String? = null,
    val added: Boolean = false,
)

@Serializable
data class AdminUserDetail(
    val user: User,
    val usageRecords: List<UsageRecord> = emptyList(),
    val ledger: List<LedgerEntry> = emptyList(),
)

@Serializable
data class AppSettings(
    val siteName: String = "LinHub",
    val defaultChatModelId: String? = null,
    val visionHelperModelId: String? = null,
    val toolRouterModelId: String? = null,
    val embeddingModelId: String? = null,
    val imageGenBaseUrl: String? = null,
    val imageGenApiKeyMasked: String? = null,
    val imageGenModel: String? = null,
    val ttsBaseUrl: String? = null,
    val ttsApiKeyMasked: String? = null,
    val ttsModel: String? = null,
    val asrBaseUrl: String? = null,
    val asrApiKeyMasked: String? = null,
    val asrModel: String? = null,
    val searchBaseUrl: String? = null,
    val tavilyApiKeyMasked: String? = null,
    val mimoApiKeyMasked: String? = null,
    val mimoTtsVoice: String? = null,
    val skillMarketRequiresReview: Boolean = true,
    val registrationEnabled: Boolean = true,
)

@Serializable
data class EngineTestResult(
    val ok: Boolean,
    val message: String? = null,
    val error: String? = null,
)

@Serializable
data class RedeemCode(
    val code: String,
    val amountCents: Int,
    val used: Boolean,
    val usedAt: String? = null,
    val createdAt: String,
)

@Serializable
data class GeneratedRedeemCodes(val codes: List<String>)

@Serializable
data class RemoteModelsAdded(val added: Int, val skipped: Int = 0)

@Serializable
data class AdminProviderRequest(
    val id: String? = null,
    val kind: String,
    val name: String,
    val baseUrl: String? = null,
    val apiKey: String? = null,
    val enabled: Boolean = true,
    val storeEnabled: Boolean = true,
)

@Serializable
data class AdminModelRequest(
    val id: String? = null,
    val providerId: String? = null,
    val slug: String? = null,
    val displayName: String? = null,
    val description: String? = null,
    val capabilities: List<String>? = null,
    val enabled: Boolean? = null,
    val inputPricePerM: Int? = null,
    val outputPricePerM: Int? = null,
    val pricePerImage: Int? = null,
    val contextWindow: Int? = null,
    val maxOutputTokens: Int? = null,
    val tier: String? = null,
    val sortOrder: Int? = null,
    @kotlinx.serialization.Transient val descriptionSpecified: Boolean = false,
    @kotlinx.serialization.Transient val pricePerImageSpecified: Boolean = false,
    @kotlinx.serialization.Transient val maxOutputTokensSpecified: Boolean = false,
)

@Serializable
data class AdminPlanRequest(
    val id: String? = null,
    val name: String,
    val description: String = "",
    val priceCentsPerMonth: Int = 0,
    val monthlyQuotaCents: Int = 0,
    val modelTier: String = "free",
    val features: List<String> = emptyList(),
    val enabled: Boolean = true,
)

@Serializable
data class AdminSettingsPatch(
    val siteName: String? = null,
    val defaultChatModelId: String? = null,
    val visionHelperModelId: String? = null,
    val toolRouterModelId: String? = null,
    val embeddingModelId: String? = null,
    val imageGenBaseUrl: String? = null,
    val imageGenModel: String? = null,
    val imageGenApiKey: String? = null,
    val ttsBaseUrl: String? = null,
    val ttsModel: String? = null,
    val ttsApiKey: String? = null,
    val asrBaseUrl: String? = null,
    val asrModel: String? = null,
    val asrApiKey: String? = null,
    val searchBaseUrl: String? = null,
    val tavilyApiKey: String? = null,
    val mimoTtsVoice: String? = null,
    val skillMarketRequiresReview: Boolean? = null,
    val registrationEnabled: Boolean? = null,
)

@Serializable
data class EngineTestRequest(
    val engine: String,
    val config: EngineConfig = EngineConfig(),
)

@Serializable
data class EngineConfig(
    val baseUrl: String? = null,
    val model: String? = null,
    val voice: String? = null,
    val apiKey: String? = null,
)

@Serializable
data class GrantBalanceRequest(val userId: String, val amountCents: Int, val note: String? = null)

@Serializable
data class SubscriptionAdminRequest(val planId: String?, val expiresInDays: Int? = null)

@Serializable
data class ReviewSkillRequest(val id: String, val approve: Boolean)

@Serializable
data class GenerateRedeemCodesRequest(val amountCents: Int, val count: Int)

@Serializable
data class RemoteModelsRequest(val slugs: List<String>)

@Serializable
data class ModelsResponse(
    val models: List<Model> = emptyList(),
    val defaultModelId: String? = null,
)

@Serializable
data class Conversation(
    val id: String,
    val title: String,
    val projectId: String? = null,
    val skillId: String? = null,
    val modelId: String? = null,
    val styleId: String? = null,
    val pinned: Boolean = false,
    val archived: Boolean = false,
    val currentLeafId: String? = null,
    val searchMatchLeafId: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class MessageUsage(
    val inputTokens: Int = 0,
    val outputTokens: Int = 0,
    val costCents: Int = 0,
)

@Serializable
data class ChatMessage(
    val id: String,
    val conversationId: String,
    val parentId: String? = null,
    val role: String,
    val parts: List<JsonObject> = emptyList(),
    val modelId: String? = null,
    val createdAt: String,
    val feedback: String? = null,
    val usage: MessageUsage? = null,
    val quotedText: String? = null,
    val status: String = "complete",
)

@Serializable
data class ConversationDetail(
    val conversation: Conversation,
    val messages: List<ChatMessage> = emptyList(),
)

@Serializable
data class ProjectKnowledgeBase(
    val id: String,
    val name: String,
    val description: String? = null,
    val documentCount: Int = 0,
    val totalChunks: Int = 0,
)

@Serializable
data class ProjectFile(
    val id: String,
    val name: String,
    val mimeType: String,
    val size: Long,
    val createdAt: String,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class Project(
    val id: String,
    val name: String,
    val description: String? = null,
    val instructions: String? = null,
    val color: String? = null,
    val modelId: String? = null,
    val knowledgeBaseIds: List<String> = emptyList(),
    val knowledgeBases: List<ProjectKnowledgeBase> = emptyList(),
    val createdAt: String,
    val updatedAt: String,
    val conversationCount: Int = 0,
    val files: List<ProjectFile> = emptyList(),
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class ArtifactVersion(
    val version: Int,
    val content: String,
    val createdAt: String,
)

@Serializable
data class Artifact(
    val id: String,
    val conversationId: String,
    val title: String,
    val kind: String,
    val language: String? = null,
    val versions: List<ArtifactVersion> = emptyList(),
    val currentVersion: Int = 1,
    val shareToken: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class ShareArtifactResponse(val shareToken: String)

@Serializable
data class Plan(
    val id: String,
    val name: String,
    val description: String,
    val priceCentsPerMonth: Int,
    val monthlyQuotaCents: Int,
    val modelTier: String,
    val features: List<String> = emptyList(),
    val enabled: Boolean = true,
)

@Serializable
data class UsageRecord(
    val id: String,
    val userId: String,
    val capability: String? = null,
    val modelId: String,
    val modelName: String,
    val conversationId: String? = null,
    val inputTokens: Int = 0,
    val outputTokens: Int = 0,
    val imageCount: Int? = null,
    val costCents: Int,
    val createdAt: String,
)

@Serializable
data class LedgerEntry(
    val id: String,
    val userId: String,
    val amountCents: Int,
    val balanceAfterCents: Int,
    val reason: String,
    val description: String,
    val createdAt: String,
)

@Serializable
data class Order(
    val id: String,
    val userId: String,
    val kind: String,
    val amountCents: Int,
    val planId: String? = null,
    val status: String,
    val channel: String,
    val createdAt: String,
    val paidAt: String? = null,
    val payUrl: String? = null,
)

@Serializable
data class CreateOrderRequest(
    val kind: String,
    val amountCents: Int? = null,
    val planId: String? = null,
)

@Serializable
data class RedeemCodeRequest(val code: String)

@Serializable
data class RedeemCodeResponse(val amountCents: Int)

@Serializable
data class SaveProjectRequest(
    val id: String? = null,
    val name: String,
    val description: String? = null,
    val instructions: String? = null,
    val color: String? = null,
    val modelId: String? = null,
    val knowledgeBaseIds: List<String> = emptyList(),
)

@Serializable
data class KnowledgeBase(
    val id: String,
    val name: String,
    val description: String? = null,
    val documentCount: Int = 0,
    val totalChunks: Int = 0,
    val createdAt: String,
    val updatedAt: String,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class SaveKnowledgeBaseRequest(
    val id: String? = null,
    val name: String,
    val description: String? = null,
)

@Serializable
data class KnowledgeDocument(
    val id: String,
    val knowledgeBaseId: String,
    val name: String,
    val mimeType: String,
    val size: Long,
    val status: String,
    val chunkCount: Int = 0,
    val extractMethod: String? = null,
    val errorMessage: String? = null,
    val createdAt: String,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class MediaAsset(
    val id: String,
    val ownerId: String,
    val kind: String,
    val name: String,
    val mimeType: String,
    val size: Long,
    val url: String,
    val conversationId: String? = null,
    val messageId: String? = null,
    val projectId: String? = null,
    val sourceTool: String? = null,
    val extractedTextAvailable: Boolean = false,
    val extractedText: String? = null,
    val createdAt: String,
)

@Serializable
data class MediaPage(
    val items: List<MediaAsset> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class UploadedAttachment(
    val id: String,
    val name: String,
    val mimeType: String,
    val size: Long,
    val url: String? = null,
    val mediaAssetId: String? = null,
    val hasText: Boolean = false,
    val createdAt: String,
)

@Serializable
data class ChunkedUploadInitRequest(
    val name: String,
    val mimeType: String,
    val size: Int,
    val projectId: String? = null,
)

@Serializable
data class ChunkedUploadSession(
    val id: String,
    val chunkSize: Int,
    val chunkCount: Int,
)

@Serializable
data class EditImageRequest(
    val image: String,
    val mask: String? = null,
    val prompt: String,
)

@Serializable
data class EditImageResponse(val url: String)

@Serializable
data class ReplaceMessageImageRequest(
    val oldUrl: String,
    val newUrl: String,
    val editPrompt: String? = null,
)

@Serializable
data class McpTool(
    val name: String,
    val description: String? = null,
)

@Serializable
data class McpServer(
    val id: String,
    val scope: String,
    val ownerId: String? = null,
    val name: String,
    val url: String,
    val transport: String = "streamable-http",
    val headersMasked: Map<String, String>? = null,
    val enabled: Boolean = true,
    val defaultEnabled: Boolean = false,
    val status: String = "unknown",
    val tools: List<McpTool> = emptyList(),
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class McpServerRequest(
    val id: String? = null,
    val scope: String = "user",
    val name: String,
    val url: String,
    val transport: String = "streamable-http",
    val headers: Map<String, String>? = null,
    val enabled: Boolean = true,
    val defaultEnabled: Boolean? = null,
)

@Serializable
data class McpTestResponse(
    val ok: Boolean,
    val tools: List<McpTool> = emptyList(),
    val error: String? = null,
)

@Serializable
data class TranscriptionResponse(val text: String)

@Serializable
data class MemoryEntry(
    val id: String,
    val content: String,
    val sourceConversationId: String? = null,
    val createdAt: String,
    val updatedAt: String,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class SaveMemoryRequest(
    val id: String? = null,
    val content: String,
)

@Serializable
data class ChatStyle(
    val id: String,
    val name: String,
    val description: String,
    val prompt: String? = null,
    val builtIn: Boolean = false,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class SaveStyleRequest(
    val id: String? = null,
    val name: String,
    val description: String,
    val prompt: String,
)

@Serializable
data class SkillResourceRef(
    val id: String,
    val name: String,
    val kind: String? = null,
    val description: String? = null,
    val path: String? = null,
    val mimeType: String? = null,
    val size: Long? = null,
    val content: String? = null,
)

@Serializable
data class SkillScriptPolicy(
    val enabled: Boolean = false,
    val allowedScripts: List<String> = emptyList(),
    val timeoutMs: Long? = null,
    val network: Boolean? = null,
)

@Serializable
data class Skill(
    val id: String,
    val ownerId: String,
    val name: String,
    val emoji: String = "\uD83E\uDD16",
    val description: String = "",
    val systemPrompt: String = "",
    val kind: String = "prompt",
    val version: String = "1.0.0",
    val source: String? = null,
    val manifest: JsonObject = JsonObject(emptyMap()),
    val packagePath: String? = null,
    val requiredTools: List<String> = emptyList(),
    val resourceRefs: List<SkillResourceRef> = emptyList(),
    val scriptPolicy: SkillScriptPolicy = SkillScriptPolicy(),
    val reviewStatus: String = "approved",
    val greeting: String? = null,
    val defaultModelId: String? = null,
    val enabledTools: List<String> = emptyList(),
    val knowledgeBaseIds: List<String> = emptyList(),
    val visibility: String = "private",
    val usageCount: Int = 0,
    val createdAt: String,
    val updatedAt: String,
    @Transient val clientMutationState: String? = null,
    @Transient val clientMutationError: String? = null,
)

@Serializable
data class SaveSkillRequest(
    val id: String? = null,
    val name: String,
    val emoji: String,
    val description: String,
    val systemPrompt: String,
    val greeting: String? = null,
    val defaultModelId: String? = null,
    val shareToMarket: Boolean = false,
)

@Serializable
data class SkillRunStep(
    val id: String,
    val runId: String,
    val parentStepId: String? = null,
    val kind: String,
    val label: String,
    val status: String,
    val progress: Int = 0,
    val sourceCount: Int = 0,
    val attempt: Int = 0,
    val modelId: String? = null,
    val error: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null,
)

@Serializable
data class SkillRunAttachment(
    val id: String,
    val name: String,
    val url: String? = null,
    val mimeType: String? = null,
    val sizeBytes: Long? = null,
)

@Serializable
data class SkillRunSnapshot(
    val id: String,
    val conversationId: String,
    val messageId: String? = null,
    val skillId: String? = null,
    val kind: String,
    val skillName: String,
    val status: String,
    val stageLabel: String,
    val progress: Int = 0,
    val input: JsonObject = JsonObject(emptyMap()),
    val steps: List<SkillRunStep> = emptyList(),
    val resultAttachments: List<SkillRunAttachment> = emptyList(),
    val sourceCount: Int = 0,
    val completionReceiptStatus: String = "completed",
    val completionMessageId: String? = null,
    val completionMessage: ChatMessage? = null,
    val error: String? = null,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class PptStudioBriefRequest(
    val topic: String,
    val audience: String,
    val pageCount: Int,
    val theme: String,
    val mediaPreference: String,
    val language: String,
    val outputFormat: String,
    val additionalInstructions: String? = null,
)

@Serializable
data class SkillPackageImportResult(
    val ok: Boolean,
    val skillId: String,
    val name: String,
    val digest: String,
    val message: String,
)

@Serializable
data class ChatToolToggles(
    val autoRouting: Boolean = false,
    val webSearch: Boolean = true,
    val imageGeneration: Boolean = true,
    val codeRunner: Boolean = true,
    val knowledgeSearch: Boolean = true,
    val mcpServerIds: List<String> = emptyList(),
    val knowledgeBaseIds: List<String> = emptyList(),
)

@Serializable
data class SendMessageRequest(
    val clientGenerationId: String,
    val conversationId: String? = null,
    val clientConversationId: String? = null,
    val clientUserMessageId: String? = null,
    val clientAssistantMessageId: String? = null,
    val parentId: String? = null,
    val text: String,
    val attachments: List<JsonObject> = emptyList(),
    val images: List<JsonObject> = emptyList(),
    val quotedText: String? = null,
    val modelId: String? = null,
    val styleId: String? = null,
    val extendedThinking: Boolean = false,
    val thinkingEffort: String? = null,
    val tools: ChatToolToggles = ChatToolToggles(),
    val projectId: String? = null,
    val skillId: String? = null,
    @Transient val parentIdSpecified: Boolean = false,
)

@Serializable
data class ConversationPatch(
    val title: String? = null,
    val pinned: Boolean? = null,
    val archived: Boolean? = null,
    val currentLeafId: String? = null,
    val modelId: String? = null,
    val projectId: String? = null,
    @Transient val projectIdSpecified: Boolean = false,
)

@Serializable
data class RegenerateRequest(
    val regenerate: Boolean = true,
    val clientGenerationId: String,
    val conversationId: String,
    val assistantMessageId: String,
    val clientAssistantMessageId: String? = null,
    val modelId: String? = null,
)

@Serializable
data class SignInRequest(val email: String, val password: String)

@Serializable
data class SignUpRequest(val name: String, val email: String, val password: String)

@Serializable
data class ApiErrorBody(
    val error: String? = null,
    val message: String? = null,
    val code: String? = null,
)

sealed interface ChatEvent {
    data class ConversationCreated(val conversation: Conversation) : ChatEvent
    data class UserMessage(val message: ChatMessage) : ChatEvent
    data class AssistantStart(val message: ChatMessage) : ChatEvent
    data class AssistantSnapshot(val message: ChatMessage) : ChatEvent
    data class RoutingDecision(val messageId: String, val decision: JsonObject) : ChatEvent
    data class ReasoningDelta(val messageId: String, val delta: String) : ChatEvent
    data class ReasoningDone(val messageId: String, val durationMs: Long) : ChatEvent
    data class TextDelta(val messageId: String, val delta: String) : ChatEvent
    data class ToolCallStart(val messageId: String, val part: JsonObject) : ChatEvent
    data class ToolCallEnd(val messageId: String, val part: JsonObject) : ChatEvent
    data class ToolInputStart(
        val messageId: String,
        val toolCallId: String,
        val toolName: String,
    ) : ChatEvent
    data class ToolInputDelta(val messageId: String, val toolCallId: String, val delta: String) : ChatEvent
    data class Image(val messageId: String, val part: JsonObject) : ChatEvent
    data class Artifact(val messageId: String, val artifact: JsonObject) : ChatEvent
    data class Title(val conversationId: String, val title: String) : ChatEvent
    data class Done(
        val messageId: String,
        val usage: MessageUsage?,
        val status: String,
    ) : ChatEvent
    data class Error(
        val messageId: String?,
        val message: String,
        val httpStatus: Int? = null,
    ) : ChatEvent
    data object Ping : ChatEvent
    data class Unknown(val type: String, val payload: JsonObject) : ChatEvent
}
