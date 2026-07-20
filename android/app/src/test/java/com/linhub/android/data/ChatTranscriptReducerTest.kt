package com.linhub.android.data

import com.linhub.android.core.model.ChatEvent
import com.linhub.android.core.model.ChatMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

class ChatTranscriptReducerTest {
    @Test
    fun `retry preparation clears only the previous stream error`() {
        val initial = ChatTranscript(
            messages = listOf(message(status = "error")),
            error = "连接中断",
        )

        val result = ChatTranscriptReducer.clearError(initial)

        assertNull(result.error)
        assertEquals(initial.messages, result.messages)
    }

    @Test
    fun `text deltas append without replacing existing content`() {
        val initial = ChatTranscript(
            messages = listOf(message(parts = emptyList(), status = "streaming")),
            streamingMessageId = "m1",
        )

        val once = ChatTranscriptReducer.reduce(initial, ChatEvent.TextDelta("m1", "你好"))
        val twice = ChatTranscriptReducer.reduce(once, ChatEvent.TextDelta("m1", "，世界"))

        assertEquals("你好，世界", twice.messages.single().parts.single().string("text"))
    }

    @Test
    fun `older assistant snapshot cannot roll visible text backward`() {
        val existing = message(
            parts = listOf(textPart("已经生成了较长内容")),
            status = "streaming",
        )
        val stale = existing.copy(parts = listOf(textPart("短")), status = "complete")

        val result = ChatTranscriptReducer.reduce(
            ChatTranscript(messages = listOf(existing), streamingMessageId = "m1"),
            ChatEvent.AssistantSnapshot(stale),
        )

        assertEquals("已经生成了较长内容", result.messages.single().parts.single().string("text"))
        assertNull(result.streamingMessageId)
    }

    @Test
    fun `done finalizes only the matching stream`() {
        val result = ChatTranscriptReducer.reduce(
            ChatTranscript(
                messages = listOf(message(status = "streaming")),
                streamingMessageId = "m1",
            ),
            ChatEvent.Done("m1", usage = null, status = "complete"),
        )

        assertFalse(result.isStreaming)
        assertEquals("complete", result.messages.single().status)
    }

    @Test
    fun `connection error finalizes the active message even without message id`() {
        val result = ChatTranscriptReducer.reduce(
            ChatTranscript(
                messages = listOf(message(status = "streaming")),
                streamingMessageId = "m1",
            ),
            ChatEvent.Error(messageId = null, message = "连接中断"),
        )

        assertFalse(result.isStreaming)
        assertEquals("error", result.messages.single().status)
        assertEquals("连接中断", result.error)
    }

    @Test
    fun `tool completion keeps structured sources for result UI`() {
        val initial = ChatTranscript(
            messages = listOf(message(parts = emptyList(), status = "streaming")),
            streamingMessageId = "m1",
        )
        val started = ChatTranscriptReducer.reduce(
            initial,
            ChatEvent.ToolCallStart("m1", buildJsonObject {
                put("type", "tool-call")
                put("toolCallId", "tool-1")
                put("toolName", "web_search")
                put("state", "running")
                put("args", buildJsonObject { put("query", "Compose") })
            }),
        )
        val completed = ChatTranscriptReducer.reduce(
            started,
            ChatEvent.ToolCallEnd("m1", buildJsonObject {
                put("type", "tool-call")
                put("toolCallId", "tool-1")
                put("toolName", "web_search")
                put("state", "success")
                put("args", buildJsonObject { put("query", "Compose") })
                put("result", buildJsonObject {
                    put("sources", buildJsonArray {
                        add(buildJsonObject {
                            put("title", "Android Developers")
                            put("url", "https://developer.android.com/compose")
                        })
                    })
                })
            }),
        )

        val tool = completed.messages.single().parts.single()
        assertEquals("success", tool.string("state"))
        assertEquals(
            "Android Developers",
            tool.getValue("result").jsonObject.getValue("sources").jsonArray
                .single().jsonObject.string("title"),
        )
    }

    @Test
    fun `routing decision is persisted as a tool config part`() {
        val result = ChatTranscriptReducer.reduce(
            ChatTranscript(messages = listOf(message(parts = emptyList(), status = "streaming"))),
            ChatEvent.RoutingDecision("m1", buildJsonObject {
                put("enabled", true)
                put("labels", buildJsonArray {
                    add("联网搜索")
                    add("知识库")
                })
                put("reasons", buildJsonArray { add("问题需要最新资料") })
                put("finalTools", buildJsonObject { put("webSearch", true) })
            }),
        )

        val config = result.messages.single().parts.single()
        assertEquals("tool-config", config.type())
        assertTrue(config.getValue("routing").jsonObject.getValue("enabled").toString().toBoolean())
        assertEquals(2, config.getValue("routing").jsonObject.getValue("labels").jsonArray.size)
    }

    private fun message(
        parts: List<kotlinx.serialization.json.JsonObject> = listOf(textPart("")),
        status: String,
    ) = ChatMessage(
        id = "m1",
        conversationId = "c1",
        role = "assistant",
        parts = parts,
        createdAt = "2026-07-10T00:00:00.000Z",
        status = status,
    )

    private fun textPart(text: String) = buildJsonObject {
        put("type", "text")
        put("text", text)
    }
}
