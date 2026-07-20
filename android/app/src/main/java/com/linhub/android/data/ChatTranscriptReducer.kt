package com.linhub.android.data

import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.ChatMessage
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class ChatTranscript(
    val messages: List<ChatMessage> = emptyList(),
    val streamingMessageId: String? = null,
    val error: String? = null,
) {
    val isStreaming: Boolean get() = streamingMessageId != null
}

object ChatTranscriptReducer {
    fun clearError(state: ChatTranscript): ChatTranscript = state.copy(error = null)

    fun reduce(state: ChatTranscript, event: ChatEvent): ChatTranscript = when (event) {
        is ChatEvent.UserMessage -> state.copy(
            messages = upsert(state.messages, event.message),
            error = null,
        )
        is ChatEvent.AssistantStart -> state.copy(
            messages = upsert(state.messages, event.message),
            streamingMessageId = event.message.id,
            error = null,
        )
        is ChatEvent.AssistantSnapshot -> {
            val ownsStream = event.message.status == "streaming"
            state.copy(
                messages = upsert(state.messages, event.message),
                streamingMessageId = when {
                    ownsStream -> event.message.id
                    state.streamingMessageId == event.message.id -> null
                    else -> state.streamingMessageId
                },
                error = null,
            )
        }
        is ChatEvent.ReasoningDelta -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = appendText(message.parts, "reasoning", event.delta))
        }
        is ChatEvent.TextDelta -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = appendText(message.parts, "text", event.delta))
        }
        is ChatEvent.ReasoningDone -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = message.parts.map { part ->
                if (part.type() == "reasoning") part.with("durationMs", JsonPrimitive(event.durationMs)) else part
            })
        }
        is ChatEvent.ToolCallStart -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = upsertTool(message.parts, event.part))
        }
        is ChatEvent.ToolCallEnd -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = upsertTool(message.parts, event.part))
        }
        is ChatEvent.ToolInputStart -> state
        is ChatEvent.ToolInputDelta -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = message.parts.map { part ->
                if (part.type() == "tool-call" && part.string("toolCallId") == event.toolCallId) {
                    part.with(
                        "inputPreview",
                        JsonPrimitive(part.string("inputPreview").orEmpty() + event.delta),
                    )
                } else {
                    part
                }
            })
        }
        is ChatEvent.Image -> state.updateMessage(event.messageId) { message ->
            message.copy(parts = message.parts + event.part)
        }
        is ChatEvent.RoutingDecision -> state.updateMessage(event.messageId) { message ->
            val config = buildJsonObject {
                put("type", "tool-config")
                event.decision["finalTools"]?.let { put("tools", it) }
                put("routing", event.decision)
            }
            val index = message.parts.indexOfFirst { it.type() == "tool-config" }
            val parts = message.parts.toMutableList().apply {
                if (index >= 0) set(index, config) else add(config)
            }
            message.copy(parts = parts)
        }
        is ChatEvent.Done -> state.updateMessage(event.messageId) { message ->
            message.copy(status = event.status, usage = event.usage)
        }.copy(
            streamingMessageId = if (state.streamingMessageId == event.messageId) null else state.streamingMessageId,
            error = null,
        )
        is ChatEvent.Error -> {
            val failedMessageId = event.messageId ?: state.streamingMessageId
            val updated = failedMessageId?.let { id ->
                state.updateMessage(id) { message ->
                    message.copy(
                        status = "error",
                        parts = if (message.parts.isEmpty()) {
                            listOf(buildJsonObject {
                                put("type", "text")
                                put("text", event.message)
                            })
                        } else {
                            message.parts
                        },
                    )
                }
            } ?: state
            updated.copy(
                streamingMessageId = if (
                    event.messageId == null || updated.streamingMessageId == failedMessageId
                ) null else updated.streamingMessageId,
                error = event.message,
            )
        }
        ChatEvent.Ping,
        is ChatEvent.Artifact,
        is ChatEvent.Title,
        is ChatEvent.ConversationCreated,
        is ChatEvent.Unknown,
        -> state
    }

    fun stop(state: ChatTranscript): ChatTranscript {
        val streamingId = state.streamingMessageId ?: return state
        return state.updateMessage(streamingId) { it.copy(status = "stopped") }
            .copy(streamingMessageId = null)
    }

    private fun ChatTranscript.updateMessage(
        messageId: String,
        update: (ChatMessage) -> ChatMessage,
    ): ChatTranscript = copy(
        messages = messages.map { if (it.id == messageId) update(it) else it },
        error = null,
    )

    private fun upsert(messages: List<ChatMessage>, incoming: ChatMessage): List<ChatMessage> {
        val index = messages.indexOfFirst { it.id == incoming.id }
        if (index < 0) return messages + incoming
        val existing = messages[index]
        val safeIncoming = if (visibleProgress(incoming.parts) < visibleProgress(existing.parts)) {
            incoming.copy(parts = existing.parts, usage = incoming.usage ?: existing.usage)
        } else {
            incoming
        }
        return messages.toMutableList().apply { set(index, safeIncoming) }
    }

    private fun appendText(parts: List<JsonObject>, type: String, delta: String): List<JsonObject> {
        if (delta.isEmpty()) return parts
        val last = parts.lastOrNull()
        return if (last?.type() == type) {
            parts.dropLast(1) + last.with("text", JsonPrimitive(last.string("text").orEmpty() + delta))
        } else {
            parts + buildJsonObject {
                put("type", type)
                put("text", delta)
            }
        }
    }

    private fun upsertTool(parts: List<JsonObject>, incoming: JsonObject): List<JsonObject> {
        val toolCallId = incoming.string("toolCallId") ?: return parts + incoming
        val index = parts.indexOfFirst {
            it.type() == "tool-call" && it.string("toolCallId") == toolCallId
        }
        if (index < 0) return parts + incoming
        return parts.toMutableList().apply { set(index, incoming) }
    }

    private fun visibleProgress(parts: List<JsonObject>): Int = parts.sumOf { part ->
        when (part.type()) {
            "text", "reasoning" -> part.string("text").orEmpty().length
            "tool-call" -> 32 + part.toString().length
            "image", "file" -> 64
            else -> 0
        }
    }
}

fun JsonObject.type(): String? = string("type")

fun JsonObject.string(key: String): String? =
    get(key)?.jsonPrimitive?.contentOrNull

private fun JsonObject.with(key: String, value: JsonPrimitive): JsonObject =
    JsonObject(toMutableMap().apply { put(key, value) })
