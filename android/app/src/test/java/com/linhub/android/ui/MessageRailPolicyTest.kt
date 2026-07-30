package com.linhub.android.ui

import com.linhub.android.core.model.ChatMessage
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageRailPolicyTest {
    @Test
    fun `rail includes only user messages and preserves transcript indexes`() {
        val messages = listOf(
            message("u1", "user", "  第一条\n问题  "),
            message("a1", "assistant", "回答"),
            message("u2", "user", "第二条问题"),
        )

        assertEquals(
            listOf(
                MessageRailItem("u1", 0, "第一条 问题"),
                MessageRailItem("u2", 2, "第二条问题"),
            ),
            buildMessageRailItems(messages),
        )
    }

    @Test
    fun `active rail item follows the latest visible user message`() {
        val items = listOf(
            MessageRailItem("u1", 1, "一"),
            MessageRailItem("u2", 4, "二"),
            MessageRailItem("u3", 7, "三"),
        )

        assertEquals("u1", activeMessageRailId(items, 0))
        assertEquals("u1", activeMessageRailId(items, 3))
        assertEquals("u2", activeMessageRailId(items, 6))
        assertEquals("u3", activeMessageRailId(items, 8))
    }

    @Test
    fun `empty user message gets an accessible fallback title`() {
        val items = buildMessageRailItems(listOf(message("u1", "user", "")))

        assertEquals("用户消息 1", items.single().title)
    }

    @Test
    fun `long conversations use a bounded evenly sampled marker set`() {
        val items = List(500) { index ->
            MessageRailItem("u$index", index * 2, "问题 $index")
        }

        val markers = sampleMessageRailMarkers(items)

        assertEquals(48, markers.size)
        assertEquals(0, markers.first().railIndex)
        assertEquals(499, markers.last().railIndex)
        assertEquals(markers.map { it.railIndex }.sorted().distinct(), markers.map { it.railIndex })
    }

    @Test
    fun `rail markers stay centered and never exceed the web maximum gap`() {
        val first = messageRailItemOffsetPx(
            index = 0,
            itemCount = 2,
            railHeightPx = 240f,
            maximumGapPx = 14f,
            hitboxPx = 24f,
        )
        val second = messageRailItemOffsetPx(
            index = 1,
            itemCount = 2,
            railHeightPx = 240f,
            maximumGapPx = 14f,
            hitboxPx = 24f,
        )

        assertEquals(14f, second - first)
        assertEquals(120f, (first + second) / 2f)
        assertEquals(
            1,
            nearestMessageRailIndex(
                pointerY = second,
                itemCount = 2,
                railHeightPx = 240f,
                maximumGapPx = 14f,
                hitboxPx = 24f,
            ),
        )
    }

    @Test
    fun `markdown prefetch window keeps only assistant text near anchor`() {
        val messages = List(120) { index ->
            message(
                id = "m$index",
                role = if (index % 2 == 0) "user" else "assistant",
                text = "正文 $index",
            )
        }

        val sources = markdownSourcesAround(messages, anchorIndex = 60, radius = 10)

        assertEquals((51..69 step 2).map { "正文 $it" }, sources)
        assertTrue(markdownSourcesAround(emptyList(), 0).isEmpty())
    }

    private fun message(id: String, role: String, text: String) = ChatMessage(
        id = id,
        conversationId = "conversation",
        role = role,
        parts = listOf(buildJsonObject {
            put("type", "text")
            put("text", text)
        }),
        createdAt = "2026-07-11T00:00:00Z",
    )
}
