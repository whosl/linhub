package com.linhub.android.data

import com.linhub.android.core.model.ChatEvent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class FramedChatEventsTest {
    @Test
    fun `adjacent deltas merge without crossing an ordered event`() = runBlocking {
        val events = flow {
            emit(ChatEvent.TextDelta("m1", "你"))
            emit(ChatEvent.TextDelta("m1", "好"))
            emit(ChatEvent.Ping)
            emit(ChatEvent.TextDelta("m1", "！"))
            emit(ChatEvent.TextDelta("m2", "另一条"))
        }.coalesceChatEvents(frameMillis = 24).toList()

        assertEquals(
            listOf(
                ChatEvent.TextDelta("m1", "你好"),
                ChatEvent.Ping,
                ChatEvent.TextDelta("m1", "！"),
                ChatEvent.TextDelta("m2", "另一条"),
            ),
            events,
        )
    }

    @Test
    fun `pending delta flushes before a slow upstream emits again`() = runBlocking {
        val events = flow {
            emit(ChatEvent.ReasoningDelta("m1", "第一帧"))
            delay(60)
            emit(ChatEvent.ReasoningDelta("m1", "第二帧"))
        }.coalesceChatEvents(frameMillis = 15).toList()

        assertEquals(
            listOf(
                ChatEvent.ReasoningDelta("m1", "第一帧"),
                ChatEvent.ReasoningDelta("m1", "第二帧"),
            ),
            events,
        )
    }

    @Test
    fun `tool input deltas only merge for the same tool call`() = runBlocking {
        val events = flow {
            emit(ChatEvent.ToolInputDelta("m1", "tool-1", "a"))
            emit(ChatEvent.ToolInputDelta("m1", "tool-1", "b"))
            emit(ChatEvent.ToolInputDelta("m1", "tool-2", "c"))
        }.coalesceChatEvents().toList()

        assertEquals(
            listOf(
                ChatEvent.ToolInputDelta("m1", "tool-1", "ab"),
                ChatEvent.ToolInputDelta("m1", "tool-2", "c"),
            ),
            events,
        )
    }
}
