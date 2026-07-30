package com.linhub.android.core.network

import com.linhub.android.core.model.ConversationPatch
import com.linhub.android.core.model.ChatToolToggles
import com.linhub.android.core.model.Artifact
import com.linhub.android.core.model.AdminModelRequest
import com.linhub.android.core.model.CreateOrderRequest
import com.linhub.android.core.model.Plan
import kotlinx.serialization.encodeToString
import com.linhub.android.core.model.SaveSkillRequest
import com.linhub.android.core.model.SendMessageRequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestEncodingTest {
    private val json = Json {
        explicitNulls = false
        encodeDefaults = true
    }

    @Test
    fun `conversation patch distinguishes omitted project from removing project`() {
        val omitted = json.parseToJsonElement(
            json.encodeConversationPatch(ConversationPatch(title = "新标题")),
        ).jsonObject
        val removed = json.parseToJsonElement(
            json.encodeConversationPatch(
                ConversationPatch(projectId = null, projectIdSpecified = true),
            ),
        ).jsonObject

        assertFalse(omitted.containsKey("projectId"))
        assertTrue(removed.containsKey("projectId"))
        assertEquals("null", removed.getValue("projectId").toString())
    }

    @Test
    fun `root edit includes explicit null parent while normal send omits it`() {
        val normal = json.parseToJsonElement(
            json.encodeSendMessageRequest(request(parentIdSpecified = false)),
        ).jsonObject
        val rootEdit = json.parseToJsonElement(
            json.encodeSendMessageRequest(request(parentIdSpecified = true)),
        ).jsonObject

        assertFalse(normal.containsKey("parentId"))
        assertTrue(rootEdit.containsKey("parentId"))
        assertEquals("null", rootEdit.getValue("parentId").toString())
    }

    @Test
    fun `skill update can clear greeting and default model`() {
        val body = json.parseToJsonElement(
            json.encodeSaveSkillRequest(
                SaveSkillRequest(
                    id = "skill-test",
                    name = "测试技能",
                    emoji = "\u2728",
                    description = "描述",
                    systemPrompt = "提示词",
                    greeting = null,
                    defaultModelId = null,
                    shareToMarket = true,
                ),
            ),
        ).jsonObject

        assertEquals("skill-test", body.getValue("id").toString().trim('"'))
        assertEquals("null", body.getValue("greeting").toString())
        assertEquals("null", body.getValue("defaultModelId").toString())
        assertTrue(body.getValue("shareToMarket").toString().toBoolean())
    }

    @Test
    fun `chat tools default to manual routing`() {
        val body = json.parseToJsonElement(
            json.encodeSendMessageRequest(
                SendMessageRequest(
                    clientGenerationId = "cg-default-tools",
                    text = "默认工具",
                ),
            ),
        ).jsonObject

        assertFalse(body.getValue("tools").jsonObject
            .getValue("autoRouting").jsonPrimitive.content.toBoolean())
    }

    @Test
    fun `chat request keeps uploaded media and explicit tool choices`() {
        val body = json.parseToJsonElement(
            json.encodeSendMessageRequest(
                SendMessageRequest(
                    clientGenerationId = "cg-media",
                    text = "",
                    images = listOf(buildJsonObject {
                        put("type", "image")
                        put("url", "/api/media/att-image")
                        put("alt", "图片.png")
                    }),
                    attachments = listOf(buildJsonObject {
                        put("type", "file")
                        put("attachmentId", "att-file")
                        put("name", "资料.pdf")
                        put("mimeType", "application/pdf")
                        put("size", 1024)
                    }),
                    tools = ChatToolToggles(
                        autoRouting = false,
                        webSearch = true,
                        imageGeneration = false,
                        codeRunner = true,
                        knowledgeSearch = true,
                        mcpServerIds = listOf("mcp-one"),
                        knowledgeBaseIds = listOf("kb-one"),
                    ),
                ),
            ),
        ).jsonObject

        assertEquals("image", body.getValue("images").jsonArray.single().jsonObject
            .getValue("type").jsonPrimitive.content)
        assertEquals("att-file", body.getValue("attachments").jsonArray.single().jsonObject
            .getValue("attachmentId").jsonPrimitive.content)
        assertEquals("mcp-one", body.getValue("tools").jsonObject
            .getValue("mcpServerIds").jsonArray.single().jsonPrimitive.content)
        assertFalse(body.getValue("tools").jsonObject
            .getValue("autoRouting").jsonPrimitive.content.toBoolean())
    }

    @Test
    fun `chat request carries style and supported thinking settings`() {
        val body = json.parseToJsonElement(
            json.encodeSendMessageRequest(
                SendMessageRequest(
                    clientGenerationId = "cg-thinking",
                    text = "分析问题",
                    modelId = "model-reasoning",
                    styleId = "style-concise",
                    extendedThinking = true,
                    thinkingEffort = "xhigh",
                ),
            ),
        ).jsonObject

        assertEquals("style-concise", body.getValue("styleId").jsonPrimitive.content)
        assertTrue(body.getValue("extendedThinking").jsonPrimitive.content.toBoolean())
        assertEquals("xhigh", body.getValue("thinkingEffort").jsonPrimitive.content)
    }

    @Test
    fun `chat request omits nullable thinking effort for regular models`() {
        val body = json.parseToJsonElement(
            json.encodeSendMessageRequest(
                SendMessageRequest(
                    clientGenerationId = "cg-regular",
                    text = "普通问题",
                    extendedThinking = false,
                    thinkingEffort = null,
                ),
            ),
        ).jsonObject

        assertFalse(body.getValue("extendedThinking").jsonPrimitive.content.toBoolean())
        assertFalse(body.containsKey("thinkingEffort"))
    }

    @Test
    fun `admin model update can clear optional token and image limits`() {
        val body = json.parseToJsonElement(
            json.encodeAdminModelRequest(
                AdminModelRequest(
                    id = "model-one",
                    description = null,
                    pricePerImage = null,
                    maxOutputTokens = null,
                    descriptionSpecified = true,
                    pricePerImageSpecified = true,
                    maxOutputTokensSpecified = true,
                ),
            ),
        ).jsonObject

        assertEquals("null", body.getValue("description").toString())
        assertEquals("null", body.getValue("pricePerImage").toString())
        assertEquals("null", body.getValue("maxOutputTokens").toString())
    }

    @Test
    fun `admin model toggle does not clear unrelated optional fields`() {
        val body = json.parseToJsonElement(
            json.encodeAdminModelRequest(
                AdminModelRequest(id = "model-one", enabled = false),
            ),
        ).jsonObject

        assertEquals(false, body.getValue("enabled").jsonPrimitive.content.toBoolean())
        assertFalse(body.containsKey("description"))
        assertFalse(body.containsKey("pricePerImage"))
        assertFalse(body.containsKey("maxOutputTokens"))
    }

    @Test
    fun `artifact response preserves version history`() {
        val artifact = json.decodeFromString<Artifact>(
            """{"id":"art-one","conversationId":"conv-one","title":"演示","kind":"html","versions":[{"version":1,"content":"<h1>一</h1>","createdAt":"2026-07-10T00:00:00.000Z"},{"version":2,"content":"<h1>二</h1>","createdAt":"2026-07-10T00:01:00.000Z"}],"currentVersion":2,"createdAt":"2026-07-10T00:00:00.000Z","updatedAt":"2026-07-10T00:01:00.000Z"}""",
        )

        assertEquals(2, artifact.currentVersion)
        assertEquals("<h1>二</h1>", artifact.versions.last().content)
    }

    @Test
    fun `subscription order omits recharge amount and plans keep unlimited quota`() {
        val order = json.parseToJsonElement(
            json.encodeToString(CreateOrderRequest(kind = "subscription", planId = "plan-pro")),
        ).jsonObject
        val plan = json.decodeFromString<Plan>(
            """{"id":"plan-pro","name":"专业版","description":"全部功能","priceCentsPerMonth":9900,"monthlyQuotaCents":-1,"modelTier":"pro","features":["全部模型"],"enabled":true}""",
        )

        assertFalse(order.containsKey("amountCents"))
        assertEquals("plan-pro", order.getValue("planId").jsonPrimitive.content)
        assertEquals(-1, plan.monthlyQuotaCents)
    }

    private fun request(parentIdSpecified: Boolean) = SendMessageRequest(
        clientGenerationId = "cg-test",
        conversationId = "conversation-test",
        parentId = null,
        parentIdSpecified = parentIdSpecified,
        text = "测试",
    )
}
