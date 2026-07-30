package com.linhub.android.core.network

import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.MessageUsage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

class ChatEventParser(private val json: Json) {
    fun parse(line: String): ChatEvent {
        val payload = json.parseToJsonElement(line).jsonObject
        val type = payload.string("type") ?: return ChatEvent.Unknown("", payload)
        return when (type) {
            "conversation-created" -> ChatEvent.ConversationCreated(
                json.decodeFromJsonElement(Conversation.serializer(), payload.requiredObject("conversation")),
            )
            "user-message" -> ChatEvent.UserMessage(payload.decodeMessage())
            "assistant-start" -> ChatEvent.AssistantStart(payload.decodeMessage())
            "assistant-snapshot" -> ChatEvent.AssistantSnapshot(payload.decodeMessage())
            "routing-decision" -> ChatEvent.RoutingDecision(
                payload.requiredString("messageId"),
                payload.requiredObject("decision"),
            )
            "reasoning-delta" -> ChatEvent.ReasoningDelta(
                payload.requiredString("messageId"),
                payload.string("delta").orEmpty(),
            )
            "reasoning-done" -> ChatEvent.ReasoningDone(
                payload.requiredString("messageId"),
                payload["durationMs"]?.jsonPrimitive?.longOrNull ?: 0,
            )
            "text-delta" -> ChatEvent.TextDelta(
                payload.requiredString("messageId"),
                payload.string("delta").orEmpty(),
            )
            "tool-call-start" -> ChatEvent.ToolCallStart(
                payload.requiredString("messageId"),
                payload.requiredObject("part"),
            )
            "tool-call-end" -> ChatEvent.ToolCallEnd(
                payload.requiredString("messageId"),
                payload.requiredObject("part"),
            )
            "tool-input-start" -> ChatEvent.ToolInputStart(
                payload.requiredString("messageId"),
                payload.requiredString("toolCallId"),
                payload.requiredString("toolName"),
            )
            "tool-input-delta" -> ChatEvent.ToolInputDelta(
                payload.requiredString("messageId"),
                payload.requiredString("toolCallId"),
                payload.string("delta").orEmpty(),
            )
            "image" -> ChatEvent.Image(
                payload.requiredString("messageId"),
                payload.requiredObject("part"),
            )
            "artifact" -> ChatEvent.Artifact(
                payload.requiredString("messageId"),
                payload.requiredObject("artifact"),
            )
            "title" -> ChatEvent.Title(
                payload.requiredString("conversationId"),
                payload.requiredString("title"),
            )
            "done" -> ChatEvent.Done(
                messageId = payload.requiredString("messageId"),
                usage = payload["usage"]?.let {
                    json.decodeFromJsonElement(MessageUsage.serializer(), it)
                },
                status = payload.string("status") ?: "complete",
            )
            "error" -> ChatEvent.Error(payload.string("messageId"), payload.string("message") ?: "生成失败")
            "ping" -> ChatEvent.Ping
            else -> ChatEvent.Unknown(type, payload)
        }
    }

    private fun JsonObject.decodeMessage(): ChatMessage =
        json.decodeFromJsonElement(ChatMessage.serializer(), requiredObject("message"))
}

internal fun JsonObject.string(key: String): String? =
    get(key)?.jsonPrimitive?.contentOrNull

internal fun JsonObject.requiredString(key: String): String =
    string(key) ?: error("流事件缺少 $key")

internal fun JsonObject.requiredObject(key: String): JsonObject =
    get(key)?.jsonObject ?: error("流事件缺少 $key")

