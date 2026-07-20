package com.linhub.android.core.network

import android.content.Context
import com.linhub.android.BuildConfig
import com.linhub.android.core.model.AdminModelRequest
import com.linhub.android.core.model.AdminPlanRequest
import com.linhub.android.core.model.AdminProviderRequest
import com.linhub.android.core.model.AdminSettingsPatch
import com.linhub.android.core.model.AdminUserDetail
import com.linhub.android.core.model.ApiErrorBody
import com.linhub.android.core.model.AppSettings
import com.linhub.android.core.model.Artifact
import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.ChunkedUploadInitRequest
import com.linhub.android.core.model.ChunkedUploadSession
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.ConversationDetail
import com.linhub.android.core.model.ConversationPatch
import com.linhub.android.core.model.CreateOrderRequest
import com.linhub.android.core.model.EditImageRequest
import com.linhub.android.core.model.EditImageResponse
import com.linhub.android.core.model.EngineTestRequest
import com.linhub.android.core.model.EngineTestResult
import com.linhub.android.core.model.GenerateRedeemCodesRequest
import com.linhub.android.core.model.GeneratedRedeemCodes
import com.linhub.android.core.model.GrantBalanceRequest
import com.linhub.android.core.model.ModelsResponse
import com.linhub.android.core.model.KnowledgeBase
import com.linhub.android.core.model.KnowledgeDocument
import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.MediaPage
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.McpServerRequest
import com.linhub.android.core.model.McpTestResponse
import com.linhub.android.core.model.MemoryEntry
import com.linhub.android.core.model.Order
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.Provider
import com.linhub.android.core.model.Project
import com.linhub.android.core.model.ProjectFile
import com.linhub.android.core.model.RegenerateRequest
import com.linhub.android.core.model.RedeemCodeRequest
import com.linhub.android.core.model.RedeemCodeResponse
import com.linhub.android.core.model.RedeemCode
import com.linhub.android.core.model.RemoteModel
import com.linhub.android.core.model.RemoteModelsAdded
import com.linhub.android.core.model.RemoteModelsRequest
import com.linhub.android.core.model.ReviewSkillRequest
import com.linhub.android.core.model.ReplaceMessageImageRequest
import com.linhub.android.core.model.SaveKnowledgeBaseRequest
import com.linhub.android.core.model.SaveMemoryRequest
import com.linhub.android.core.model.SaveProjectRequest
import com.linhub.android.core.model.SaveSkillRequest
import com.linhub.android.core.model.SaveStyleRequest
import com.linhub.android.core.model.SendMessageRequest
import com.linhub.android.core.model.SignInRequest
import com.linhub.android.core.model.SignUpRequest
import com.linhub.android.core.model.ShareArtifactResponse
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.SubscriptionAdminRequest
import com.linhub.android.core.model.TranscriptionResponse
import com.linhub.android.core.model.User
import com.linhub.android.core.model.UploadedAttachment
import com.linhub.android.core.model.UsageRecord
import java.io.IOException
import java.io.ByteArrayOutputStream
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Cache
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Dispatcher
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ApiException(val status: Int, override val message: String) : IOException(message)

