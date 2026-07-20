package com.linhub.android.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import com.linhub.android.AppContainer
import com.linhub.android.BuildConfig
import com.linhub.android.core.cache.EpochTime
import com.linhub.android.core.cache.CachePayloadCodec
import com.linhub.android.core.cache.CachedPayloadEntity
import com.linhub.android.core.cache.CachedBillingPayload
import com.linhub.android.core.cache.CachedSettingsPayload
import com.linhub.android.core.cache.CachedSkillsPayload
import com.linhub.android.core.cache.ConversationEntity
import com.linhub.android.core.cache.LinHubCacheDatabase
import com.linhub.android.core.cache.ModelEntity
import com.linhub.android.core.cache.UserEntity
import com.linhub.android.core.cache.toCacheEntity
import com.linhub.android.core.cache.toDomain
import com.linhub.android.core.cache.pruneCache
import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.AdminModelRequest
import com.linhub.android.core.model.AdminPlanRequest
import com.linhub.android.core.model.AdminProviderRequest
import com.linhub.android.core.model.AdminSettingsPatch
import com.linhub.android.core.model.AdminUserDetail
import com.linhub.android.core.model.AppSettings
import com.linhub.android.core.model.EngineTestRequest
import com.linhub.android.core.model.Artifact
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.ChatToolToggles
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.ConversationDetail
import com.linhub.android.core.model.ConversationPatch
import com.linhub.android.core.model.CreateOrderRequest
import com.linhub.android.core.model.KnowledgeBase
import com.linhub.android.core.model.KnowledgeDocument
import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.MediaPage
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.McpServerRequest
import com.linhub.android.core.model.MemoryEntry
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Order
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.Project
import com.linhub.android.core.model.ProjectFile
import com.linhub.android.core.model.Provider
import com.linhub.android.core.model.RedeemCode
import com.linhub.android.core.model.RemoteModel
import com.linhub.android.core.model.SaveKnowledgeBaseRequest
import com.linhub.android.core.model.SaveMemoryRequest
import com.linhub.android.core.model.SaveProjectRequest
import com.linhub.android.core.model.SaveSkillRequest
import com.linhub.android.core.model.SaveStyleRequest
import com.linhub.android.core.model.SendMessageRequest
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.ThemeMode
import com.linhub.android.core.model.User
import com.linhub.android.core.model.UploadedAttachment
import com.linhub.android.core.model.UsageRecord
import com.linhub.android.core.network.ApiException
import com.linhub.android.data.ChatTranscript
import com.linhub.android.data.ChatTranscriptReducer
import com.linhub.android.data.coalesceChatEvents
import com.linhub.android.data.string
import com.linhub.android.data.type
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.decodeFromJsonElement

enum class AppPhase { Loading, Authentication, Chat }
enum class AuthMode { SignIn, SignUp }

data class AppAppearance(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val fontSizePreset: FontSizePreset = FontSizePreset.SMALL,
)

internal fun appAppearance(state: LinHubUiState): AppAppearance = AppAppearance(
    themeMode = state.themeMode,
    fontSizePreset = state.fontSizePreset,
)

data class WorkspaceShellState(
    val destination: WorkspaceDestination = WorkspaceDestination.Chat,
    val drawerOpenRequest: Long = 0,
    val user: User? = null,
    val conversations: List<Conversation> = emptyList(),
    val projects: List<Project> = emptyList(),
    val selectedConversationId: String? = null,
    val pinnedProjectIds: Set<String> = emptySet(),
    val collapsedProjectIds: Set<String> = emptySet(),
    val failedConversationRenames: Map<String, String> = emptyMap(),
    val conversationSearch: String = "",
    val searchResults: List<Conversation>? = null,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val fontSizePreset: FontSizePreset = FontSizePreset.SMALL,
)

internal fun workspaceShellState(state: LinHubUiState): WorkspaceShellState = WorkspaceShellState(
    destination = state.destination,
    drawerOpenRequest = state.drawerOpenRequest,
    user = state.user,
    conversations = state.conversations,
    projects = state.projects,
    selectedConversationId = state.selectedConversationId,
    pinnedProjectIds = state.pinnedProjectIds,
    collapsedProjectIds = state.collapsedProjectIds,
    failedConversationRenames = state.failedConversationRenames,
    conversationSearch = state.conversationSearch,
    searchResults = state.searchResults,
    themeMode = state.themeMode,
    fontSizePreset = state.fontSizePreset,
)

enum class WorkspaceDestination {
    Chat,
    Projects,
    Knowledge,
    Files,
    Skills,
    Billing,
    Settings,
    Admin,
}

internal const val NEW_CHAT_KEY = "__new_conversation__"

private data class UiPreferenceSnapshot(
    val defaultStyleId: String?,
    val modelThinkingEfforts: Map<String, String>,
    val messageRailEnabled: Boolean,
    val themeMode: ThemeMode,
    val fontSizePreset: FontSizePreset,
    val collapsedProjectIds: Set<String> = emptySet(),
    val pinnedProjectIds: Set<String> = emptySet(),
)

data class AdminUiState(
    val selectedSection: AdminSection = AdminSection.Providers,
    val loadedResources: Set<AdminResource> = emptySet(),
    val loadingResources: Set<AdminResource> = emptySet(),
    val providers: List<Provider> = emptyList(),
    val models: List<Model> = emptyList(),
    val plans: List<Plan> = emptyList(),
    val users: List<User> = emptyList(),
    val userDetails: Map<String, AdminUserDetail> = emptyMap(),
    val pendingSkills: List<Skill> = emptyList(),
    val settings: AppSettings? = null,
    val globalMcpServers: List<McpServer> = emptyList(),
    val usage: List<UsageRecord> = emptyList(),
    val redeemCodes: List<RedeemCode> = emptyList(),
    val remoteModels: Map<String, List<RemoteModel>> = emptyMap(),
    val testingModelIds: Set<String> = emptySet(),
    val testingEngines: Set<String> = emptySet(),
    val generatedCodes: List<String> = emptyList(),
)

