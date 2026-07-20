package com.linhub.android.data

import com.linhub.android.core.model.ChatEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

internal fun Flow<ChatEvent>.coalesceChatEvents(
    frameMillis: Long = 24L,
): Flow<ChatEvent> = flow {
    require(frameMillis in 1..1_000)
    val frameNanos = frameMillis * NANOS_PER_MILLI

    coroutineScope {
        val events = Channel<ChatEvent>(Channel.UNLIMITED)
        val producer = launch {
            try {
                this@coalesceChatEvents.collect(events::send)
            } finally {
                events.close()
            }
        }
        var pending: ChatEvent? = null
        var deadlineNanos = 0L

        try {
            while (true) {
                if (pending != null && System.nanoTime() >= deadlineNanos) {
                    emit(pending)
                    pending = null
                    continue
                }

                val result = if (pending == null) {
                    events.receiveCatching()
                } else {
                    val remainingNanos = (deadlineNanos - System.nanoTime()).coerceAtLeast(1L)
                    val remainingMillis = (remainingNanos + NANOS_PER_MILLI - 1L) / NANOS_PER_MILLI
                    withTimeoutOrNull(remainingMillis) { events.receiveCatching() }
                }

                if (result == null) {
                    pending?.let { emit(it) }
                    pending = null
                    continue
                }
                if (result.isClosed) {
                    pending?.let { emit(it) }
                    result.exceptionOrNull()?.let { throw it }
                    break
                }

                val event = result.getOrThrow()
                if (!event.isFrameDelta()) {
                    pending?.let { emit(it) }
                    pending = null
                    emit(event)
                    continue
                }

                val current = pending
                if (current == null) {
                    pending = event
                    deadlineNanos = System.nanoTime() + frameNanos
                } else {
                    val merged = mergeFrameDelta(current, event)
                    if (merged != null) {
                        pending = merged
                    } else {
                        emit(current)
                        pending = event
                        deadlineNanos = System.nanoTime() + frameNanos
                    }
                }
            }
        } finally {
            producer.cancel()
            events.cancel()
        }
    }
}

private fun ChatEvent.isFrameDelta(): Boolean =
    this is ChatEvent.TextDelta ||
        this is ChatEvent.ReasoningDelta ||
        this is ChatEvent.ToolInputDelta

private fun mergeFrameDelta(current: ChatEvent, next: ChatEvent): ChatEvent? = when {
    current is ChatEvent.TextDelta && next is ChatEvent.TextDelta &&
        current.messageId == next.messageId -> current.copy(delta = current.delta + next.delta)
    current is ChatEvent.ReasoningDelta && next is ChatEvent.ReasoningDelta &&
        current.messageId == next.messageId -> current.copy(delta = current.delta + next.delta)
    current is ChatEvent.ToolInputDelta && next is ChatEvent.ToolInputDelta &&
        current.messageId == next.messageId && current.toolCallId == next.toolCallId ->
        current.copy(delta = current.delta + next.delta)
    else -> null
}

private const val NANOS_PER_MILLI = 1_000_000L