class LinHubApi(
    context: Context,
    private val sessionStore: SessionStore,
    baseUrl: String = BuildConfig.API_BASE_URL,
    callTimeoutMillis: Long = 0L,
) {
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    init {
        require(callTimeoutMillis >= 0L) { "网络调用超时不能为负数" }
    }

    private val rootUrl: HttpUrl = baseUrl.ensureTrailingSlash().toHttpUrl()
    private val eventParser = ChatEventParser(json)
    private val dispatcher = Dispatcher().apply {
        maxRequests = 32
        maxRequestsPerHost = 12
    }

    private val client = OkHttpClient.Builder()
        .dispatcher(dispatcher)
        .cache(Cache(context.cacheDir.resolve("http"), 64L * 1024L * 1024L))
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .callTimeout(callTimeoutMillis, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .addInterceptor { chain ->
            val builder = chain.request().newBuilder()
            if (chain.request().header("Accept") == null) {
                builder.header("Accept", "application/json")
            }
            if (chain.request().url.hasSameOrigin(rootUrl)) {
                sessionStore.currentToken()?.let { builder.header("Authorization", "Bearer $it") }
            }
            chain.proceed(builder.build())
        }
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                    redactHeader("Authorization")
                    redactHeader("set-auth-token")
                })
            }
        }
        .build()

    private val streamClient = client.newBuilder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .callTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val uploadClient = client.newBuilder()
        .readTimeout(5, TimeUnit.MINUTES)
        .writeTimeout(5, TimeUnit.MINUTES)
        .callTimeout(6, TimeUnit.MINUTES)
        .build()

    suspend fun signIn(email: String, password: String) {
        authenticate("api/auth/sign-in/email", SignInRequest(email, password))
    }

    suspend fun signUp(name: String, email: String, password: String) {
        authenticate("api/auth/sign-up/email", SignUpRequest(name, email, password))
    }

    suspend fun signOut(sessionToken: String? = sessionStore.currentToken()) {
        val builder = request("api/auth/sign-out").post(EMPTY_JSON)
        sessionToken?.let { builder.header("Authorization", "Bearer $it") }
        try {
            executeUnit(builder.build())
        } catch (_: IOException) {
            // 本地会话已撤销，远端退出失败不应阻塞用户。
        } finally {
            sessionStore.clear()
        }
    }

    suspend fun currentUser(): User? = executeNullable(request("api/me").get().build())

    suspend fun updateProfile(
        name: String? = null,
        avatarUrl: String? = null,
        defaultModelId: String? = null,
        defaultModelSpecified: Boolean = false,
    ): User {
        val body = buildJsonObject {
            name?.let { put("name", it) }
            avatarUrl?.let { put("avatarUrl", it) }
            if (defaultModelSpecified) {
                put("defaultModelId", defaultModelId?.let(::JsonPrimitive) ?: JsonNull)
            }
        }
        return executeJson(
            request("api/me")
                .patch(body.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build(),
        )
    }

    suspend fun exportAccountData(): ByteArray {
        return withContext(Dispatchers.IO) {
            val response = executeResponse(
                request("api/account/export")
                    .header("Accept", "application/json")
                    .get()
                    .build(),
                uploadClient,
            )
            response.use {
                ensureSuccess(it)
                val declaredLength = it.body.contentLength()
                if (declaredLength > MAX_EXPORT_BYTES) {
                    throw ApiException(413, "导出文件超过 50MB")
                }
                it.body.byteStream().readLimited(MAX_EXPORT_BYTES)
            }
        }
    }

    suspend fun models(): ModelsResponse = executeJson(request("api/models").get().build())

    suspend fun plans(): List<Plan> = executeJson(request("api/plans").get().build())

    suspend fun usageRecords(): List<UsageRecord> =
        executeJson(request("api/usage").get().build())

    suspend fun ledger(): List<LedgerEntry> = executeJson(request("api/ledger").get().build())

    suspend fun createOrder(input: CreateOrderRequest, idempotencyKey: String): Order = executeJson(
        request("api/orders")
            .header("Idempotency-Key", idempotencyKey)
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun redeemCode(code: String): Int = executeJson<RedeemCodeResponse>(
        request("api/redeem")
            .post(
                json.encodeToString(RedeemCodeRequest(code)).toRequestBody(JSON_MEDIA_TYPE),
            )
            .build(),
    ).amountCents

    suspend fun conversations(query: String? = null): List<Conversation> {
        val path = if (query.isNullOrBlank()) {
            "api/conversations"
        } else {
            "api/conversations?q=${java.net.URLEncoder.encode(query, Charsets.UTF_8.name())}"
        }
        return executeJson(request(path).get().build())
    }

    suspend fun conversation(id: String): ConversationDetail =
        executeJson(request("api/conversations/${id.urlSegment()}").get().build())

    suspend fun artifacts(conversationId: String): List<Artifact> {
        val url = requireNotNull(rootUrl.resolve("api/artifacts")).newBuilder()
            .addQueryParameter("conversationId", conversationId)
            .build()
        return executeJson(Request.Builder().url(url).get().build())
    }

    suspend fun artifact(id: String): Artifact =
        executeJson(request("api/artifacts/${id.urlSegment()}").get().build())

    suspend fun shareArtifact(id: String): String = executeJson<ShareArtifactResponse>(
        request("api/artifacts/${id.urlSegment()}/share").post(EMPTY_JSON).build(),
    ).shareToken

    suspend fun sharedArtifact(token: String): Artifact = executeJson(
        request("api/artifacts/shared/${token.urlSegment()}").get().build(),
    )

    suspend fun projects(): List<Project> = executeJson(request("api/projects").get().build())

    suspend fun projectConversations(projectId: String): List<Conversation> = executeJson(
        request("api/projects/${projectId.urlSegment()}/conversations").get().build(),
    )

    suspend fun saveProject(input: SaveProjectRequest): Project {
        val body = json.encodeToString(input.copy(id = null)).toRequestBody(JSON_MEDIA_TYPE)
        val builder = if (input.id == null) {
            request("api/projects").post(body)
        } else {
            request("api/projects/${input.id.urlSegment()}").patch(body)
        }
        return executeJson(builder.build())
    }

    suspend fun deleteProject(id: String) {
        executeUnit(request("api/projects/${id.urlSegment()}").delete().build())
    }

    suspend fun knowledgeBases(): List<KnowledgeBase> =
        executeJson(request("api/knowledge").get().build())

    suspend fun saveKnowledgeBase(input: SaveKnowledgeBaseRequest): KnowledgeBase = executeJson(
        request("api/knowledge")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteKnowledgeBase(id: String) {
        executeUnit(request("api/knowledge/${id.urlSegment()}").delete().build())
    }

    suspend fun knowledgeDocuments(knowledgeBaseId: String): List<KnowledgeDocument> = executeJson(
        request("api/knowledge/${knowledgeBaseId.urlSegment()}/documents").get().build(),
    )

    suspend fun uploadKnowledgeDocument(
        knowledgeBaseId: String,
        name: String,
        mimeType: String,
        bytes: ByteArray,
    ): KnowledgeDocument = executeJson(
        request("api/knowledge/${knowledgeBaseId.urlSegment()}/documents")
            .post(multipartFile(name, mimeType, bytes))
            .build(),
        uploadClient,
    )

    suspend fun deleteKnowledgeDocument(knowledgeBaseId: String, documentId: String) {
        executeUnit(
            request(
                "api/knowledge/${knowledgeBaseId.urlSegment()}/documents/${documentId.urlSegment()}",
            ).delete().build(),
        )
    }

    suspend fun uploadProjectFile(
        projectId: String,
        name: String,
        mimeType: String,
        bytes: ByteArray,
    ): ProjectFile = uploadAttachment(
        name = name,
        mimeType = mimeType,
        bytes = bytes,
        projectId = projectId,
    )

    suspend fun uploadChatAttachment(
        name: String,
        mimeType: String,
        bytes: ByteArray,
        onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit = { _, _ -> },
    ): UploadedAttachment = uploadAttachment(
        name = name,
        mimeType = mimeType,
        bytes = bytes,
        onProgress = onProgress,
    )

    private suspend inline fun <reified T> uploadAttachment(
        name: String,
        mimeType: String,
        bytes: ByteArray,
        projectId: String? = null,
        noinline onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit = { _, _ -> },
    ): T {
        if (!shouldUseChunkedUpload(bytes.size)) {
            return executeJson(
                request("api/upload")
                    .post(
                        multipartFile(
                            name = name,
                            mimeType = mimeType,
                            bytes = bytes,
                            projectId = projectId,
                            onProgress = onProgress,
                        ),
                    )
                    .build(),
                uploadClient,
            )
        }

        onProgress(0L, bytes.size.toLong())
        val upload = executeJson<ChunkedUploadSession>(
            request("api/upload/chunked")
                .post(
                    json.encodeToString(
                        ChunkedUploadInitRequest(
                            name = name,
                            mimeType = mimeType,
                            size = bytes.size,
                            projectId = projectId,
                        ),
                    ).toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
            uploadClient,
        )
        var completed = false
        try {
            for (index in 0 until upload.chunkCount) {
                val start = index * upload.chunkSize
                val end = minOf(bytes.size, start + upload.chunkSize)
                val chunk = bytes.copyOfRange(start, end)
                val chunkBody = ProgressRequestBody(
                    chunk.toRequestBody("application/octet-stream".toMediaType()),
                ) { written, _ ->
                    onProgress(start.toLong() + written, bytes.size.toLong())
                }
                executeUnit(
                    request("api/upload/chunked/${upload.id.urlSegment()}/$index")
                        .put(chunkBody)
                        .build(),
                    uploadClient,
                )
            }
            val result = executeJson<T>(
                request("api/upload/chunked/${upload.id.urlSegment()}")
                    .post(EMPTY_JSON)
                    .build(),
                uploadClient,
            )
            completed = true
            return result
        } finally {
            if (!completed) {
                withContext(NonCancellable) {
                    runCatching {
                        executeUnit(
                            request("api/upload/chunked/${upload.id.urlSegment()}")
                                .delete()
                                .build(),
                        )
                    }
                }
            }
        }
    }

    suspend fun deleteProjectFile(fileId: String) {
        executeUnit(request("api/attachments/${fileId.urlSegment()}").delete().build())
    }

    suspend fun mediaAssets(
        kind: String = "all",
        query: String = "",
        cursor: String? = null,
        limit: Int = 60,
    ): MediaPage {
        val url = requireNotNull(rootUrl.resolve("api/media")).newBuilder().apply {
            if (kind != "all") addQueryParameter("kind", kind)
            if (query.isNotBlank()) addQueryParameter("q", query.trim())
            cursor?.let { addQueryParameter("cursor", it) }
            addQueryParameter("limit", limit.coerceIn(1, 100).toString())
        }.build()
        return executeJson(Request.Builder().url(url).get().build())
    }

    suspend fun deleteMediaAsset(id: String) {
        executeUnit(request("api/media/${id.urlSegment()}").delete().build())
    }

    suspend fun mediaAssetMetadata(id: String): MediaAsset = executeJson(
        request("api/media/${id.urlSegment()}/metadata").get().build(),
    )

    suspend fun downloadBytes(url: String): ByteArray {
        val resolved = when {
            url.startsWith("/") -> requireNotNull(rootUrl.resolve(url))
            else -> url.toHttpUrl()
        }
        if (resolved.scheme != "https" && !resolved.hasSameOrigin(rootUrl)) {
            throw ApiException(400, "仅支持安全下载地址")
        }
        return withContext(Dispatchers.IO) {
            val response = executeResponse(
                Request.Builder().url(resolved).header("Accept", "image/*,*/*").get().build(),
            )
            response.use {
                ensureSuccess(it)
                val declaredLength = it.body.contentLength()
                if (declaredLength > MAX_DOWNLOAD_BYTES) {
                    throw ApiException(413, "文件不能超过 25MB")
                }
                it.body.byteStream().readLimited(MAX_DOWNLOAD_BYTES)
            }
        }
    }

    suspend fun editImage(
        imagePng: ByteArray,
        maskPng: ByteArray?,
        prompt: String,
        idempotencyKey: String,
    ): String {
        val data = executeJson<EditImageResponse>(
            request("api/edit-image")
                .header("Idempotency-Key", idempotencyKey)
                .post(
                    json.encodeToString(
                        EditImageRequest(
                            image = imagePng.asPngDataUrl(),
                            mask = maskPng?.asPngDataUrl(),
                            prompt = prompt,
                        ),
                    ).toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
            uploadClient,
        )
        return data.url
    }

    suspend fun imageEditResult(idempotencyKey: String): String? = withContext(Dispatchers.IO) {
        val editRequest = request("api/edit-image")
            .header("Idempotency-Key", idempotencyKey)
            .get()
            .build()
        executeResponse(editRequest).use { response ->
            if (response.code == 404) return@withContext null
            ensureSuccess(response)
            try {
                json.decodeFromString<EditImageResponse>(response.body.string()).url
            } catch (error: SerializationException) {
                throw ApiException(response.code, "服务器响应格式不兼容")
            }
        }
    }

    suspend fun replaceMessageImage(
        messageId: String,
        oldUrl: String,
        newUrl: String,
        editPrompt: String,
    ) {
        executeUnit(
            request("api/messages/${messageId.urlSegment()}/image")
                .patch(
                    json.encodeToString(
                        ReplaceMessageImageRequest(oldUrl, newUrl, editPrompt),
                    ).toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
        )
    }

    suspend fun skills(market: Boolean = false): List<Skill> {
        val url = requireNotNull(rootUrl.resolve("api/skills")).newBuilder().apply {
            if (market) addQueryParameter("market", "1")
        }.build()
        return executeJson(Request.Builder().url(url).get().build())
    }

    suspend fun skill(id: String): Skill =
        executeJson(request("api/skills/${id.urlSegment()}").get().build())

    suspend fun saveSkill(input: SaveSkillRequest): Skill = executeJson(
        request("api/skills")
            .post(json.encodeSaveSkillRequest(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteSkill(id: String) {
        executeUnit(request("api/skills/${id.urlSegment()}").delete().build())
    }

    suspend fun mcpServers(scope: String): List<McpServer> {
        val url = requireNotNull(rootUrl.resolve("api/mcp")).newBuilder()
            .addQueryParameter("scope", if (scope == "global") "global" else "user")
            .build()
        return executeJson(Request.Builder().url(url).get().build())
    }

    suspend fun saveMcpServer(input: McpServerRequest): McpServer = executeJson(
        request("api/mcp")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteMcpServer(id: String) {
        executeUnit(request("api/mcp/${id.urlSegment()}").delete().build())
    }

    suspend fun testMcpServer(id: String): McpTestResponse = executeJson(
        request("api/mcp/${id.urlSegment()}/test").post(EMPTY_JSON).build(),
    )

    suspend fun transcribeAudio(wav: ByteArray): String = executeJson<TranscriptionResponse>(
        request("api/voice/transcribe")
            .post(multipartFile("recording.wav", "audio/wav", wav, fieldName = "audio"))
            .build(),
        uploadClient,
    ).text

    suspend fun synthesizeSpeech(text: String): ByteArray {
        val body = buildJsonObject { put("text", text) }
        return withContext(Dispatchers.IO) {
            val response = executeResponse(
                request("api/voice/tts")
                    .header("Accept", "audio/mpeg")
                    .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
                    .build(),
                uploadClient,
            )
            response.use {
                ensureSuccess(it)
                val declaredLength = it.body.contentLength()
                if (declaredLength > MAX_SPEECH_BYTES) {
                    throw ApiException(413, "语音文件过大")
                }
                it.body.byteStream().readLimited(MAX_SPEECH_BYTES)
            }
        }
    }

    suspend fun memories(): List<MemoryEntry> =
        executeJson(request("api/memories").get().build())

    suspend fun saveMemory(input: SaveMemoryRequest): MemoryEntry = executeJson(
        request("api/memories")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteMemory(id: String) {
        executeUnit(request("api/memories/${id.urlSegment()}").delete().build())
    }

    suspend fun styles(): List<ChatStyle> = executeJson(request("api/styles").get().build())

    suspend fun saveStyle(input: SaveStyleRequest): ChatStyle = executeJson(
        request("api/styles")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteStyle(id: String) {
        executeUnit(request("api/styles/${id.urlSegment()}").delete().build())
    }

    suspend fun updateConversation(id: String, patch: ConversationPatch) {
        executeUnit(
            request("api/conversations/${id.urlSegment()}")
                .patch(json.encodeConversationPatch(patch).toRequestBody(JSON_MEDIA_TYPE))
                .build(),
        )
    }

    suspend fun deleteConversation(id: String) {
        executeUnit(request("api/conversations/${id.urlSegment()}").delete().build())
    }

    fun sendMessage(input: SendMessageRequest): Flow<ChatEvent> = stream(
        request("api/chat")
            .post(json.encodeSendMessageRequest(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
        requireTerminalEvent = true,
    )

    fun resumeConversation(conversationId: String): Flow<ChatEvent> = stream(
        request("api/chat?conversationId=${conversationId.queryValue()}").get().build(),
    )

    fun regenerate(
        conversationId: String,
        assistantMessageId: String,
        modelId: String?,
        clientGenerationId: String,
        clientAssistantMessageId: String,
    ): Flow<ChatEvent> = stream(
        request("api/chat")
            .post(
                json.encodeToString(
                    RegenerateRequest(
                        clientGenerationId = clientGenerationId,
                        conversationId = conversationId,
                        assistantMessageId = assistantMessageId,
                        clientAssistantMessageId = clientAssistantMessageId,
                        modelId = modelId,
                    ),
                ).toRequestBody(JSON_MEDIA_TYPE),
            )
            .build(),
        requireTerminalEvent = true,
    )

    suspend fun setFeedback(messageId: String, feedback: String?) {
        val body = buildJsonObject {
            put("feedback", feedback?.let(::JsonPrimitive) ?: JsonNull)
        }
        executeUnit(
            request("api/messages/${messageId.urlSegment()}/feedback")
                .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build(),
        )
    }

    suspend fun stopGeneration(conversationId: String?, clientGenerationId: String?) {
        val query = when {
            conversationId != null -> "conversationId=${conversationId.queryValue()}"
            clientGenerationId != null -> "clientGenerationId=${clientGenerationId.queryValue()}"
            else -> return
        }
        executeUnit(request("api/chat?$query").delete().build())
    }

    suspend fun adminProviders(): List<Provider> =
        executeJson(request("api/admin/providers").get().build())

    suspend fun saveAdminProvider(input: AdminProviderRequest): Provider = executeJson(
        request("api/admin/providers")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteAdminProvider(id: String) {
        executeUnit(request("api/admin/providers/${id.urlSegment()}").delete().build())
    }

    suspend fun adminModels(): List<com.linhub.android.core.model.Model> =
        executeJson(request("api/admin/models").get().build())

    suspend fun saveAdminModel(input: AdminModelRequest): com.linhub.android.core.model.Model =
        executeJson(
            request("api/admin/models")
                .post(json.encodeAdminModelRequest(input).toRequestBody(JSON_MEDIA_TYPE))
                .build(),
        )

    suspend fun deleteAdminModel(id: String) {
        executeUnit(request("api/admin/models/${id.urlSegment()}").delete().build())
    }

    suspend fun testAdminModel(id: String): EngineTestResult = executeJson(
        request("api/admin/models/${id.urlSegment()}/test").post(EMPTY_JSON).build(),
        uploadClient,
    )

    suspend fun adminRemoteModels(providerId: String): List<RemoteModel> = executeJson(
        request("api/admin/providers/${providerId.urlSegment()}/models").get().build(),
        uploadClient,
    )

    suspend fun addAdminRemoteModels(providerId: String, slugs: List<String>): Int =
        executeJson<RemoteModelsAdded>(
            request("api/admin/providers/${providerId.urlSegment()}/models")
                .post(
                    json.encodeToString(RemoteModelsRequest(slugs)).toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
            uploadClient,
        ).added

    suspend fun adminSettings(): AppSettings =
        executeJson(request("api/admin/settings").get().build())

    suspend fun saveAdminSettings(input: AdminSettingsPatch): AppSettings = executeJson(
        request("api/admin/settings")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun testAdminEngine(input: EngineTestRequest): EngineTestResult = executeJson(
        request("api/admin/settings/engine-test")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
        uploadClient,
    )

    suspend fun adminUsers(): List<User> = executeJson(request("api/admin/users").get().build())

    suspend fun adminUserDetail(id: String): AdminUserDetail =
        executeJson(request("api/admin/users/${id.urlSegment()}").get().build())

    suspend fun grantAdminBalance(id: String, amountCents: Int, note: String?) {
        executeUnit(
            request("api/admin/users")
                .post(
                    json.encodeToString(GrantBalanceRequest(id, amountCents, note))
                        .toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
        )
    }

    suspend fun updateAdminSubscription(
        id: String,
        planId: String?,
        expiresInDays: Int?,
    ): AdminUserDetail {
        val body = buildJsonObject {
            put("planId", planId?.let(::JsonPrimitive) ?: JsonNull)
            expiresInDays?.let { put("expiresInDays", it) }
        }
        return executeJson(
            request("api/admin/users/${id.urlSegment()}")
                .patch(body.toString().toRequestBody(JSON_MEDIA_TYPE))
                .build(),
        )
    }

    suspend fun deleteAdminUser(id: String) {
        executeUnit(request("api/admin/users/${id.urlSegment()}").delete().build())
    }

    suspend fun adminPlans(): List<Plan> =
        executeJson(request("api/admin/plans").get().build())

    suspend fun saveAdminPlan(input: AdminPlanRequest): Plan = executeJson(
        request("api/admin/plans")
            .post(json.encodeToString(input).toRequestBody(JSON_MEDIA_TYPE))
            .build(),
    )

    suspend fun deleteAdminPlan(id: String) {
        val url = requireNotNull(rootUrl.resolve("api/admin/plans")).newBuilder()
            .addQueryParameter("id", id)
            .build()
        executeUnit(Request.Builder().url(url).delete().build())
    }

    suspend fun adminPendingSkills(): List<Skill> =
        executeJson(request("api/admin/skills").get().build())

    suspend fun reviewAdminSkill(id: String, approve: Boolean) {
        executeUnit(
            request("api/admin/skills")
                .post(
                    json.encodeToString(ReviewSkillRequest(id, approve))
                        .toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
        )
    }

    suspend fun adminUsage(): List<UsageRecord> {
        val url = requireNotNull(rootUrl.resolve("api/usage")).newBuilder()
            .addQueryParameter("all", "1")
            .build()
        return executeJson(Request.Builder().url(url).get().build())
    }

    suspend fun adminRedeemCodes(): List<RedeemCode> =
        executeJson(request("api/admin/redeem-codes").get().build())

    suspend fun generateAdminRedeemCodes(amountCents: Int, count: Int): List<String> =
        executeJson<GeneratedRedeemCodes>(
            request("api/admin/redeem-codes")
                .post(
                    json.encodeToString(GenerateRedeemCodesRequest(amountCents, count))
                        .toRequestBody(JSON_MEDIA_TYPE),
                )
                .build(),
        ).codes

    private suspend inline fun <reified T> authenticate(path: String, body: T) {
        withContext(Dispatchers.IO) {
            val response = executeResponse(
                request(path)
                    .post(json.encodeToString(body).toRequestBody(JSON_MEDIA_TYPE))
                    .build(),
            )
            response.use {
                ensureSuccess(it)
                val token = it.header("set-auth-token")
                    ?: throw ApiException(500, "登录成功，但服务端未返回移动端会话令牌")
                sessionStore.saveToken(token)
            }
        }
    }

    private fun stream(
        request: Request,
        requireTerminalEvent: Boolean = false,
    ): Flow<ChatEvent> = callbackFlow {
        val call = streamClient.newCall(request)
        val reader = launch(Dispatchers.IO) {
            try {
                call.execute().use { response ->
                    if (!response.isSuccessful) {
                        send(ChatEvent.Error(null, errorMessage(response), response.code))
                        return@use
                    }
                    val source = response.body.source()
                    var receivedTerminalEvent = false
                    while (!source.exhausted()) {
                        val line = source.readUtf8Line() ?: break
                        if (line.isBlank()) continue
                        val event = runCatching { eventParser.parse(line) }
                            .getOrElse { ChatEvent.Error(null, "流式响应解析失败，请重试") }
                        send(event)
                        if (event is ChatEvent.Done || event is ChatEvent.Error) {
                            receivedTerminalEvent = true
                        }
                    }
                    if (requireTerminalEvent && !receivedTerminalEvent && !call.isCanceled()) {
                        send(ChatEvent.Error(null, "生成连接提前中断，请重新连接"))
                    }
                }
            } catch (_: IOException) {
                if (!call.isCanceled()) {
                    send(ChatEvent.Error(null, "网络连接失败，请检查网络后重试"))
                }
            } finally {
                close()
            }
        }
        awaitClose {
            call.cancel()
            reader.cancel()
        }
    }

    private fun request(path: String): Request.Builder = Request.Builder().url(rootUrl.resolve(path)!!)

    private suspend inline fun <reified T> executeJson(
        request: Request,
        httpClient: OkHttpClient = client,
    ): T = withContext(Dispatchers.IO) {
        executeResponse(request, httpClient).use { response ->
            ensureSuccess(response)
            val body = response.body.string()
            try {
                json.decodeFromString<T>(body)
            } catch (error: SerializationException) {
                throw ApiException(response.code, "服务器响应格式不兼容")
            }
        }
    }

    private suspend inline fun <reified T> executeNullable(request: Request): T? =
        withContext(Dispatchers.IO) {
        executeResponse(request).use { response ->
            ensureSuccess(response)
            val body = response.body.string()
            if (body == "null" || body.isBlank()) null else json.decodeFromString<T>(body)
        }
    }

    private suspend fun executeUnit(
        request: Request,
        httpClient: OkHttpClient = client,
    ) {
        withContext(Dispatchers.IO) {
            executeResponse(request, httpClient).use(::ensureSuccess)
        }
    }

    private suspend fun executeResponse(
        request: Request,
        httpClient: OkHttpClient = client,
    ): Response =
        suspendCancellableCoroutine { continuation ->
            val call = httpClient.newCall(request)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    if (continuation.isActive) continuation.resume(response)
                    else response.close()
                }
            })
        }

    private fun ensureSuccess(response: Response) {
        if (!response.isSuccessful) throw ApiException(response.code, errorMessage(response))
    }

    private fun errorMessage(response: Response): String {
        val raw = response.body.string()
        val body = runCatching { json.decodeFromString<ApiErrorBody>(raw) }.getOrNull()
        return body?.error ?: body?.message ?: when (response.code) {
            401 -> "登录已失效，请重新登录"
            403 -> "当前账户没有此操作权限"
            429 -> "请求过于频繁，请稍后再试"
            else -> "请求失败（${response.code}）"
        }
    }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        val EMPTY_JSON = "{}".toRequestBody(JSON_MEDIA_TYPE)
        const val MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
        const val MAX_SPEECH_BYTES = 15 * 1024 * 1024
        const val MAX_EXPORT_BYTES = 50 * 1024 * 1024
    }
}

private fun multipartFile(
    name: String,
    mimeType: String,
    bytes: ByteArray,
    fieldName: String = "file",
    projectId: String? = null,
    onProgress: ((bytesWritten: Long, totalBytes: Long) -> Unit)? = null,
): MultipartBody = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .apply { projectId?.let { addFormDataPart("projectId", it) } }
        .addFormDataPart(
            fieldName,
            name,
            bytes.toRequestBody(mimeType.toMediaTypeOrNull()).let { body ->
                onProgress?.let { ProgressRequestBody(body, it) } ?: body
            },
        )
        .build()

internal fun shouldUseChunkedUpload(size: Int): Boolean = size >= CHUNKED_UPLOAD_THRESHOLD_BYTES

private const val CHUNKED_UPLOAD_THRESHOLD_BYTES = 4 * 1024 * 1024

internal class ProgressRequestBody(
    private val delegate: RequestBody,
    private val onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit,
) : RequestBody() {
    override fun contentType() = delegate.contentType()

    override fun contentLength(): Long = delegate.contentLength()

    override fun writeTo(sink: BufferedSink) {
        val total = contentLength().coerceAtLeast(0L)
        var written = 0L
        var lastReported = 0L
        val progressSink = object : ForwardingSink(sink) {
            override fun write(source: Buffer, byteCount: Long) {
                super.write(source, byteCount)
                written += byteCount
                if (written == total || written - lastReported >= PROGRESS_REPORT_STEP_BYTES) {
                    lastReported = written
                    onProgress(written, total)
                }
            }
        }
        val buffered = progressSink.buffer()
        delegate.writeTo(buffered)
        buffered.flush()
        if (written == 0L || written != lastReported) onProgress(written, total)
    }
}

private const val PROGRESS_REPORT_STEP_BYTES = 64L * 1024

internal fun Json.encodeConversationPatch(patch: ConversationPatch): String {
    val fields = encodeToJsonElement(patch).jsonObject.toMutableMap()
    if (patch.projectIdSpecified) {
        fields["projectId"] = patch.projectId?.let(::JsonPrimitive) ?: JsonNull
    }
    return JsonObject(fields).toString()
}

internal fun Json.encodeSendMessageRequest(input: SendMessageRequest): String {
    val fields = encodeToJsonElement(input).jsonObject.toMutableMap()
    if (input.parentIdSpecified) {
        fields["parentId"] = input.parentId?.let(::JsonPrimitive) ?: JsonNull
    }
    return JsonObject(fields).toString()
}

internal fun Json.encodeSaveSkillRequest(input: SaveSkillRequest): String = buildJsonObject {
    input.id?.let { put("id", it) }
    put("name", input.name)
    put("emoji", input.emoji)
    put("description", input.description)
    put("systemPrompt", input.systemPrompt)
    put("greeting", input.greeting?.let(::JsonPrimitive) ?: JsonNull)
    put("defaultModelId", input.defaultModelId?.let(::JsonPrimitive) ?: JsonNull)
    put("shareToMarket", input.shareToMarket)
}.toString()

internal fun Json.encodeAdminModelRequest(input: AdminModelRequest): String {
    val fields = encodeToJsonElement(input).jsonObject.toMutableMap()
    if (input.descriptionSpecified) {
        fields["description"] = input.description?.let(::JsonPrimitive) ?: JsonNull
    }
    if (input.pricePerImageSpecified) {
        fields["pricePerImage"] = input.pricePerImage?.let(::JsonPrimitive) ?: JsonNull
    }
    if (input.maxOutputTokensSpecified) {
        fields["maxOutputTokens"] = input.maxOutputTokens?.let(::JsonPrimitive) ?: JsonNull
    }
    return JsonObject(fields).toString()
}

private fun String.ensureTrailingSlash() = if (endsWith('/')) this else "$this/"
private fun String.urlSegment(): String = java.net.URLEncoder.encode(this, Charsets.UTF_8.name()).replace("+", "%20")
private fun String.queryValue(): String = java.net.URLEncoder.encode(this, Charsets.UTF_8.name())

internal fun HttpUrl.hasSameOrigin(other: HttpUrl): Boolean =
    scheme == other.scheme && host == other.host && port == other.port

private fun ByteArray.asPngDataUrl(): String =
    "data:image/png;base64,${Base64.getEncoder().encodeToString(this)}"

private fun java.io.InputStream.readLimited(maxBytes: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maxBytes, 512 * 1024))
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0
    while (true) {
        val count = read(buffer)
        if (count < 0) break
        total += count
        if (total > maxBytes) throw ApiException(413, "图片不能超过 25MB")
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}