data class MediaPreviewUiState(
    val asset: MediaAsset,
    val bytes: ByteArray? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

data class KnowledgeUploadProgress(
    val completed: Int,
    val total: Int,
    val currentName: String,
)

data class ProjectUploadProgress(
    val projectId: String,
    val completed: Int,
    val total: Int,
    val currentName: String,
    val mirrorKnowledgeBaseId: String? = null,
)

data class AttachmentUploadUi(
    val id: String,
    val name: String,
    val progress: Float = 0f,
    val error: String? = null,
)

data class LinHubUiState(
    val phase: AppPhase = AppPhase.Loading,
    val authMode: AuthMode = AuthMode.SignIn,
    val authSubmitting: Boolean = false,
    val user: User? = null,
    val models: List<Model> = emptyList(),
    /** `/api/models` 解析后的有效默认模型；可能来自个人、全局或首个可用模型。 */
    val defaultModelId: String? = null,
    val selectedModelId: String? = null,
    val conversations: List<Conversation> = emptyList(),
    val conversationSearch: String = "",
    val searchResults: List<Conversation>? = null,
    val selectedConversationId: String? = null,
    val destination: WorkspaceDestination = WorkspaceDestination.Chat,
    val pendingProjectId: String? = null,
    val temporaryProjectChat: Boolean = false,
    val projectEditorRequestId: String? = null,
    val projectConversationRequestId: String? = null,
    val pendingSkillId: String? = null,
    val leafOverrides: Map<String, String> = emptyMap(),
    val failedConversationRenames: Map<String, String> = emptyMap(),
    val transcripts: Map<String, ChatTranscript> = mapOf(NEW_CHAT_KEY to ChatTranscript()),
    val loadingConversationIds: Set<String> = emptySet(),
    val draft: String = "",
    val quotedText: String? = null,
    val startingNewConversation: Boolean = false,
    val drawerOpenRequest: Long = 0,
    val message: String? = null,
    val bootstrapError: String? = null,
    val usingCachedData: Boolean = false,
    val isOffline: Boolean = false,
    val workspaceRefreshing: Boolean = false,
    val projects: List<Project> = emptyList(),
    val projectsLoaded: Boolean = false,
    val projectConversations: Map<String, List<Conversation>> = emptyMap(),
    val loadingProjectConversationIds: Set<String> = emptySet(),
    val projectUploadProgress: ProjectUploadProgress? = null,
    val knowledgeBases: List<KnowledgeBase> = emptyList(),
    val knowledgeBasesLoaded: Boolean = false,
    val knowledgeDocuments: Map<String, List<KnowledgeDocument>> = emptyMap(),
    val selectedKnowledgeBaseId: String? = null,
    val knowledgeUploadProgress: KnowledgeUploadProgress? = null,
    val loadingDestinations: Set<WorkspaceDestination> = emptySet(),
    val mediaAssets: List<MediaAsset> = emptyList(),
    val mediaKind: String = "all",
    val mediaQuery: String = "",
    val mediaNextCursor: String? = null,
    val mediaResultKey: String? = null,
    val mediaLoadedAtEpochMillis: Long? = null,
    val mediaPreview: MediaPreviewUiState? = null,
    val downloadingMediaIds: Set<String> = emptySet(),
    val editingMediaIds: Set<String> = emptySet(),
    val pendingAttachments: List<UploadedAttachment> = emptyList(),
    val attachmentUploads: List<AttachmentUploadUi> = emptyList(),
    val editingPendingAttachmentIds: Set<String> = emptySet(),
    val chatTools: ChatToolToggles = ChatToolToggles(),
    val mcpServers: List<McpServer> = emptyList(),
    val chatToolOptionsLoading: Boolean = false,
    val chatToolOptionsLoaded: Boolean = false,
    val editingImageMessageIds: Set<String> = emptySet(),
    val artifacts: Map<String, List<Artifact>> = emptyMap(),
    val selectedArtifactId: String? = null,
    val artifactLoading: Boolean = false,
    val pendingShareUrl: String? = null,
    val pendingPaymentUrl: String? = null,
    val billingRedeemSuccessEvent: Long = 0,
    val sharedArtifact: Artifact? = null,
    val sharedArtifactUrl: String? = null,
    val sharedArtifactLoading: Boolean = false,
    val plans: List<Plan> = emptyList(),
    val usageRecords: List<UsageRecord> = emptyList(),
    val ledgerEntries: List<LedgerEntry> = emptyList(),
    val selectedBillingSection: BillingSection = BillingSection.Plans,
    val billingCacheRead: Boolean = false,
    val billingLoadedResources: Set<BillingResource> = emptySet(),
    val billingLoadedAtEpochMillis: Map<BillingResource, Long> = emptyMap(),
    val billingLoadingResources: Set<BillingResource> = emptySet(),
    val memories: List<MemoryEntry> = emptyList(),
    val styles: List<ChatStyle> = emptyList(),
    val defaultStyleId: String = "style-normal",
    val selectedStyleId: String = "style-normal",
    val messageRailEnabled: Boolean = true,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val fontSizePreset: FontSizePreset = FontSizePreset.SMALL,
    val collapsedProjectIds: Set<String> = emptySet(),
    val pinnedProjectIds: Set<String> = emptySet(),
    val thinkingEffort: String = "high",
    val modelThinkingEfforts: Map<String, String> = emptyMap(),
    val voiceTranscribing: Boolean = false,
    val speechMessageId: String? = null,
    val speechLoading: Boolean = false,
    val selectedSettingsSection: SettingsSection = SettingsSection.Account,
    val settingsCacheRead: Boolean = false,
    val settingsLoadedResources: Set<SettingsResource> = emptySet(),
    val settingsLoadedAtEpochMillis: Map<SettingsResource, Long> = emptyMap(),
    val settingsLoadingResources: Set<SettingsResource> = emptySet(),
    val testingMcpServerIds: Set<String> = emptySet(),
    val mySkills: List<Skill> = emptyList(),
    val marketSkills: List<Skill> = emptyList(),
    val skillsLoaded: Boolean = false,
    val admin: AdminUiState = AdminUiState(),
) {
    val selectedKey: String get() = selectedConversationId ?: NEW_CHAT_KEY
    val transcript: ChatTranscript get() = transcripts[selectedKey] ?: ChatTranscript()
    val selectedModel: Model? get() = models.firstOrNull { it.id == selectedModelId }
    val uploadingAttachmentCount: Int get() = attachmentUploads.count { it.error == null }
    val activeSkill: Skill?
        get() {
            val skillId = pendingSkillId
                ?: conversations.firstOrNull { it.id == selectedConversationId }?.skillId
                ?: return null
            return (mySkills + marketSkills).firstOrNull { it.id == skillId }
        }
    val selectedArtifact: Artifact?
        get() = selectedArtifactId?.let { id ->
            artifacts.values.asSequence().flatten().firstOrNull { it.id == id }
        }
}

class LinHubViewModel(
    private val container: AppContainer,
    private val benchmarkScenario: String? = null,
) : ViewModel() {
    private val _state = MutableStateFlow(LinHubUiState())
    val state = _state.asStateFlow()
    val appearance = state
        .map(::appAppearance)
        .distinctUntilChanged()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = appAppearance(_state.value),
        )
    private val streamJobs = mutableMapOf<String, Job>()
    private val clientGenerationIds = mutableMapOf<String, String>()
    private val failedSendRequests = mutableMapOf<String, SendMessageRequest>()
    private val feedbackMutations = mutableMapOf<String, FeedbackMutation>()
    private val feedbackJobs = mutableMapOf<String, Job>()
    private val chatUploadJobs = mutableMapOf<String, Job>()
    private val chatUploadPayloads = mutableMapOf<String, PendingChatUpload>()
    private val pendingAttachmentEditJobs = mutableMapOf<String, Job>()
    private val cacheFlushJobs = mutableMapOf<String, Job>()
    private val deletedConversationIds = mutableSetOf<String>()
    private val conversationRevisions = mutableMapOf<String, Long>()
    private var conversationSearchJob: Job? = null
    private var mediaSearchJob: Job? = null
    private var mediaLoadJob: Job? = null
    private var destinationPrefetchJob: Job? = null
    private var projectUploadJob: Job? = null
    private var knowledgeUploadJob: Job? = null
    private val knowledgePollJobs = mutableMapOf<String, Job>()
    private var speechJob: Job? = null
    private var cacheObserverJob: Job? = null
    private var preferenceObserverJob: Job? = null
    private var networkObserverJob: Job? = null
    private var networkStatusInitialized = false
    private var benchmarkStreamingRunStarted = false
    private var activeCacheAccountId: String? = null
    private var activeCacheDatabase: LinHubCacheDatabase? = null
    private var lastAppBackgroundedAtEpochMillis: Long? = null
    private var awaitingExternalPaymentReturn = false
    private var externalPaymentRefreshJob: Job? = null
    private var appInForeground = false
    private var pendingNetworkRefresh = false
    private var pendingImageEditRecoveryJob: Job? = null
    private val pendingMessageImageEdits = ConcurrentHashMap<String, PendingMessageImageEdit>()
    private val messageImageEditGate = KeyedSingleFlightGate<String>()
    private val readRequestGate = KeyedSingleFlightGate<String>()
    private val destinationLoadingTracker = ReferenceCountedLoadingTracker<WorkspaceDestination>()
    private val authMutationGate = SingleFlightMutationGate()
    private val skillsMutationGate = SingleFlightMutationGate()
    private val projectsMutationGate = SingleFlightMutationGate()
    private val knowledgeMutationGate = SingleFlightMutationGate()
    private val settingsMutationGate = SingleFlightMutationGate()
    private val billingMutationGate = SingleFlightMutationGate()
    private val adminMutationGate = SingleFlightMutationGate()

    private companion object {
        const val SYNC_USER = "workspace:user"
        const val SYNC_MODELS = "workspace:models"
        const val SYNC_CONVERSATIONS = "workspace:conversations"
        const val SYNC_CONVERSATION_PREFIX = "conversation:"
        const val PAYLOAD_PROJECTS = "projects"
        const val PAYLOAD_KNOWLEDGE = "knowledge"
        const val PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX = "knowledge-documents:"
        const val PAYLOAD_SKILLS = "skills"
        const val PAYLOAD_BILLING = "billing"
        const val PAYLOAD_SETTINGS = "settings"
        const val PAYLOAD_ARTIFACTS_PREFIX = "artifacts:"
        const val PENDING_MESSAGE_IMAGE_EDIT_PREFIX = "operation:message-image:"
        const val PAYLOAD_MEDIA_PREFIX = "media:"
        const val READ_PROJECTS = "read:projects"
        const val READ_KNOWLEDGE_BASES = "read:knowledge-bases"
        const val READ_KNOWLEDGE_DOCUMENTS_PREFIX = "read:knowledge-documents:"
        const val READ_SKILLS = "read:skills"
        const val READ_SKILL_PREFIX = "read:skill:"
        const val READ_ARTIFACTS_PREFIX = "read:artifacts:"
        const val SYNC_PAYLOAD_PREFIX = "payload:"
        const val USER_TTL_MILLIS = 30_000L
        const val CONVERSATIONS_TTL_MILLIS = 30_000L
        const val MODELS_TTL_MILLIS = 15 * 60_000L
        const val STREAM_CACHE_DEBOUNCE_MILLIS = 300L
        const val WORKSPACE_PAYLOAD_TTL_MILLIS = 60_000L
        const val BILLING_PAYLOAD_TTL_MILLIS = 30_000L
        const val MEDIA_PAYLOAD_TTL_MILLIS = 30_000L
        val MEDIA_KINDS = setOf("all", "upload", "generated", "edited")
    }

    init {
        if (BuildConfig.BENCHMARK_ENABLED) {
            _state.value = benchmarkUiState(benchmarkScenario)
        } else {
            startPreferenceObserver()
            startNetworkObserver()
            restoreSession()
        }
    }

    fun setAuthMode(mode: AuthMode) = _state.update { it.copy(authMode = mode, message = null) }

    /** 仅供 Macrobenchmark 变体触发，普通 Debug/Release 构建会直接拒绝。 */
    internal fun runStreamingBenchmark() {
        if (
            !canRunStreamingBenchmark(BuildConfig.BENCHMARK_ENABLED, benchmarkScenario) ||
            benchmarkStreamingRunStarted
        ) {
            return
        }
        benchmarkStreamingRunStarted = true
        val transcriptKey = _state.value.selectedKey
        viewModelScope.launch {
            streamingBenchmarkEvents().forEach { event ->
                if (event is ChatEvent.TextDelta) delay(BENCHMARK_STREAMING_FRAME_MILLIS)
                applyEvent(transcriptKey, event)
            }
        }
    }

    fun authenticate(name: String, email: String, password: String) {
        val authMode = _state.value.authMode
        if (_state.value.authSubmitting) return
        val cleanEmail = email.trim()
        if (cleanEmail.isEmpty() || password.length < 8) {
            showMessage("请输入有效邮箱和至少 8 位密码")
            return
        }
        if (authMode == AuthMode.SignUp && name.trim().isEmpty()) {
            showMessage("请输入昵称")
            return
        }
        if (!authMutationGate.tryAcquire()) return
        // 在协程创建前同步占位，堵住状态重组前的同帧重复登录或注册。
        _state.update { it.copy(authSubmitting = true, message = null) }
        viewModelScope.launch {
            try {
                runSuspendCatching {
                    if (authMode == AuthMode.SignIn) {
                        container.api.signIn(cleanEmail, password)
                    } else {
                        container.api.signUp(name.trim(), cleanEmail, password)
                    }
                    loadWorkspace()
                }.onFailure(::handleError)
            } finally {
                authMutationGate.release()
                _state.update { it.copy(authSubmitting = false) }
            }
        }
    }

    fun signOut() {
        val sessionToken = container.sessionStore.currentToken()
        val accountId = container.sessionStore.currentAccountId()
        container.sessionStore.clear()
        viewModelScope.coroutineContext.cancelChildren()
        streamJobs.values.forEach { it.cancel() }
        streamJobs.clear()
        clientGenerationIds.clear()
        conversationRevisions.clear()
        cacheFlushJobs.values.forEach { it.cancel() }
        cacheFlushJobs.clear()
        feedbackJobs.values.forEach(Job::cancel)
        feedbackJobs.clear()
        feedbackMutations.clear()
        chatUploadJobs.clear()
        chatUploadPayloads.clear()
        pendingAttachmentEditJobs.clear()
        pendingImageEditRecoveryJob?.cancel()
        pendingImageEditRecoveryJob = null
        pendingMessageImageEdits.clear()
        knowledgeUploadJob = null
        knowledgePollJobs.clear()
        projectUploadJob = null
        awaitingExternalPaymentReturn = false
        externalPaymentRefreshJob = null
        lastAppBackgroundedAtEpochMillis = null
        pendingNetworkRefresh = false
        speechJob?.cancel()
        speechJob = null
        container.speechPlaybackController.stop()
        deactivateCache()
        accountId?.let(container.cacheDatabaseManager::deleteFor)
        _state.value = LinHubUiState(phase = AppPhase.Authentication)
        startPreferenceObserver()
        networkStatusInitialized = false
        startNetworkObserver()
        viewModelScope.launch {
            container.api.signOut(sessionToken)
        }
    }

    fun newConversation() = enterNewConversation()

    fun newConversationFromHeader() {
        val snapshot = _state.value
        val selectedProjectId = snapshot.conversations
            .firstOrNull { it.id == snapshot.selectedConversationId }
            ?.projectId
        val target = resolveHeaderNewChatContext(
            hasSelectedConversation = snapshot.selectedConversationId != null,
            selectedConversationProjectId = selectedProjectId,
            pendingProjectId = snapshot.pendingProjectId,
            availableProjectIds = snapshot.projects.mapTo(mutableSetOf(), Project::id),
        )
        enterNewConversation(
            projectId = target.projectId,
            temporaryProjectChat = target.temporaryProjectChat,
        )
    }

    private fun enterNewConversation(
        projectId: String? = null,
        temporaryProjectChat: Boolean = false,
    ) {
        clearChatAttachmentUploads()
        _state.update {
            val project = projectId?.let { id -> it.projects.firstOrNull { project -> project.id == id } }
            val modelId = resolveChatModelId(
                it.models,
                project?.modelId,
                it.defaultModelId,
            )
            it.copy(
                destination = WorkspaceDestination.Chat,
                selectedConversationId = null,
                pendingProjectId = project?.id,
                temporaryProjectChat = temporaryProjectChat && project == null,
                pendingSkillId = null,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(it, modelId),
                transcripts = it.putTranscript(NEW_CHAT_KEY, ChatTranscript()),
                draft = "",
                quotedText = null,
                pendingAttachments = emptyList(),
                selectedArtifactId = null,
                selectedStyleId = it.defaultStyleId,
            )
        }
    }

    fun openConversation(id: String, searchMatchLeafId: String? = null) {
        if (
            _state.value.destination == WorkspaceDestination.Chat &&
            _state.value.selectedConversationId == id &&
            searchMatchLeafId == null
        ) return
        clearChatAttachmentUploads()
        val listedConversation = _state.value.searchResults?.firstOrNull { it.id == id }
            ?: _state.value.conversations.firstOrNull { it.id == id }
        _state.update {
            val modelId = resolveChatModelId(
                it.models,
                listedConversation?.modelId,
                it.selectedModelId,
            )
            it.copy(
                destination = WorkspaceDestination.Chat,
                selectedConversationId = id,
                pendingProjectId = null,
                temporaryProjectChat = false,
                pendingSkillId = null,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(it, modelId),
                draft = "",
                quotedText = null,
                pendingAttachments = emptyList(),
                selectedArtifactId = null,
                selectedStyleId = listedConversation?.styleId ?: it.defaultStyleId,
                leafOverrides = if (searchMatchLeafId != null) {
                    it.leafOverrides + (id to searchMatchLeafId)
                } else {
                    it.leafOverrides
                },
            )
        }
        loadConversation(id)
        loadArtifacts(id)
        listedConversation?.skillId?.let(::loadSkillContext)
        if (searchMatchLeafId != null && searchMatchLeafId != listedConversation?.currentLeafId) {
            persistLeafSelection(id, searchMatchLeafId, rollbackOnFailure = false)
        }
    }

    fun updateConversationSearch(query: String) {
        _state.update {
            it.copy(
                conversationSearch = query,
                searchResults = if (query.isBlank()) null else it.searchResults,
            )
        }
        conversationSearchJob?.cancel()
        if (query.isBlank()) return
        conversationSearchJob = viewModelScope.launch {
            delay(250)
            runSuspendCatching { container.api.conversations(query.trim()) }
                .onSuccess { results ->
                    if (_state.value.conversationSearch == query) {
                        _state.update { it.copy(searchResults = results) }
                    }
                }
                .onFailure(::handleError)
        }
    }

    fun selectDestination(destination: WorkspaceDestination) {
        if (destination != WorkspaceDestination.Files) mediaLoadJob?.cancel()
        _state.update {
            it.copy(
                destination = destination,
                mediaPreview = if (destination == WorkspaceDestination.Files) {
                    it.mediaPreview
                } else {
                    null
                },
            )
        }
        // Macrobenchmark 变体只测本地 Compose 导航，不允许网络、账号或 Room 波动污染帧时间。
        if (BuildConfig.BENCHMARK_ENABLED) return
        when (destination) {
            WorkspaceDestination.Projects -> loadProjectSurface(ProjectSurface.List)
            WorkspaceDestination.Knowledge -> loadKnowledgeBases()
            WorkspaceDestination.Files -> loadMediaAssets(reset = true)
            WorkspaceDestination.Skills -> loadSkills()
            WorkspaceDestination.Billing -> loadBilling()
            WorkspaceDestination.Settings -> loadSettings()
            WorkspaceDestination.Admin -> loadAdmin()
            WorkspaceDestination.Chat -> Unit
        }
    }

    fun startProjectConversation(project: Project) {
        clearChatAttachmentUploads()
        _state.update {
            val modelId = resolveChatModelId(it.models, project.modelId, it.selectedModelId)
            it.copy(
                destination = WorkspaceDestination.Chat,
                selectedConversationId = null,
                pendingProjectId = project.id,
                temporaryProjectChat = false,
                pendingSkillId = null,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(it, modelId),
                transcripts = it.putTranscript(NEW_CHAT_KEY, ChatTranscript()),
                draft = "",
                quotedText = null,
                pendingAttachments = emptyList(),
                selectedArtifactId = null,
                selectedStyleId = it.defaultStyleId,
            )
        }
    }

    fun openProjectEditor(project: Project) {
        if (project.clientMutationState == "pending") return
        _state.update {
            it.copy(
                destination = WorkspaceDestination.Projects,
                projectEditorRequestId = project.id,
            )
        }
        loadProjectSurface(ProjectSurface.Editor)
    }

    fun prepareProjectEditor() {
        loadProjectSurface(ProjectSurface.Editor)
    }

    fun openProjectDetails(project: Project) {
        if (project.clientMutationState == "pending") return
        _state.update {
            it.copy(
                destination = WorkspaceDestination.Projects,
                projectConversationRequestId = project.id,
            )
        }
        loadProjectSurface(ProjectSurface.Conversations)
        loadProjectConversations(project)
    }

    fun consumeProjectEditorRequest(projectId: String) {
        _state.update {
            if (it.projectEditorRequestId == projectId) {
                it.copy(projectEditorRequestId = null)
            } else {
                it
            }
        }
    }

    fun consumeProjectConversationRequest(projectId: String) {
        _state.update {
            if (it.projectConversationRequestId == projectId) {
                it.copy(projectConversationRequestId = null)
            } else {
                it
            }
        }
    }

    fun loadProjectConversations(project: Project) {
        // Benchmark 交互夹具已预载详情，禁止 UI smoke 意外访问真实后端。
        if (BuildConfig.BENCHMARK_ENABLED) return
        if (project.id in _state.value.loadingProjectConversationIds) return
        viewModelScope.launch {
            _state.update {
                it.copy(
                    loadingProjectConversationIds = it.loadingProjectConversationIds + project.id,
                )
            }
            runSuspendCatching { container.api.projectConversations(project.id) }
                .onSuccess { conversations ->
                    _state.update {
                        it.copy(projectConversations = it.projectConversations + (project.id to conversations))
                    }
                }
                .onFailure(::handleError)
            _state.update {
                it.copy(
                    loadingProjectConversationIds = it.loadingProjectConversationIds - project.id,
                )
            }
        }
    }

    fun startSkillConversation(skill: Skill) {
        clearChatAttachmentUploads()
        _state.update {
            val modelId = resolveChatModelId(
                it.models,
                skill.defaultModelId,
                it.selectedModelId,
            )
            it.copy(
                destination = WorkspaceDestination.Chat,
                selectedConversationId = null,
                pendingProjectId = null,
                temporaryProjectChat = false,
                pendingSkillId = skill.id,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(it, modelId),
                marketSkills = if (
                    it.mySkills.any { item -> item.id == skill.id } ||
                    it.marketSkills.any { item -> item.id == skill.id }
                ) {
                    it.marketSkills
                } else {
                    listOf(skill) + it.marketSkills
                },
                transcripts = it.putTranscript(NEW_CHAT_KEY, ChatTranscript()),
                draft = "",
                quotedText = null,
                pendingAttachments = emptyList(),
                selectedArtifactId = null,
                selectedStyleId = it.defaultStyleId,
            )
        }
    }

    fun saveSkill(
        skill: Skill?,
        name: String,
        emoji: String,
        description: String,
        systemPrompt: String,
        greeting: String,
        defaultModelId: String?,
        shareToMarket: Boolean,
    ) {
        val cleanName = name.trim()
        val cleanPrompt = systemPrompt.trim()
        if (cleanName.isEmpty() || cleanPrompt.isEmpty()) {
            showMessage("请输入技能名称和系统提示词")
            return
        }
        if (skill?.kind == "pack") {
            showMessage("技能包由系统维护，不能在客户端编辑")
            return
        }
        if (!tryStartDestinationMutation(skillsMutationGate, WorkspaceDestination.Skills)) return
        val now = java.time.Instant.now().toString()
        val optimisticId = skill?.id ?: "optimistic-skill-${UUID.randomUUID()}"
        val optimistic = skill?.copy(
            name = cleanName,
            emoji = emoji.ifBlank { "\uD83E\uDD16" },
            description = description.trim(),
            systemPrompt = cleanPrompt,
            greeting = greeting.trim().takeIf(String::isNotEmpty),
            defaultModelId = defaultModelId,
            visibility = if (shareToMarket) "pending" else "private",
            updatedAt = now,
            clientMutationState = "pending",
            clientMutationError = null,
        ) ?: Skill(
            id = optimisticId,
            ownerId = _state.value.user?.id.orEmpty(),
            name = cleanName,
            emoji = emoji.ifBlank { "\uD83E\uDD16" },
            description = description.trim(),
            systemPrompt = cleanPrompt,
            greeting = greeting.trim().takeIf(String::isNotEmpty),
            defaultModelId = defaultModelId,
            visibility = if (shareToMarket) "pending" else "private",
            reviewStatus = if (shareToMarket) "pending" else "draft",
            createdAt = now,
            updatedAt = now,
            clientMutationState = "pending",
        )
        _state.update { state ->
            state.copy(
                mySkills = (listOf(optimistic) + state.mySkills.filterNot {
                    it.id == optimisticId
                }).sortedByDescending(Skill::updatedAt),
                marketSkills = state.marketSkills.map { current ->
                    if (current.id == optimisticId) optimistic else current
                },
            )
        }
        viewModelScope.launch {
            try {
                runSuspendCatching {
                    container.api.saveSkill(
                        SaveSkillRequest(
                            id = skill?.id,
                            name = cleanName,
                            emoji = emoji.ifBlank { "\uD83E\uDD16" },
                            description = description.trim(),
                            systemPrompt = cleanPrompt,
                            greeting = greeting.trim().takeIf(String::isNotEmpty),
                            defaultModelId = defaultModelId,
                            shareToMarket = shareToMarket,
                        ),
                    )
                }.onSuccess { saved ->
                    _state.update { state ->
                        state.copy(
                            mySkills = (
                                listOf(saved) + state.mySkills.filterNot {
                                    it.id == saved.id || it.id == optimisticId
                                }
                            ).sortedByDescending(Skill::updatedAt),
                            marketSkills = when (saved.visibility) {
                                "public" -> (listOf(saved) + state.marketSkills.filterNot {
                                    it.id == saved.id
                                }).sortedByDescending(Skill::usageCount)
                                else -> state.marketSkills.filterNot { it.id == saved.id }
                            },
                            message = if (skill == null) "技能已创建" else "技能已更新",
                        )
                    }
                    cacheSkillsSnapshot()
                }.onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update { state ->
                        state.copy(
                            mySkills = if (skill == null) {
                                state.mySkills.filterNot { it.id == optimisticId }
                            } else {
                                state.mySkills.map { current ->
                                    if (
                                        current.id == optimisticId &&
                                        current.clientMutationState == "pending"
                                    ) skill else current
                                }
                            },
                            marketSkills = if (skill == null) {
                                state.marketSkills.filterNot { it.id == optimisticId }
                            } else {
                                state.marketSkills.map { current ->
                                    if (
                                        current.id == optimisticId &&
                                        current.clientMutationState == "pending"
                                    ) skill else current
                                }
                            },
                            message = error.userMessage(),
                        )
                    }
                }
            } finally {
                finishDestinationMutation(skillsMutationGate, WorkspaceDestination.Skills)
            }
        }
    }

    fun deleteSkill(skill: Skill) {
        if (skill.kind == "pack") {
            showMessage("技能包不能删除")
            return
        }
        _state.update {
            it.copy(
                mySkills = it.mySkills.filterNot { item -> item.id == skill.id },
                marketSkills = it.marketSkills.filterNot { item -> item.id == skill.id },
                pendingSkillId = if (it.pendingSkillId == skill.id) null else it.pendingSkillId,
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteSkill(skill.id) }
                .onSuccess { cacheSkillsSnapshot() }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            mySkills = (it.mySkills + skill)
                                .distinctBy(Skill::id)
                                .sortedByDescending(Skill::updatedAt),
                            marketSkills = if (skill.visibility == "public") {
                                (it.marketSkills + skill)
                                    .distinctBy(Skill::id)
                                    .sortedByDescending(Skill::usageCount)
                            } else {
                                it.marketSkills
                            },
                            message = error.userMessage(),
                        )
                    }
                    cacheSkillsSnapshot()
                }
        }
    }

    fun refreshSkills() = loadSkills(force = true)

    fun saveProject(
        project: Project?,
        name: String,
        description: String,
        instructions: String,
        color: String?,
        modelId: String?,
        knowledgeBaseIds: List<String>,
    ) {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return
        if (!tryStartDestinationMutation(projectsMutationGate, WorkspaceDestination.Projects)) return
        val now = java.time.Instant.now().toString()
        val optimisticId = project?.id ?: "optimistic-project-${UUID.randomUUID()}"
        val linkedKnowledge = _state.value.knowledgeBases
            .filter { it.id in knowledgeBaseIds }
            .map { knowledge ->
                com.linhub.android.core.model.ProjectKnowledgeBase(
                    id = knowledge.id,
                    name = knowledge.name,
                    description = knowledge.description,
                    documentCount = knowledge.documentCount,
                    totalChunks = knowledge.totalChunks,
                )
            }
        val optimistic = project?.copy(
            name = cleanName,
            description = description.trim().takeIf(String::isNotEmpty),
            instructions = instructions,
            color = color,
            modelId = modelId,
            knowledgeBaseIds = knowledgeBaseIds,
            knowledgeBases = linkedKnowledge,
            updatedAt = now,
            clientMutationState = "pending",
            clientMutationError = null,
        ) ?: Project(
            id = optimisticId,
            name = cleanName,
            description = description.trim().takeIf(String::isNotEmpty),
            instructions = instructions,
            color = color,
            modelId = modelId,
            knowledgeBaseIds = knowledgeBaseIds,
            knowledgeBases = linkedKnowledge,
            createdAt = now,
            updatedAt = now,
            clientMutationState = "pending",
        )
        _state.update { state ->
            state.copy(
                projects = (listOf(optimistic) + state.projects.filterNot {
                    it.id == optimisticId
                }).sortedByDescending(Project::updatedAt),
            )
        }
        viewModelScope.launch {
            try {
                runSuspendCatching {
                    container.api.saveProject(
                        SaveProjectRequest(
                            id = project?.id,
                            name = cleanName,
                            description = description.trim(),
                            instructions = instructions,
                            color = color,
                            modelId = modelId,
                            knowledgeBaseIds = knowledgeBaseIds,
                        ),
                    )
                }.onSuccess { saved ->
                    _state.update { state ->
                        state.copy(
                            projects = (
                                listOf(saved) + state.projects.filterNot {
                                    it.id == saved.id || it.id == optimisticId
                                }
                            ).sortedByDescending { it.updatedAt },
                        )
                    }
                    cacheProjectsSnapshot()
                }.onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update { state ->
                        state.copy(
                            projects = if (project == null) {
                                state.projects.filterNot { it.id == optimisticId }
                            } else {
                                state.projects.map { current ->
                                    if (
                                        current.id == optimisticId &&
                                        current.clientMutationState == "pending"
                                    ) project else current
                                }
                            },
                            message = error.userMessage(),
                        )
                    }
                }
            } finally {
                finishDestinationMutation(projectsMutationGate, WorkspaceDestination.Projects)
            }
        }
    }

    fun deleteProject(project: Project) {
        val pendingProjectId = _state.value.pendingProjectId
        val projectEditorRequestId = _state.value.projectEditorRequestId
        val projectConversationRequestId = _state.value.projectConversationRequestId
        val affectedConversations = _state.value.conversations.filter { it.projectId == project.id }
        val affectedConversationsById = affectedConversations.associateBy(Conversation::id)
        val loadedProjectConversations = _state.value.projectConversations[project.id]
        _state.update {
            it.copy(
                projects = it.projects.filterNot { item -> item.id == project.id },
                conversations = it.conversations.map { conversation ->
                    if (conversation.projectId == project.id) conversation.copy(projectId = null)
                    else conversation
                },
                projectConversations = it.projectConversations - project.id,
                pendingProjectId = if (it.pendingProjectId == project.id) null else it.pendingProjectId,
                projectEditorRequestId = if (it.projectEditorRequestId == project.id) {
                    null
                } else {
                    it.projectEditorRequestId
                },
                projectConversationRequestId = if (it.projectConversationRequestId == project.id) {
                    null
                } else {
                    it.projectConversationRequestId
                },
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteProject(project.id) }
                .onSuccess {
                    cacheProjectsSnapshot()
                    refreshConversations()
                }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            projects = (it.projects + project)
                                .distinctBy(Project::id)
                                .sortedByDescending(Project::updatedAt),
                            conversations = it.conversations.map { conversation ->
                                affectedConversationsById[conversation.id] ?: conversation
                            },
                            projectConversations = loadedProjectConversations?.let { loaded ->
                                it.projectConversations + (project.id to loaded)
                            } ?: it.projectConversations,
                            pendingProjectId = if (pendingProjectId == project.id) {
                                project.id
                            } else {
                                it.pendingProjectId
                            },
                            projectEditorRequestId = if (projectEditorRequestId == project.id) {
                                project.id
                            } else {
                                it.projectEditorRequestId
                            },
                            projectConversationRequestId = if (
                                projectConversationRequestId == project.id
                            ) {
                                project.id
                            } else {
                                it.projectConversationRequestId
                            },
                            message = error.userMessage(),
                        )
                    }
                    cacheProjectsSnapshot()
                }
        }
    }

    fun uploadProjectFiles(
        project: Project,
        uris: List<Uri>,
        mirrorKnowledgeBaseId: String?,
    ) {
        val selectedUris = uris.distinct()
        if (selectedUris.isEmpty()) return
        if (selectedUris.size > MAX_PROJECT_UPLOAD_COUNT) {
            showMessage("每次最多上传 $MAX_PROJECT_UPLOAD_COUNT 个项目文件")
            return
        }
        if (
            mirrorKnowledgeBaseId != null &&
            _state.value.knowledgeBases.none { it.id == mirrorKnowledgeBaseId }
        ) {
            showMessage("目标知识库不存在或已被删除")
            return
        }
        if (projectUploadJob?.isActive == true) {
            showMessage("已有一批项目文件正在上传")
            return
        }
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            setDestinationLoading(WorkspaceDestination.Projects, true)
            var successCount = 0
            var mirrorSuccessCount = 0
            var sessionExpired = false
            val failures = mutableListOf<String>()
            try {
                for ((index, uri) in selectedUris.withIndex()) {
                    val fallbackName = uri.lastPathSegment ?: "第 ${index + 1} 个文件"
                    var displayName = fallbackName
                    val temporaryFileId = "optimistic-project-file-${UUID.randomUUID()}"
                    val temporaryKnowledgeId = "optimistic-kb-document-${UUID.randomUUID()}"
                    val createdAt = java.time.Instant.now().toString()
                    _state.update { state ->
                        state.copy(
                            projects = state.projects.map { current ->
                                if (current.id == project.id) {
                                    current.copy(
                                        files = listOf(
                                            ProjectFile(
                                                id = temporaryFileId,
                                                name = fallbackName,
                                                mimeType = "application/octet-stream",
                                                size = 0,
                                                createdAt = createdAt,
                                                clientMutationState = "pending",
                                            ),
                                        ) + current.files,
                                    )
                                } else current
                            },
                        )
                    }
                    _state.update {
                        it.copy(
                            projectUploadProgress = ProjectUploadProgress(
                                projectId = project.id,
                                completed = index,
                                total = selectedUris.size,
                                currentName = fallbackName,
                                mirrorKnowledgeBaseId = mirrorKnowledgeBaseId,
                            )
                        )
                    }
                    val result = runSuspendCatching {
                        val picked = withContext(Dispatchers.IO) {
                            container.readContent(uri, MAX_PROJECT_FILE_BYTES)
                        }
                        displayName = picked.name
                        _state.update {
                            val projects = it.projects.map { current ->
                                if (current.id == project.id) {
                                    current.copy(
                                        files = current.files.map { file ->
                                            if (file.id == temporaryFileId) {
                                                file.copy(
                                                    name = picked.name,
                                                    mimeType = picked.mimeType,
                                                    size = picked.bytes.size.toLong(),
                                                )
                                            } else file
                                        },
                                    )
                                } else current
                            }
                            val knowledgeDocuments = mirrorKnowledgeBaseId?.let { knowledgeBaseId ->
                                val current = it.knowledgeDocuments[knowledgeBaseId].orEmpty()
                                it.knowledgeDocuments + (
                                    knowledgeBaseId to (
                                        listOf(
                                            KnowledgeDocument(
                                                id = temporaryKnowledgeId,
                                                knowledgeBaseId = knowledgeBaseId,
                                                name = picked.name,
                                                mimeType = picked.mimeType,
                                                size = picked.bytes.size.toLong(),
                                                status = "processing",
                                                createdAt = createdAt,
                                                clientMutationState = "pending",
                                            ),
                                        ) + current
                                    )
                                )
                            } ?: it.knowledgeDocuments
                            it.copy(
                                projects = projects,
                                knowledgeDocuments = knowledgeDocuments,
                                projectUploadProgress = ProjectUploadProgress(
                                    projectId = project.id,
                                    completed = index,
                                    total = selectedUris.size,
                                    currentName = picked.name,
                                    mirrorKnowledgeBaseId = mirrorKnowledgeBaseId,
                                ),
                            )
                        }
                        val projectFile = container.api.uploadProjectFile(
                            project.id,
                            picked.name,
                            picked.mimeType,
                            picked.bytes,
                        )
                        val knowledgeDocument = mirrorKnowledgeBaseId?.let { knowledgeBaseId ->
                            runSuspendCatching {
                                container.api.uploadKnowledgeDocument(
                                    knowledgeBaseId,
                                    picked.name,
                                    picked.mimeType,
                                    picked.bytes,
                                )
                            }
                        }
                        Triple(picked.name, projectFile, knowledgeDocument)
                    }
                    result.onSuccess { (name, file, knowledgeResult) ->
                        successCount += 1
                        _state.update { state ->
                            state.copy(
                                projects = state.projects.map { current ->
                                    if (current.id == project.id) {
                                        current.copy(
                                            files = listOf(file) + current.files.filterNot {
                                                it.id == file.id || it.id == temporaryFileId
                                            },
                                        )
                                    } else {
                                        current
                                    }
                                },
                            )
                        }
                        knowledgeResult?.onSuccess { document ->
                            mirrorSuccessCount += 1
                            val knowledgeBaseId = requireNotNull(mirrorKnowledgeBaseId)
                            _state.update { state ->
                                val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                                state.copy(
                                    knowledgeDocuments = state.knowledgeDocuments + (
                                        knowledgeBaseId to (
                                            listOf(document) + current.filterNot {
                                                it.id == document.id || it.id == temporaryKnowledgeId
                                            }
                                        )
                                    ),
                                )
                            }
                        }?.onFailure { error ->
                            if (handleUnauthorized(error)) {
                                sessionExpired = true
                            } else {
                                failures += "$name：项目已保存，加入知识库失败：${error.userMessage()}"
                                val knowledgeBaseId = requireNotNull(mirrorKnowledgeBaseId)
                                _state.update { state ->
                                    val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                                    state.copy(
                                        knowledgeDocuments = state.knowledgeDocuments + (
                                            knowledgeBaseId to current.map { document ->
                                                if (document.id == temporaryKnowledgeId) {
                                                    document.copy(
                                                        status = "error",
                                                        errorMessage = error.userMessage(),
                                                        clientMutationState = "failed",
                                                        clientMutationError = error.userMessage(),
                                                    )
                                                } else document
                                            }
                                        ),
                                    )
                                }
                            }
                        }
                    }.onFailure { error ->
                        if (handleUnauthorized(error)) {
                            sessionExpired = true
                        } else {
                            failures += "$displayName：${error.userMessage()}"
                            _state.update { state ->
                                val knowledgeDocuments = mirrorKnowledgeBaseId?.let { knowledgeBaseId ->
                                    val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                                    state.knowledgeDocuments + (
                                        knowledgeBaseId to current.map { document ->
                                            if (document.id == temporaryKnowledgeId) {
                                                document.copy(
                                                    status = "error",
                                                    errorMessage = "项目文件上传失败，未加入知识库",
                                                    clientMutationState = "failed",
                                                    clientMutationError = error.userMessage(),
                                                )
                                            } else document
                                        }
                                    )
                                } ?: state.knowledgeDocuments
                                state.copy(
                                    projects = state.projects.map { current ->
                                        if (current.id == project.id) {
                                            current.copy(
                                                files = current.files.map { file ->
                                                    if (file.id == temporaryFileId) {
                                                        file.copy(
                                                            clientMutationState = "failed",
                                                            clientMutationError = error.userMessage(),
                                                        )
                                                    } else file
                                                },
                                            )
                                        } else current
                                    },
                                    knowledgeDocuments = knowledgeDocuments,
                                )
                            }
                        }
                    }
                    if (sessionExpired) break
                }
                if (!sessionExpired) {
                    if (
                        mirrorKnowledgeBaseId != null &&
                        mirrorSuccessCount > 0 &&
                        mirrorKnowledgeBaseId !in project.knowledgeBaseIds
                    ) {
                        runSuspendCatching {
                            container.api.saveProject(
                                SaveProjectRequest(
                                    id = project.id,
                                    name = project.name,
                                    description = project.description,
                                    instructions = project.instructions,
                                    color = project.color,
                                    modelId = project.modelId,
                                    knowledgeBaseIds = project.knowledgeBaseIds + mirrorKnowledgeBaseId,
                                ),
                            )
                        }.onSuccess { saved ->
                            _state.update { state ->
                                state.copy(
                                    projects = state.projects.map { current ->
                                        if (current.id == saved.id) saved else current
                                    },
                                )
                            }
                        }.onFailure { error ->
                            if (handleUnauthorized(error)) {
                                sessionExpired = true
                            } else {
                                failures += "文件已加入知识库，但项目关联失败：${error.userMessage()}"
                            }
                        }
                    }
                    if (sessionExpired) return@launch
                    refreshProjectsIndex()
                    if (mirrorKnowledgeBaseId != null && mirrorSuccessCount > 0) {
                        cacheKnowledgeDocumentsSnapshot(mirrorKnowledgeBaseId)
                        scheduleKnowledgePolling(
                            mirrorKnowledgeBaseId,
                            _state.value.knowledgeDocuments[mirrorKnowledgeBaseId].orEmpty(),
                        )
                        refreshKnowledgeBaseIndex()
                    }
                    showMessage(projectUploadResultMessage(successCount, failures, mirrorKnowledgeBaseId != null))
                }
            } finally {
                _state.update { it.copy(projectUploadProgress = null) }
                setDestinationLoading(WorkspaceDestination.Projects, false)
                if (projectUploadJob === ownerJob) projectUploadJob = null
            }
        }
        projectUploadJob = ownerJob
        ownerJob.start()
    }

    fun deleteProjectFile(project: Project, file: ProjectFile) {
        if (file.clientMutationState != null) {
            _state.update { state ->
                state.copy(
                    projects = state.projects.map { current ->
                        if (current.id == project.id) {
                            current.copy(files = current.files.filterNot { it.id == file.id })
                        } else current
                    },
                )
            }
            return
        }
        _state.update { state ->
            state.copy(
                projects = state.projects.map { current ->
                    if (current.id == project.id) {
                        current.copy(files = current.files.filterNot { it.id == file.id })
                    } else {
                        current
                    }
                },
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteProjectFile(file.id) }
                .onSuccess { refreshProjectsIndex() }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update { state ->
                        state.copy(
                            projects = state.projects.map { current ->
                                if (current.id == project.id) {
                                    current.copy(files = (current.files + file).distinctBy(ProjectFile::id))
                                } else {
                                    current
                                }
                            },
                            message = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun saveKnowledgeBase(knowledgeBase: KnowledgeBase?, name: String, description: String) {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return
        if (!tryStartDestinationMutation(knowledgeMutationGate, WorkspaceDestination.Knowledge)) return
        val now = java.time.Instant.now().toString()
        val optimisticId = knowledgeBase?.id ?: "optimistic-kb-${UUID.randomUUID()}"
        val previousSelectedId = _state.value.selectedKnowledgeBaseId
        val optimistic = knowledgeBase?.copy(
            name = cleanName,
            description = description.trim().takeIf(String::isNotEmpty),
            updatedAt = now,
            clientMutationState = "pending",
            clientMutationError = null,
        ) ?: KnowledgeBase(
            id = optimisticId,
            name = cleanName,
            description = description.trim().takeIf(String::isNotEmpty),
            createdAt = now,
            updatedAt = now,
            clientMutationState = "pending",
        )
        _state.update { state ->
            state.copy(
                knowledgeBases = (listOf(optimistic) + state.knowledgeBases.filterNot {
                    it.id == optimisticId
                }).sortedByDescending(KnowledgeBase::updatedAt),
                selectedKnowledgeBaseId = optimisticId,
                knowledgeDocuments = if (knowledgeBase == null) {
                    state.knowledgeDocuments + (optimisticId to emptyList())
                } else {
                    state.knowledgeDocuments
                },
            )
        }
        viewModelScope.launch {
            try {
                val result = runSuspendCatching {
                    container.api.saveKnowledgeBase(
                        SaveKnowledgeBaseRequest(
                            id = knowledgeBase?.id,
                            name = cleanName,
                            description = description.trim(),
                        ),
                    )
                }
                result.onSuccess { saved ->
                    _state.update { state ->
                        state.copy(
                            knowledgeBases = (
                                listOf(saved) + state.knowledgeBases.filterNot {
                                    it.id == saved.id || it.id == optimisticId
                                }
                            ).sortedByDescending { it.updatedAt },
                            selectedKnowledgeBaseId = saved.id,
                            knowledgeDocuments = if (knowledgeBase == null) {
                                (state.knowledgeDocuments - optimisticId) + (saved.id to emptyList())
                            } else {
                                state.knowledgeDocuments
                            },
                        )
                    }
                }.onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update { state ->
                        state.copy(
                            knowledgeBases = if (knowledgeBase == null) {
                                state.knowledgeBases.filterNot { it.id == optimisticId }
                            } else {
                                state.knowledgeBases.map { current ->
                                    if (
                                        current.id == optimisticId &&
                                        current.clientMutationState == "pending"
                                    ) knowledgeBase else current
                                }
                            },
                            selectedKnowledgeBaseId = if (
                                state.selectedKnowledgeBaseId == optimisticId
                            ) previousSelectedId else state.selectedKnowledgeBaseId,
                            knowledgeDocuments = if (knowledgeBase == null) {
                                state.knowledgeDocuments - optimisticId
                            } else {
                                state.knowledgeDocuments
                            },
                            message = error.userMessage(),
                        )
                    }
                }
                if (result.isSuccess) {
                    runSuspendCatching { container.api.knowledgeBases() }
                        .onSuccess { refreshed ->
                            _state.update { it.copy(knowledgeBases = refreshed) }
                            writeCachedPayload(PAYLOAD_KNOWLEDGE, refreshed)
                        }
                        .onFailure(::handleBackgroundError)
                }
            } finally {
                finishDestinationMutation(knowledgeMutationGate, WorkspaceDestination.Knowledge)
            }
        }
    }

    fun deleteKnowledgeBase(knowledgeBase: KnowledgeBase) {
        val previousProjects = _state.value.projects
        _state.update {
            it.copy(
                knowledgeBases = it.knowledgeBases.filterNot { item -> item.id == knowledgeBase.id },
                knowledgeDocuments = it.knowledgeDocuments - knowledgeBase.id,
                selectedKnowledgeBaseId = if (it.selectedKnowledgeBaseId == knowledgeBase.id) {
                    null
                } else {
                    it.selectedKnowledgeBaseId
                },
                projects = it.projects.map { project ->
                    project.copy(
                        knowledgeBaseIds = project.knowledgeBaseIds - knowledgeBase.id,
                        knowledgeBases = project.knowledgeBases.filterNot { linked ->
                            linked.id == knowledgeBase.id
                        },
                    )
                },
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteKnowledgeBase(knowledgeBase.id) }
                .onSuccess {
                    cacheKnowledgeSnapshot()
                    activeCacheDatabase?.cachedPayloadDao()
                        ?.delete("$PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX${knowledgeBase.id}")
                    loadProjects(force = true)
                }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            knowledgeBases = (it.knowledgeBases + knowledgeBase)
                                .distinctBy(KnowledgeBase::id)
                                .sortedByDescending(KnowledgeBase::updatedAt),
                            projects = previousProjects,
                            message = error.userMessage(),
                        )
                    }
                    cacheKnowledgeSnapshot()
                }
        }
    }

    fun selectKnowledgeBase(id: String?) {
        if (
            id != null &&
            _state.value.knowledgeBases.firstOrNull { it.id == id }
                ?.clientMutationState == "pending"
        ) return
        _state.update { it.copy(selectedKnowledgeBaseId = id) }
        // Benchmark 交互夹具已预载文档，禁止 UI smoke 意外访问真实后端。
        if (BuildConfig.BENCHMARK_ENABLED) return
        if (id != null) loadKnowledgeDocuments(id)
    }

    fun updateMediaKind(kind: String) {
        if (kind !in MEDIA_KINDS || kind == _state.value.mediaKind) return
        _state.update {
            it.copy(
                mediaKind = kind,
                mediaAssets = emptyList(),
                mediaNextCursor = null,
                mediaResultKey = null,
                mediaLoadedAtEpochMillis = null,
            )
        }
        loadMediaAssets(reset = true)
    }

    fun updateMediaQuery(query: String) {
        _state.update { it.copy(mediaQuery = query) }
        mediaSearchJob?.cancel()
        mediaSearchJob = viewModelScope.launch {
            delay(250)
            _state.update {
                it.copy(
                    mediaAssets = emptyList(),
                    mediaNextCursor = null,
                    mediaResultKey = null,
                    mediaLoadedAtEpochMillis = null,
                )
            }
            loadMediaAssets(reset = true)
        }
    }

    fun loadMoreMedia() {
        if (_state.value.mediaNextCursor != null) loadMediaAssets(reset = false)
    }

    fun deleteMediaAsset(asset: MediaAsset) {
        _state.update {
            it.copy(
                mediaAssets = it.mediaAssets.filterNot { item -> item.id == asset.id },
                mediaPreview = it.mediaPreview?.takeUnless { preview ->
                    preview.asset.id == asset.id
                },
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteMediaAsset(asset.id) }
                .onSuccess { cacheMediaSnapshot() }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            mediaAssets = (it.mediaAssets + asset)
                                .distinctBy(MediaAsset::id)
                                .sortedByDescending(MediaAsset::createdAt),
                            message = error.userMessage(),
                        )
                    }
                    cacheMediaSnapshot()
                }
        }
    }

    fun openMediaPreview(asset: MediaAsset) {
        val loadSource = asset.previewLoadSource()
        _state.update {
            it.copy(
                mediaPreview = MediaPreviewUiState(
                    asset = asset,
                    loading = loadSource != MediaPreviewLoadSource.None,
                ),
            )
        }
        if (loadSource == MediaPreviewLoadSource.None) return
        viewModelScope.launch {
            runSuspendCatching {
                when (loadSource) {
                    MediaPreviewLoadSource.Metadata -> PreviewLoadResult.Metadata(
                        container.api.mediaAssetMetadata(asset.id),
                    )
                    MediaPreviewLoadSource.Bytes -> PreviewLoadResult.Bytes(
                        container.api.downloadBytes(asset.url),
                    )
                    MediaPreviewLoadSource.None -> error("无需加载预览")
                }
            }.onSuccess { result ->
                _state.update { state ->
                    val preview = state.mediaPreview
                    if (preview?.asset?.id == asset.id) {
                        state.copy(
                            mediaPreview = preview.copy(
                                asset = when (result) {
                                    is PreviewLoadResult.Metadata -> result.asset
                                    is PreviewLoadResult.Bytes -> preview.asset
                                },
                                bytes = (result as? PreviewLoadResult.Bytes)?.bytes,
                                loading = false,
                                error = null,
                            ),
                        )
                    } else {
                        state
                    }
                }
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update { state ->
                    val preview = state.mediaPreview
                    if (preview?.asset?.id == asset.id) {
                        state.copy(
                            mediaPreview = preview.copy(
                                loading = false,
                                error = error.userMessage(),
                            ),
                        )
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun closeMediaPreview() = _state.update { it.copy(mediaPreview = null) }

    fun downloadMediaAsset(asset: MediaAsset, destination: Uri) {
        if (asset.id in _state.value.downloadingMediaIds) return
        _state.update { it.copy(downloadingMediaIds = it.downloadingMediaIds + asset.id) }
        viewModelScope.launch {
            runSuspendCatching {
                val bytes = container.api.downloadBytes(asset.url)
                withContext(Dispatchers.IO) { container.writeContent(destination, bytes) }
            }.onSuccess {
                showMessage("文件已保存")
            }.onFailure(::handleError)
            _state.update { it.copy(downloadingMediaIds = it.downloadingMediaIds - asset.id) }
        }
    }

    fun editMediaImage(asset: MediaAsset, prompt: String, maskPng: ByteArray?) {
        val cleanPrompt = prompt.trim()
        if (
            cleanPrompt.isEmpty() ||
            !asset.mimeType.startsWith("image/") ||
            asset.id in _state.value.editingMediaIds
        ) {
            return
        }
        _state.update { it.copy(editingMediaIds = it.editingMediaIds + asset.id) }
        viewModelScope.launch {
            runSuspendCatching {
                val originalBytes = container.api.downloadBytes(asset.url)
                val prepared = withContext(Dispatchers.Default) {
                    prepareImageEdit(originalBytes, maskPng)
                }
                container.api.editImage(
                    imagePng = prepared.first,
                    maskPng = prepared.second,
                    prompt = cleanPrompt,
                    idempotencyKey = imageEditOperationKey(
                        scope = "media:${asset.id}",
                        oldUrl = asset.url,
                        prompt = cleanPrompt,
                        maskPng = maskPng,
                    ),
                )
            }.onSuccess {
                _state.update { state ->
                    state.copy(
                        mediaAssets = emptyList(),
                        mediaNextCursor = null,
                        mediaPreview = null,
                        message = "已生成编辑后的图片",
                    )
                }
                loadMediaAssets(reset = true, force = true)
            }.onFailure(::handleError)
            _state.update { it.copy(editingMediaIds = it.editingMediaIds - asset.id) }
        }
    }

    fun uploadKnowledgeDocuments(knowledgeBaseId: String, uris: List<Uri>) {
        val selectedUris = uris.distinct()
        if (selectedUris.isEmpty()) return
        if (selectedUris.size > MAX_KNOWLEDGE_UPLOAD_COUNT) {
            showMessage("每次最多上传 $MAX_KNOWLEDGE_UPLOAD_COUNT 个文档")
            return
        }
        if (knowledgeUploadJob?.isActive == true) {
            showMessage("已有一批文档正在上传")
            return
        }
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            setDestinationLoading(WorkspaceDestination.Knowledge, true)
            var successCount = 0
            val failures = mutableListOf<String>()
            var sessionExpired = false
            try {
                for ((index, uri) in selectedUris.withIndex()) {
                    val fallbackName = uri.lastPathSegment ?: "第 ${index + 1} 个文档"
                    var displayName = fallbackName
                    val temporaryDocumentId = "optimistic-kb-document-${UUID.randomUUID()}"
                    val createdAt = java.time.Instant.now().toString()
                    _state.update { state ->
                        val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                        state.copy(
                            knowledgeDocuments = state.knowledgeDocuments + (
                                knowledgeBaseId to (
                                    listOf(
                                        KnowledgeDocument(
                                            id = temporaryDocumentId,
                                            knowledgeBaseId = knowledgeBaseId,
                                            name = fallbackName,
                                            mimeType = "application/octet-stream",
                                            size = 0,
                                            status = "processing",
                                            createdAt = createdAt,
                                            clientMutationState = "pending",
                                        ),
                                    ) + current
                                )
                            ),
                        )
                    }
                    _state.update {
                        it.copy(
                            knowledgeUploadProgress = KnowledgeUploadProgress(
                                completed = index,
                                total = selectedUris.size,
                                currentName = fallbackName,
                            ),
                        )
                    }
                    val result = runSuspendCatching {
                        val file = withContext(Dispatchers.IO) {
                            container.readContent(uri, MAX_KNOWLEDGE_FILE_BYTES)
                        }
                        displayName = file.name
                        _state.update {
                            val current = it.knowledgeDocuments[knowledgeBaseId].orEmpty()
                            it.copy(
                                knowledgeDocuments = it.knowledgeDocuments + (
                                    knowledgeBaseId to current.map { document ->
                                        if (document.id == temporaryDocumentId) {
                                            document.copy(
                                                name = file.name,
                                                mimeType = file.mimeType,
                                                size = file.bytes.size.toLong(),
                                            )
                                        } else document
                                    }
                                ),
                                knowledgeUploadProgress = KnowledgeUploadProgress(
                                    completed = index,
                                    total = selectedUris.size,
                                    currentName = file.name,
                                ),
                            )
                        }
                        container.api.uploadKnowledgeDocument(
                            knowledgeBaseId,
                            file.name,
                            file.mimeType,
                            file.bytes,
                        )
                    }
                    result.onSuccess { document ->
                        successCount += 1
                        _state.update { state ->
                            val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                            state.copy(
                                knowledgeDocuments = state.knowledgeDocuments + (
                                    knowledgeBaseId to (
                                        listOf(document) + current.filterNot {
                                            it.id == document.id || it.id == temporaryDocumentId
                                        }
                                    )
                                ),
                            )
                        }
                    }.onFailure { error ->
                        if (handleUnauthorized(error)) {
                            sessionExpired = true
                        } else {
                            failures += "$displayName：${error.userMessage()}"
                            _state.update { state ->
                                val current = state.knowledgeDocuments[knowledgeBaseId].orEmpty()
                                state.copy(
                                    knowledgeDocuments = state.knowledgeDocuments + (
                                        knowledgeBaseId to current.map { document ->
                                            if (document.id == temporaryDocumentId) {
                                                document.copy(
                                                    status = "error",
                                                    errorMessage = error.userMessage(),
                                                    clientMutationState = "failed",
                                                    clientMutationError = error.userMessage(),
                                                )
                                            } else document
                                        }
                                    ),
                                )
                            }
                        }
                    }
                    if (sessionExpired) break
                }
                if (!sessionExpired) {
                    if (successCount > 0) {
                        cacheKnowledgeDocumentsSnapshot(knowledgeBaseId)
                        scheduleKnowledgePolling(
                            knowledgeBaseId,
                            _state.value.knowledgeDocuments[knowledgeBaseId].orEmpty(),
                        )
                    }
                    // 解析失败的上传也会在服务端留下 status=error 的文档记录；
                    // 单凭 POST 异常无法拿到该记录，因此批次结束后统一回源，确保
                    // ready / processing / error 三种最终状态立即进入界面与 Room 缓存。
                    runSuspendCatching {
                        container.api.knowledgeDocuments(knowledgeBaseId)
                    }.onSuccess { documents ->
                        _state.update { state ->
                            state.copy(
                                knowledgeDocuments = state.knowledgeDocuments + (
                                    knowledgeBaseId to documents
                                ),
                            )
                        }
                        cacheKnowledgeDocumentsSnapshot(knowledgeBaseId)
                        scheduleKnowledgePolling(knowledgeBaseId, documents)
                    }.onFailure(::handleBackgroundError)
                    refreshKnowledgeBaseIndex()
                    showMessage(knowledgeUploadResultMessage(successCount, failures))
                }
            } finally {
                _state.update { it.copy(knowledgeUploadProgress = null) }
                setDestinationLoading(WorkspaceDestination.Knowledge, false)
                if (knowledgeUploadJob === ownerJob) knowledgeUploadJob = null
            }
        }
        knowledgeUploadJob = ownerJob
        ownerJob.start()
    }

    fun deleteKnowledgeDocument(knowledgeBaseId: String, document: KnowledgeDocument) {
        if (document.clientMutationState != null) {
            _state.update { state ->
                state.copy(
                    knowledgeDocuments = state.knowledgeDocuments + (
                        knowledgeBaseId to state.knowledgeDocuments[knowledgeBaseId]
                            .orEmpty()
                            .filterNot { it.id == document.id }
                    ),
                )
            }
            return
        }
        _state.update { state ->
            state.copy(
                knowledgeDocuments = state.knowledgeDocuments + (
                    knowledgeBaseId to state.knowledgeDocuments[knowledgeBaseId]
                        .orEmpty()
                        .filterNot { it.id == document.id }
                ),
            )
        }
        viewModelScope.launch {
            runSuspendCatching {
                container.api.deleteKnowledgeDocument(knowledgeBaseId, document.id)
            }.onSuccess {
                cacheKnowledgeDocumentsSnapshot(knowledgeBaseId)
                refreshKnowledgeBaseIndex()
                scheduleKnowledgePolling(
                    knowledgeBaseId,
                    _state.value.knowledgeDocuments[knowledgeBaseId].orEmpty(),
                )
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update { state ->
                    state.copy(
                        knowledgeDocuments = state.knowledgeDocuments + (
                            knowledgeBaseId to (
                                state.knowledgeDocuments[knowledgeBaseId].orEmpty() + document
                            ).distinctBy(KnowledgeDocument::id)
                        ),
                        message = error.userMessage(),
                    )
                }
                cacheKnowledgeDocumentsSnapshot(knowledgeBaseId)
            }
        }
    }

    fun renameConversation(conversation: Conversation, title: String) {
        val cleanTitle = title.trim().take(100)
        if (cleanTitle.isEmpty() || cleanTitle == conversation.title) return
        _state.update {
            it.copy(failedConversationRenames = it.failedConversationRenames - conversation.id)
        }
        patchConversation(
            conversation = conversation,
            optimistic = conversation.copy(title = cleanTitle),
            patch = ConversationPatch(title = cleanTitle),
        )
    }

    fun consumeFailedConversationRename(conversationId: String) {
        _state.update {
            it.copy(failedConversationRenames = it.failedConversationRenames - conversationId)
        }
    }

    fun togglePinned(conversation: Conversation) = patchConversation(
        conversation = conversation,
        optimistic = conversation.copy(pinned = !conversation.pinned),
        patch = ConversationPatch(pinned = !conversation.pinned),
    )

    fun toggleArchived(conversation: Conversation) = patchConversation(
        conversation = conversation,
        optimistic = conversation.copy(archived = !conversation.archived),
        patch = ConversationPatch(archived = !conversation.archived),
    )

    fun moveConversation(conversation: Conversation, projectId: String?) {
        if (conversation.projectId == projectId) return
        if (projectId != null && _state.value.projects.none { it.id == projectId }) {
            showMessage("目标项目不存在或已被删除")
            return
        }
        patchConversation(
            conversation = conversation,
            optimistic = conversation.copy(projectId = projectId),
            patch = ConversationPatch(
                projectId = projectId,
                projectIdSpecified = true,
            ),
            successMessage = if (projectId == null) "已移出项目" else "已移动到项目",
        )
    }

    fun deleteConversation(conversation: Conversation) {
        deletedConversationIds += conversation.id
        bumpConversationRevision(conversation.id)
        streamJobs.remove(conversation.id)?.cancel()
        cacheFlushJobs.remove(conversation.id)?.cancel()
        val snapshot = _state.value
        val previousTranscript = snapshot.transcripts[conversation.id]
        val previousArtifacts = snapshot.artifacts[conversation.id]
        val previousSelectedArtifactId = snapshot.selectedArtifactId
        val wasSelected = snapshot.selectedConversationId == conversation.id
        val wasInSearch = snapshot.searchResults?.any { it.id == conversation.id } == true
        _state.update { state ->
            state.copy(
                conversations = state.conversations.filterNot { it.id == conversation.id },
                searchResults = state.searchResults?.filterNot { it.id == conversation.id },
                transcripts = state.transcripts - conversation.id,
                leafOverrides = state.leafOverrides - conversation.id,
                artifacts = state.artifacts - conversation.id,
                selectedArtifactId = state.selectedArtifactId?.takeUnless { artifactId ->
                    state.artifacts[conversation.id].orEmpty().any { it.id == artifactId }
                },
                selectedConversationId = if (
                    state.selectedConversationId == conversation.id
                ) null else state.selectedConversationId,
            )
        }
        viewModelScope.launch {
            activeCacheDatabase?.conversationDao()?.delete(conversation.id)
            runSuspendCatching { container.api.deleteConversation(conversation.id) }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    deletedConversationIds -= conversation.id
                    _state.update { state ->
                        state.copy(
                            conversations = (state.conversations + conversation)
                                .distinctBy { it.id },
                            searchResults = if (wasInSearch) {
                                (state.searchResults.orEmpty() + conversation).distinctBy { it.id }
                            } else {
                                state.searchResults
                            },
                            transcripts = previousTranscript?.let { transcript ->
                                state.putTranscript(conversation.id, transcript)
                            } ?: state.transcripts,
                            artifacts = previousArtifacts?.let { artifacts ->
                                state.artifacts + (conversation.id to artifacts)
                            } ?: state.artifacts,
                            selectedArtifactId = previousSelectedArtifactId,
                            selectedConversationId = if (wasSelected) {
                                conversation.id
                            } else {
                                state.selectedConversationId
                            },
                            message = error.userMessage(),
                        )
                    }
                    activeCacheDatabase?.conversationDao()?.upsert(conversation.toCacheEntity())
                    if (previousTranscript != null) persistTranscriptCache(conversation.id)
                }
        }
    }

    fun switchBranch(conversationId: String, leafId: String) {
        persistLeafSelection(conversationId, leafId, rollbackOnFailure = true)
    }

    private fun persistLeafSelection(
        conversationId: String,
        leafId: String,
        rollbackOnFailure: Boolean,
    ) {
        val previousOverride = _state.value.leafOverrides[conversationId]
        if (conversationId in deletedConversationIds) return
        _state.update { it.copy(leafOverrides = it.leafOverrides + (conversationId to leafId)) }
        viewModelScope.launch {
            val cachedConversation = activeCacheDatabase?.conversationDao()?.get(conversationId)
            cachedConversation?.takeIf { conversationId !in deletedConversationIds }?.let {
                activeCacheDatabase?.conversationDao()?.upsert(it.copy(currentLeafId = leafId))
            }
            runSuspendCatching {
                container.api.updateConversation(
                    conversationId,
                    ConversationPatch(currentLeafId = leafId),
                )
            }.onSuccess {
                if (conversationId !in deletedConversationIds) refreshConversationIndexes()
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                if (
                    rollbackOnFailure &&
                    cachedConversation != null &&
                    conversationId !in deletedConversationIds
                ) {
                    activeCacheDatabase?.conversationDao()?.upsert(cachedConversation)
                }
                _state.update { state ->
                    if (conversationId in deletedConversationIds) return@update state
                    val restored = if (rollbackOnFailure) {
                        state.leafOverrides.toMutableMap().apply {
                            if (previousOverride == null) remove(conversationId)
                            else put(conversationId, previousOverride)
                        }
                    } else {
                        state.leafOverrides
                    }
                    state.copy(leafOverrides = restored, message = error.userMessage())
                }
            }
        }
    }

    fun updateDraft(value: String) = _state.update { it.copy(draft = value) }

    fun transcribeAudio(wav: ByteArray) {
        if (wav.isEmpty() || _state.value.voiceTranscribing) return
        viewModelScope.launch {
            _state.update { it.copy(voiceTranscribing = true, message = null) }
            runSuspendCatching { container.api.transcribeAudio(wav) }
                .onSuccess { transcript ->
                    val clean = transcript.trim()
                    _state.update {
                        if (clean.isEmpty()) {
                            it.copy(message = "没有识别到语音")
                        } else {
                            it.copy(
                                draft = listOf(it.draft.trimEnd(), clean)
                                    .filter(String::isNotEmpty)
                                    .joinToString(" "),
                                message = "语音转写完成",
                            )
                        }
                    }
                }
                .onFailure(::handleError)
            _state.update { it.copy(voiceTranscribing = false) }
        }
    }

    fun toggleSpeech(message: ChatMessage) {
        if (_state.value.speechMessageId == message.id) {
            stopSpeech()
            return
        }
        val text = message.plainText()
            .replace(Regex("```[\\s\\S]*?```"), "（代码块）")
            .trim()
            .take(2_000)
        if (text.isEmpty()) return
        stopSpeech()
        speechJob = viewModelScope.launch {
            _state.update {
                it.copy(speechMessageId = message.id, speechLoading = true, message = null)
            }
            runSuspendCatching { container.api.synthesizeSpeech(text) }
                .onSuccess { audio ->
                    if (_state.value.speechMessageId != message.id) return@onSuccess
                    container.speechPlaybackController.play(audio) {
                        _state.update { state ->
                            if (state.speechMessageId == message.id) {
                                state.copy(speechMessageId = null, speechLoading = false)
                            } else {
                                state
                            }
                        }
                    }
                    _state.update { state ->
                        if (state.speechMessageId == message.id) {
                            state.copy(speechLoading = false)
                        } else {
                            state
                        }
                    }
                }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            speechMessageId = null,
                            speechLoading = false,
                            message = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun stopSpeech() {
        speechJob?.cancel()
        speechJob = null
        container.speechPlaybackController.stop()
        _state.update { it.copy(speechMessageId = null, speechLoading = false) }
    }

    fun clearQuote() = _state.update { it.copy(quotedText = null) }

    fun quoteMessage(message: ChatMessage) {
        val text = message.plainText().trim()
        if (text.isNotEmpty()) _state.update { it.copy(quotedText = text) }
    }

    fun selectModel(id: String) = _state.update {
        val selected = it.models.firstOrNull { model -> model.id == id }
        if (selected == null || "image-generation" in selected.capabilities) it
        else it.copy(
            selectedModelId = id,
            thinkingEffort = resolveModelThinkingEffort(selected, it.modelThinkingEfforts),
        )
    }

    fun selectThinkingEffort(effort: String) {
        val snapshot = _state.value
        val model = snapshot.selectedModel ?: return
        if (effort !in supportedThinkingEfforts(model)) return
        val previous = snapshot.modelThinkingEfforts[model.id]
        _state.update {
            it.copy(
                thinkingEffort = effort,
                modelThinkingEfforts = it.modelThinkingEfforts + (model.id to effort),
            )
        }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setModelThinkingEffort(model.id, effort)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.modelThinkingEfforts[model.id] != effort) return@update state
                    val restored = state.modelThinkingEfforts.toMutableMap().apply {
                        if (previous == null) remove(model.id) else put(model.id, previous)
                    }
                    state.copy(
                        modelThinkingEfforts = restored,
                        thinkingEffort = resolveModelThinkingEffort(state.selectedModel, restored),
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun resetThinkingEffort() {
        val snapshot = _state.value
        val model = snapshot.selectedModel ?: return
        val previous = snapshot.modelThinkingEfforts[model.id] ?: return
        val updated = snapshot.modelThinkingEfforts - model.id
        _state.update {
            it.copy(
                modelThinkingEfforts = updated,
                thinkingEffort = recommendedThinkingEffort(model),
            )
        }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.resetModelThinkingEffort(model.id)
            }.onFailure { error ->
                _state.update { state ->
                    if (model.id in state.modelThinkingEfforts) return@update state
                    val restored = state.modelThinkingEfforts + (model.id to previous)
                    state.copy(
                        modelThinkingEfforts = restored,
                        thinkingEffort = resolveModelThinkingEffort(state.selectedModel, restored),
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun selectChatStyle(id: String) {
        if (_state.value.styles.none { it.id == id }) return
        _state.update { it.copy(selectedStyleId = id) }
    }

    fun sendMessage() {
        val snapshot = _state.value
        val thinking = thinkingRequestConfig(snapshot.selectedModel, snapshot.thinkingEffort)
        val text = snapshot.draft.trim()
        val key = snapshot.selectedKey
        if (
            (text.isEmpty() && snapshot.pendingAttachments.isEmpty()) ||
            snapshot.uploadingAttachmentCount > 0 ||
            snapshot.selectedConversationId in snapshot.loadingConversationIds ||
            streamJobs[key]?.isActive == true ||
            snapshot.transcript.isStreaming
        ) return

        val generationId = "cg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val proposedConversationId = snapshot.selectedConversationId
            ?: "c-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val userMessageId = "msg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val assistantMessageId = "msg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val parentId = snapshot.selectedConversationId?.let { conversationId ->
            snapshot.leafOverrides[conversationId]
                ?: snapshot.conversations.firstOrNull { it.id == conversationId }?.currentLeafId
        }
        snapshot.selectedConversationId?.let(::bumpConversationRevision)
        clientGenerationIds[key] = generationId
        val images = snapshot.pendingAttachments.mapNotNull { attachment ->
            val url = attachment.url?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            buildJsonObject {
                put("type", "image")
                put("url", url)
                put("alt", attachment.name)
            }
        }
        val files = snapshot.pendingAttachments.filter { it.url.isNullOrBlank() }.map { attachment ->
            buildJsonObject {
                put("type", "file")
                put("attachmentId", attachment.id)
                put("name", attachment.name)
                put("mimeType", attachment.mimeType)
                put("size", attachment.size)
            }
        }
        chatUploadPayloads.clear()
        val optimisticCreatedAt = java.time.Instant.now().toString()
        val optimisticUser = ChatMessage(
            id = userMessageId,
            conversationId = proposedConversationId,
            parentId = parentId,
            role = "user",
            parts = images + files + buildJsonObject {
                put("type", "text")
                put("text", text)
            },
            createdAt = optimisticCreatedAt,
            quotedText = snapshot.quotedText,
            status = "sending",
        )
        val optimisticAssistant = ChatMessage(
            id = assistantMessageId,
            conversationId = proposedConversationId,
            parentId = userMessageId,
            role = "assistant",
            modelId = snapshot.selectedModelId,
            parts = emptyList(),
            createdAt = optimisticCreatedAt,
            status = "streaming",
        )
        _state.update {
            val transcript = it.transcripts[key] ?: ChatTranscript()
            it.copy(
                draft = "",
                quotedText = null,
                pendingAttachments = emptyList(),
                attachmentUploads = emptyList(),
                message = null,
                startingNewConversation = key == NEW_CHAT_KEY,
                transcripts = it.putTranscript(
                    key,
                    ChatTranscriptReducer.clearError(
                        transcript.copy(
                            messages = transcript.messages + optimisticUser + optimisticAssistant,
                            streamingMessageId = assistantMessageId,
                        ),
                    ),
                ),
                leafOverrides = if (key != NEW_CHAT_KEY) {
                    it.leafOverrides + (key to assistantMessageId)
                } else {
                    it.leafOverrides
                },
            )
        }

        val request = SendMessageRequest(
            clientGenerationId = generationId,
            conversationId = snapshot.selectedConversationId,
            clientConversationId = if (snapshot.selectedConversationId == null) {
                proposedConversationId
            } else {
                null
            },
            clientUserMessageId = userMessageId,
            clientAssistantMessageId = assistantMessageId,
            parentId = parentId,
            parentIdSpecified = true,
            text = text,
            attachments = files,
            images = images,
            quotedText = snapshot.quotedText,
            modelId = snapshot.selectedModelId,
            styleId = snapshot.selectedStyleId,
            extendedThinking = thinking.extendedThinking,
            thinkingEffort = thinking.effort,
            tools = snapshot.chatTools,
            projectId = snapshot.pendingProjectId,
            skillId = snapshot.pendingSkillId,
        )
        failedSendRequests[userMessageId] = request
        var streamKey = key
        var accepted = false
        var terminal = false
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val ownerJob = checkNotNull(coroutineContext[Job])
            try {
                container.api.sendMessage(request).coalesceChatEvents().collect { event ->
                    if (event is ChatEvent.ConversationCreated) {
                        streamKey = migrateNewConversation(event.conversation, generationId, ownerJob)
                    } else {
                        if (event is ChatEvent.UserMessage && event.message.id == userMessageId) {
                            accepted = true
                            failedSendRequests.remove(userMessageId)
                        }
                        if (event is ChatEvent.Done || event is ChatEvent.Error) terminal = true
                        applyEvent(streamKey, event)
                        if (event is ChatEvent.Error && !accepted && event.httpStatus != 401) {
                            markOptimisticSendFailed(
                                key = streamKey,
                                userMessageId = userMessageId,
                                assistantMessageId = assistantMessageId,
                                error = event.message,
                            )
                        }
                    }
                }
            } finally {
                if (!terminal && !accepted) {
                    markOptimisticSendFailed(
                        key = streamKey,
                        userMessageId = userMessageId,
                        assistantMessageId = assistantMessageId,
                        error = "连接中断，请编辑消息后重试",
                    )
                }
                releaseStreamOwnership(key, ownerJob, generationId)
                releaseStreamOwnership(streamKey, ownerJob, generationId)
                if (key == NEW_CHAT_KEY && streamKey == NEW_CHAT_KEY) {
                    _state.update { it.copy(startingNewConversation = false) }
                }
                if (hasActiveSession()) {
                    if (streamKey != NEW_CHAT_KEY) refreshConversation(streamKey)
                    refreshConversations()
                }
            }
        }
        streamJobs[key] = job
        job.start()
    }

    fun editAndResend(message: ChatMessage, editedText: String) {
        val snapshot = _state.value
        val thinking = thinkingRequestConfig(snapshot.selectedModel, snapshot.thinkingEffort)
        val conversationId = snapshot.selectedConversationId ?: return
        val text = editedText.trim()
        if (
            message.role != "user" ||
            text.isEmpty() ||
            text == message.plainText().trim() ||
            snapshot.transcript.isStreaming ||
            streamJobs[conversationId]?.isActive == true
        ) return

        val generationId = "cg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val userMessageId = "msg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val assistantMessageId = "msg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        bumpConversationRevision(conversationId)
        clientGenerationIds[conversationId] = generationId
        val createdAt = java.time.Instant.now().toString()
        val optimisticUser = ChatMessage(
            id = userMessageId,
            conversationId = conversationId,
            parentId = message.parentId,
            role = "user",
            parts = listOf(buildJsonObject {
                put("type", "text")
                put("text", text)
            }),
            modelId = snapshot.selectedModelId,
            createdAt = createdAt,
            status = "sending",
        )
        val optimisticAssistant = ChatMessage(
            id = assistantMessageId,
            conversationId = conversationId,
            parentId = userMessageId,
            role = "assistant",
            modelId = snapshot.selectedModelId,
            parts = emptyList(),
            createdAt = createdAt,
            status = "streaming",
        )
        _state.update { state ->
            val transcript = state.transcripts[conversationId] ?: ChatTranscript()
            state.copy(
                transcripts = state.putTranscript(
                    conversationId,
                    transcript.copy(
                        messages = transcript.messages + optimisticUser + optimisticAssistant,
                        streamingMessageId = assistantMessageId,
                        error = null,
                    ),
                ),
                leafOverrides = state.leafOverrides + (conversationId to assistantMessageId),
            )
        }
        val request = SendMessageRequest(
            clientGenerationId = generationId,
            conversationId = conversationId,
            clientUserMessageId = userMessageId,
            clientAssistantMessageId = assistantMessageId,
            parentId = message.parentId,
            parentIdSpecified = true,
            text = text,
            modelId = snapshot.selectedModelId,
            styleId = snapshot.selectedStyleId,
            extendedThinking = thinking.extendedThinking,
            thinkingEffort = thinking.effort,
            tools = snapshot.chatTools,
        )
        failedSendRequests[userMessageId] = request
        var accepted = false
        var terminal = false
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val ownerJob = checkNotNull(coroutineContext[Job])
            try {
                container.api.sendMessage(request).coalesceChatEvents().collect { event ->
                    if (event is ChatEvent.UserMessage && event.message.id == userMessageId) {
                        accepted = true
                        failedSendRequests.remove(userMessageId)
                    }
                    if (event is ChatEvent.Done || event is ChatEvent.Error) terminal = true
                    applyEvent(conversationId, event)
                    if (event is ChatEvent.Error && !accepted) {
                        markOptimisticSendFailed(
                            conversationId,
                            userMessageId,
                            assistantMessageId,
                            event.message,
                        )
                    }
                }
            } finally {
                if (!terminal && !accepted) {
                    markOptimisticSendFailed(
                        conversationId,
                        userMessageId,
                        assistantMessageId,
                        "连接中断，请编辑消息后重试",
                    )
                }
                releaseStreamOwnership(conversationId, ownerJob, generationId)
                if (hasActiveSession()) {
                    refreshConversation(conversationId)
                    refreshConversations()
                }
            }
        }
        streamJobs[conversationId] = job
        job.start()
    }

    fun retryFailedSend(userMessageId: String) {
        val request = failedSendRequests[userMessageId] ?: return
        val assistantMessageId = request.clientAssistantMessageId ?: return
        val entry = _state.value.transcripts.entries.firstOrNull { (_, transcript) ->
            transcript.messages.any { it.id == userMessageId && it.status == "error" }
        } ?: return
        val key = entry.key
        if (streamJobs[key]?.isActive == true) return
        val userMessage = entry.value.messages.firstOrNull { it.id == userMessageId } ?: return
        val assistant = ChatMessage(
            id = assistantMessageId,
            conversationId = userMessage.conversationId,
            parentId = userMessageId,
            role = "assistant",
            modelId = request.modelId,
            parts = emptyList(),
            createdAt = java.time.Instant.now().toString(),
            status = "streaming",
        )
        clientGenerationIds[key] = request.clientGenerationId
        _state.update { state ->
            val transcript = state.transcripts[key] ?: return@update state
            state.copy(
                startingNewConversation = key == NEW_CHAT_KEY,
                transcripts = state.putTranscript(
                    key,
                    transcript.copy(
                        messages = transcript.messages
                            .filterNot { it.id == assistantMessageId }
                            .map { message ->
                                if (message.id == userMessageId) message.copy(status = "sending")
                                else message
                            } + assistant,
                        streamingMessageId = assistantMessageId,
                        error = null,
                    ),
                ),
                leafOverrides = if (key == NEW_CHAT_KEY) state.leafOverrides else {
                    state.leafOverrides + (key to assistantMessageId)
                },
                message = null,
            )
        }
        var streamKey = key
        var accepted = false
        var terminal = false
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val ownerJob = checkNotNull(coroutineContext[Job])
            try {
                container.api.sendMessage(request).coalesceChatEvents().collect { event ->
                    if (event is ChatEvent.ConversationCreated) {
                        streamKey = migrateNewConversation(
                            event.conversation,
                            request.clientGenerationId,
                            ownerJob,
                        )
                    } else {
                        if (event is ChatEvent.UserMessage && event.message.id == userMessageId) {
                            accepted = true
                            failedSendRequests.remove(userMessageId)
                        }
                        if (event is ChatEvent.Done || event is ChatEvent.Error) terminal = true
                        applyEvent(streamKey, event)
                        if (event is ChatEvent.Error && !accepted && event.httpStatus != 401) {
                            markOptimisticSendFailed(
                                streamKey,
                                userMessageId,
                                assistantMessageId,
                                event.message,
                            )
                        }
                    }
                }
            } finally {
                if (!terminal && !accepted) {
                    markOptimisticSendFailed(
                        streamKey,
                        userMessageId,
                        assistantMessageId,
                        "连接中断，请重试",
                    )
                }
                releaseStreamOwnership(key, ownerJob, request.clientGenerationId)
                releaseStreamOwnership(streamKey, ownerJob, request.clientGenerationId)
                if (key == NEW_CHAT_KEY && streamKey == NEW_CHAT_KEY) {
                    _state.update { it.copy(startingNewConversation = false) }
                }
                if (hasActiveSession()) {
                    if (streamKey != NEW_CHAT_KEY) refreshConversation(streamKey)
                    refreshConversations()
                }
            }
        }
        streamJobs[key] = job
        job.start()
    }

    fun stopGeneration() {
        val state = _state.value
        val key = state.selectedKey
        val conversationId = state.selectedConversationId
        val generationId = clientGenerationIds[key]
        streamJobs.remove(key)?.cancel()
        _state.update { current ->
            current.copy(
                startingNewConversation = false,
                transcripts = current.putTranscript(
                    key,
                    ChatTranscriptReducer.stop(current.transcripts[key] ?: ChatTranscript()),
                ),
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.stopGeneration(conversationId, generationId) }
                .onFailure(::handleError)
            refreshConversations()
        }
    }

    fun retryStream() {
        val conversationId = _state.value.selectedConversationId ?: return
        if (streamJobs[conversationId]?.isActive == true) return
        val transcript = _state.value.transcripts[conversationId] ?: return
        if (transcript.error == null) return
        _state.update { current ->
            current.copy(
                message = null,
                transcripts = current.putTranscript(
                    conversationId,
                    ChatTranscriptReducer.clearError(transcript),
                ),
            )
        }
        resumeConversation(conversationId)
    }

    fun regenerate(assistantMessageId: String, modelId: String? = _state.value.selectedModelId) {
        val conversationId = _state.value.selectedConversationId ?: return
        val transcript = _state.value.transcripts[conversationId] ?: return
        if (transcript.isStreaming || streamJobs[conversationId]?.isActive == true) return
        val target = transcript.messages.firstOrNull { it.id == assistantMessageId }
            ?: return
        val parentId = target.parentId ?: return
        val generationId = "cg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        val clientAssistantMessageId =
            "msg-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        bumpConversationRevision(conversationId)
        clientGenerationIds[conversationId] = generationId
        val optimistic = ChatMessage(
            id = clientAssistantMessageId,
            conversationId = conversationId,
            parentId = parentId,
            role = "assistant",
            modelId = modelId ?: target.modelId,
            parts = emptyList(),
            createdAt = java.time.Instant.now().toString(),
            status = "streaming",
        )
        _state.update { state ->
            val current = state.transcripts[conversationId] ?: ChatTranscript()
            state.copy(
                transcripts = state.putTranscript(
                    conversationId,
                    current.copy(
                        messages = current.messages + optimistic,
                        streamingMessageId = clientAssistantMessageId,
                        error = null,
                    ),
                ),
                leafOverrides = state.leafOverrides +
                    (conversationId to clientAssistantMessageId),
            )
        }
        var terminal = false
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val ownerJob = checkNotNull(coroutineContext[Job])
            try {
                container.api.regenerate(
                    conversationId = conversationId,
                    assistantMessageId = assistantMessageId,
                    modelId = modelId,
                    clientGenerationId = generationId,
                    clientAssistantMessageId = clientAssistantMessageId,
                ).coalesceChatEvents().collect { event ->
                    if (event is ChatEvent.Done || event is ChatEvent.Error) terminal = true
                    applyEvent(conversationId, event)
                }
            } finally {
                if (!terminal) {
                    applyEvent(
                        conversationId,
                        ChatEvent.Error(
                            messageId = clientAssistantMessageId,
                            message = "连接中断，请重新生成",
                        ),
                    )
                }
                releaseStreamOwnership(conversationId, ownerJob, generationId)
                if (hasActiveSession()) {
                    refreshConversation(conversationId)
                    refreshConversations()
                }
            }
        }
        streamJobs[conversationId] = job
        job.start()
    }

    fun setFeedback(messageId: String, feedback: String?) {
        if (feedback != null && feedback != "up" && feedback != "down") return
        val key = _state.value.selectedKey
        val currentFeedback = _state.value.transcripts[key]
            ?.messages
            ?.firstOrNull { it.id == messageId }
            ?.feedback
            ?: if (_state.value.transcripts[key]?.messages?.any { it.id == messageId } == true) null else return
        val mutation = feedbackMutations.getOrPut(messageId) {
            FeedbackMutation(key = key, desired = currentFeedback, confirmed = currentFeedback)
        }
        mutation.desired = feedback
        mutation.version += 1
        _state.update { state ->
            val transcript = state.transcripts[key] ?: return@update state
            state.copy(
                transcripts = state.putTranscript(
                    key,
                    transcript.copy(
                        messages = transcript.messages.map {
                            if (it.id == messageId) it.copy(feedback = feedback) else it
                        },
                    ),
                ),
            )
        }
        scheduleTranscriptCache(key, immediately = true)
        if (feedbackJobs[messageId]?.isActive == true) return
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try {
                while (true) {
                    val active = feedbackMutations[messageId] ?: break
                    val requested = active.desired
                    val requestedVersion = active.version
                    val result = runSuspendCatching {
                        container.api.setFeedback(messageId, requested)
                    }
                    result.onSuccess {
                        active.confirmed = requested
                    }.onFailure { error ->
                        if (handleUnauthorized(error)) return@launch
                        if (active.version == requestedVersion) {
                            active.desired = active.confirmed
                            _state.update { state ->
                                val transcript = state.transcripts[active.key] ?: return@update state
                                state.copy(
                                    transcripts = state.putTranscript(
                                        active.key,
                                        transcript.copy(
                                            messages = transcript.messages.map { current ->
                                                if (current.id == messageId) {
                                                    current.copy(feedback = active.confirmed)
                                                } else {
                                                    current
                                                }
                                            },
                                        ),
                                    ),
                                    message = error.userMessage(),
                                )
                            }
                            scheduleTranscriptCache(active.key, immediately = true)
                        }
                    }
                    if (active.version == requestedVersion) break
                }
            } finally {
                feedbackJobs.remove(messageId)
                feedbackMutations.remove(messageId)
            }
        }
        feedbackJobs[messageId] = job
        job.start()
    }

    fun uploadChatAttachment(name: String, mimeType: String, bytes: ByteArray) {
        if (bytes.size > MAX_CHAT_ATTACHMENT_BYTES) {
            showMessage("文件不能超过 20MB")
            return
        }
        if (_state.value.attachmentUploads.size >= MAX_CHAT_UPLOAD_QUEUE) {
            showMessage("每次最多上传 $MAX_CHAT_UPLOAD_QUEUE 个附件")
            return
        }
        val localId = "upload-${UUID.randomUUID().toString().replace("-", "").take(16)}"
        chatUploadPayloads[localId] = PendingChatUpload(name, mimeType, bytes)
        _state.update {
            it.copy(attachmentUploads = it.attachmentUploads + AttachmentUploadUi(localId, name))
        }
        startChatAttachmentUpload(localId)
    }

    fun retryChatAttachmentUpload(id: String) {
        if (chatUploadPayloads[id] == null || chatUploadJobs[id]?.isActive == true) return
        _state.update { state ->
            state.copy(
                attachmentUploads = state.attachmentUploads.map { upload ->
                    if (upload.id == id) upload.copy(progress = 0f, error = null) else upload
                },
            )
        }
        startChatAttachmentUpload(id)
    }

    fun removeChatAttachmentUpload(id: String) {
        chatUploadJobs.remove(id)?.cancel()
        chatUploadPayloads.remove(id)
        _state.update {
            it.copy(attachmentUploads = it.attachmentUploads.filterNot { upload -> upload.id == id })
        }
    }

    fun removePendingAttachment(id: String) {
        pendingAttachmentEditJobs.remove(id)?.cancel()
        _state.update {
            it.copy(
                pendingAttachments = it.pendingAttachments.filterNot { item -> item.id == id },
                editingPendingAttachmentIds = it.editingPendingAttachmentIds - id,
            )
        }
    }

    fun editPendingAttachmentImage(id: String, prompt: String, maskPng: ByteArray?) {
        val cleanPrompt = prompt.trim()
        val attachment = _state.value.pendingAttachments.firstOrNull { it.id == id } ?: return
        val oldUrl = attachment.url ?: return
        if (
            cleanPrompt.isEmpty() ||
            !attachment.mimeType.startsWith("image/") ||
            pendingAttachmentEditJobs[id]?.isActive == true
        ) {
            return
        }
        _state.update {
            it.copy(editingPendingAttachmentIds = it.editingPendingAttachmentIds + id)
        }
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try {
                runSuspendCatching {
                    val originalBytes = container.api.downloadBytes(oldUrl)
                    val prepared = withContext(Dispatchers.Default) {
                        prepareImageEdit(originalBytes, maskPng)
                    }
                    container.api.editImage(
                        imagePng = prepared.first,
                        maskPng = prepared.second,
                        prompt = cleanPrompt,
                        idempotencyKey = imageEditOperationKey(
                            scope = "attachment:$id",
                            oldUrl = oldUrl,
                            prompt = cleanPrompt,
                            maskPng = maskPng,
                        ),
                    )
                }.onSuccess { newUrl ->
                    val mediaAssetId = Regex("^/api/media/([A-Za-z0-9._-]+)$")
                        .matchEntire(newUrl)?.groupValues?.getOrNull(1)
                    _state.update { state ->
                        state.copy(
                            pendingAttachments = state.pendingAttachments.map { current ->
                                if (current.id == id) {
                                    current.copy(
                                        url = newUrl,
                                        mediaAssetId = mediaAssetId,
                                    )
                                } else {
                                    current
                                }
                            },
                            message = "待发送图片已更新",
                        )
                    }
                }.onFailure(::handleError)
            } finally {
                _state.update {
                    it.copy(editingPendingAttachmentIds = it.editingPendingAttachmentIds - id)
                }
                if (pendingAttachmentEditJobs[id] === ownerJob) {
                    pendingAttachmentEditJobs.remove(id)
                }
            }
        }
        pendingAttachmentEditJobs[id] = ownerJob
        ownerJob.start()
    }

    fun downloadImage(uri: Uri, url: String) {
        viewModelScope.launch {
            runSuspendCatching {
                val bytes = container.api.downloadBytes(url)
                withContext(Dispatchers.IO) { container.writeContent(uri, bytes) }
            }.onSuccess {
                showMessage("文件已保存")
            }.onFailure(::handleError)
        }
    }

    fun editMessageImage(
        messageId: String,
        oldUrl: String,
        prompt: String,
        maskPng: ByteArray?,
    ) {
        val cleanPrompt = prompt.trim()
        val snapshot = _state.value
        if (cleanPrompt.isEmpty() || !messageImageEditGate.tryAcquire(messageId)) return
        val hasMessage = snapshot.transcripts.entries.any { (_, transcript) ->
            transcript.messages.any { it.id == messageId }
        }
        if (!hasMessage) {
            messageImageEditGate.release(messageId)
            return
        }
        _state.update {
            it.copy(editingImageMessageIds = it.editingImageMessageIds + messageId)
        }
        viewModelScope.launch {
            try {
                val operationKey = imageEditOperationKey(
                    scope = "message:$messageId",
                    oldUrl = oldUrl,
                    prompt = cleanPrompt,
                    maskPng = maskPng,
                )
                val stored = pendingMessageImageEdit(messageId)
                if (stored != null && !stored.matches(
                        messageId = messageId,
                        oldUrl = oldUrl,
                        prompt = cleanPrompt,
                        operationKey = operationKey,
                    )
                ) {
                    when (recoverPendingMessageImageEdit(stored, notifyUser = true)) {
                        PendingImageEditRecovery.Missing -> Unit
                        PendingImageEditRecovery.Applied,
                        PendingImageEditRecovery.Deferred,
                        -> return@launch
                    }
                }

                var pending = pendingMessageImageEdit(messageId)?.takeIf {
                    it.matches(messageId, oldUrl, cleanPrompt, operationKey)
                }
                val resumedExistingOperation = pending != null
                if (pending == null) {
                    pending = PendingMessageImageEdit(
                        messageId = messageId,
                        oldUrl = oldUrl,
                        prompt = cleanPrompt,
                        operationKey = operationKey,
                    )
                    persistPendingMessageImageEdit(pending)
                }

                var newUrl = pending.newUrl
                if (newUrl == null && resumedExistingOperation) {
                    val lookup = runSuspendCatching {
                        container.api.imageEditResult(operationKey)
                    }
                    lookup.exceptionOrNull()?.let { error ->
                        if (!handleUnauthorized(error)) {
                            showMessage("正在恢复上次图片编辑，请联网后重试")
                        }
                        return@launch
                    }
                    newUrl = lookup.getOrNull()
                }
                if (newUrl == null) {
                    val generated = runSuspendCatching {
                        val originalBytes = container.api.downloadBytes(oldUrl)
                        val prepared = withContext(Dispatchers.Default) {
                            prepareImageEdit(originalBytes, maskPng)
                        }
                        container.api.editImage(
                            imagePng = prepared.first,
                            maskPng = prepared.second,
                            prompt = cleanPrompt,
                            idempotencyKey = operationKey,
                        )
                    }
                    val generationError = generated.exceptionOrNull()
                    if (generationError != null) {
                        if (!shouldKeepPendingImageEdit(generationError)) {
                            clearPendingMessageImageEdit(messageId)
                        }
                        if (!handleUnauthorized(generationError)) {
                            if (shouldKeepPendingImageEdit(generationError)) {
                                showMessage("图片编辑结果暂不确定；再次重试会复用同一操作，不会重复扣费")
                            } else {
                                handleError(generationError)
                            }
                        }
                        return@launch
                    }
                    newUrl = requireNotNull(generated.getOrNull())
                }

                pending = pending.copy(newUrl = newUrl)
                persistPendingMessageImageEdit(pending)
                recoverPendingMessageImageEdit(pending, notifyUser = true)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                handleError(error)
            } finally {
                messageImageEditGate.release(messageId)
                _state.update {
                    it.copy(editingImageMessageIds = it.editingImageMessageIds - messageId)
                }
            }
        }
    }

    private enum class PendingImageEditRecovery { Applied, Missing, Deferred }

    private suspend fun pendingMessageImageEdit(messageId: String): PendingMessageImageEdit? {
        pendingMessageImageEdits[messageId]?.let { return it }
        val cached = readCachedPayload<PendingMessageImageEdit>(
            "$PENDING_MESSAGE_IMAGE_EDIT_PREFIX$messageId",
        ) ?: return null
        pendingMessageImageEdits[messageId] = cached
        return cached
    }

    private suspend fun persistPendingMessageImageEdit(edit: PendingMessageImageEdit) {
        writeCachedPayload(
            "$PENDING_MESSAGE_IMAGE_EDIT_PREFIX${edit.messageId}",
            edit,
        )
        pendingMessageImageEdits[edit.messageId] = edit
    }

    private suspend fun clearPendingMessageImageEdit(messageId: String) {
        val database = activeCacheDatabase
        if (database != null) {
            val key = "$PENDING_MESSAGE_IMAGE_EDIT_PREFIX$messageId"
            database.withTransaction {
                database.cachedPayloadDao().delete(key)
                database.syncStateDao().delete("$SYNC_PAYLOAD_PREFIX$key")
            }
        }
        pendingMessageImageEdits.remove(messageId)
    }

    private suspend fun recoverPendingMessageImageEdit(
        initial: PendingMessageImageEdit,
        notifyUser: Boolean,
    ): PendingImageEditRecovery {
        var pending = initial
        if (pending.newUrl == null) {
            val lookup = runSuspendCatching {
                container.api.imageEditResult(pending.operationKey)
            }
            val lookupError = lookup.exceptionOrNull()
            if (lookupError != null) {
                if (handleUnauthorized(lookupError)) return PendingImageEditRecovery.Deferred
                if (notifyUser) showMessage("正在恢复上次图片编辑，请联网后重试")
                return PendingImageEditRecovery.Deferred
            }
            val recoveredUrl = lookup.getOrNull()
            if (recoveredUrl == null) {
                clearPendingMessageImageEdit(pending.messageId)
                return PendingImageEditRecovery.Missing
            }
            pending = pending.copy(newUrl = recoveredUrl)
            persistPendingMessageImageEdit(pending)
        }

        val newUrl = requireNotNull(pending.newUrl)
        val replacement = runSuspendCatching {
            container.api.replaceMessageImage(
                pending.messageId,
                pending.oldUrl,
                newUrl,
                pending.prompt,
            )
        }
        val error = replacement.exceptionOrNull()
        if (error == null) {
            clearPendingMessageImageEdit(pending.messageId)
            applyMessageImageEditLocally(
                pending,
                if (notifyUser) "图片已更新" else "已恢复上次图片编辑结果",
            )
            return PendingImageEditRecovery.Applied
        }
        if (handleUnauthorized(error)) return PendingImageEditRecovery.Deferred
        if (error is ApiException && error.status == 404) {
            clearPendingMessageImageEdit(pending.messageId)
            if (notifyUser) {
                showMessage("图片已生成，但原消息已不存在；编辑结果仍保存在文件中心")
            }
            return PendingImageEditRecovery.Applied
        }
        if (notifyUser) {
            showMessage("图片已生成，消息关联暂未完成；再次点击编辑只会重试关联，不会重复扣费")
        }
        return PendingImageEditRecovery.Deferred
    }

    private fun applyMessageImageEditLocally(
        pending: PendingMessageImageEdit,
        successMessage: String,
    ) {
        val transcriptKey = _state.value.transcripts.entries.firstOrNull { (_, transcript) ->
            transcript.messages.any { it.id == pending.messageId }
        }?.key
        if (transcriptKey == null) return
        bumpConversationRevision(transcriptKey)
        _state.update { state ->
            val transcript = state.transcripts[transcriptKey] ?: return@update state
            state.copy(
                transcripts = state.putTranscript(
                    transcriptKey,
                    transcript.copy(
                        messages = transcript.messages.map { message ->
                            if (message.id == pending.messageId) {
                                message.copy(
                                    parts = replaceLocalMessageImage(
                                        message.parts,
                                        pending.oldUrl,
                                        requireNotNull(pending.newUrl),
                                    ),
                                )
                            } else {
                                message
                            }
                        },
                    ),
                ),
                message = successMessage,
            )
        }
        scheduleTranscriptCache(transcriptKey, immediately = true)
        if (transcriptKey != NEW_CHAT_KEY) refreshConversation(transcriptKey)
    }

    private fun resumePendingMessageImageEdits() {
        if (
            BuildConfig.BENCHMARK_ENABLED ||
            _state.value.isOffline ||
            pendingImageEditRecoveryJob?.isActive == true
        ) {
            return
        }
        val database = activeCacheDatabase ?: return
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(Dispatchers.IO, start = CoroutineStart.LAZY) {
            try {
                val cached = database.cachedPayloadDao()
                    .listPrefix(PENDING_MESSAGE_IMAGE_EDIT_PREFIX)
                    .mapNotNull { entity ->
                        CachePayloadCodec.decodeOrNull<PendingMessageImageEdit>(entity.payloadJson)
                    }
                for (pending in cached) {
                    pendingMessageImageEdits[pending.messageId] = pending
                    if (!messageImageEditGate.tryAcquire(pending.messageId)) continue
                    try {
                        recoverPendingMessageImageEdit(pending, notifyUser = false)
                    } finally {
                        messageImageEditGate.release(pending.messageId)
                    }
                }
            } finally {
                if (pendingImageEditRecoveryJob === ownerJob) {
                    pendingImageEditRecoveryJob = null
                }
            }
        }
        pendingImageEditRecoveryJob = ownerJob
        ownerJob.start()
    }

    fun openArtifact(id: String) {
        val existing = _state.value.artifacts.values.asSequence().flatten().firstOrNull {
            it.id == id
        }
        if (existing != null) {
            _state.update { it.copy(selectedArtifactId = id) }
            return
        }
        if (_state.value.artifactLoading) return
        _state.update { it.copy(artifactLoading = true) }
        viewModelScope.launch {
            try {
                runSuspendCatching { container.api.artifact(id) }
                    .onSuccess { artifact ->
                        _state.update {
                            it.copy(
                                artifacts = it.artifacts + (
                                    artifact.conversationId to (
                                        it.artifacts[artifact.conversationId].orEmpty() + artifact
                                    ).distinctBy(Artifact::id)
                                ),
                                selectedArtifactId = artifact.id,
                            )
                        }
                    }
                    .onFailure(::handleError)
            } finally {
                _state.update { it.copy(artifactLoading = false) }
            }
        }
    }

    fun closeArtifact() = _state.update { it.copy(selectedArtifactId = null) }

    fun shareArtifact(artifact: Artifact) {
        if (_state.value.artifactLoading) return
        _state.update { it.copy(artifactLoading = true) }
        viewModelScope.launch {
            try {
                runSuspendCatching { container.api.shareArtifact(artifact.id) }
                    .onSuccess { token ->
                        val base = BuildConfig.API_BASE_URL.trimEnd('/')
                        _state.update {
                            it.copy(pendingShareUrl = "$base/share/artifact/$token")
                        }
                    }
                    .onFailure(::handleError)
            } finally {
                _state.update { it.copy(artifactLoading = false) }
            }
        }
    }

    fun consumeShareUrl() = _state.update { it.copy(pendingShareUrl = null) }

    fun consumePaymentUrl(paymentPageOpened: Boolean) {
        if (paymentPageOpened) awaitingExternalPaymentReturn = true
        _state.update { it.copy(pendingPaymentUrl = null) }
    }

    fun openDeepLink(uri: Uri) {
        val token = parseSharedArtifactToken(uri.toString()) ?: return
        val url = "${BuildConfig.API_BASE_URL.trimEnd('/')}/share/artifact/$token"
        viewModelScope.launch {
            _state.update { it.copy(sharedArtifactLoading = true, message = null) }
            runSuspendCatching { container.api.sharedArtifact(token) }
                .onSuccess { artifact ->
                    _state.update {
                        it.copy(
                            sharedArtifact = artifact,
                            sharedArtifactUrl = url,
                            sharedArtifactLoading = false,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(sharedArtifactLoading = false, message = error.userMessage())
                    }
                }
        }
    }

    fun closeSharedArtifact() = _state.update {
        it.copy(sharedArtifact = null, sharedArtifactUrl = null, sharedArtifactLoading = false)
    }

    fun shareOpenedSharedArtifact() {
        _state.value.sharedArtifactUrl?.let { url ->
            _state.update { it.copy(pendingShareUrl = url) }
        }
    }

    fun saveArtifact(uri: Uri, content: String) {
        viewModelScope.launch {
            runSuspendCatching {
                withContext(Dispatchers.IO) {
                    container.writeContent(uri, content.toByteArray(Charsets.UTF_8))
                }
            }.onSuccess { showMessage("作品已保存") }
                .onFailure(::handleError)
        }
    }

    fun createRecharge(amountCents: Int) {
        if (amountCents !in 100..1_000_000) {
            showMessage("充值金额需在 1 到 10000 元之间")
            return
        }
        createBillingOrder(CreateOrderRequest(kind = "recharge", amountCents = amountCents))
    }

    fun subscribe(plan: Plan) {
        if (!plan.enabled || plan.id == _state.value.user?.subscription?.planId) return
        createBillingOrder(CreateOrderRequest(kind = "subscription", planId = plan.id))
    }

    private fun createBillingOrder(request: CreateOrderRequest) {
        if (!tryStartDestinationMutation(billingMutationGate, WorkspaceDestination.Billing)) return
        viewModelScope.launch {
            try {
                var idempotencyKey: String? = null
                val outcome = commitThenReconcile(
                    commit = {
                        val key = container.uiPreferenceStore.getOrCreateBillingOrderIdempotencyKey(
                            billingOrderSignature(request),
                        )
                        idempotencyKey = key
                        container.api.createOrder(request, key)
                    },
                    onCommitted = ::publishBillingOrder,
                    reconcile = {
                        applyBillingSnapshot(fetchBillingSnapshot())
                    },
                )
                when (outcome) {
                    is CommittedMutationOutcome.Rejected -> {
                        idempotencyKey?.takeIf {
                            shouldDiscardBillingIdempotencyKey(outcome.error)
                        }?.let { key ->
                            runSuspendCatching {
                                container.uiPreferenceStore.clearBillingOrderIdempotencyKey(key)
                            }.onFailure(::handleBackgroundError)
                        }
                        handleError(outcome.error)
                    }
                    is CommittedMutationOutcome.Committed -> {
                        idempotencyKey?.let { key ->
                            runSuspendCatching {
                                container.uiPreferenceStore.clearBillingOrderIdempotencyKey(key)
                            }.onFailure(::handleBackgroundError)
                        }
                        outcome.reconciliationError?.let { error ->
                            if (!handleUnauthorized(error)) {
                                showMessage(billingReconciliationPendingMessage(outcome.value))
                            }
                        }
                    }
                }
            } finally {
                finishDestinationMutation(billingMutationGate, WorkspaceDestination.Billing)
            }
        }
    }

    fun redeemCode(code: String) {
        val cleanCode = code.trim()
        if (cleanCode.isEmpty()) return
        if (!tryStartDestinationMutation(billingMutationGate, WorkspaceDestination.Billing)) return
        viewModelScope.launch {
            try {
                when (val outcome = commitThenReconcile(
                    commit = { container.api.redeemCode(cleanCode) },
                    onCommitted = { amount ->
                        _state.update { state ->
                            state.copy(
                                user = state.user?.withBalanceDelta(amount),
                                billingRedeemSuccessEvent = state.billingRedeemSuccessEvent + 1,
                                message = "兑换成功，已到账 ${formatMoney(amount)}",
                            )
                        }
                    },
                    reconcile = {
                        applyBillingSnapshot(fetchBillingSnapshot())
                    },
                )) {
                    is CommittedMutationOutcome.Rejected -> handleError(outcome.error)
                    is CommittedMutationOutcome.Committed -> {
                        outcome.reconciliationError?.let { error ->
                            if (!handleUnauthorized(error)) {
                                showMessage(
                                    "兑换成功，已到账 ${formatMoney(outcome.value)}；" +
                                        "账务数据暂未刷新，请稍后重试",
                                )
                            }
                        }
                    }
                }
            } finally {
                finishDestinationMutation(billingMutationGate, WorkspaceDestination.Billing)
            }
        }
    }

    private fun publishBillingOrder(order: Order) {
        val paymentUrl = safeExternalPaymentUrl(order.payUrl)
        _state.update {
            it.copy(
                pendingPaymentUrl = if (order.status == "paid") null else paymentUrl,
                message = when {
                    order.status == "paid" -> "操作已生效"
                    paymentUrl != null -> "订单已创建，正在打开支付页面"
                    else -> "订单已创建，请按支付提示完成付款"
                },
            )
        }
    }

    fun refreshBilling() = loadBillingSection(
        _state.value.selectedBillingSection,
        force = true,
    )

    fun selectBillingSection(section: BillingSection) {
        _state.update { it.copy(selectedBillingSection = section) }
        if (BuildConfig.BENCHMARK_ENABLED) return
        loadBillingSection(section)
    }

    fun updateProfileName(name: String) {
        val cleanName = name.trim()
        if (cleanName.isEmpty() || cleanName == _state.value.user?.name) return
        runSettingsMutation {
            val previous = _state.value.user ?: return@runSettingsMutation
            val optimistic = previous.copy(
                name = cleanName,
                clientMutationState = "pending",
                clientMutationError = null,
            )
            _state.update { it.copy(user = optimistic) }
            runSuspendCatching { container.api.updateProfile(name = cleanName) }
                .onSuccess { user -> applyUpdatedUser(user, "昵称已保存") }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update { state ->
                        val current = state.user
                        state.copy(
                            user = if (
                                current?.name == cleanName &&
                                current.clientMutationState == "pending"
                            ) previous else current,
                            message = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun updateAvatar(name: String, mimeType: String, bytes: ByteArray) {
        if (!mimeType.startsWith("image/") || bytes.isEmpty()) {
            showMessage("请选择有效的图片")
            return
        }
        if (bytes.size > MAX_AVATAR_BYTES) {
            showMessage("头像图片不能超过 5MB")
            return
        }
        runSettingsMutation {
            val previous = _state.value.user ?: return@runSettingsMutation
            val temporaryAvatarUrl = "data:$mimeType;base64," +
                android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            _state.update {
                it.copy(
                    user = previous.copy(
                        avatarUrl = temporaryAvatarUrl,
                        clientMutationState = "pending",
                    ),
                )
            }
            runSuspendCatching {
                val uploaded = container.api.uploadChatAttachment(name, mimeType, bytes)
                val url = uploaded.url ?: error("头像上传未返回图片地址")
                container.api.updateProfile(avatarUrl = url)
            }.onSuccess { user ->
                applyUpdatedUser(user, "头像已更新")
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update { state ->
                    val current = state.user
                    state.copy(
                        user = if (
                            current?.avatarUrl == temporaryAvatarUrl &&
                            current.clientMutationState == "pending"
                        ) previous else current,
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun exportAccountData(uri: Uri) {
        runSettingsMutation {
            runSuspendCatching {
                val bytes = container.api.exportAccountData()
                withContext(Dispatchers.IO) { container.writeContent(uri, bytes) }
            }.onSuccess { showMessage("账户数据已导出") }
                .onFailure(::handleError)
        }
    }

    fun setDefaultModel(id: String?) {
        if (id == _state.value.user?.defaultModelId) return
        runSettingsMutation {
            val previousUser = _state.value.user ?: return@runSettingsMutation
            val previousDefaultModelId = _state.value.defaultModelId
            val previousSelectedModelId = _state.value.selectedModelId
            _state.update { state ->
                val selectedModelId = if (state.selectedConversationId == null) {
                    resolveChatModelId(state.models, id, state.selectedModelId)
                } else {
                    state.selectedModelId
                }
                state.copy(
                    user = previousUser.copy(
                        defaultModelId = id,
                        clientMutationState = "pending",
                    ),
                    defaultModelId = id,
                    selectedModelId = selectedModelId,
                    thinkingEffort = thinkingEffortAfterModelChange(state, selectedModelId),
                )
            }
            runSuspendCatching {
                container.api.updateProfile(
                    defaultModelId = id,
                    defaultModelSpecified = true,
                )
            }.onSuccess { user ->
                applyUpdatedUser(user, "默认模型已更新")
                _state.update { state ->
                    if (state.selectedConversationId == null) {
                        val modelId = resolveChatModelId(
                            state.models,
                            user.defaultModelId,
                            state.selectedModelId,
                        )
                        state.copy(
                            defaultModelId = user.defaultModelId,
                            selectedModelId = modelId,
                            thinkingEffort = thinkingEffortAfterModelChange(state, modelId),
                        )
                    } else {
                        state.copy(defaultModelId = user.defaultModelId)
                    }
                }
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update { state ->
                    val current = state.user
                    if (
                        current == null ||
                        current.defaultModelId != id ||
                        current.clientMutationState != "pending"
                    ) return@update state.copy(message = error.userMessage())
                    state.copy(
                        user = previousUser,
                        defaultModelId = previousDefaultModelId,
                        selectedModelId = previousSelectedModelId,
                        thinkingEffort = thinkingEffortAfterModelChange(
                            state,
                            previousSelectedModelId,
                        ),
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun saveMemory(content: String) {
        val cleanContent = content.trim()
        if (cleanContent.isEmpty()) return
        runSettingsMutation {
            val now = java.time.Instant.now().toString()
            val temporary = MemoryEntry(
                id = "optimistic-memory-${UUID.randomUUID()}",
                content = cleanContent,
                createdAt = now,
                updatedAt = now,
                clientMutationState = "pending",
            )
            _state.update { it.copy(memories = listOf(temporary) + it.memories) }
            runSuspendCatching {
                container.api.saveMemory(SaveMemoryRequest(content = cleanContent))
            }.onSuccess { memory ->
                _state.update {
                    it.copy(
                        memories = listOf(memory) + it.memories.filterNot { item ->
                            item.id == memory.id || item.id == temporary.id
                        },
                        message = "记忆已添加",
                    )
                }
                markSettingsResourceFresh(SettingsResource.Memories)
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update {
                    it.copy(
                        memories = it.memories.filterNot { item -> item.id == temporary.id },
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun deleteMemory(memory: MemoryEntry) {
        _state.update { it.copy(memories = it.memories.filterNot { item -> item.id == memory.id }) }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteMemory(memory.id) }
                .onSuccess { markSettingsResourceFresh(SettingsResource.Memories) }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            memories = (it.memories + memory).distinctBy(MemoryEntry::id),
                            message = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun saveStyle(name: String, description: String, prompt: String) {
        val cleanName = name.trim()
        val cleanPrompt = prompt.trim()
        if (cleanName.isEmpty() || cleanPrompt.isEmpty()) return
        runSettingsMutation {
            val temporary = ChatStyle(
                id = "optimistic-style-${UUID.randomUUID()}",
                name = cleanName,
                description = description.trim(),
                prompt = cleanPrompt,
                builtIn = false,
                clientMutationState = "pending",
            )
            _state.update { it.copy(styles = it.styles + temporary) }
            runSuspendCatching {
                container.api.saveStyle(
                    SaveStyleRequest(
                        name = cleanName,
                        description = description.trim(),
                        prompt = cleanPrompt,
                    ),
                )
            }.onSuccess { style ->
                _state.update {
                    it.copy(
                        styles = (it.styles.filterNot { current ->
                            current.id == temporary.id || current.id == style.id
                        } + style).distinctBy(ChatStyle::id),
                        message = "回复风格已创建",
                    )
                }
                markSettingsResourceFresh(SettingsResource.Styles)
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update {
                    it.copy(
                        styles = it.styles.filterNot { current -> current.id == temporary.id },
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun deleteStyle(style: ChatStyle) {
        if (style.builtIn) return
        val previous = _state.value
        val wasDefault = previous.defaultStyleId == style.id
        val wasSelected = previous.selectedStyleId == style.id
        _state.update {
            it.copy(
                styles = it.styles.filterNot { item -> item.id == style.id },
                defaultStyleId = if (wasDefault) "style-normal" else it.defaultStyleId,
                selectedStyleId = if (it.selectedStyleId == style.id) "style-normal"
                else it.selectedStyleId,
            )
        }
        viewModelScope.launch {
            if (wasDefault) container.uiPreferenceStore.setDefaultStyleId("style-normal")
            runSuspendCatching { container.api.deleteStyle(style.id) }
                .onSuccess { markSettingsResourceFresh(SettingsResource.Styles) }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            styles = (it.styles + style).distinctBy(ChatStyle::id),
                            defaultStyleId = if (wasDefault && it.defaultStyleId == "style-normal") {
                                previous.defaultStyleId
                            } else {
                                it.defaultStyleId
                            },
                            selectedStyleId = if (wasSelected && it.selectedStyleId == "style-normal") {
                                previous.selectedStyleId
                            } else {
                                it.selectedStyleId
                            },
                            message = error.userMessage(),
                        )
                    }
                    if (wasDefault) {
                        container.uiPreferenceStore.setDefaultStyleId(previous.defaultStyleId)
                    }
                }
        }
    }

    fun setDefaultStyle(id: String) {
        if (_state.value.styles.none { it.id == id } && id != "style-normal") return
        _state.update {
            it.copy(
                defaultStyleId = id,
                selectedStyleId = if (it.selectedConversationId == null) id else it.selectedStyleId,
            )
        }
        viewModelScope.launch { container.uiPreferenceStore.setDefaultStyleId(id) }
    }

    fun setMessageRailEnabled(enabled: Boolean) {
        val previous = _state.value.messageRailEnabled
        if (previous == enabled) return
        _state.update { it.copy(messageRailEnabled = enabled) }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setMessageRailEnabled(enabled)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.messageRailEnabled != enabled) return@update state
                    state.copy(
                        messageRailEnabled = previous,
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun setThemeMode(mode: ThemeMode) {
        val previous = _state.value.themeMode
        if (previous == mode) return
        _state.update { it.copy(themeMode = mode) }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setThemeMode(mode)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.themeMode != mode) return@update state
                    state.copy(
                        themeMode = previous,
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun setFontSizePreset(preset: FontSizePreset) {
        val previous = _state.value.fontSizePreset
        if (previous == preset) return
        _state.update { it.copy(fontSizePreset = preset) }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setFontSizePreset(preset)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.fontSizePreset != preset) return@update state
                    state.copy(
                        fontSizePreset = previous,
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun toggleProjectCollapsed(projectId: String) {
        if (projectId.isBlank()) return
        val previous = _state.value.collapsedProjectIds
        val next = previous.toggleMembership(projectId)
        _state.update { it.copy(collapsedProjectIds = next) }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setCollapsedProjectIds(next)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.collapsedProjectIds != next) return@update state
                    state.copy(collapsedProjectIds = previous, message = error.userMessage())
                }
            }
        }
    }

    fun toggleProjectPinned(projectId: String) {
        if (projectId.isBlank()) return
        val previous = _state.value.pinnedProjectIds
        val next = previous.toggleMembership(projectId)
        _state.update { it.copy(pinnedProjectIds = next) }
        viewModelScope.launch {
            runSuspendCatching {
                container.uiPreferenceStore.setPinnedProjectIds(next)
            }.onFailure { error ->
                _state.update { state ->
                    if (state.pinnedProjectIds != next) return@update state
                    state.copy(pinnedProjectIds = previous, message = error.userMessage())
                }
            }
        }
    }

    fun saveMcpServer(
        server: McpServer?,
        name: String,
        url: String,
        transport: String,
        headers: Map<String, String>?,
    ) {
        val cleanName = name.trim()
        val cleanUrl = url.trim()
        if (cleanName.isEmpty() || cleanUrl.isEmpty()) return
        runSettingsMutation {
            val temporaryId = server?.id ?: "optimistic-mcp-${UUID.randomUUID()}"
            val temporary = server?.copy(
                name = cleanName,
                url = cleanUrl,
                transport = transport,
                clientMutationState = "pending",
                clientMutationError = null,
            ) ?: McpServer(
                id = temporaryId,
                scope = "user",
                name = cleanName,
                url = cleanUrl,
                transport = transport,
                enabled = true,
                status = "unknown",
                clientMutationState = "pending",
            )
            _state.update { state ->
                state.copy(
                    mcpServers = state.mcpServers.filterNot { it.id == temporaryId } + temporary,
                )
            }
            runSuspendCatching {
                container.api.saveMcpServer(
                    McpServerRequest(
                        id = server?.id,
                        name = cleanName,
                        url = cleanUrl,
                        transport = transport,
                        headers = headers,
                        enabled = server?.enabled ?: true,
                    ),
                )
            }.onSuccess { saved ->
                _state.update {
                    it.copy(
                        mcpServers = (it.mcpServers.filterNot { item -> item.id == saved.id } + saved)
                            .filterNot { item -> item.id == temporaryId && item.id != saved.id }
                            .distinctBy(McpServer::id),
                        chatToolOptionsLoaded = false,
                        message = if (server == null) "MCP 服务器已添加" else "MCP 服务器已更新",
                    )
                }
                markSettingsResourceFresh(SettingsResource.UserMcp)
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update { state ->
                    state.copy(
                        mcpServers = if (server == null) {
                            state.mcpServers.filterNot { it.id == temporaryId }
                        } else {
                            state.mcpServers.map { current ->
                                if (
                                    current.id == temporaryId &&
                                    current.clientMutationState == "pending"
                                ) server else current
                            }
                        },
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun toggleMcpServer(server: McpServer) {
        val optimistic = server.copy(enabled = !server.enabled)
        val wasSelected = server.id in _state.value.chatTools.mcpServerIds
        _state.update {
            it.copy(
                mcpServers = it.mcpServers.map { item ->
                    if (item.id == server.id) optimistic else item
                },
                chatTools = if (optimistic.enabled) {
                    it.chatTools
                } else {
                    it.chatTools.copy(mcpServerIds = it.chatTools.mcpServerIds - server.id)
                },
            )
        }
        viewModelScope.launch {
            runSuspendCatching {
                container.api.saveMcpServer(
                    McpServerRequest(
                        id = server.id,
                        scope = server.scope,
                        name = server.name,
                        url = server.url,
                        transport = server.transport,
                        enabled = !server.enabled,
                    ),
                )
            }.onSuccess { saved ->
                _state.update { state ->
                    state.copy(
                        mcpServers = state.mcpServers.map { if (it.id == saved.id) saved else it },
                        chatToolOptionsLoaded = false,
                    )
                }
                markSettingsResourceFresh(SettingsResource.UserMcp)
            }.onFailure { error ->
                if (handleUnauthorized(error)) return@onFailure
                _state.update {
                    it.copy(
                        mcpServers = it.mcpServers.map { item ->
                            if (item.id == server.id) server else item
                        },
                        chatTools = if (wasSelected) {
                            it.chatTools.copy(
                                mcpServerIds = (it.chatTools.mcpServerIds + server.id).distinct(),
                            )
                        } else {
                            it.chatTools
                        },
                        message = error.userMessage(),
                    )
                }
            }
        }
    }

    fun testMcpServer(server: McpServer) {
        if (server.id in _state.value.testingMcpServerIds) return
        _state.update {
            it.copy(testingMcpServerIds = it.testingMcpServerIds + server.id)
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.testMcpServer(server.id) }
                .onSuccess { result ->
                    _state.update { state ->
                        state.copy(
                            mcpServers = state.mcpServers.map {
                                if (it.id == server.id) {
                                    it.copy(
                                        status = if (result.ok) "connected" else "error",
                                        tools = result.tools,
                                    )
                                } else {
                                    it
                                }
                            },
                            message = if (result.ok) {
                                "连接成功，发现 ${result.tools.size} 个工具"
                            } else {
                                result.error ?: "连接失败"
                            },
                        )
                    }
                    markSettingsResourceFresh(SettingsResource.UserMcp)
                }
                .onFailure(::handleError)
            _state.update {
                it.copy(testingMcpServerIds = it.testingMcpServerIds - server.id)
            }
        }
    }

    fun deleteMcpServer(server: McpServer) {
        val wasSelected = server.id in _state.value.chatTools.mcpServerIds
        _state.update {
            it.copy(
                mcpServers = it.mcpServers.filterNot { item -> item.id == server.id },
                chatTools = it.chatTools.copy(
                    mcpServerIds = it.chatTools.mcpServerIds - server.id,
                ),
            )
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.deleteMcpServer(server.id) }
                .onSuccess { markSettingsResourceFresh(SettingsResource.UserMcp) }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    _state.update {
                        it.copy(
                            mcpServers = (it.mcpServers + server).distinctBy(McpServer::id),
                            chatTools = if (wasSelected) {
                                it.chatTools.copy(
                                    mcpServerIds = (it.chatTools.mcpServerIds + server.id).distinct(),
                                )
                            } else {
                                it.chatTools
                            },
                            message = error.userMessage(),
                        )
                    }
                }
        }
    }

    fun refreshSettings() = loadSettingsSection(
        _state.value.selectedSettingsSection,
        force = true,
    )

    fun selectSettingsSection(section: SettingsSection) {
        _state.update { it.copy(selectedSettingsSection = section) }
        if (BuildConfig.BENCHMARK_ENABLED) return
        loadSettingsSection(section)
    }

    fun updateChatTools(tools: ChatToolToggles) {
        _state.update { it.copy(chatTools = tools) }
    }

    fun requestChatToolOptions() {
        val state = _state.value
        if (state.chatToolOptionsLoading || state.chatToolOptionsLoaded) return
        val includeGlobalMcp = state.user?.role == "admin"
        _state.update { it.copy(chatToolOptionsLoading = true) }
        viewModelScope.launch {
            val (knowledge, userMcp, globalMcp) = coroutineScope {
                val knowledge = async { runSuspendCatching { container.api.knowledgeBases() } }
                val userMcp = async { runSuspendCatching { container.api.mcpServers("user") } }
                val globalMcp = async {
                    if (includeGlobalMcp) {
                        runSuspendCatching { container.api.mcpServers("global") }
                    } else {
                        Result.success(emptyList())
                    }
                }
                Triple(knowledge.await(), userMcp.await(), globalMcp.await())
            }
            val error = sequenceOf(knowledge, userMcp, globalMcp)
                .mapNotNull { it.exceptionOrNull() }
                .firstOrNull()
            if (error != null && handleUnauthorized(error)) return@launch
            _state.update { current ->
                val mergedMcpServers = mergeMcpServersByScope(
                    existing = current.mcpServers,
                    userServers = userMcp.getOrNull(),
                    globalServers = globalMcp.getOrNull(),
                )
                current.copy(
                    knowledgeBases = knowledge.getOrNull() ?: current.knowledgeBases,
                    mcpServers = mergedMcpServers,
                    chatTools = current.chatTools.copy(
                        mcpServerIds = validSelectedMcpServerIds(
                            current.chatTools.mcpServerIds,
                            mergedMcpServers,
                        ),
                    ),
                    chatToolOptionsLoading = false,
                    chatToolOptionsLoaded = error == null,
                    message = error?.userMessage() ?: current.message,
                )
            }
        }
    }

    fun showComposerError(message: String) = showMessage(message)

    fun onAppBackgrounded() {
        if (BuildConfig.BENCHMARK_ENABLED) return
        appInForeground = false
        lastAppBackgroundedAtEpochMillis = EpochTime.now()
        stopSpeech()
    }

    fun onAppForegrounded() {
        appInForeground = true
        if (BuildConfig.BENCHMARK_ENABLED || !hasActiveSession()) return
        resumePendingMessageImageEdits()
        val backgroundDuration = lastAppBackgroundedAtEpochMillis?.let {
            (EpochTime.now() - it).coerceAtLeast(0L)
        } ?: 0L
        lastAppBackgroundedAtEpochMillis = null
        val refreshDecision = foregroundRefreshDecision(
            backgroundDurationMillis = backgroundDuration,
            awaitingExternalPaymentReturn = awaitingExternalPaymentReturn,
            refreshThresholdMillis = FOREGROUND_REFRESH_THRESHOLD_MILLIS,
            visibleDestinationRefreshThresholdMillis =
                FOREGROUND_DESTINATION_REFRESH_THRESHOLD_MILLIS,
            forceNetworkRefresh = pendingNetworkRefresh,
        )
        pendingNetworkRefresh = false
        if (refreshDecision.consumeExternalPaymentReturn) {
            awaitingExternalPaymentReturn = false
        }
        val snapshot = _state.value
        performRefresh(snapshot, refreshDecision)
    }

    private fun performRefresh(
        snapshot: LinHubUiState,
        refreshDecision: ForegroundRefreshDecision,
    ) {
        val conversationId = snapshot.selectedConversationId
        if (conversationId != null) {
            if (
                snapshot.transcripts[conversationId]?.isStreaming == true &&
                streamJobs[conversationId]?.isActive != true
            ) {
                resumeConversation(conversationId)
            } else if (refreshDecision.refreshWorkspace) {
                refreshConversation(conversationId)
            }
        }
        if (refreshDecision.refreshWorkspace) {
            refreshConversations()
            if (
                snapshot.destination == WorkspaceDestination.Billing &&
                !refreshDecision.refreshBillingSnapshot
            ) {
                loadBilling(force = true)
            }
        }
        if (refreshDecision.refreshVisibleDestination) {
            refreshVisibleDestination(
                snapshot = snapshot,
                userAlreadyRefreshing = refreshDecision.refreshBillingSnapshot ||
                    snapshot.destination == WorkspaceDestination.Billing ||
                    (
                        snapshot.destination == WorkspaceDestination.Settings &&
                            snapshot.selectedSettingsSection == SettingsSection.Account
                    ),
            )
        }
        if (refreshDecision.refreshBillingSnapshot) {
            refreshBillingSnapshotAfterExternalPayment()
        }
    }

    private fun refreshAfterNetworkReconnect() {
        if (!hasActiveSession()) return
        val refreshDecision = foregroundRefreshDecision(
            backgroundDurationMillis = 0,
            awaitingExternalPaymentReturn = awaitingExternalPaymentReturn,
            refreshThresholdMillis = FOREGROUND_REFRESH_THRESHOLD_MILLIS,
            visibleDestinationRefreshThresholdMillis =
                FOREGROUND_DESTINATION_REFRESH_THRESHOLD_MILLIS,
            forceNetworkRefresh = true,
        )
        if (refreshDecision.consumeExternalPaymentReturn) {
            awaitingExternalPaymentReturn = false
        }
        performRefresh(_state.value, refreshDecision)
    }

    fun requestDrawer() {
        loadProjects()
        _state.update { it.copy(drawerOpenRequest = System.nanoTime()) }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun retryBootstrap() {
        _state.update { it.copy(phase = AppPhase.Loading, message = null, bootstrapError = null) }
        restoreSession()
    }

    fun refreshAdmin() = loadAdminSection(_state.value.admin.selectedSection, force = true)

    fun selectAdminSection(section: AdminSection) {
        _state.update { it.copy(admin = it.admin.copy(selectedSection = section)) }
        if (BuildConfig.BENCHMARK_ENABLED) return
        loadAdminSection(section)
    }

    private fun loadAdmin(force: Boolean = false) {
        loadAdminSection(_state.value.admin.selectedSection, force)
    }

    private fun loadAdminSection(section: AdminSection, force: Boolean = false) {
        val snapshot = _state.value
        if (snapshot.user?.role != "admin") return
        val requested = adminResourcesForSection(section).filterTo(linkedSetOf()) { resource ->
            resource !in snapshot.admin.loadingResources &&
                (force || resource !in snapshot.admin.loadedResources)
        }
        if (requested.isEmpty()) return
        _state.update {
            it.copy(admin = it.admin.copy(
                loadingResources = it.admin.loadingResources + requested,
            ))
        }
        viewModelScope.launch {
            val results = coroutineScope {
                requested.map { resource ->
                    async {
                        resource to runSuspendCatching { fetchAdminResource(resource) }
                    }
                }.map { it.await() }
            }
            val payloads = results.mapNotNull { (_, result) -> result.getOrNull() }
            if (payloads.isNotEmpty()) {
                _state.update { state ->
                    var admin = state.admin
                    payloads.forEach { payload -> admin = admin.withPayload(payload) }
                    state.copy(admin = admin.copy(
                        loadedResources = admin.loadedResources +
                            payloads.map(AdminResourcePayload::resource),
                    ))
                }
            }
            _state.update {
                it.copy(admin = it.admin.copy(
                    loadingResources = it.admin.loadingResources - requested,
                ))
            }
            results.firstNotNullOfOrNull { (_, result) -> result.exceptionOrNull() }
                ?.let(::handleError)
        }
    }

    private suspend fun fetchAdminResource(resource: AdminResource): AdminResourcePayload =
        when (resource) {
            AdminResource.Providers -> AdminResourcePayload.Providers(
                container.api.adminProviders(),
            )
            AdminResource.Models -> AdminResourcePayload.Models(container.api.adminModels())
            AdminResource.Plans -> AdminResourcePayload.Plans(container.api.adminPlans())
            AdminResource.Users -> AdminResourcePayload.Users(container.api.adminUsers())
            AdminResource.PendingSkills -> AdminResourcePayload.PendingSkills(
                container.api.adminPendingSkills(),
            )
            AdminResource.Settings -> AdminResourcePayload.Settings(container.api.adminSettings())
            AdminResource.GlobalMcp -> AdminResourcePayload.GlobalMcp(
                container.api.mcpServers("global"),
            )
            AdminResource.RedeemCodes -> AdminResourcePayload.RedeemCodes(
                container.api.adminRedeemCodes(),
            )
            AdminResource.Usage -> AdminResourcePayload.Usage(container.api.adminUsage())
        }

    private fun AdminUiState.withPayload(payload: AdminResourcePayload): AdminUiState =
        when (payload) {
            is AdminResourcePayload.Providers -> copy(providers = payload.value)
            is AdminResourcePayload.Models -> copy(models = payload.value)
            is AdminResourcePayload.Plans -> copy(plans = payload.value)
            is AdminResourcePayload.Users -> copy(users = payload.value)
            is AdminResourcePayload.PendingSkills -> copy(pendingSkills = payload.value)
            is AdminResourcePayload.Settings -> copy(settings = payload.value)
            is AdminResourcePayload.GlobalMcp -> copy(globalMcpServers = payload.value)
            is AdminResourcePayload.RedeemCodes -> copy(redeemCodes = payload.value)
            is AdminResourcePayload.Usage -> copy(usage = payload.value)
        }

    /*
     * 每个资源独立完成和落状态。一个不相关管理接口失败时，当前标签已经成功返回的内容仍可用，
     * 且失败资源不会被标为已加载，下次进入或刷新会继续重试。
     */
    private sealed interface AdminResourcePayload {
        val resource: AdminResource

        data class Providers(val value: List<Provider>) : AdminResourcePayload {
            override val resource = AdminResource.Providers
        }

        data class Models(val value: List<Model>) : AdminResourcePayload {
            override val resource = AdminResource.Models
        }

        data class Plans(val value: List<Plan>) : AdminResourcePayload {
            override val resource = AdminResource.Plans
        }

        data class Users(val value: List<User>) : AdminResourcePayload {
            override val resource = AdminResource.Users
        }

        data class PendingSkills(val value: List<Skill>) : AdminResourcePayload {
            override val resource = AdminResource.PendingSkills
        }

        data class Settings(val value: AppSettings) : AdminResourcePayload {
            override val resource = AdminResource.Settings
        }

        data class GlobalMcp(val value: List<McpServer>) : AdminResourcePayload {
            override val resource = AdminResource.GlobalMcp
        }

        data class RedeemCodes(val value: List<RedeemCode>) : AdminResourcePayload {
            override val resource = AdminResource.RedeemCodes
        }

        data class Usage(val value: List<UsageRecord>) : AdminResourcePayload {
            override val resource = AdminResource.Usage
        }
    }

    fun saveAdminProvider(input: AdminProviderRequest) = runAdminMutation {
        val previous = input.id?.let { id ->
            _state.value.admin.providers.firstOrNull { it.id == id }
        }
        val optimistic = previous?.copy(enabled = input.enabled)
        optimistic?.let { attempted ->
            _state.update { state ->
                state.copy(admin = state.admin.copy(
                    providers = state.admin.providers.map {
                        if (it.id == attempted.id) attempted else it
                    },
                ))
            }
        }
        val saved = try {
            container.api.saveAdminProvider(input)
        } catch (error: Throwable) {
            if (previous != null && optimistic != null) {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        providers = state.admin.providers.map { current ->
                            if (current == optimistic) previous else current
                        },
                    ))
                }
            }
            throw error
        }
        _state.update {
            it.copy(admin = it.admin.copy(
                providers = (it.admin.providers.filterNot { item -> item.id == saved.id } + saved)
                    .sortedBy(Provider::name),
            ))
        }
        if (input.id == null) "供应商已添加" else "供应商已更新"
    }

    fun deleteAdminProvider(provider: Provider) = runAdminMutation {
        container.api.deleteAdminProvider(provider.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                providers = it.admin.providers.filterNot { item -> item.id == provider.id },
                models = it.admin.models.filterNot { item -> item.providerId == provider.id },
            ))
        }
        "供应商已删除"
    }

    fun loadAdminRemoteModels(provider: Provider) = runAdminMutation {
        val models = container.api.adminRemoteModels(provider.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                remoteModels = it.admin.remoteModels + (provider.id to models),
            ))
        }
        "已拉取 ${models.size} 个远端模型"
    }

    fun addAdminRemoteModels(provider: Provider, slugs: List<String>) = runAdminMutation {
        when (val outcome = commitThenReconcile(
            commit = { container.api.addAdminRemoteModels(provider.id, slugs.distinct()) },
            onCommitted = {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        loadedResources = state.admin.loadedResources - AdminResource.Models,
                        remoteModels = state.admin.remoteModels + (
                            provider.id to state.admin.remoteModels[provider.id].orEmpty().map { remote ->
                                if (remote.slug in slugs) remote.copy(added = true) else remote
                            }
                        ),
                    ))
                }
            },
            reconcile = {
                val models = container.api.adminModels()
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        models = models,
                        loadedResources = state.admin.loadedResources + AdminResource.Models,
                    ))
                }
            },
        )) {
            is CommittedMutationOutcome.Rejected -> throw outcome.error
            is CommittedMutationOutcome.Committed -> adminReconciliationMessage(
                success = "已添加 ${outcome.value} 个模型",
                error = outcome.reconciliationError,
            )
        }
    }

    fun saveAdminModel(input: AdminModelRequest) = runAdminMutation {
        val previous = input.id?.let { id ->
            _state.value.admin.models.firstOrNull { it.id == id }
        }
        val optimistic = previous?.copy(enabled = input.enabled ?: previous.enabled)
        if (input.enabled != null && optimistic != null) {
            _state.update { state ->
                state.copy(admin = state.admin.copy(
                    models = state.admin.models.map {
                        if (it.id == optimistic.id) optimistic else it
                    },
                ))
            }
        }
        val saved = try {
            container.api.saveAdminModel(input)
        } catch (error: Throwable) {
            if (input.enabled != null && previous != null && optimistic != null) {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        models = state.admin.models.map { current ->
                            if (current == optimistic) previous else current
                        },
                    ))
                }
            }
            throw error
        }
        _state.update {
            it.copy(admin = it.admin.copy(
                models = (it.admin.models.filterNot { item -> item.id == saved.id } + saved)
                    .sortedWith(compareByDescending<Model> { item -> item.enabled }.thenBy(Model::sortOrder)),
            ))
        }
        if (input.id == null) "模型已添加" else "模型已更新"
    }

    fun deleteAdminModel(model: Model) = runAdminMutation {
        container.api.deleteAdminModel(model.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                models = it.admin.models.filterNot { item -> item.id == model.id },
            ))
        }
        "模型已删除"
    }

    fun testAdminModel(model: Model) {
        if (model.id in _state.value.admin.testingModelIds) return
        _state.update {
            it.copy(admin = it.admin.copy(testingModelIds = it.admin.testingModelIds + model.id))
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.testAdminModel(model.id) }
                .onSuccess { result -> showMessage(result.message ?: result.error ?: "测试完成") }
                .onFailure(::handleError)
            _state.update {
                it.copy(admin = it.admin.copy(testingModelIds = it.admin.testingModelIds - model.id))
            }
        }
    }

    fun saveAdminPlan(input: AdminPlanRequest) = runAdminMutation {
        val previous = input.id?.let { id ->
            _state.value.admin.plans.firstOrNull { it.id == id }
        }
        val optimistic = previous?.copy(enabled = input.enabled)
        optimistic?.let { attempted ->
            _state.update { state ->
                state.copy(admin = state.admin.copy(
                    plans = state.admin.plans.map {
                        if (it.id == attempted.id) attempted else it
                    },
                ))
            }
        }
        val saved = try {
            container.api.saveAdminPlan(input)
        } catch (error: Throwable) {
            if (previous != null && optimistic != null) {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        plans = state.admin.plans.map { current ->
                            if (current == optimistic) previous else current
                        },
                    ))
                }
            }
            throw error
        }
        _state.update {
            it.copy(admin = it.admin.copy(
                plans = (it.admin.plans.filterNot { item -> item.id == saved.id } + saved)
                    .sortedBy(Plan::priceCentsPerMonth),
            ))
        }
        if (input.id == null) "套餐已添加" else "套餐已更新"
    }

    fun deleteAdminPlan(plan: Plan) = runAdminMutation {
        container.api.deleteAdminPlan(plan.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                plans = it.admin.plans.map { item ->
                    if (item.id == plan.id) item.copy(enabled = false) else item
                },
            ))
        }
        "套餐已停用"
    }

    fun loadAdminUserDetail(user: User) = runAdminMutation {
        val detail = container.api.adminUserDetail(user.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                userDetails = it.admin.userDetails + (user.id to detail),
            ))
        }
        ""
    }

    fun grantAdminBalance(user: User, amountCents: Int, note: String) {
        if (amountCents <= 0) return
        runAdminMutation {
            when (val outcome = commitThenReconcile(
                commit = {
                    container.api.grantAdminBalance(
                        user.id,
                        amountCents,
                        note.trim().takeIf(String::isNotEmpty),
                    )
                    amountCents
                },
                onCommitted = { granted -> applyAdminBalanceDelta(user.id, granted) },
                reconcile = { refreshAdminUser(user.id) },
            )) {
                is CommittedMutationOutcome.Rejected -> throw outcome.error
                is CommittedMutationOutcome.Committed -> adminReconciliationMessage(
                    success = "余额已赠送",
                    error = outcome.reconciliationError,
                )
            }
        }
    }

    fun updateAdminSubscription(user: User, planId: String?, days: Int) = runAdminMutation {
        val detail = container.api.updateAdminSubscription(
            user.id,
            planId,
            days.takeIf { planId != null },
        )
        applyAdminUserDetail(detail)
        if (planId == null) "订阅已取消" else "订阅已更新"
    }

    fun deleteAdminUser(user: User) = runAdminMutation {
        container.api.deleteAdminUser(user.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                users = it.admin.users.filterNot { item -> item.id == user.id },
                userDetails = it.admin.userDetails - user.id,
            ))
        }
        "用户已删除"
    }

    fun reviewAdminSkill(skill: Skill, approve: Boolean) = runAdminMutation {
        container.api.reviewAdminSkill(skill.id, approve)
        _state.update {
            it.copy(admin = it.admin.copy(
                pendingSkills = it.admin.pendingSkills.filterNot { item -> item.id == skill.id },
            ))
        }
        if (approve) "技能已通过" else "技能已拒绝"
    }

    fun saveAdminSettings(input: AdminSettingsPatch) = runAdminMutation {
        val previous = _state.value.admin.settings
        val optimistic = previous?.copy(
            registrationEnabled = input.registrationEnabled ?: previous.registrationEnabled,
            skillMarketRequiresReview = input.skillMarketRequiresReview
                ?: previous.skillMarketRequiresReview,
        )
        if (
            optimistic != null &&
            (input.registrationEnabled != null || input.skillMarketRequiresReview != null)
        ) {
            _state.update { it.copy(admin = it.admin.copy(settings = optimistic)) }
        }
        val saved = try {
            container.api.saveAdminSettings(input)
        } catch (error: Throwable) {
            if (previous != null && optimistic != null) {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        settings = if (state.admin.settings == optimistic) previous
                        else state.admin.settings,
                    ))
                }
            }
            throw error
        }
        _state.update { it.copy(admin = it.admin.copy(settings = saved)) }
        "全局设置已保存"
    }

    fun testAdminEngine(input: EngineTestRequest) {
        if (input.engine in _state.value.admin.testingEngines) return
        _state.update {
            it.copy(admin = it.admin.copy(testingEngines = it.admin.testingEngines + input.engine))
        }
        viewModelScope.launch {
            runSuspendCatching { container.api.testAdminEngine(input) }
                .onSuccess { result -> showMessage(result.message ?: result.error ?: "测试完成") }
                .onFailure(::handleError)
            _state.update {
                it.copy(admin = it.admin.copy(testingEngines = it.admin.testingEngines - input.engine))
            }
        }
    }

    fun saveAdminMcpServer(input: McpServerRequest) = runAdminMutation {
        val previous = input.id?.let { id ->
            _state.value.admin.globalMcpServers.firstOrNull { it.id == id }
        }
        val optimistic = previous?.copy(enabled = input.enabled)
        optimistic?.let { attempted ->
            _state.update { state ->
                state.copy(admin = state.admin.copy(
                    globalMcpServers = state.admin.globalMcpServers.map {
                        if (it.id == attempted.id) attempted else it
                    },
                ))
            }
        }
        val saved = try {
            container.api.saveMcpServer(input.copy(scope = "global"))
        } catch (error: Throwable) {
            if (previous != null && optimistic != null) {
                _state.update { state ->
                    state.copy(admin = state.admin.copy(
                        globalMcpServers = state.admin.globalMcpServers.map { current ->
                            if (current == optimistic) previous else current
                        },
                    ))
                }
            }
            throw error
        }
        _state.update {
            it.copy(admin = it.admin.copy(
                globalMcpServers = (
                    it.admin.globalMcpServers.filterNot { item -> item.id == saved.id } + saved
                ).distinctBy(McpServer::id),
            ))
        }
        if (input.id == null) "全局 MCP 已添加" else "全局 MCP 已更新"
    }

    fun testAdminMcpServer(server: McpServer) = runAdminMutation {
        val result = container.api.testMcpServer(server.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                globalMcpServers = it.admin.globalMcpServers.map { item ->
                    if (item.id == server.id) item.copy(
                        status = if (result.ok) "connected" else "error",
                        tools = result.tools,
                    ) else item
                },
            ))
        }
        result.error ?: if (result.ok) "全局 MCP 连接成功" else "连接失败"
    }

    fun deleteAdminMcpServer(server: McpServer) = runAdminMutation {
        container.api.deleteMcpServer(server.id)
        _state.update {
            it.copy(admin = it.admin.copy(
                globalMcpServers = it.admin.globalMcpServers.filterNot { item -> item.id == server.id },
            ))
        }
        "全局 MCP 已删除"
    }

    fun generateAdminRedeemCodes(amountCents: Int, count: Int) {
        if (amountCents < 100 || count !in 1..50) return
        runAdminMutation {
            when (val outcome = commitThenReconcile(
                commit = { container.api.generateAdminRedeemCodes(amountCents, count) },
                onCommitted = { generated ->
                    _state.update { state ->
                        state.copy(admin = state.admin.copy(
                            loadedResources = state.admin.loadedResources - AdminResource.RedeemCodes,
                            generatedCodes = generated,
                        ))
                    }
                },
                reconcile = {
                    val codes = container.api.adminRedeemCodes()
                    _state.update { state ->
                        state.copy(admin = state.admin.copy(
                            redeemCodes = codes,
                            loadedResources = state.admin.loadedResources + AdminResource.RedeemCodes,
                        ))
                    }
                },
            )) {
                is CommittedMutationOutcome.Rejected -> throw outcome.error
                is CommittedMutationOutcome.Committed -> adminReconciliationMessage(
                    success = "已生成 ${outcome.value.size} 个兑换码",
                    error = outcome.reconciliationError,
                )
            }
        }
    }

    private fun runSettingsMutation(block: suspend () -> Unit) {
        if (!tryStartDestinationMutation(settingsMutationGate, WorkspaceDestination.Settings)) return
        viewModelScope.launch {
            try {
                block()
            } finally {
                finishDestinationMutation(settingsMutationGate, WorkspaceDestination.Settings)
            }
        }
    }

    private fun runAdminMutation(block: suspend () -> String) {
        if (_state.value.user?.role != "admin") return
        if (!tryStartDestinationMutation(adminMutationGate, WorkspaceDestination.Admin)) return
        viewModelScope.launch {
            try {
                runSuspendCatching(block)
                    .onSuccess { message -> if (message.isNotBlank()) showMessage(message) }
                    .onFailure(::handleError)
            } finally {
                finishDestinationMutation(adminMutationGate, WorkspaceDestination.Admin)
            }
        }
    }

    private suspend fun refreshAdminUser(userId: String) {
        applyAdminUserDetail(container.api.adminUserDetail(userId))
    }

    private fun applyAdminUserDetail(detail: AdminUserDetail) {
        _state.update {
            it.copy(
                user = if (it.user?.id == detail.user.id) detail.user else it.user,
                admin = it.admin.copy(
                    users = it.admin.users.map { user ->
                        if (user.id == detail.user.id) detail.user else user
                    },
                    userDetails = it.admin.userDetails + (detail.user.id to detail),
                    loadedResources = it.admin.loadedResources + AdminResource.Users,
                ),
            )
        }
    }

    private fun applyAdminBalanceDelta(userId: String, amountCents: Int) {
        _state.update { state ->
            val detail = state.admin.userDetails[userId]
            state.copy(
                user = if (state.user?.id == userId) {
                    state.user.withBalanceDelta(amountCents)
                } else {
                    state.user
                },
                admin = state.admin.copy(
                    loadedResources = state.admin.loadedResources - AdminResource.Users,
                    users = state.admin.users.map { user ->
                        if (user.id == userId) user.withBalanceDelta(amountCents) else user
                    },
                    userDetails = if (detail == null) {
                        state.admin.userDetails
                    } else {
                        state.admin.userDetails + (
                            userId to detail.copy(
                                user = detail.user.withBalanceDelta(amountCents),
                            )
                        )
                    },
                ),
            )
        }
    }

    private fun loadProjects(force: Boolean = false) {
        val state = _state.value
        if (!force && state.projectsLoaded) return
        if (WorkspaceDestination.Projects in state.loadingDestinations) return
        if (!readRequestGate.tryAcquire(READ_PROJECTS)) return
        setDestinationLoading(WorkspaceDestination.Projects, true)
        viewModelScope.launch {
            try {
                if (!force && !_state.value.projectsLoaded) {
                    readCachedPayload<List<Project>>(PAYLOAD_PROJECTS)?.let { cached ->
                        _state.update {
                            it.copy(
                                projects = cached,
                                usingCachedData = true,
                            )
                        }
                    }
                    if (isCachedPayloadFresh(PAYLOAD_PROJECTS)) {
                        _state.update { it.copy(projectsLoaded = true) }
                        return@launch
                    }
                }
                runSuspendCatching { container.api.projects() }
                    .onSuccess { projects ->
                        _state.update { it.copy(projects = projects, projectsLoaded = true) }
                        writeCachedPayload(PAYLOAD_PROJECTS, projects)
                    }
                    .onFailure(::handleError)
            } finally {
                readRequestGate.release(READ_PROJECTS)
                setDestinationLoading(WorkspaceDestination.Projects, false)
            }
        }
    }

    private fun loadProjectSurface(surface: ProjectSurface) {
        val state = _state.value
        projectResourcesToLoad(
            surface = surface,
            projectsLoaded = state.projectsLoaded,
            knowledgeBasesLoaded = state.knowledgeBasesLoaded,
        ).forEach { resource ->
            when (resource) {
                ProjectResource.Projects -> loadProjects()
                ProjectResource.KnowledgeBases -> loadKnowledgeBases()
            }
        }
    }

    private fun loadArtifacts(conversationId: String, force: Boolean = false) {
        if (!force && _state.value.artifacts.containsKey(conversationId)) return
        val requestKey = "$READ_ARTIFACTS_PREFIX$conversationId"
        if (!readRequestGate.tryAcquire(requestKey)) return
        viewModelScope.launch {
            try {
                val payloadKey = "$PAYLOAD_ARTIFACTS_PREFIX$conversationId"
                if (!force) {
                    readCachedPayload<List<Artifact>>(payloadKey)?.let { cached ->
                        _state.update {
                            it.copy(artifacts = it.artifacts + (conversationId to cached))
                        }
                    }
                    if (isCachedPayloadFresh(payloadKey)) return@launch
                }
                runSuspendCatching { container.api.artifacts(conversationId) }
                    .onSuccess { artifacts ->
                        _state.update {
                            it.copy(artifacts = it.artifacts + (conversationId to artifacts))
                        }
                        writeCachedPayload(payloadKey, artifacts)
                    }
                    .onFailure(::handleBackgroundError)
            } finally {
                readRequestGate.release(requestKey)
            }
        }
    }

    private fun loadBilling(force: Boolean = false) {
        loadBillingSection(_state.value.selectedBillingSection, force)
    }

    private fun loadBillingSection(section: BillingSection, force: Boolean = false) {
        val snapshot = _state.value
        val now = EpochTime.now()
        val freshResources = snapshot.billingLoadedAtEpochMillis
            .filterValues { loadedAt ->
                isLoadedSnapshotFresh(loadedAt, now, BILLING_PAYLOAD_TTL_MILLIS)
            }
            .keys
        val initiallyRequested = billingResourcesToLoad(
            section = section,
            loadedResources = snapshot.billingLoadedResources,
            freshResources = freshResources,
            userAvailable = snapshot.user != null,
            force = force,
        ).filterTo(linkedSetOf()) { it !in snapshot.billingLoadingResources }
        if (initiallyRequested.isEmpty()) return
        _state.update {
            it.copy(billingLoadingResources = it.billingLoadingResources + initiallyRequested)
        }
        viewModelScope.launch {
            if (!force && !_state.value.billingCacheRead) {
                val cached = readCachedPayload<CachedBillingPayload>(PAYLOAD_BILLING)
                val cacheFresh = cached != null && isCachedPayloadFresh(PAYLOAD_BILLING)
                val loadedAt = EpochTime.now()
                _state.update { state ->
                    state.copy(
                        plans = cached?.plans ?: state.plans,
                        usageRecords = cached?.usage ?: state.usageRecords,
                        ledgerEntries = cached?.ledger ?: state.ledgerEntries,
                        billingCacheRead = true,
                        billingLoadedResources = if (cached != null) {
                            state.billingLoadedResources + BILLING_CACHE_RESOURCES
                        } else {
                            state.billingLoadedResources
                        },
                        billingLoadedAtEpochMillis = if (cacheFresh) {
                            state.billingLoadedAtEpochMillis +
                                BILLING_CACHE_RESOURCES.associateWith { loadedAt }
                        } else {
                            state.billingLoadedAtEpochMillis
                        },
                        usingCachedData = state.usingCachedData || cached != null,
                    )
                }
            }
            val refreshed = _state.value
            val refreshedNow = EpochTime.now()
            val refreshedFreshResources = refreshed.billingLoadedAtEpochMillis
                .filterValues { loadedAt ->
                    isLoadedSnapshotFresh(
                        loadedAt,
                        refreshedNow,
                        BILLING_PAYLOAD_TTL_MILLIS,
                    )
                }
                .keys
            val requested = billingResourcesToLoad(
                section = section,
                loadedResources = refreshed.billingLoadedResources,
                freshResources = refreshedFreshResources,
                userAvailable = refreshed.user != null,
                force = force,
            ).filterTo(linkedSetOf()) { it in initiallyRequested }
            val results = coroutineScope {
                requested.map { resource ->
                    async {
                        resource to runSuspendCatching { fetchBillingResource(resource) }
                    }
                }.map { it.await() }
            }
            val payloads = results.mapNotNull { (_, result) -> result.getOrNull() }
            if (payloads.isNotEmpty()) applyBillingPayloads(payloads)
            _state.update {
                it.copy(
                    billingLoadingResources = it.billingLoadingResources - initiallyRequested,
                )
            }
            results.firstNotNullOfOrNull { (_, result) -> result.exceptionOrNull() }
                ?.let(::handleError)
            cacheBillingSnapshotIfFresh()
        }
    }

    private fun loadSettings(force: Boolean = false) {
        loadSettingsSection(_state.value.selectedSettingsSection, force)
    }

    private fun loadSettingsSection(section: SettingsSection, force: Boolean = false) {
        val snapshot = _state.value
        val now = EpochTime.now()
        val freshResources = snapshot.settingsLoadedAtEpochMillis
            .filterValues { loadedAt ->
                isLoadedSnapshotFresh(loadedAt, now, WORKSPACE_PAYLOAD_TTL_MILLIS)
            }
            .keys
        val initiallyRequested = settingsResourcesToLoad(
            section = section,
            loadedResources = snapshot.settingsLoadedResources,
            freshResources = freshResources,
            userAvailable = snapshot.user != null,
            force = force,
        ).filterTo(linkedSetOf()) { it !in snapshot.settingsLoadingResources }
        if (initiallyRequested.isEmpty()) return
        _state.update {
            it.copy(settingsLoadingResources = it.settingsLoadingResources + initiallyRequested)
        }
        viewModelScope.launch {
            if (!force && !_state.value.settingsCacheRead) {
                val cached = readCachedPayload<CachedSettingsPayload>(PAYLOAD_SETTINGS)
                val cacheFresh = cached != null && isCachedPayloadFresh(PAYLOAD_SETTINGS)
                val loadedAt = EpochTime.now()
                _state.update { current ->
                    val cachedStyles = if (current.styles.isEmpty()) {
                        cached?.styles.orEmpty()
                    } else {
                        current.styles
                    }
                    val styleSelection = resolveStyleSelection(
                        cachedStyles,
                        current.defaultStyleId,
                        current.selectedStyleId,
                    )
                    val mergedMcp = if (cached != null) {
                        mergeMcpServersByScope(
                            current.mcpServers,
                            cached.userMcpServers,
                            null,
                        )
                    } else {
                        current.mcpServers
                    }
                    current.copy(
                        memories = cached?.memories ?: current.memories,
                        styles = cachedStyles,
                        defaultStyleId = styleSelection.defaultStyleId,
                        selectedStyleId = styleSelection.selectedStyleId,
                        mcpServers = mergedMcp,
                        chatTools = current.chatTools.copy(
                            mcpServerIds = validSelectedMcpServerIds(
                                current.chatTools.mcpServerIds,
                                mergedMcp,
                            ),
                        ),
                        settingsCacheRead = true,
                        settingsLoadedResources = if (cached != null) {
                            current.settingsLoadedResources + SETTINGS_CACHE_RESOURCES
                        } else {
                            current.settingsLoadedResources
                        },
                        settingsLoadedAtEpochMillis = if (cacheFresh) {
                            current.settingsLoadedAtEpochMillis +
                                SETTINGS_CACHE_RESOURCES.associateWith { loadedAt }
                        } else {
                            current.settingsLoadedAtEpochMillis
                        },
                        usingCachedData = current.usingCachedData || cached != null,
                    )
                }
            }
            val refreshed = _state.value
            val refreshedNow = EpochTime.now()
            val refreshedFreshResources = refreshed.settingsLoadedAtEpochMillis
                .filterValues { loadedAt ->
                    isLoadedSnapshotFresh(
                        loadedAt,
                        refreshedNow,
                        WORKSPACE_PAYLOAD_TTL_MILLIS,
                    )
                }
                .keys
            val requested = settingsResourcesToLoad(
                section = section,
                loadedResources = refreshed.settingsLoadedResources,
                freshResources = refreshedFreshResources,
                userAvailable = refreshed.user != null,
                force = force,
            ).filterTo(linkedSetOf()) { it in initiallyRequested }
            val results = coroutineScope {
                requested.map { resource ->
                    async {
                        resource to runSuspendCatching { fetchSettingsResource(resource) }
                    }
                }.map { it.await() }
            }
            val payloads = results.mapNotNull { (_, result) -> result.getOrNull() }
            if (payloads.isNotEmpty()) applySettingsPayloads(payloads)
            _state.update {
                it.copy(
                    settingsLoadingResources = it.settingsLoadingResources - initiallyRequested,
                )
            }
            results.firstNotNullOfOrNull { (_, result) -> result.exceptionOrNull() }
                ?.let(::handleError)
            cacheSettingsSnapshotIfFresh()
        }
    }

    private suspend fun fetchSettingsResource(
        resource: SettingsResource,
    ): SettingsResourcePayload = when (resource) {
        SettingsResource.User -> SettingsResourcePayload.UserValue(
            container.api.currentUser()
                ?: throw ApiException(401, "登录已失效，请重新登录"),
        )
        SettingsResource.Memories -> SettingsResourcePayload.MemoriesValue(
            container.api.memories(),
        )
        SettingsResource.Styles -> SettingsResourcePayload.StylesValue(container.api.styles())
        SettingsResource.UserMcp -> SettingsResourcePayload.UserMcpValue(
            container.api.mcpServers("user"),
        )
    }

    private suspend fun applySettingsPayloads(payloads: List<SettingsResourcePayload>) {
        val now = EpochTime.now()
        val requestedDefaultStyleId = _state.value.defaultStyleId
        _state.update { state ->
            var updated = state
            payloads.forEach { payload ->
                updated = when (payload) {
                    is SettingsResourcePayload.UserValue -> updated.copy(user = payload.value)
                    is SettingsResourcePayload.MemoriesValue -> updated.copy(
                        memories = payload.value,
                    )
                    is SettingsResourcePayload.StylesValue -> {
                        val selection = resolveStyleSelection(
                            payload.value,
                            updated.defaultStyleId,
                            updated.selectedStyleId,
                        )
                        updated.copy(
                            styles = payload.value,
                            defaultStyleId = selection.defaultStyleId,
                            selectedStyleId = selection.selectedStyleId,
                        )
                    }
                    is SettingsResourcePayload.UserMcpValue -> {
                        val merged = mergeMcpServersByScope(
                            updated.mcpServers,
                            payload.value,
                            null,
                        )
                        updated.copy(
                            mcpServers = merged,
                            chatTools = updated.chatTools.copy(
                                mcpServerIds = validSelectedMcpServerIds(
                                    updated.chatTools.mcpServerIds,
                                    merged,
                                ),
                            ),
                        )
                    }
                }
            }
            updated.copy(
                settingsLoadedResources = updated.settingsLoadedResources +
                    payloads.map(SettingsResourcePayload::resource),
                settingsLoadedAtEpochMillis = updated.settingsLoadedAtEpochMillis +
                    payloads.associate { it.resource to now },
            )
        }
        val resolvedDefaultStyleId = _state.value.defaultStyleId
        if (resolvedDefaultStyleId != requestedDefaultStyleId) {
            container.uiPreferenceStore.setDefaultStyleId(resolvedDefaultStyleId)
        }
        payloads.filterIsInstance<SettingsResourcePayload.UserValue>()
            .lastOrNull()
            ?.value
            ?.let { user ->
                viewModelScope.launch { activeCacheDatabase?.userDao()?.upsert(user.toCacheEntity()) }
            }
    }

    private fun markSettingsResourceFresh(resource: SettingsResource) {
        val now = EpochTime.now()
        _state.update {
            it.copy(
                settingsLoadedResources = it.settingsLoadedResources + resource,
                settingsLoadedAtEpochMillis = it.settingsLoadedAtEpochMillis + (resource to now),
            )
        }
        cacheSettingsSnapshotIfFresh()
    }

    private fun cacheSettingsSnapshotIfFresh() {
        val state = _state.value
        val cacheFresh = areSettingsCacheResourcesFresh(
            state.settingsLoadedAtEpochMillis,
            EpochTime.now(),
            WORKSPACE_PAYLOAD_TTL_MILLIS,
        )
        if (!cacheFresh) return
        val payload = CachedSettingsPayload(
            state.memories,
            state.styles,
            state.mcpServers.filter { it.scope == "user" },
        )
        viewModelScope.launch { writeCachedPayload(PAYLOAD_SETTINGS, payload) }
    }

    private fun applyUpdatedUser(user: User, message: String) {
        _state.update { it.copy(user = user, message = message) }
        viewModelScope.launch {
            activeCacheDatabase?.userDao()?.upsert(user.toCacheEntity())
        }
    }

    private suspend fun fetchBillingSnapshot(): BillingSnapshot = coroutineScope {
        val user = async { container.api.currentUser() }
        val plans = async { container.api.plans() }
        val usage = async { container.api.usageRecords() }
        val ledger = async { container.api.ledger() }
        BillingSnapshot(
            user = user.await() ?: throw ApiException(401, "登录已失效，请重新登录"),
            plans = plans.await(),
            usage = usage.await(),
            ledger = ledger.await(),
        )
    }

    private suspend fun fetchBillingResource(resource: BillingResource): BillingResourcePayload =
        when (resource) {
            BillingResource.User -> BillingResourcePayload.UserValue(
                container.api.currentUser()
                    ?: throw ApiException(401, "登录已失效，请重新登录"),
            )
            BillingResource.Plans -> BillingResourcePayload.PlansValue(container.api.plans())
            BillingResource.Usage -> BillingResourcePayload.UsageValue(
                container.api.usageRecords(),
            )
            BillingResource.Ledger -> BillingResourcePayload.LedgerValue(container.api.ledger())
        }

    private fun applyBillingPayloads(payloads: List<BillingResourcePayload>) {
        val now = EpochTime.now()
        _state.update { state ->
            var updated = state
            payloads.forEach { payload ->
                updated = when (payload) {
                    is BillingResourcePayload.UserValue -> updated.copy(user = payload.value)
                    is BillingResourcePayload.PlansValue -> updated.copy(plans = payload.value)
                    is BillingResourcePayload.UsageValue -> updated.copy(
                        usageRecords = payload.value,
                    )
                    is BillingResourcePayload.LedgerValue -> updated.copy(
                        ledgerEntries = payload.value,
                    )
                }
            }
            updated.copy(
                billingLoadedResources = updated.billingLoadedResources +
                    payloads.map(BillingResourcePayload::resource),
                billingLoadedAtEpochMillis = updated.billingLoadedAtEpochMillis +
                    payloads.associate { it.resource to now },
            )
        }
        payloads.filterIsInstance<BillingResourcePayload.UserValue>()
            .lastOrNull()
            ?.value
            ?.let { user ->
                viewModelScope.launch { activeCacheDatabase?.userDao()?.upsert(user.toCacheEntity()) }
            }
    }

    private fun cacheBillingSnapshotIfFresh() {
        val state = _state.value
        val now = EpochTime.now()
        val cacheFresh = areBillingCacheResourcesFresh(
            state.billingLoadedAtEpochMillis,
            now,
            BILLING_PAYLOAD_TTL_MILLIS,
        )
        if (!cacheFresh) return
        viewModelScope.launch {
            writeCachedPayload(
                PAYLOAD_BILLING,
                CachedBillingPayload(state.plans, state.usageRecords, state.ledgerEntries),
                BILLING_PAYLOAD_TTL_MILLIS,
            )
        }
    }

    private fun applyBillingSnapshot(snapshot: BillingSnapshot) {
        val now = EpochTime.now()
        _state.update { it.withBillingSnapshot(snapshot, now) }
        viewModelScope.launch {
            activeCacheDatabase?.userDao()?.upsert(snapshot.user.toCacheEntity())
            writeCachedPayload(
                PAYLOAD_BILLING,
                CachedBillingPayload(snapshot.plans, snapshot.usage, snapshot.ledger),
                BILLING_PAYLOAD_TTL_MILLIS,
            )
        }
    }

    private fun refreshBillingSnapshotAfterExternalPayment() {
        if (externalPaymentRefreshJob?.isActive == true) return
        externalPaymentRefreshJob = viewModelScope.launch {
            runSuspendCatching { fetchBillingSnapshot() }
                .onSuccess(::applyBillingSnapshot)
                .onFailure(::handleError)
        }
    }

    /**
     * 对齐 Web QueryClient 的窗口重新聚焦语义：缓存继续即时显示，只后台重新验证当前页面。
     */
    private fun refreshVisibleDestination(
        snapshot: LinHubUiState,
        userAlreadyRefreshing: Boolean,
    ) {
        if (!userAlreadyRefreshing) refreshCurrentUserInBackground()
        when (snapshot.destination) {
            WorkspaceDestination.Chat,
            -> refreshChatSurface(snapshot)

            WorkspaceDestination.Billing -> Unit

            WorkspaceDestination.Projects -> {
                loadProjects(force = true)
                snapshot.projectConversations.keys.forEach { projectId ->
                    snapshot.projects.firstOrNull { it.id == projectId }
                        ?.let(::loadProjectConversations)
                }
            }

            WorkspaceDestination.Knowledge -> refreshKnowledgeSurface(
                snapshot.selectedKnowledgeBaseId,
            )
            WorkspaceDestination.Files -> loadMediaAssets(reset = true, force = true)
            WorkspaceDestination.Skills -> loadSkills(force = true)
            WorkspaceDestination.Settings -> loadSettings(force = true)
            WorkspaceDestination.Admin -> loadAdmin(force = true)
        }
    }

    private fun refreshChatSurface(snapshot: LinHubUiState) {
        refreshModelsInBackground()
        refreshStylesInBackground()
        refreshKnowledgeBaseIndex()
        snapshot.selectedConversationId?.let { loadArtifacts(it, force = true) }
        val selectedConversation = snapshot.conversations.firstOrNull {
            it.id == snapshot.selectedConversationId
        }
        val activeProjectId = snapshot.pendingProjectId ?: selectedConversation?.projectId
        if (activeProjectId != null) refreshProjectsIndex()
        val activeSkillId = snapshot.pendingSkillId ?: selectedConversation?.skillId
        activeSkillId?.let { loadSkillContext(it, force = true) }
    }

    private fun refreshModelsInBackground() {
        viewModelScope.launch {
            runSuspendCatching { container.api.models() }
                .onSuccess { response ->
                    val cachedAt = EpochTime.now()
                    _state.update { it.withRefreshedModels(response) }
                    activeCacheDatabase?.let { database ->
                        database.withTransaction {
                            database.modelDao().replaceAll(
                                response.models.map { it.toCacheEntity(cachedAt) },
                            )
                            database.syncStateDao().recordSuccess(
                                SYNC_MODELS,
                                MODELS_TTL_MILLIS,
                                cachedAt,
                            )
                        }
                    }
                }
                .onFailure(::handleBackgroundError)
        }
    }

    private fun refreshCurrentUserInBackground() {
        viewModelScope.launch {
            runSuspendCatching {
                container.api.currentUser()
                    ?: throw ApiException(401, "登录已失效，请重新登录")
            }.onSuccess { user ->
                val cachedAt = EpochTime.now()
                _state.update { it.copy(user = user) }
                activeCacheDatabase?.let { database ->
                    database.withTransaction {
                        database.userDao().upsert(user.toCacheEntity(cachedAt))
                        database.syncStateDao().recordSuccess(
                            SYNC_USER,
                            USER_TTL_MILLIS,
                            cachedAt,
                        )
                    }
                }
            }.onFailure(::handleBackgroundError)
        }
    }

    private fun refreshProjectsIndex() {
        if (!hasActiveSession()) return
        if (projectsMutationGate.isActive()) return
        if (!readRequestGate.tryAcquire(READ_PROJECTS)) return
        viewModelScope.launch {
            try {
                runSuspendCatching { container.api.projects() }
                    .onSuccess { projects ->
                        _state.update { it.copy(projects = projects, projectsLoaded = true) }
                        writeCachedPayload(PAYLOAD_PROJECTS, projects)
                    }
                    .onFailure(::handleBackgroundError)
            } finally {
                readRequestGate.release(READ_PROJECTS)
            }
        }
    }

    private fun loadKnowledgeBases(force: Boolean = false) {
        val state = _state.value
        if (!force && state.knowledgeBasesLoaded) return
        if (knowledgeMutationGate.isActive()) return
        if (!readRequestGate.tryAcquire(READ_KNOWLEDGE_BASES)) return
        setDestinationLoading(WorkspaceDestination.Knowledge, true)
        viewModelScope.launch {
            try {
                if (!force && !_state.value.knowledgeBasesLoaded) {
                    readCachedPayload<List<KnowledgeBase>>(PAYLOAD_KNOWLEDGE)?.let { cached ->
                        _state.update { it.copy(knowledgeBases = cached, usingCachedData = true) }
                    }
                    if (isCachedPayloadFresh(PAYLOAD_KNOWLEDGE)) {
                        _state.update { it.copy(knowledgeBasesLoaded = true) }
                        return@launch
                    }
                }
                runSuspendCatching { container.api.knowledgeBases() }
                    .onSuccess { knowledgeBases ->
                        _state.update {
                            it.copy(knowledgeBases = knowledgeBases, knowledgeBasesLoaded = true)
                        }
                        writeCachedPayload(PAYLOAD_KNOWLEDGE, knowledgeBases)
                    }
                    .onFailure(::handleError)
            } finally {
                readRequestGate.release(READ_KNOWLEDGE_BASES)
                setDestinationLoading(WorkspaceDestination.Knowledge, false)
            }
        }
    }

    private fun refreshKnowledgeSurface(knowledgeBaseId: String?) {
        if (knowledgeMutationGate.isActive()) return
        val requestKeys = buildList {
            add(READ_KNOWLEDGE_BASES)
            knowledgeBaseId?.let { add("$READ_KNOWLEDGE_DOCUMENTS_PREFIX$it") }
        }
        val acquired = mutableListOf<String>()
        for (key in requestKeys) {
            if (!readRequestGate.tryAcquire(key)) {
                acquired.forEach(readRequestGate::release)
                return
            }
            acquired += key
        }
        setDestinationLoading(WorkspaceDestination.Knowledge, true)
        viewModelScope.launch {
            try {
                val results = coroutineScope {
                    val knowledgeBases = async {
                        runSuspendCatching { container.api.knowledgeBases() }
                    }
                    val documents = knowledgeBaseId?.let { id ->
                        async {
                            runSuspendCatching { container.api.knowledgeDocuments(id) }
                        }
                    }
                    knowledgeBases.await() to documents?.await()
                }
                results.first.onSuccess { knowledgeBases ->
                    _state.update { state ->
                        state.copy(
                            knowledgeBases = knowledgeBases,
                            knowledgeBasesLoaded = true,
                            selectedKnowledgeBaseId = state.selectedKnowledgeBaseId?.takeIf { id ->
                                knowledgeBases.any { it.id == id }
                            },
                        )
                    }
                    writeCachedPayload(PAYLOAD_KNOWLEDGE, knowledgeBases)
                }
                results.second?.onSuccess { documents ->
                    val id = knowledgeBaseId ?: return@onSuccess
                    _state.update { state ->
                        state.copy(
                            knowledgeDocuments = state.knowledgeDocuments + (id to documents),
                        )
                    }
                    writeCachedPayload("$PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX$id", documents)
                    scheduleKnowledgePolling(id, documents)
                }
                sequenceOf(
                    results.first.exceptionOrNull(),
                    results.second?.exceptionOrNull(),
                ).filterNotNull().firstOrNull()?.let(::handleBackgroundError)
            } finally {
                acquired.forEach(readRequestGate::release)
                setDestinationLoading(WorkspaceDestination.Knowledge, false)
            }
        }
    }

    private fun loadKnowledgeDocuments(knowledgeBaseId: String) {
        if (_state.value.knowledgeDocuments.containsKey(knowledgeBaseId)) return
        if (knowledgeMutationGate.isActive()) return
        val requestKey = "$READ_KNOWLEDGE_DOCUMENTS_PREFIX$knowledgeBaseId"
        if (!readRequestGate.tryAcquire(requestKey)) return
        setDestinationLoading(WorkspaceDestination.Knowledge, true)
        viewModelScope.launch {
            try {
                val payloadKey = "$PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX$knowledgeBaseId"
                readCachedPayload<List<KnowledgeDocument>>(payloadKey)?.let { cached ->
                    _state.update {
                        it.copy(
                            knowledgeDocuments = it.knowledgeDocuments + (knowledgeBaseId to cached),
                            usingCachedData = true,
                        )
                    }
                    scheduleKnowledgePolling(knowledgeBaseId, cached)
                }
                if (isCachedPayloadFresh(payloadKey)) return@launch
                runSuspendCatching { container.api.knowledgeDocuments(knowledgeBaseId) }
                    .onSuccess { documents ->
                        _state.update {
                            it.copy(
                                knowledgeDocuments = it.knowledgeDocuments + (
                                    knowledgeBaseId to documents
                                ),
                            )
                        }
                        writeCachedPayload(payloadKey, documents)
                        scheduleKnowledgePolling(knowledgeBaseId, documents)
                    }
                    .onFailure(::handleError)
            } finally {
                readRequestGate.release(requestKey)
                setDestinationLoading(WorkspaceDestination.Knowledge, false)
            }
        }
    }

    private fun refreshKnowledgeBaseIndex() {
        if (!hasActiveSession()) return
        if (knowledgeMutationGate.isActive()) return
        if (!readRequestGate.tryAcquire(READ_KNOWLEDGE_BASES)) return
        viewModelScope.launch {
            try {
                runSuspendCatching { container.api.knowledgeBases() }
                    .onSuccess { knowledgeBases ->
                        _state.update {
                            it.copy(knowledgeBases = knowledgeBases, knowledgeBasesLoaded = true)
                        }
                        writeCachedPayload(PAYLOAD_KNOWLEDGE, knowledgeBases)
                    }
                    .onFailure(::handleBackgroundError)
            } finally {
                readRequestGate.release(READ_KNOWLEDGE_BASES)
            }
        }
    }

    private fun scheduleKnowledgePolling(
        knowledgeBaseId: String,
        documents: List<KnowledgeDocument>,
    ) {
        if (documents.none { it.status == "processing" }) {
            knowledgePollJobs.remove(knowledgeBaseId)?.cancel()
            return
        }
        if (knowledgePollJobs[knowledgeBaseId]?.isActive == true) return
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try {
                repeat(MAX_KNOWLEDGE_POLL_ATTEMPTS) {
                    delay(KNOWLEDGE_POLL_INTERVAL_MILLIS)
                    if (!hasActiveSession()) return@launch
                    val previous = _state.value.knowledgeDocuments[knowledgeBaseId].orEmpty()
                    val result = runSuspendCatching {
                        container.api.knowledgeDocuments(knowledgeBaseId)
                    }
                    val next = result.getOrElse { error ->
                        if (!handleUnauthorized(error)) handleBackgroundError(error)
                        return@launch
                    }
                    _state.update { state ->
                        state.copy(
                            knowledgeDocuments = state.knowledgeDocuments + (knowledgeBaseId to next),
                        )
                    }
                    writeCachedPayload("$PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX$knowledgeBaseId", next)
                    if (
                        previous.any { it.status == "processing" } &&
                        next.none { it.status == "processing" }
                    ) {
                        refreshKnowledgeBaseIndex()
                    }
                    if (next.none { it.status == "processing" }) return@launch
                }
                showMessage("部分文档解析时间较长，可稍后返回查看状态")
            } finally {
                if (knowledgePollJobs[knowledgeBaseId] === ownerJob) {
                    knowledgePollJobs.remove(knowledgeBaseId)
                }
            }
        }
        knowledgePollJobs[knowledgeBaseId] = ownerJob
        ownerJob.start()
    }

    private fun loadMediaAssets(reset: Boolean, force: Boolean = false) {
        val snapshot = _state.value
        val kind = snapshot.mediaKind
        val query = snapshot.mediaQuery.trim()
        val requestKey = mediaResultKey(kind, query)
        if (
            reset &&
            !force &&
            shouldReuseMediaResult(
                currentResultKey = snapshot.mediaResultKey,
                requestedResultKey = requestKey,
                loadedAtEpochMillis = snapshot.mediaLoadedAtEpochMillis,
                nowEpochMillis = EpochTime.now(),
                ttlMillis = MEDIA_PAYLOAD_TTL_MILLIS,
                allowExpired = snapshot.isOffline,
            )
        ) return
        if (!reset && mediaLoadJob?.isActive == true) return
        if (reset) mediaLoadJob?.cancel()
        val cursor = if (reset) null else snapshot.mediaNextCursor ?: return
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            setDestinationLoading(WorkspaceDestination.Files, true)
            try {
                val payloadKey = "$PAYLOAD_MEDIA_PREFIX$kind"
                if (reset && query.isEmpty() && !force) {
                    val cached = readCachedPayload<MediaPage>(payloadKey)
                    cached?.let {
                        _state.update { current ->
                            if (current.mediaKind == kind && current.mediaQuery.trim() == query) {
                                current.copy(
                                    mediaAssets = cached.items,
                                    mediaNextCursor = cached.nextCursor,
                                    mediaResultKey = requestKey,
                                    mediaLoadedAtEpochMillis = null,
                                    usingCachedData = true,
                                )
                            } else {
                                current
                            }
                        }
                    }
                    if (cached != null && isCachedPayloadFresh(payloadKey)) {
                        val now = EpochTime.now()
                        _state.update { current ->
                            if (current.mediaResultKey == requestKey) {
                                current.copy(mediaLoadedAtEpochMillis = now)
                            } else {
                                current
                            }
                        }
                        return@launch
                    }
                }
                runSuspendCatching {
                    container.api.mediaAssets(kind = kind, query = query, cursor = cursor)
                }.onSuccess { page ->
                    _state.update { current ->
                        if (current.mediaKind == kind && current.mediaQuery.trim() == query) {
                            current.copy(
                                mediaAssets = if (reset) {
                                    page.items
                                } else {
                                    (current.mediaAssets + page.items).distinctBy(MediaAsset::id)
                                },
                                mediaNextCursor = page.nextCursor,
                                mediaResultKey = requestKey,
                                mediaLoadedAtEpochMillis = EpochTime.now(),
                            )
                        } else {
                            current
                        }
                    }
                    val current = _state.value
                    if (
                        query.isEmpty() &&
                        current.mediaKind == kind &&
                        current.mediaQuery.isBlank() &&
                        current.mediaResultKey == requestKey
                    ) {
                        writeCachedPayload(
                            payloadKey,
                            MediaPage(current.mediaAssets, current.mediaNextCursor),
                            MEDIA_PAYLOAD_TTL_MILLIS,
                        )
                    }
                }.onFailure(::handleError)
            } finally {
                if (mediaLoadJob === ownerJob) {
                    mediaLoadJob = null
                    setDestinationLoading(WorkspaceDestination.Files, false)
                }
            }
        }
        mediaLoadJob = ownerJob
        ownerJob.start()
    }

    private fun loadSkills(force: Boolean = false) {
        val state = _state.value
        if (!force && state.skillsLoaded) return
        if (WorkspaceDestination.Skills in state.loadingDestinations) return
        if (!readRequestGate.tryAcquire(READ_SKILLS)) return
        setDestinationLoading(WorkspaceDestination.Skills, true)
        viewModelScope.launch {
            try {
                if (!force && !state.skillsLoaded) {
                    readCachedPayload<CachedSkillsPayload>(PAYLOAD_SKILLS)?.let { cached ->
                        _state.update {
                            it.copy(
                                mySkills = cached.mine,
                                marketSkills = cached.market,
                                usingCachedData = true,
                            )
                        }
                    }
                    if (isCachedPayloadFresh(PAYLOAD_SKILLS)) {
                        _state.update { it.copy(skillsLoaded = true) }
                        return@launch
                    }
                }
                runSuspendCatching {
                    coroutineScope {
                        val mine = async { container.api.skills() }
                        val market = async { container.api.skills(market = true) }
                        mine.await() to market.await()
                    }
                }.onSuccess { (mine, market) ->
                    _state.update {
                        it.copy(mySkills = mine, marketSkills = market, skillsLoaded = true)
                    }
                    writeCachedPayload(PAYLOAD_SKILLS, CachedSkillsPayload(mine, market))
                }.onFailure(::handleError)
            } finally {
                readRequestGate.release(READ_SKILLS)
                setDestinationLoading(WorkspaceDestination.Skills, false)
            }
        }
    }

    private fun loadSkillContext(id: String, force: Boolean = false) {
        val state = _state.value
        if (!force && (state.mySkills + state.marketSkills).any { it.id == id }) return
        if (skillsMutationGate.isActive()) return
        val requestKey = "$READ_SKILL_PREFIX$id"
        if (!readRequestGate.tryAcquire(requestKey)) return
        viewModelScope.launch {
            try {
                runSuspendCatching { container.api.skill(id) }
                    .onSuccess { skill ->
                        _state.update { current ->
                            if (skill.ownerId == current.user?.id) {
                                current.copy(
                                    mySkills = (listOf(skill) + current.mySkills)
                                        .distinctBy(Skill::id),
                                )
                            } else {
                                current.copy(
                                    marketSkills = (listOf(skill) + current.marketSkills)
                                        .distinctBy(Skill::id),
                                )
                            }
                        }
                    }
                    .onFailure(::handleBackgroundError)
            } finally {
                readRequestGate.release(requestKey)
            }
        }
    }

    private fun setDestinationLoading(destination: WorkspaceDestination, loading: Boolean) {
        val stillLoading = destinationLoadingTracker.update(destination, loading)
        _state.update {
            it.copy(
                loadingDestinations = if (stillLoading) {
                    it.loadingDestinations + destination
                } else {
                    it.loadingDestinations - destination
                },
            )
        }
    }

    private fun tryStartDestinationMutation(
        gate: SingleFlightMutationGate,
        destination: WorkspaceDestination,
    ): Boolean {
        if (destination in _state.value.loadingDestinations || !gate.tryAcquire()) return false
        // 在启动协程前同步发布 loading，避免按钮禁用状态尚未重组时再次提交。
        setDestinationLoading(destination, true)
        return true
    }

    private fun finishDestinationMutation(
        gate: SingleFlightMutationGate,
        destination: WorkspaceDestination,
    ) {
        gate.release()
        setDestinationLoading(destination, false)
    }

    private fun prefetchCachedDestinationPayloads() {
        if (destinationPrefetchJob?.isActive == true) return
        val accountId = activeCacheAccountId ?: return
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(Dispatchers.IO, start = CoroutineStart.LAZY) {
            try {
                val cached = coroutineScope {
                    val projects = async { readCachedPayload<List<Project>>(PAYLOAD_PROJECTS) }
                    val knowledge = async {
                        readCachedPayload<List<KnowledgeBase>>(PAYLOAD_KNOWLEDGE)
                    }
                    val skills = async { readCachedPayload<CachedSkillsPayload>(PAYLOAD_SKILLS) }
                    val media = async {
                        readCachedPayload<MediaPage>("${PAYLOAD_MEDIA_PREFIX}all")
                    }
                    val billing = async {
                        readCachedPayload<CachedBillingPayload>(PAYLOAD_BILLING)
                    }
                    val settings = async {
                        readCachedPayload<CachedSettingsPayload>(PAYLOAD_SETTINGS)
                    }
                    CachedDestinationPrefetch(
                        projects = projects.await(),
                        projectsFresh = isCachedPayloadFresh(PAYLOAD_PROJECTS),
                        knowledgeBases = knowledge.await(),
                        knowledgeFresh = isCachedPayloadFresh(PAYLOAD_KNOWLEDGE),
                        skills = skills.await(),
                        skillsFresh = isCachedPayloadFresh(PAYLOAD_SKILLS),
                        media = media.await(),
                        mediaFresh = isCachedPayloadFresh("${PAYLOAD_MEDIA_PREFIX}all"),
                        billing = billing.await(),
                        billingFresh = isCachedPayloadFresh(PAYLOAD_BILLING),
                        settings = settings.await(),
                        settingsFresh = isCachedPayloadFresh(PAYLOAD_SETTINGS),
                    )
                }
                if (activeCacheAccountId != accountId) return@launch
                val now = EpochTime.now()
                val allMediaKey = mediaResultKey("all", "")
                _state.update { state ->
                    val applyProjects = !state.projectsLoaded && cached.projects != null
                    val applyKnowledge =
                        !state.knowledgeBasesLoaded && cached.knowledgeBases != null
                    val applySkills = !state.skillsLoaded && cached.skills != null
                    val applyMedia = state.mediaResultKey == null &&
                        state.mediaKind == "all" &&
                        state.mediaQuery.isBlank() &&
                        state.mediaAssets.isEmpty() &&
                        cached.media != null
                    val applyBilling = !state.billingCacheRead && cached.billing != null
                    val applySettings = !state.settingsCacheRead && cached.settings != null
                    val settingsStyles = if (applySettings && state.styles.isEmpty()) {
                        cached.settings?.styles.orEmpty()
                    } else {
                        state.styles
                    }
                    val styleSelection = resolveStyleSelection(
                        styles = settingsStyles,
                        requestedDefaultStyleId = state.defaultStyleId,
                        requestedSelectedStyleId = state.selectedStyleId,
                    )
                    val mergedMcp = if (applySettings) {
                        mergeMcpServersByScope(
                            existing = state.mcpServers,
                            userServers = cached.settings?.userMcpServers,
                            globalServers = null,
                        )
                    } else {
                        state.mcpServers
                    }
                    state.copy(
                        projects = if (applyProjects) cached.projects.orEmpty() else state.projects,
                        projectsLoaded = state.projectsLoaded ||
                            (applyProjects && cached.projectsFresh),
                        knowledgeBases = if (applyKnowledge) {
                            cached.knowledgeBases.orEmpty()
                        } else {
                            state.knowledgeBases
                        },
                        knowledgeBasesLoaded = state.knowledgeBasesLoaded ||
                            (applyKnowledge && cached.knowledgeFresh),
                        mySkills = if (applySkills) cached.skills?.mine.orEmpty() else state.mySkills,
                        marketSkills = if (applySkills) {
                            cached.skills?.market.orEmpty()
                        } else {
                            state.marketSkills
                        },
                        skillsLoaded = state.skillsLoaded || (applySkills && cached.skillsFresh),
                        mediaAssets = if (applyMedia) cached.media?.items.orEmpty() else state.mediaAssets,
                        mediaNextCursor = if (applyMedia) {
                            cached.media?.nextCursor
                        } else {
                            state.mediaNextCursor
                        },
                        mediaResultKey = if (applyMedia) allMediaKey else state.mediaResultKey,
                        mediaLoadedAtEpochMillis = if (applyMedia && cached.mediaFresh) {
                            now
                        } else {
                            state.mediaLoadedAtEpochMillis
                        },
                        plans = if (applyBilling) cached.billing?.plans.orEmpty() else state.plans,
                        usageRecords = if (applyBilling) {
                            cached.billing?.usage.orEmpty()
                        } else {
                            state.usageRecords
                        },
                        ledgerEntries = if (applyBilling) {
                            cached.billing?.ledger.orEmpty()
                        } else {
                            state.ledgerEntries
                        },
                        billingCacheRead = true,
                        billingLoadedResources = if (applyBilling) {
                            state.billingLoadedResources + BILLING_CACHE_RESOURCES
                        } else {
                            state.billingLoadedResources
                        },
                        billingLoadedAtEpochMillis = if (applyBilling && cached.billingFresh) {
                            state.billingLoadedAtEpochMillis +
                                BILLING_CACHE_RESOURCES.associateWith { now }
                        } else {
                            state.billingLoadedAtEpochMillis
                        },
                        memories = if (applySettings) {
                            cached.settings?.memories.orEmpty()
                        } else {
                            state.memories
                        },
                        styles = settingsStyles,
                        defaultStyleId = if (applySettings) {
                            styleSelection.defaultStyleId
                        } else {
                            state.defaultStyleId
                        },
                        selectedStyleId = if (applySettings) {
                            styleSelection.selectedStyleId
                        } else {
                            state.selectedStyleId
                        },
                        mcpServers = mergedMcp,
                        chatTools = if (applySettings) {
                            state.chatTools.copy(
                                mcpServerIds = validSelectedMcpServerIds(
                                    state.chatTools.mcpServerIds,
                                    mergedMcp,
                                ),
                            )
                        } else {
                            state.chatTools
                        },
                        settingsCacheRead = true,
                        settingsLoadedResources = if (applySettings) {
                            state.settingsLoadedResources + SETTINGS_CACHE_RESOURCES
                        } else {
                            state.settingsLoadedResources
                        },
                        settingsLoadedAtEpochMillis = if (applySettings && cached.settingsFresh) {
                            state.settingsLoadedAtEpochMillis +
                                SETTINGS_CACHE_RESOURCES.associateWith { now }
                        } else {
                            state.settingsLoadedAtEpochMillis
                        },
                        usingCachedData = state.usingCachedData ||
                            applyProjects || applyKnowledge || applySkills || applyMedia ||
                            applyBilling || applySettings,
                    )
                }
            } finally {
                if (destinationPrefetchJob === ownerJob) destinationPrefetchJob = null
            }
        }
        destinationPrefetchJob = ownerJob
        ownerJob.start()
    }

    private suspend inline fun <reified T> readCachedPayload(key: String): T? {
        val cached = activeCacheDatabase?.cachedPayloadDao()?.get(key) ?: return null
        return CachePayloadCodec.decodeOrNull<T>(cached.payloadJson)
    }

    private suspend fun isCachedPayloadFresh(key: String): Boolean =
        activeCacheDatabase?.syncStateDao()?.get("$SYNC_PAYLOAD_PREFIX$key")?.isStale() == false

    private suspend inline fun <reified T> writeCachedPayload(
        key: String,
        value: T,
        ttlMillis: Long = WORKSPACE_PAYLOAD_TTL_MILLIS,
    ) {
        val database = activeCacheDatabase ?: return
        val now = EpochTime.now()
        val encoded = CachePayloadCodec.encode(value)
        database.withTransaction {
            database.cachedPayloadDao().upsert(CachedPayloadEntity(key, encoded, now))
            database.syncStateDao().recordSuccess(
                key = "$SYNC_PAYLOAD_PREFIX$key",
                ttlMillis = ttlMillis,
                nowEpochMillis = now,
            )
        }
    }

    private fun cacheProjectsSnapshot() {
        val projects = _state.value.projects
        viewModelScope.launch { writeCachedPayload(PAYLOAD_PROJECTS, projects) }
    }

    private fun cacheKnowledgeSnapshot() {
        val knowledge = _state.value.knowledgeBases
        viewModelScope.launch { writeCachedPayload(PAYLOAD_KNOWLEDGE, knowledge) }
    }

    private fun cacheKnowledgeDocumentsSnapshot(knowledgeBaseId: String) {
        val documents = _state.value.knowledgeDocuments[knowledgeBaseId] ?: return
        viewModelScope.launch {
            writeCachedPayload("$PAYLOAD_KNOWLEDGE_DOCUMENTS_PREFIX$knowledgeBaseId", documents)
        }
    }

    private fun cacheSkillsSnapshot() {
        val state = _state.value
        val payload = CachedSkillsPayload(state.mySkills, state.marketSkills)
        viewModelScope.launch { writeCachedPayload(PAYLOAD_SKILLS, payload) }
    }

    private fun cacheMediaSnapshot() {
        val state = _state.value
        if (state.mediaQuery.isNotBlank()) return
        val payload = MediaPage(state.mediaAssets, state.mediaNextCursor)
        viewModelScope.launch {
            writeCachedPayload(
                "$PAYLOAD_MEDIA_PREFIX${state.mediaKind}",
                payload,
                MEDIA_PAYLOAD_TTL_MILLIS,
            )
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            if (container.sessionStore.currentToken() == null) {
                _state.update { it.copy(phase = AppPhase.Authentication) }
                return@launch
            }
            val cachedAccountId = container.sessionStore.currentAccountId()
            val restoredCache = cachedAccountId?.let { restoreCachedWorkspace(it) } == true
            if (restoredCache) prefetchCachedDestinationPayloads()
            _state.update { it.copy(workspaceRefreshing = true) }
            runSuspendCatching { loadWorkspace() }.onFailure { error ->
                if (BuildConfig.DEBUG) {
                    android.util.Log.e("LinHub", "恢复工作区失败", error)
                }
                if (error is ApiException && error.status == 401) {
                    expireSession("登录已失效，请重新登录")
                } else if (restoredCache) {
                    _state.update {
                        it.copy(
                            phase = AppPhase.Chat,
                            usingCachedData = true,
                            isOffline = true,
                            workspaceRefreshing = false,
                            message = "网络不可用，正在显示缓存数据",
                        )
                    }
                } else {
                    _state.update {
                        it.copy(
                            phase = AppPhase.Loading,
                            workspaceRefreshing = false,
                            message = null,
                            bootstrapError = error.userMessage(),
                        )
                    }
                }
            }
        }
    }

    private suspend fun loadWorkspace() = coroutineScope {
        val userDeferred = async { container.api.currentUser() }
        val modelsDeferred = async { container.api.models() }
        val conversationsDeferred = async { container.api.conversations() }
        val user = userDeferred.await() ?: throw ApiException(401, "登录已失效，请重新登录")
        val models = modelsDeferred.await()
        val conversations = conversationsDeferred.await()
        if (activeCacheAccountId != null && activeCacheAccountId != user.id) {
            deactivateCache()
            _state.value = LinHubUiState(phase = AppPhase.Loading)
        }
        container.sessionStore.saveAccountId(user.id)
        val database = activateCache(user.id)
        database.withTransaction {
            val cachedAt = EpochTime.now()
            database.userDao().upsert(user.toCacheEntity(cachedAt))
            database.modelDao().replaceAll(models.models.map { it.toCacheEntity(cachedAt) })
            database.conversationDao().replaceIndex(conversations.map { it.toCacheEntity(cachedAt) })
            database.syncStateDao().recordSuccess(SYNC_USER, USER_TTL_MILLIS, cachedAt)
            database.syncStateDao().recordSuccess(SYNC_MODELS, MODELS_TTL_MILLIS, cachedAt)
            database.syncStateDao().recordSuccess(SYNC_CONVERSATIONS, CONVERSATIONS_TTL_MILLIS, cachedAt)
        }
        _state.update {
            val modelId = resolveChatModelId(
                models.models,
                models.defaultModelId,
                user.defaultModelId,
            )
            it.copy(
                phase = AppPhase.Chat,
                user = user,
                models = models.models,
                defaultModelId = models.defaultModelId,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(it, modelId, models.models),
                conversations = conversations,
                message = null,
                usingCachedData = false,
                isOffline = false,
                workspaceRefreshing = false,
                bootstrapError = null,
            )
        }
        viewModelScope.launch(Dispatchers.IO) {
            runSuspendCatching { database.pruneCache() }
                .onFailure(::handleBackgroundError)
        }
        refreshProjectsIndex()
        refreshStylesInBackground()
        prefetchCachedDestinationPayloads()
        resumePendingMessageImageEdits()
    }

    private fun refreshStylesInBackground() {
        viewModelScope.launch {
            runSuspendCatching { container.api.styles() }
                .onSuccess { styles ->
                    val requestedDefaultStyleId = _state.value.defaultStyleId
                    _state.update { state ->
                        val selection = resolveStyleSelection(
                            styles = styles,
                            requestedDefaultStyleId = state.defaultStyleId,
                            requestedSelectedStyleId = state.selectedStyleId,
                        )
                        state.copy(
                            styles = styles,
                            defaultStyleId = selection.defaultStyleId,
                            selectedStyleId = selection.selectedStyleId,
                        )
                    }
                    val resolvedDefaultStyleId = _state.value.defaultStyleId
                    if (resolvedDefaultStyleId != requestedDefaultStyleId) {
                        container.uiPreferenceStore.setDefaultStyleId(resolvedDefaultStyleId)
                    }
                    markSettingsResourceFresh(SettingsResource.Styles)
                }
                .onFailure(::handleBackgroundError)
        }
    }

    private suspend fun restoreCachedWorkspace(accountId: String): Boolean {
        val database = activateCache(accountId)
        val cachedProjects = readCachedPayload<List<Project>>(PAYLOAD_PROJECTS).orEmpty()
        val cached = coroutineScope {
            val user = async { database.userDao().get() }
            val models = async { database.modelDao().observeAll().first() }
            val conversations = async { database.conversationDao().observeIndex(includeArchived = true).first() }
            CachedWorkspace(user.await(), models.await(), conversations.await())
        }
        val user = cached.user?.toDomain() ?: return false
        val models = cached.models.map { it.toDomain() }
        _state.update { state ->
            val modelId = resolveChatModelId(models, state.selectedModelId, user.defaultModelId)
            val defaultModelId = resolveChatModelId(models, user.defaultModelId)
            state.copy(
                phase = AppPhase.Chat,
                user = user,
                models = models,
                defaultModelId = defaultModelId,
                selectedModelId = modelId,
                thinkingEffort = thinkingEffortAfterModelChange(state, modelId, models),
                conversations = cached.conversations
                    .filterNot { it.id in deletedConversationIds }
                    .map { it.toDomain() },
                projects = cachedProjects,
                usingCachedData = true,
                isOffline = false,
            )
        }
        return true
    }

    private fun activateCache(accountId: String): LinHubCacheDatabase {
        if (activeCacheAccountId == accountId && activeCacheDatabase != null) {
            return requireNotNull(activeCacheDatabase)
        }
        cacheObserverJob?.cancel()
        val database = container.cacheDatabaseManager.databaseFor(accountId)
        activeCacheAccountId = accountId
        activeCacheDatabase = database
        cacheObserverJob = viewModelScope.launch {
            combine(
                database.userDao().observe(),
                database.modelDao().observeAll(),
                database.conversationDao().observeIndex(includeArchived = true),
            ) { user, models, conversations ->
                CachedWorkspace(user, models, conversations)
            }.collect { cached ->
                if (activeCacheAccountId != accountId) return@collect
                val user = cached.user?.toDomain() ?: return@collect
                val models = cached.models.map { it.toDomain() }
                _state.update { state ->
                    val defaultModelId = resolveChatModelId(
                        models,
                        state.defaultModelId,
                        user.defaultModelId,
                    )
                    val modelId = resolveChatModelId(
                        models,
                        state.selectedModelId,
                        defaultModelId,
                    )
                    state.copy(
                        phase = AppPhase.Chat,
                        user = user,
                        models = models,
                        defaultModelId = defaultModelId,
                        selectedModelId = modelId,
                        thinkingEffort = thinkingEffortAfterModelChange(state, modelId, models),
                        conversations = cached.conversations
                            .filterNot { it.id in deletedConversationIds }
                            .map { it.toDomain() },
                    )
                }
            }
        }
        return database
    }

    private fun deactivateCache() {
        cacheObserverJob?.cancel()
        cacheObserverJob = null
        activeCacheAccountId = null
        activeCacheDatabase = null
    }

    private fun loadConversation(id: String) {
        if (id in deletedConversationIds) return
        val existing = _state.value.transcripts[id]
        if (existing != null) {
            if (existing.isStreaming) resumeConversation(id)
            else refreshConversation(id)
            return
        }
        if (id in _state.value.loadingConversationIds) return
        viewModelScope.launch {
            _state.update { it.copy(loadingConversationIds = it.loadingConversationIds + id) }
            val database = activeCacheDatabase
            val cachedMessages = database?.messageDao()?.observeTree(id)?.first().orEmpty()
            if (id !in deletedConversationIds && cachedMessages.isNotEmpty()) {
                val cachedConversation = database?.conversationDao()?.get(id)?.toDomain()
                val messages = cachedMessages.map { it.toDomain() }
                val streaming = messages.lastOrNull {
                    it.role == "assistant" && it.status == "streaming"
                }
                _state.update { state ->
                    state.copy(
                        transcripts = state.putTranscript(
                            id,
                            ChatTranscript(
                                messages = messages,
                                streamingMessageId = streaming?.id,
                            ),
                        ),
                        conversations = cachedConversation?.let(state.conversations::replaceConversation)
                            ?: state.conversations,
                        usingCachedData = true,
                    )
                }
                cachedConversation?.skillId?.let(::loadSkillContext)
            }
            runSuspendCatching { container.api.conversation(id) }
                .onSuccess { detail ->
                    if (id in deletedConversationIds) return@onSuccess
                    val streaming = detail.messages.lastOrNull {
                        it.role == "assistant" && it.status == "streaming"
                    }
                    _state.update {
                        it.copy(
                            transcripts = it.putTranscript(
                                id,
                                ChatTranscript(
                                    messages = detail.messages,
                                    streamingMessageId = streaming?.id,
                                ),
                            ),
                            conversations = it.conversations.map { item ->
                                if (item.id == id) detail.conversation else item
                            },
                        )
                    }
                    detail.conversation.skillId?.let(::loadSkillContext)
                    cacheConversationDetail(detail)
                    if (streaming != null) resumeConversation(id)
                }
                .onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    when {
                        error is ApiException && error.status in setOf(403, 404) ->
                            removeUnavailableConversation(id, error.userMessage())
                        cachedMessages.isNotEmpty() && error !is ApiException -> _state.update {
                            it.copy(isOffline = true, message = "网络不可用，正在显示缓存会话")
                        }
                        else -> handleError(error)
                    }
                }
            _state.update { it.copy(loadingConversationIds = it.loadingConversationIds - id) }
        }
    }

    private fun resumeConversation(id: String) {
        if (streamJobs[id]?.isActive == true) return
        val job = viewModelScope.launch(start = CoroutineStart.LAZY) {
            val ownerJob = checkNotNull(coroutineContext[Job])
            try {
                container.api.resumeConversation(id).coalesceChatEvents().collect { applyEvent(id, it) }
            } finally {
                if (streamJobs[id] === ownerJob) streamJobs.remove(id)
                if (hasActiveSession()) refreshConversation(id)
            }
        }
        streamJobs[id] = job
        job.start()
    }

    private fun releaseStreamOwnership(key: String, ownerJob: Job, generationId: String) {
        if (streamJobs[key] === ownerJob) streamJobs.remove(key)
        if (clientGenerationIds[key] == generationId) clientGenerationIds.remove(key)
    }

    private fun markOptimisticSendFailed(
        key: String,
        userMessageId: String,
        assistantMessageId: String,
        error: String,
    ) {
        _state.update { state ->
            val transcript = state.transcripts[key] ?: return@update state
            state.copy(
                transcripts = state.putTranscript(
                    key,
                    transcript.copy(
                        messages = transcript.messages
                            .filterNot { it.id == assistantMessageId }
                            .map { message ->
                                if (message.id == userMessageId && message.status == "sending") {
                                    message.copy(status = "error")
                                } else {
                                    message
                                }
                            },
                        streamingMessageId = if (
                            transcript.streamingMessageId == assistantMessageId
                        ) null else transcript.streamingMessageId,
                        error = error,
                    ),
                ),
                leafOverrides = if (
                    key != NEW_CHAT_KEY && state.leafOverrides[key] == assistantMessageId
                ) {
                    state.leafOverrides + (key to userMessageId)
                } else {
                    state.leafOverrides
                },
                startingNewConversation = false,
                message = error,
            )
        }
        scheduleTranscriptCache(key, immediately = true)
    }

    private fun applyEvent(key: String, event: ChatEvent) {
        if (event is ChatEvent.Error && event.httpStatus == 401) {
            handleError(ApiException(401, event.message))
            return
        }
        if (key in deletedConversationIds) return
        if (event is ChatEvent.Artifact) {
            runCatching {
                container.api.json.decodeFromJsonElement(Artifact.serializer(), event.artifact)
            }.getOrNull()?.let { artifact ->
                _state.update { state ->
                    state.copy(
                        artifacts = state.artifacts + (
                            artifact.conversationId to (
                                state.artifacts[artifact.conversationId].orEmpty() + artifact
                            ).distinctBy(Artifact::id)
                        ),
                    )
                }
            }
        }
        if (event is ChatEvent.Title) {
            _state.update { state ->
                state.copy(conversations = state.conversations.map { conversation ->
                    if (conversation.id == event.conversationId) {
                        conversation.copy(title = event.title)
                    } else {
                        conversation
                    }
                })
            }
        }
        _state.update { state ->
            val transcript = state.transcripts[key] ?: ChatTranscript()
            val nextLeafId = when (event) {
                is ChatEvent.UserMessage -> event.message.id
                is ChatEvent.AssistantStart -> event.message.id
                is ChatEvent.AssistantSnapshot -> event.message.id
                else -> null
            }
            state.copy(
                transcripts = state.putTranscript(key, ChatTranscriptReducer.reduce(transcript, event)),
                leafOverrides = if (key != NEW_CHAT_KEY && nextLeafId != null) {
                    state.leafOverrides + (key to nextLeafId)
                } else {
                    state.leafOverrides
                },
                message = if (event is ChatEvent.Error) event.message else state.message,
            )
        }
        val flushImmediately = when (event) {
            is ChatEvent.Done,
            is ChatEvent.Error,
            is ChatEvent.ToolCallEnd,
            -> true
            is ChatEvent.AssistantSnapshot -> event.message.status != "streaming"
            else -> false
        }
        scheduleTranscriptCache(key, flushImmediately)
    }

    private fun migrateNewConversation(
        conversation: Conversation,
        generationId: String,
        ownerJob: Job,
    ): String {
        val newKey = conversation.id
        val oldTranscript = _state.value.transcripts[NEW_CHAT_KEY] ?: ChatTranscript()
        _state.update { state ->
            val transcripts = state.transcripts.toMutableMap().apply {
                remove(NEW_CHAT_KEY)
                put(newKey, oldTranscript)
            }
            state.copy(
                selectedConversationId = newKey,
                startingNewConversation = false,
                pendingProjectId = null,
                temporaryProjectChat = false,
                pendingSkillId = null,
                conversations = listOf(conversation) + state.conversations.filterNot { it.id == newKey },
                transcripts = trimTranscripts(transcripts, setOf(newKey)),
            )
        }
        if (streamJobs[NEW_CHAT_KEY] === ownerJob) {
            streamJobs.remove(NEW_CHAT_KEY)
            streamJobs[newKey] = ownerJob
        }
        if (clientGenerationIds[NEW_CHAT_KEY] == generationId) {
            clientGenerationIds.remove(NEW_CHAT_KEY)
            clientGenerationIds[newKey] = generationId
        }
        bumpConversationRevision(newKey)
        return newKey
    }

    private fun refreshConversations() {
        if (!hasActiveSession()) return
        refreshConversationIndexes()
    }

    private fun refreshConversationIndexes() {
        viewModelScope.launch {
            val query = _state.value.conversationSearch.trim().takeIf { it.isNotEmpty() }
            runSuspendCatching {
                coroutineScope {
                    val all = async { container.api.conversations() }
                    val search = query?.let { async { container.api.conversations(it) } }
                    all.await() to search?.await()
                }
            }.onSuccess { (conversations, searchResults) ->
                val visibleConversations = conversations.filterNot { it.id in deletedConversationIds }
                val visibleSearchResults = searchResults?.filterNot { it.id in deletedConversationIds }
                activeCacheDatabase?.let { database ->
                    val cachedAt = EpochTime.now()
                    database.withTransaction {
                        database.conversationDao().replaceIndex(
                            visibleConversations.map { it.toCacheEntity(cachedAt) },
                        )
                        database.syncStateDao().recordSuccess(
                            SYNC_CONVERSATIONS,
                            CONVERSATIONS_TTL_MILLIS,
                            cachedAt,
                        )
                    }
                }
                _state.update { state ->
                    state.copy(
                        conversations = visibleConversations,
                        searchResults = if (query != null && state.conversationSearch.trim() == query) {
                            visibleSearchResults
                        } else {
                            state.searchResults
                        },
                    )
                }
            }.onFailure(::handleBackgroundError)
        }
    }

    private fun refreshConversation(id: String) {
        if (!hasActiveSession() || id in deletedConversationIds) return
        val requestedRevision = conversationRevisions[id] ?: 0L
        viewModelScope.launch {
            runSuspendCatching { container.api.conversation(id) }
                .onSuccess { detail ->
                    if (
                        id in deletedConversationIds ||
                        (conversationRevisions[id] ?: 0L) != requestedRevision
                    ) return@onSuccess
                    val streaming = detail.messages.lastOrNull {
                        it.role == "assistant" && it.status == "streaming"
                    }
                    _state.update { state ->
                        state.copy(
                            transcripts = state.putTranscript(
                                id,
                                ChatTranscript(
                                    messages = detail.messages,
                                    streamingMessageId = streaming?.id,
                                ),
                            ),
                            conversations = state.conversations.map {
                                if (it.id == id) detail.conversation else it
                            },
                        )
                    }
                    detail.conversation.skillId?.let(::loadSkillContext)
                    cacheConversationDetail(detail)
                    if (streaming != null) resumeConversation(id)
                }.onFailure { error ->
                    if (error is ApiException && error.status in setOf(403, 404)) {
                        removeUnavailableConversation(id, error.userMessage())
                    } else {
                        handleBackgroundError(error)
                    }
                }
        }
    }

    private suspend fun removeUnavailableConversation(id: String, message: String) {
        deletedConversationIds += id
        bumpConversationRevision(id)
        cacheFlushJobs.remove(id)?.cancel()
        activeCacheDatabase?.conversationDao()?.delete(id)
        _state.update { state ->
            state.copy(
                conversations = state.conversations.filterNot { it.id == id },
                searchResults = state.searchResults?.filterNot { it.id == id },
                transcripts = state.transcripts - id,
                leafOverrides = state.leafOverrides - id,
                artifacts = state.artifacts - id,
                selectedArtifactId = state.selectedArtifactId?.takeUnless { artifactId ->
                    state.artifacts[id].orEmpty().any { it.id == artifactId }
                },
                selectedConversationId = if (state.selectedConversationId == id) null
                else state.selectedConversationId,
                message = message,
            )
        }
    }

    private suspend fun cacheConversationDetail(detail: ConversationDetail) {
        if (detail.conversation.id in deletedConversationIds) return
        val database = activeCacheDatabase ?: return
        val generation = EpochTime.now()
        database.withTransaction {
            database.conversationDao().upsert(detail.conversation.toCacheEntity(generation))
            database.messageDao().replaceSnapshot(
                conversationId = detail.conversation.id,
                generation = generation,
                messages = detail.messages.map { it.toCacheEntity(generation, generation) },
            )
            database.syncStateDao().recordSuccess(
                key = "$SYNC_CONVERSATION_PREFIX${detail.conversation.id}",
                ttlMillis = 0,
                nowEpochMillis = generation,
            )
        }
    }

    private fun scheduleTranscriptCache(key: String, immediately: Boolean) {
        if (key == NEW_CHAT_KEY || activeCacheDatabase == null) return
        cacheFlushJobs.remove(key)?.cancel()
        cacheFlushJobs[key] = viewModelScope.launch {
            if (!immediately) delay(STREAM_CACHE_DEBOUNCE_MILLIS)
            persistTranscriptCache(key)
            cacheFlushJobs.remove(key)
        }
    }

    private suspend fun persistTranscriptCache(conversationId: String) {
        if (conversationId in deletedConversationIds) return
        val database = activeCacheDatabase ?: return
        val state = _state.value
        val transcript = state.transcripts[conversationId] ?: return
        val listed = state.conversations.firstOrNull { it.id == conversationId } ?: return
        val conversation = listed.copy(
            currentLeafId = state.leafOverrides[conversationId] ?: listed.currentLeafId,
        )
        val generation = EpochTime.now()
        database.withTransaction {
            database.conversationDao().upsert(conversation.toCacheEntity(generation))
            database.messageDao().replaceSnapshot(
                conversationId = conversationId,
                generation = generation,
                messages = transcript.messages.map { it.toCacheEntity(generation, generation) },
            )
        }
    }

    private fun patchConversation(
        conversation: Conversation,
        optimistic: Conversation,
        patch: ConversationPatch,
        successMessage: String? = null,
    ) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.replaceConversation(optimistic),
                searchResults = state.searchResults?.replaceConversation(optimistic),
            )
        }
        viewModelScope.launch {
            if (conversation.id !in deletedConversationIds) {
                activeCacheDatabase?.conversationDao()?.upsert(optimistic.toCacheEntity())
            }
            runSuspendCatching { container.api.updateConversation(conversation.id, patch) }
                .onSuccess {
                    if (conversation.id !in deletedConversationIds) refreshConversationIndexes()
                    successMessage?.let(::showMessage)
                }.onFailure { error ->
                    if (handleUnauthorized(error)) return@onFailure
                    if (conversation.id in deletedConversationIds) return@onFailure
                    var rolledBack: Conversation? = null
                    _state.update { state ->
                        val current = state.conversations.firstOrNull { it.id == conversation.id }
                            ?: state.searchResults?.firstOrNull { it.id == conversation.id }
                            ?: return@update state
                        val restored = rollbackConversationPatch(
                            current = current,
                            previous = conversation,
                            attempted = optimistic,
                            patch = patch,
                        )
                        rolledBack = restored
                        state.copy(
                            conversations = state.conversations.replaceConversation(restored),
                            searchResults = state.searchResults?.replaceConversation(restored),
                            failedConversationRenames = patch.title?.let { attemptedTitle ->
                                state.failedConversationRenames + (conversation.id to attemptedTitle)
                            } ?: state.failedConversationRenames,
                            message = error.userMessage(),
                        )
                    }
                    rolledBack?.let { restored ->
                        activeCacheDatabase?.conversationDao()?.upsert(restored.toCacheEntity())
                    }
                }
        }
    }

    private fun startChatAttachmentUpload(id: String) {
        val payload = chatUploadPayloads[id] ?: return
        if (chatUploadJobs[id]?.isActive == true) return
        attachmentUploadOfflineMessage(_state.value.isOffline)?.let { error ->
            _state.update { state ->
                state.copy(
                    attachmentUploads = state.attachmentUploads.map { upload ->
                        if (upload.id == id) upload.copy(progress = 0f, error = error) else upload
                    },
                )
            }
            return
        }
        lateinit var ownerJob: Job
        ownerJob = viewModelScope.launch(start = CoroutineStart.LAZY) {
            try {
                runSuspendCatching {
                    val attachment = container.api.uploadChatAttachment(
                        payload.name,
                        payload.mimeType,
                        payload.bytes,
                    ) { written, total ->
                        val progress = if (total > 0L) {
                            (written.toDouble() / total).toFloat().coerceIn(0f, 1f)
                        } else {
                            0f
                        }
                        _state.update { state ->
                            state.copy(
                                attachmentUploads = state.attachmentUploads.map { upload ->
                                    if (upload.id == id && upload.error == null) {
                                        upload.copy(progress = progress)
                                    } else {
                                        upload
                                    }
                                },
                            )
                        }
                    }
                    require(
                        !attachment.mimeType.startsWith("image/") || !attachment.url.isNullOrBlank(),
                    ) { "图片上传成功，但服务端未返回可访问地址" }
                    attachment
                }.onSuccess { attachment ->
                    chatUploadPayloads.remove(id)
                    _state.update { state ->
                        state.copy(
                            attachmentUploads = state.attachmentUploads.filterNot { it.id == id },
                            pendingAttachments = (state.pendingAttachments + attachment)
                                .distinctBy(UploadedAttachment::id),
                            message = if (
                                !attachment.mimeType.startsWith("image/") && !attachment.hasText
                            ) {
                                "「${attachment.name}」未提取到文本，模型只能看到文件名"
                            } else {
                                state.message
                            },
                        )
                    }
                }.onFailure { error ->
                    if (handleUnauthorized(error)) {
                        chatUploadPayloads.remove(id)
                        return@onFailure
                    }
                    _state.update { state ->
                        state.copy(
                            attachmentUploads = state.attachmentUploads.map { upload ->
                                if (upload.id == id) upload.copy(error = error.userMessage()) else upload
                            },
                        )
                    }
                }
            } finally {
                if (chatUploadJobs[id] === ownerJob) chatUploadJobs.remove(id)
            }
        }
        chatUploadJobs[id] = ownerJob
        ownerJob.start()
    }

    private fun cancelChatAttachmentUploadsForOffline() {
        val activeIds = chatUploadJobs
            .filterValues(Job::isActive)
            .keys
            .toSet()
        if (activeIds.isEmpty()) return
        activeIds.forEach { id -> chatUploadJobs.remove(id)?.cancel() }
        _state.update { state ->
            state.copy(
                attachmentUploads = state.attachmentUploads.map { upload ->
                    if (upload.id in activeIds) {
                        upload.copy(error = OFFLINE_ATTACHMENT_UPLOAD_MESSAGE)
                    } else {
                        upload
                    }
                },
            )
        }
    }

    private fun clearChatAttachmentUploads() {
        chatUploadJobs.values.forEach(Job::cancel)
        chatUploadJobs.clear()
        chatUploadPayloads.clear()
        pendingAttachmentEditJobs.values.forEach(Job::cancel)
        pendingAttachmentEditJobs.clear()
        pendingImageEditRecoveryJob?.cancel()
        pendingImageEditRecoveryJob = null
        pendingMessageImageEdits.clear()
        _state.update {
            it.copy(
                attachmentUploads = emptyList(),
                editingPendingAttachmentIds = emptySet(),
            )
        }
    }

    private fun handleError(error: Throwable) {
        if (BuildConfig.DEBUG) {
            android.util.Log.e("LinHub", "操作失败", error)
        }
        if (error is ApiException && error.status == 401) {
            expireSession("登录已失效，请重新登录")
            return
        }
        showMessage(error.userMessage())
    }

    private fun showMessage(message: String) = _state.update { it.copy(message = message) }

    private fun handleUnauthorized(error: Throwable): Boolean {
        if (error !is ApiException || error.status != 401) return false
        handleError(error)
        return true
    }

    private fun handleBackgroundError(error: Throwable) {
        if (error is ApiException && error.status == 401) handleError(error)
    }

    private fun expireSession(message: String) {
        val accountId = container.sessionStore.currentAccountId()
        container.sessionStore.clear()
        viewModelScope.coroutineContext.cancelChildren()
        streamJobs.values.forEach(Job::cancel)
        streamJobs.clear()
        clientGenerationIds.clear()
        cacheFlushJobs.values.forEach(Job::cancel)
        cacheFlushJobs.clear()
        feedbackJobs.values.forEach(Job::cancel)
        feedbackJobs.clear()
        feedbackMutations.clear()
        chatUploadJobs.clear()
        chatUploadPayloads.clear()
        pendingAttachmentEditJobs.clear()
        knowledgeUploadJob = null
        knowledgePollJobs.clear()
        projectUploadJob = null
        awaitingExternalPaymentReturn = false
        externalPaymentRefreshJob = null
        lastAppBackgroundedAtEpochMillis = null
        pendingNetworkRefresh = false
        speechJob?.cancel()
        speechJob = null
        container.speechPlaybackController.stop()
        deletedConversationIds.clear()
        conversationRevisions.clear()
        deactivateCache()
        accountId?.let(container.cacheDatabaseManager::deleteFor)
        _state.value = LinHubUiState(phase = AppPhase.Authentication, message = message)
        startPreferenceObserver()
        networkStatusInitialized = false
        startNetworkObserver()
    }

    private fun startPreferenceObserver() {
        preferenceObserverJob?.cancel()
        preferenceObserverJob = viewModelScope.launch {
            val basePreferences = combine(
                container.uiPreferenceStore.defaultStyleId,
                container.uiPreferenceStore.modelThinkingEfforts,
                container.uiPreferenceStore.messageRailEnabled,
                container.uiPreferenceStore.themeMode,
                container.uiPreferenceStore.fontSizePreset,
            ) { styleId, thinkingEfforts, messageRailEnabled, themeMode, fontSizePreset ->
                UiPreferenceSnapshot(
                    defaultStyleId = styleId,
                    modelThinkingEfforts = thinkingEfforts,
                    messageRailEnabled = messageRailEnabled,
                    themeMode = themeMode,
                    fontSizePreset = fontSizePreset,
                )
            }
            combine(
                basePreferences,
                container.uiPreferenceStore.collapsedProjectIds,
                container.uiPreferenceStore.pinnedProjectIds,
            ) { preferences, collapsedProjectIds, pinnedProjectIds ->
                preferences.copy(
                    collapsedProjectIds = collapsedProjectIds,
                    pinnedProjectIds = pinnedProjectIds,
                )
            }
                .collect { preferences ->
                    val defaultStyleId = preferences.defaultStyleId ?: "style-normal"
                    _state.update { state ->
                        state.copy(
                            defaultStyleId = defaultStyleId,
                            selectedStyleId = if (state.selectedConversationId == null) {
                                defaultStyleId
                            } else {
                                state.selectedStyleId
                            },
                            modelThinkingEfforts = preferences.modelThinkingEfforts,
                            messageRailEnabled = preferences.messageRailEnabled,
                            themeMode = preferences.themeMode,
                            fontSizePreset = preferences.fontSizePreset,
                            collapsedProjectIds = preferences.collapsedProjectIds,
                            pinnedProjectIds = preferences.pinnedProjectIds,
                            thinkingEffort = resolveModelThinkingEffort(
                                state.selectedModel,
                                preferences.modelThinkingEfforts,
                            ),
                        )
                    }
                }
        }
    }

    private fun startNetworkObserver() {
        networkObserverJob?.cancel()
        networkObserverJob = viewModelScope.launch {
            container.networkMonitor.isOnline.collect { isOnline ->
                val previous = _state.value
                val transitionMessage = networkTransitionMessage(
                    initialized = networkStatusInitialized,
                    wasOffline = previous.isOffline,
                    isOnline = isOnline,
                )
                val reconnectAction = networkReconnectAction(
                    initialized = networkStatusInitialized,
                    wasOffline = previous.isOffline,
                    isOnline = isOnline,
                    hasActiveSession = hasActiveSession(),
                    appInForeground = appInForeground,
                )
                _state.update {
                    it.copy(
                        isOffline = !isOnline,
                        message = transitionMessage ?: it.message,
                    )
                }
                if (!isOnline) cancelChatAttachmentUploadsForOffline()
                when (reconnectAction) {
                    NetworkReconnectAction.None -> Unit
                    NetworkReconnectAction.RefreshNow -> {
                        pendingNetworkRefresh = false
                        resumePendingMessageImageEdits()
                        refreshAfterNetworkReconnect()
                    }
                    NetworkReconnectAction.RefreshOnForeground -> pendingNetworkRefresh = true
                }
                networkStatusInitialized = true
            }
        }
    }

    private fun hasActiveSession(): Boolean =
        _state.value.phase == AppPhase.Chat && container.sessionStore.currentToken() != null

    private fun bumpConversationRevision(conversationId: String) {
        conversationRevisions[conversationId] = (conversationRevisions[conversationId] ?: 0L) + 1L
    }

    override fun onCleared() {
        container.speechPlaybackController.stop()
        super.onCleared()
    }

}

