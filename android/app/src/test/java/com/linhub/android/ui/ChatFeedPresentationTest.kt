package com.linhub.android.ui

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatFeedPresentationTest {
    @Test
    fun `web tool names match the web summary family`() {
        assertTrue(isWebToolName("web_search"))
        assertTrue(isWebToolName("web_read"))
        assertTrue(isWebToolName("tavily_research"))
        assertFalse(isWebToolName("search_knowledge"))
        assertFalse(isWebToolName("run_code"))
    }

    @Test
    fun `completed web calls collapse into one deduplicated summary`() {
        val summary = summarizeWebToolParts(
            listOf(
                tool("web_search", "success", "https://a.test", "https://b.test"),
                tool("web_search", "success", "https://b.test", "https://c.test"),
            ),
        )

        assertEquals("已搜索 2 次", summary.label)
        assertEquals(3, summary.sourceCount)
        assertFalse(summary.running)
    }

    @Test
    fun `running web call uses active copy`() {
        val summary = summarizeWebToolParts(listOf(tool("tavily_research", "running")))

        assertEquals("正在调研…", summary.label)
        assertEquals(0, summary.sourceCount)
        assertTrue(summary.running)
    }

    @Test
    fun `completed work summary includes reasoning and tool calls`() {
        val summary = summarizeWorkParts(
            parts = listOf(
                reasoning("先分析问题", durationMs = 1_000),
                tool("run_code", "error"),
                reasoning("改用另一种方法", durationMs = 2_000),
            ),
            streaming = false,
        )

        assertEquals("工作过程 · 3 个步骤 · 3s · 1 个失败", summary.label)
        assertEquals(3_000L, summary.durationMs)
        assertFalse(summary.running)
        assertEquals(1, summary.errorCount)
    }

    @Test
    fun `streaming work summary exposes latest tool activity`() {
        val summary = summarizeWorkParts(
            parts = listOf(
                reasoning("正在分析", durationMs = 1_000),
                tool("run_code", "error"),
            ),
            streaming = true,
        )

        assertEquals("运行代码遇到问题，正在继续… · 2 个步骤", summary.label)
        assertTrue(summary.running)
        assertEquals(1, summary.errorCount)
    }

    @Test
    fun `streaming text chunks preserve exact content at newline boundaries`() {
        val text = (1..48).joinToString("\n") { index ->
            "第 $index 行：持续增长的原生流式正文。"
        }

        val chunks = streamingTextChunks(text, targetSize = 96)

        assertTrue(chunks.size > 1)
        assertEquals(text, chunks.joinToString("\n"))
    }

    @Test
    fun `completed streaming chunks stay stable when new frames append`() {
        val initial = (1..36).joinToString("\n") { "稳定行 $it：Compose" }
        val extended = initial + (37..52).joinToString(
            separator = "\n",
            prefix = "\n",
        ) { "新增行 $it：Compose" }
        val initialChunks = streamingTextChunks(initial, targetSize = 80)
        val extendedChunks = streamingTextChunks(extended, targetSize = 80)

        assertEquals(
            initialChunks.dropLast(1),
            extendedChunks.take(initialChunks.size - 1),
        )
        assertEquals(extended, extendedChunks.joinToString("\n"))
    }

    @Test
    fun `bottom follow includes lazy list trailing content padding`() {
        assertEquals(
            14,
            bottomScrollDistance(
                itemOffset = 200,
                itemSize = 600,
                afterContentPadding = 14,
                viewportEndOffset = 800,
            ),
        )
        assertEquals(
            0,
            bottomScrollDistance(
                itemOffset = 100,
                itemSize = 500,
                afterContentPadding = 14,
                viewportEndOffset = 800,
            ),
        )
    }

    private fun tool(name: String, state: String, vararg urls: String) = buildJsonObject {
        put("type", "tool-call")
        put("toolName", name)
        put("state", state)
        put("result", buildJsonObject {
            put("sources", buildJsonArray {
                urls.forEachIndexed { index, url ->
                    add(buildJsonObject {
                        put("title", "来源 ${index + 1}")
                        put("url", url)
                    })
                }
            })
        })
    }

    private fun reasoning(text: String, durationMs: Int) = buildJsonObject {
        put("type", "reasoning")
        put("text", text)
        put("durationMs", durationMs)
    }
}
