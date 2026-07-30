package com.linhub.android.ui

import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.AppSettings
import com.linhub.android.core.model.KnowledgeBase
import com.linhub.android.core.model.KnowledgeDocument
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.Project
import com.linhub.android.core.model.ProjectFile
import com.linhub.android.core.model.ProjectKnowledgeBase
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.User
import com.linhub.android.data.ChatTranscript
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put

internal const val BENCHMARK_SCENARIO_LONG_CHAT = "long-chat"
internal const val BENCHMARK_SCENARIO_LONG_CHAT_NO_RAIL = "long-chat-no-rail"
internal const val BENCHMARK_SCENARIO_DRAWER_NAVIGATION = "drawer-navigation"
internal const val BENCHMARK_SCENARIO_WORKSPACE_SMOKE = "workspace-smoke"
internal const val BENCHMARK_SCENARIO_WORKSPACE_INTERACTION = "workspace-interaction"
internal const val BENCHMARK_SCENARIO_STREAMING_CHAT = "streaming-chat"
internal const val BENCHMARK_SCENARIO_THINKING_CHAT = "thinking-chat"
internal const val BENCHMARK_STREAMING_FRAME_COUNT = 120
internal const val BENCHMARK_STREAMING_FRAME_MILLIS = 24L
internal const val BENCHMARK_STREAMING_DONE_MARKER = "STREAMING_BENCHMARK_DONE"

private const val BENCHMARK_STREAMING_CONVERSATION_ID = "benchmark-streaming-chat"
private const val BENCHMARK_STREAMING_USER_MESSAGE_ID = "benchmark-streaming-user"
private const val BENCHMARK_STREAMING_ASSISTANT_MESSAGE_ID = "benchmark-streaming-assistant"