private fun Set<String>.toggleMembership(value: String): Set<String> =
    if (value in this) this - value else this + value

private data class CachedWorkspace(
    val user: UserEntity?,
    val models: List<ModelEntity>,
    val conversations: List<ConversationEntity>,
)

private data class CachedDestinationPrefetch(
    val projects: List<Project>?,
    val projectsFresh: Boolean,
    val knowledgeBases: List<KnowledgeBase>?,
    val knowledgeFresh: Boolean,
    val skills: CachedSkillsPayload?,
    val skillsFresh: Boolean,
    val media: MediaPage?,
    val mediaFresh: Boolean,
    val billing: CachedBillingPayload?,
    val billingFresh: Boolean,
    val settings: CachedSettingsPayload?,
    val settingsFresh: Boolean,
)

private data class FeedbackMutation(
    val key: String,
    var desired: String?,
    var confirmed: String?,
    var version: Long = 0,
)

private data class PendingChatUpload(
    val name: String,
    val mimeType: String,
    val bytes: ByteArray,
)

private sealed interface BillingResourcePayload {
    val resource: BillingResource

    data class UserValue(val value: User) : BillingResourcePayload {
        override val resource = BillingResource.User
    }

    data class PlansValue(val value: List<Plan>) : BillingResourcePayload {
        override val resource = BillingResource.Plans
    }

    data class UsageValue(val value: List<UsageRecord>) : BillingResourcePayload {
        override val resource = BillingResource.Usage
    }

    data class LedgerValue(val value: List<LedgerEntry>) : BillingResourcePayload {
        override val resource = BillingResource.Ledger
    }
}

private sealed interface SettingsResourcePayload {
    val resource: SettingsResource

    data class UserValue(val value: User) : SettingsResourcePayload {
        override val resource = SettingsResource.User
    }

    data class MemoriesValue(val value: List<MemoryEntry>) : SettingsResourcePayload {
        override val resource = SettingsResource.Memories
    }

    data class StylesValue(val value: List<ChatStyle>) : SettingsResourcePayload {
        override val resource = SettingsResource.Styles
    }

    data class UserMcpValue(val value: List<McpServer>) : SettingsResourcePayload {
        override val resource = SettingsResource.UserMcp
    }
}

private fun LinHubUiState.putTranscript(key: String, transcript: ChatTranscript): Map<String, ChatTranscript> {
    val updated = LinkedHashMap(transcripts).apply {
        remove(key)
        put(key, transcript)
    }
    return trimTranscripts(updated, setOf(key, selectedKey))
}

private fun trimTranscripts(
    transcripts: Map<String, ChatTranscript>,
    protectedKeys: Set<String>,
): Map<String, ChatTranscript> {
    if (transcripts.size <= MAX_MEMORY_TRANSCRIPTS) return transcripts
    val updated = LinkedHashMap(transcripts)
    while (updated.size > MAX_MEMORY_TRANSCRIPTS) {
        val candidate = updated.entries.firstOrNull { (key, transcript) ->
            key !in protectedKeys && key != NEW_CHAT_KEY && !transcript.isStreaming
        }?.key ?: break
        updated.remove(candidate)
    }
    return updated
}