/** 仅由独立 benchmark 变体启用，避免性能测试依赖网络、账号或 Room 状态。 */
internal fun benchmarkUiState(scenario: String?): LinHubUiState {
    val model = Model(
        id = "benchmark-model",
        providerId = "benchmark-provider",
        providerKind = "openai",
        slug = "benchmark-model",
        displayName = "性能基准模型",
        capabilities = listOf("chat", "reasoning"),
        contextWindow = 128_000,
    )
    val user = User(
        id = "benchmark-user",
        email = "benchmark@linhub.invalid",
        name = "性能测试",
        role = if (
            scenario == BENCHMARK_SCENARIO_DRAWER_NAVIGATION ||
            scenario == BENCHMARK_SCENARIO_WORKSPACE_SMOKE ||
            scenario == BENCHMARK_SCENARIO_WORKSPACE_INTERACTION
        ) {
            "admin"
        } else {
            "user"
        },
        createdAt = BENCHMARK_TIMESTAMP,
    )
    if (scenario == BENCHMARK_SCENARIO_WORKSPACE_SMOKE) {
        return benchmarkWorkspaceSmokeUiState(user, model)
    }
    if (scenario == BENCHMARK_SCENARIO_WORKSPACE_INTERACTION) {
        return benchmarkWorkspaceInteractionUiState(user, model)
    }
    if (scenario == BENCHMARK_SCENARIO_STREAMING_CHAT) {
        return benchmarkStreamingUiState(user, model)
    }
    if (scenario == BENCHMARK_SCENARIO_THINKING_CHAT) {
        return benchmarkThinkingUiState(user, model)
    }
    if (scenario != BENCHMARK_SCENARIO_LONG_CHAT && scenario != BENCHMARK_SCENARIO_LONG_CHAT_NO_RAIL) {
        return LinHubUiState(
            phase = AppPhase.Chat,
            user = user,
            models = listOf(model),
            selectedModelId = model.id,
        )
    }

    val conversationId = "benchmark-long-chat"
    val messages = benchmarkMessages(conversationId)
    val conversation = Conversation(
        id = conversationId,
        title = "性能基准长会话",
        modelId = model.id,
        currentLeafId = messages.last().id,
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    return LinHubUiState(
        phase = AppPhase.Chat,
        user = user,
        models = listOf(model),
        selectedModelId = model.id,
        messageRailEnabled = scenario != BENCHMARK_SCENARIO_LONG_CHAT_NO_RAIL,
        conversations = listOf(conversation),
        selectedConversationId = conversationId,
        transcripts = mapOf(
            NEW_CHAT_KEY to ChatTranscript(),
            conversationId to ChatTranscript(messages = messages),
        ),
    )
}

/** 仅用于截图回归：覆盖 reasoning、搜索、代码错误聚合和完成态浮层。 */
private fun benchmarkThinkingUiState(user: User, model: Model): LinHubUiState {
    val conversationId = "benchmark-thinking-chat"
    val userMessage = ChatMessage(
        id = "benchmark-thinking-user",
        conversationId = conversationId,
        role = "user",
        parts = listOf(buildJsonObject {
            put("type", "text")
            put("text", "比较中国和日本的饮料市场规模，并给出数据来源。")
        }),
        createdAt = BENCHMARK_TIMESTAMP,
    )
    val assistantMessage = ChatMessage(
        id = "benchmark-thinking-assistant",
        conversationId = conversationId,
        role = "assistant",
        parts = listOf(
            buildJsonObject {
                put("type", "reasoning")
                put("text", "我先检索两国饮料市场的公开数据，并优先核对行业报告与协会来源。")
                put("durationMs", 32_000)
            },
            buildJsonObject {
                put("type", "tool-call")
                put("toolCallId", "benchmark-web-search")
                put("toolName", "web_search")
                put("state", "success")
                put("args", buildJsonObject { put("query", "中国 日本 饮料市场规模") })
                put("result", buildJsonObject {
                    put("sources", buildJsonArray {
                        add(buildJsonObject {
                            put("title", "中国饮料工业协会")
                            put("url", "https://www.chinabeverage.org/")
                        })
                        add(buildJsonObject {
                            put("title", "日本清凉饮料工业会")
                            put("url", "https://www.j-sda.or.jp/")
                        })
                    })
                })
            },
            buildJsonObject {
                put("type", "reasoning")
                put("text", "搜索结果口径不同，需要统一年份并区分销售额、产量和人均消费量。")
                put("durationMs", 60_000)
            },
            buildJsonObject {
                put("type", "tool-call")
                put("toolCallId", "benchmark-code-error")
                put("toolName", "run_code")
                put("state", "error")
                put("args", buildJsonObject { put("code", "normalize_market_data()") })
                put("errorMessage", "数据口径不一致，已跳过这次计算并改用报告原始值。")
            },
            buildJsonObject {
                put("type", "text")
                put("text", "## 对比结论\n\n中国市场总体规模更大，日本人均消费和成熟品类占比更高。正式引用时应统一统计年份与口径。")
            },
        ),
        modelId = model.id,
        parentId = userMessage.id,
        status = "complete",
        createdAt = BENCHMARK_TIMESTAMP,
    )
    val conversation = Conversation(
        id = conversationId,
        title = "市场规模对比",
        modelId = model.id,
        currentLeafId = assistantMessage.id,
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    return LinHubUiState(
        phase = AppPhase.Chat,
        user = user,
        models = listOf(model),
        selectedModelId = model.id,
        conversations = listOf(conversation),
        selectedConversationId = conversationId,
        transcripts = mapOf(
            NEW_CHAT_KEY to ChatTranscript(),
            conversationId to ChatTranscript(messages = listOf(userMessage, assistantMessage)),
        ),
    )
}

private fun benchmarkWorkspaceSmokeUiState(user: User, model: Model): LinHubUiState {
    val plan = Plan(
        id = "benchmark-plan",
        name = "自动化套餐",
        description = "用于验证原生计费页面的确定性套餐",
        priceCentsPerMonth = 990,
        monthlyQuotaCents = 5_000,
        modelTier = "pro",
        features = listOf("页面自动化验证"),
    )
    return LinHubUiState(
        phase = AppPhase.Chat,
        user = user,
        models = listOf(model),
        defaultModelId = model.id,
        selectedModelId = model.id,
        projectsLoaded = true,
        knowledgeBasesLoaded = true,
        skillsLoaded = true,
        plans = listOf(plan),
        billingLoadedResources = BillingResource.entries.toSet(),
        styles = listOf(
            ChatStyle(
                id = "style-normal",
                name = "标准",
                description = "平衡、清晰的默认回复风格",
                builtIn = true,
            ),
        ),
        settingsLoadedResources = SettingsResource.entries.toSet(),
        admin = AdminUiState(
            loadedResources = AdminResource.entries.toSet(),
            models = listOf(model),
            plans = listOf(plan),
            users = listOf(user),
            settings = AppSettings(),
        ),
    )
}

/**
 * 富数据工作区夹具只服务 R8 交互回归。所有详情数据都预先驻留在内存中，测试不读取
 * 真实账号、网络或 Room，也不会触发任何写操作。
 */
private fun benchmarkWorkspaceInteractionUiState(user: User, model: Model): LinHubUiState {
    val knowledgeBase = KnowledgeBase(
        id = "benchmark-knowledge",
        name = "自动化知识库",
        description = "验证非空知识库详情",
        documentCount = 1,
        totalChunks = 3,
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    val document = KnowledgeDocument(
        id = "benchmark-document",
        knowledgeBaseId = knowledgeBase.id,
        name = "自动化文档.txt",
        mimeType = "text/plain",
        size = 128,
        status = "ready",
        chunkCount = 3,
        extractMethod = "plain-text",
        createdAt = BENCHMARK_TIMESTAMP,
    )
    val projectFile = ProjectFile(
        id = "benchmark-project-file",
        name = "自动化项目资料.txt",
        mimeType = "text/plain",
        size = 256,
        createdAt = BENCHMARK_TIMESTAMP,
    )
    val project = Project(
        id = "benchmark-project",
        name = "自动化项目",
        description = "验证项目详情与三个标签",
        instructions = "所有回复先给出结论，再列出验证步骤。",
        color = "#D97757",
        modelId = model.id,
        knowledgeBaseIds = listOf(knowledgeBase.id),
        knowledgeBases = listOf(
            ProjectKnowledgeBase(
                id = knowledgeBase.id,
                name = knowledgeBase.name,
                description = knowledgeBase.description,
                documentCount = knowledgeBase.documentCount,
                totalChunks = knowledgeBase.totalChunks,
            ),
        ),
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
        conversationCount = 1,
        files = listOf(projectFile),
    )
    val projectConversation = Conversation(
        id = "benchmark-project-conversation",
        title = "项目自动化会话",
        projectId = project.id,
        modelId = model.id,
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    val skill = Skill(
        id = "benchmark-skill",
        ownerId = user.id,
        name = "自动化技能",
        emoji = "\uD83E\uDDEA",
        description = "验证技能编辑器的预填与取消",
        systemPrompt = "只输出可复现的验证结果。",
        greeting = "开始执行自动化验证。",
        defaultModelId = model.id,
        enabledTools = listOf("code_interpreter"),
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    val mediaAsset = MediaAsset(
        id = "benchmark-media",
        ownerId = user.id,
        kind = "upload",
        name = "automation.kt",
        mimeType = "text/x-kotlin",
        size = 48,
        url = "/api/media/benchmark-media",
        extractedTextAvailable = true,
        extractedText = "fun main() = println(\"WORKSPACE_INTERACTION_OK\")\n",
        createdAt = BENCHMARK_TIMESTAMP,
    )
    return benchmarkWorkspaceSmokeUiState(user, model).copy(
        projects = listOf(project),
        projectConversations = mapOf(project.id to listOf(projectConversation)),
        knowledgeBases = listOf(knowledgeBase),
        knowledgeDocuments = mapOf(knowledgeBase.id to listOf(document)),
        mySkills = listOf(skill),
        mediaAssets = listOf(mediaAsset),
        mediaResultKey = "all\u0000",
        mediaLoadedAtEpochMillis = 1L,
    )
}

internal fun canRunStreamingBenchmark(
    benchmarkEnabled: Boolean,
    scenario: String?,
): Boolean = benchmarkEnabled && scenario == BENCHMARK_SCENARIO_STREAMING_CHAT

/**
 * 构造与线上流式消息完全相同的 reducer 事件；调用端按生产合帧周期逐帧提交 TextDelta。
 */
internal fun streamingBenchmarkEvents(): List<ChatEvent> = buildList(
    BENCHMARK_STREAMING_FRAME_COUNT + 2,
) {
    add(ChatEvent.AssistantStart(benchmarkStreamingAssistantMessage()))
    repeat(BENCHMARK_STREAMING_FRAME_COUNT) { index ->
        val frame = index + 1
        val delta = when {
            frame == 1 -> "## 原生 Compose 流式性能验证\n\n"
            frame == BENCHMARK_STREAMING_FRAME_COUNT ->
                "\n渲染完成：$BENCHMARK_STREAMING_DONE_MARKER"
            else -> "第 $frame 帧：合并增量、更新消息树并保持列表稳定。\n"
        }
        add(ChatEvent.TextDelta(BENCHMARK_STREAMING_ASSISTANT_MESSAGE_ID, delta))
    }
    add(
        ChatEvent.Done(
            messageId = BENCHMARK_STREAMING_ASSISTANT_MESSAGE_ID,
            usage = null,
            status = "complete",
        ),
    )
}

private fun benchmarkStreamingUiState(user: User, model: Model): LinHubUiState {
    val userMessage = ChatMessage(
        id = BENCHMARK_STREAMING_USER_MESSAGE_ID,
        conversationId = BENCHMARK_STREAMING_CONVERSATION_ID,
        role = "user",
        parts = listOf(buildJsonObject {
            put("type", "text")
            put("text", "请持续输出一段用于验证原生流式渲染性能的回答。")
        }),
        createdAt = BENCHMARK_TIMESTAMP,
    )
    val assistantMessage = benchmarkStreamingAssistantMessage()
    val conversation = Conversation(
        id = BENCHMARK_STREAMING_CONVERSATION_ID,
        title = "流式性能基准",
        modelId = model.id,
        currentLeafId = assistantMessage.id,
        createdAt = BENCHMARK_TIMESTAMP,
        updatedAt = BENCHMARK_TIMESTAMP,
    )
    return LinHubUiState(
        phase = AppPhase.Chat,
        user = user,
        models = listOf(model),
        selectedModelId = model.id,
        conversations = listOf(conversation),
        selectedConversationId = conversation.id,
        transcripts = mapOf(
            NEW_CHAT_KEY to ChatTranscript(),
            conversation.id to ChatTranscript(
                messages = listOf(userMessage, assistantMessage),
                streamingMessageId = assistantMessage.id,
            ),
        ),
    )
}

private fun benchmarkStreamingAssistantMessage(): ChatMessage = ChatMessage(
    id = BENCHMARK_STREAMING_ASSISTANT_MESSAGE_ID,
    conversationId = BENCHMARK_STREAMING_CONVERSATION_ID,
    parentId = BENCHMARK_STREAMING_USER_MESSAGE_ID,
    role = "assistant",
    parts = emptyList(),
    modelId = "benchmark-model",
    createdAt = BENCHMARK_TIMESTAMP,
    status = "streaming",
)

private fun benchmarkMessages(conversationId: String): List<ChatMessage> = buildList(1_000) {
    var parentId: String? = null
    repeat(1_000) { index ->
        val number = index + 1
        val id = "benchmark-message-${number.toString().padStart(4, '0')}"
        val role = if (index % 2 == 0) "user" else "assistant"
        val text = if (role == "user") {
            "性能基准问题 $number：请用简洁的步骤说明 Compose 长列表优化。"
        } else {
            """
            ### 性能基准回复 $number

            - 使用稳定的 `key` 与 `contentType`
            - 缓存 Markdown 解析结果
            - 合并流式文本更新，减少无效重组

            当前消息用于验证 1,000 条原生消息的滚动帧时间。
            """.trimIndent()
        }
        add(
            ChatMessage(
                id = id,
                conversationId = conversationId,
                parentId = parentId,
                role = role,
                parts = listOf(buildJsonObject {
                    put("type", "text")
                    put("text", text)
                }),
                modelId = if (role == "assistant") "benchmark-model" else null,
                createdAt = BENCHMARK_TIMESTAMP,
            ),
        )
        parentId = id
    }
}

private const val BENCHMARK_TIMESTAMP = "2026-01-01T00:00:00.000Z"