private const val MAX_MEMORY_TRANSCRIPTS = 10
private const val MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024
private const val MAX_CHAT_UPLOAD_QUEUE = 8
private const val FOREGROUND_REFRESH_THRESHOLD_MILLIS = 5_000L
private const val FOREGROUND_DESTINATION_REFRESH_THRESHOLD_MILLIS = 30_000L
private const val MAX_KNOWLEDGE_FILE_BYTES = 30 * 1024 * 1024
private const val MAX_PROJECT_FILE_BYTES = 20 * 1024 * 1024
private const val MAX_PROJECT_UPLOAD_COUNT = 20
private const val MAX_KNOWLEDGE_UPLOAD_COUNT = 20
private const val KNOWLEDGE_POLL_INTERVAL_MILLIS = 1_500L
private const val MAX_KNOWLEDGE_POLL_ATTEMPTS = 200
private const val MAX_AVATAR_BYTES = 5 * 1024 * 1024
private const val MAX_EDIT_IMAGE_DIMENSION = 1024

private fun knowledgeUploadResultMessage(successCount: Int, failures: List<String>): String = when {
    failures.isEmpty() -> "已上传 $successCount 个文档，正在解析"
    successCount > 0 -> buildString {
        append("已上传 $successCount 个文档，${failures.size} 个失败")
        failures.take(3).forEach { append("\n").append(it) }
        if (failures.size > 3) append("\n另有 ${failures.size - 3} 个失败")
    }
    else -> buildString {
        append("${failures.size} 个文档上传失败")
        failures.take(3).forEach { append("\n").append(it) }
        if (failures.size > 3) append("\n另有 ${failures.size - 3} 个失败")
    }
}

internal fun projectUploadResultMessage(
    successCount: Int,
    failures: List<String>,
    mirrored: Boolean,
): String = when {
    failures.isEmpty() -> if (mirrored) {
        "已上传 $successCount 个项目资料并同步到知识库"
    } else {
        "已上传 $successCount 个项目文件"
    }
    successCount > 0 -> buildString {
        append("已上传 $successCount 个项目文件，${failures.size} 个步骤失败")
        failures.take(3).forEach { append("\n").append(it) }
        if (failures.size > 3) append("\n另有 ${failures.size - 3} 个失败")
    }
    else -> buildString {
        append("${failures.size} 个项目文件上传失败")
        failures.take(3).forEach { append("\n").append(it) }
        if (failures.size > 3) append("\n另有 ${failures.size - 3} 个失败")
    }
}

class LinHubViewModelFactory(
    private val container: AppContainer,
    private val benchmarkScenario: String? = null,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(LinHubViewModel::class.java))
        return LinHubViewModel(container, benchmarkScenario) as T
    }
}

private fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message
    else -> message ?: "网络连接失败，请稍后重试"
}

private fun formatMoney(cents: Int): String {
    val value = cents.toLong()
    val sign = if (value < 0) "-" else ""
    val absolute = kotlin.math.abs(value)
    return "$sign¥${absolute / 100}.${(absolute % 100).toString().padStart(2, '0')}"
}

internal fun User.withBalanceDelta(deltaCents: Int): User = copy(
    balance = (balance.toLong() + deltaCents.toLong())
        .coerceIn(Int.MIN_VALUE.toLong(), Int.MAX_VALUE.toLong())
        .toInt(),
)

internal fun billingReconciliationPendingMessage(order: Order): String =
    if (order.status == "paid") {
        "操作已生效，账务数据暂未刷新，请稍后重试"
    } else {
        "订单已创建，账务数据暂未刷新；支付状态将在返回后更新"
    }

internal fun adminReconciliationMessage(success: String, error: Throwable?): String {
    if (error is ApiException && error.status == 401) throw error
    return if (error == null) success else "$success；列表刷新失败，请稍后重试"
}

private fun List<Conversation>.replaceConversation(next: Conversation): List<Conversation> =
    map { if (it.id == next.id) next else it }

private fun ChatMessage.plainText(): String = parts
    .filter { it.type() == "text" }
    .mapNotNull { it.string("text") }
    .joinToString("\n")

internal fun MediaAsset.needsPreviewBytes(): Boolean {
    return previewLoadSource() == MediaPreviewLoadSource.Bytes
}

internal fun MediaAsset.needsPreviewMetadata(): Boolean {
    return previewLoadSource() == MediaPreviewLoadSource.Metadata
}

internal enum class MediaPreviewLoadSource { None, Metadata, Bytes }

private sealed interface PreviewLoadResult {
    data class Metadata(val asset: MediaAsset) : PreviewLoadResult
    data class Bytes(val bytes: ByteArray) : PreviewLoadResult
}

internal fun MediaAsset.previewLoadSource(): MediaPreviewLoadSource {
    if (mimeType.startsWith("image/")) return MediaPreviewLoadSource.None
    val extension = name.substringAfterLast('.', missingDelimiterValue = "")
        .lowercase()
    // PDF 即使已有服务端抽取文本，原生 PdfRenderer 仍需要原文件字节。
    if (mimeType == "application/pdf" || extension == "pdf") {
        return MediaPreviewLoadSource.Bytes
    }
    if (extractedText != null) return MediaPreviewLoadSource.None
    if (extractedTextAvailable) return MediaPreviewLoadSource.Metadata
    return if (mimeType.startsWith("text/") || extension in MEDIA_TEXT_EXTENSIONS) {
        MediaPreviewLoadSource.Bytes
    } else {
        MediaPreviewLoadSource.None
    }
}

private val MEDIA_TEXT_EXTENSIONS = setOf(
    "txt",
    "md",
    "markdown",
    "json",
    "xml",
    "yaml",
    "yml",
    "log",
    "csv",
    "tsv",
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "kt",
    "kts",
    "go",
    "rs",
    "c",
    "cpp",
    "h",
    "css",
    "sql",
    "sh",
    "rb",
    "php",
    "vue",
    "svelte",
)

private fun prepareImageEdit(
    imageBytes: ByteArray,
    maskBytes: ByteArray?,
): Pair<ByteArray, ByteArray?> {
    val decoded = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
        ?: error("无法读取图片")
    val scale = (MAX_EDIT_IMAGE_DIMENSION.toFloat() / maxOf(decoded.width, decoded.height))
        .coerceAtMost(1f)
    val width = (decoded.width * scale).toInt().coerceAtLeast(1)
    val height = (decoded.height * scale).toInt().coerceAtLeast(1)
    val image = if (width == decoded.width && height == decoded.height) {
        decoded
    } else {
        Bitmap.createScaledBitmap(decoded, width, height, true).also { decoded.recycle() }
    }
    val imagePng = image.toPng().also { image.recycle() }
    val maskPng = maskBytes?.let { bytes ->
        val decodedMask = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: error("无法读取蒙版")
        val mask = if (decodedMask.width == width && decodedMask.height == height) {
            decodedMask
        } else {
            Bitmap.createScaledBitmap(decodedMask, width, height, false).also {
                decodedMask.recycle()
            }
        }
        mask.toPng().also { mask.recycle() }
    }
    return imagePng to maskPng
}

private fun Bitmap.toPng(): ByteArray = ByteArrayOutputStream().use { output ->
    check(compress(Bitmap.CompressFormat.PNG, 100, output)) { "图片导出失败" }
    output.toByteArray()
}

private fun replaceLocalMessageImage(
    parts: List<JsonObject>,
    oldUrl: String,
    newUrl: String,
): List<JsonObject> {
    val mediaAssetId = Regex("^/api/media/([A-Za-z0-9._-]+)$")
        .matchEntire(newUrl)?.groupValues?.getOrNull(1)
    return parts.map { part ->
        if (part.type() != "image" || part.string("url") != oldUrl) return@map part
        JsonObject(part.toMutableMap().apply {
            put("url", JsonPrimitive(newUrl))
            put("alt", JsonPrimitive("编辑后的图片"))
            remove("mediaAssetId")
            mediaAssetId?.let { put("mediaAssetId", JsonPrimitive(it)) }
        })
    }
}

internal fun resolveChatModelId(models: List<Model>, vararg candidates: String?): String? {
    val chatModels = models.filterNot { "image-generation" in it.capabilities }
    return candidates.firstNotNullOfOrNull { candidate ->
        candidate?.takeIf { id -> chatModels.any { it.id == id } }
    } ?: chatModels.firstOrNull()?.id
}

internal fun thinkingEffortAfterModelChange(
    state: LinHubUiState,
    modelId: String?,
    models: List<Model> = state.models,
): String {
    val model = models.firstOrNull { it.id == modelId }
    return resolveModelThinkingEffort(model, state.modelThinkingEfforts)
}

private fun resolveModelThinkingEffort(
    model: Model?,
    overrides: Map<String, String>,
): String {
    val override = model?.id?.let(overrides::get)
    return if (override != null && override in supportedThinkingEfforts(model)) {
        override
    } else {
        recommendedThinkingEffort(model)
    }
}

internal fun parseSharedArtifactToken(url: String): String? {
    val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return null
    val segments = uri.path.orEmpty().trim('/').split('/').filter(String::isNotEmpty)
    val token = when {
        uri.scheme.equals("linhub", ignoreCase = true) &&
            uri.host.equals("share", ignoreCase = true) &&
            segments.size == 2 && segments[0] == "artifact" -> segments[1]
        uri.scheme in setOf("http", "https") &&
            segments.size == 3 && segments[0] == "share" && segments[1] == "artifact" -> segments[2]
        else -> null
    }
    return token?.takeIf { it.matches(Regex("[a-fA-F0-9]{32}")) }
}

internal fun safeExternalPaymentUrl(url: String?): String? {
    val uri = url?.let { runCatching { java.net.URI(it) }.getOrNull() } ?: return null
    return url.takeIf {
        uri.scheme.equals("https", ignoreCase = true) &&
            !uri.host.isNullOrBlank() &&
            uri.userInfo == null
    }
}

internal fun restoreUnacceptedSend(
    current: LinHubUiState,
    attemptedDraft: String,
    attemptedQuote: String?,
    attemptedAttachments: List<UploadedAttachment>,
    error: String,
): LinHubUiState {
    if (
        current.selectedConversationId != null ||
        current.transcripts[NEW_CHAT_KEY]?.messages?.isNotEmpty() == true
    ) {
        return current.copy(startingNewConversation = false, message = error)
    }
    val restoredDraft = when {
        attemptedDraft.isBlank() -> current.draft
        current.draft.isBlank() -> attemptedDraft
        current.draft.trim() == attemptedDraft.trim() -> current.draft
        else -> "$attemptedDraft\n\n${current.draft}"
    }
    return current.copy(
        draft = restoredDraft,
        quotedText = current.quotedText ?: attemptedQuote,
        pendingAttachments = (attemptedAttachments + current.pendingAttachments)
            .distinctBy(UploadedAttachment::id),
        startingNewConversation = false,
        message = error,
    )
}

private suspend inline fun <T> runSuspendCatching(
    crossinline block: suspend () -> T,
): Result<T> = try {
    Result.success(block())
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}
