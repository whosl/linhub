package com.linhub.android.ui.markdown

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MarkdownEngineTest {
    @Test
    fun `standalone hyphen rule after prose stays a divider instead of setext heading`() {
        val document = MarkdownEngine.parse(
            "第一行\n第二行。\n---\n下一段",
        )

        assertFalse(document.blocks.any { it is MarkdownBlock.Heading })
        assertTrue(document.blocks[0] is MarkdownBlock.Paragraph)
        assertTrue(document.blocks[1] is MarkdownBlock.Divider)
        assertTrue(document.blocks[2] is MarkdownBlock.Paragraph)
    }

    @Test
    fun `only explicit quote lines stay inside blockquote`() {
        val document = MarkdownEngine.parse(
            "> **「余烬酒馆」**\n> *余烬尚温，酒可暖人*\n店里并不算热闹。",
        )

        assertTrue(document.blocks[0] is MarkdownBlock.Quote)
        assertTrue(document.blocks[1] is MarkdownBlock.Paragraph)
        assertEquals(2, document.blocks.size)
    }

    @Test
    fun `normalization leaves fenced code tables and setext h1 unchanged`() {
        val source = """
            ```text
            正文
            ---
            ```

            | 名称 | 数量 |
            | --- | ---: |
            | 苹果 | 2 |

            一级标题
            ===
        """.trimIndent()

        val normalized = normalizeMarkdownBlockBoundaries(source)

        assertTrue(normalized.contains("正文\n---\n```"))
        assertTrue(normalized.contains("| --- | ---: |"))
        val document = MarkdownEngine.parse(normalized)
        assertTrue(document.blocks.any { it is MarkdownBlock.Code })
        assertTrue(document.blocks.any { it is MarkdownBlock.Table })
        assertTrue(document.blocks.any { it is MarkdownBlock.Heading && it.level == 1 })
    }

    @Test
    fun `normalization preserves yaml frontmatter delimiters`() {
        val source = "---\ntitle: 文档\ntags: [a, b]\n---\n正文"

        assertEquals(source, normalizeMarkdownBlockBoundaries(source))
    }

    @Test
    fun `prewarm fills the shared cache without changing parsed output`() {
        MarkdownEngine.clearCache()
        val sources = List(32) { index -> "## 标题 $index\n\n- 项目 A\n- 项目 B" }

        MarkdownEngine.prewarm(sources)

        assertTrue(sources.all(MarkdownEngine::isCached))
        assertEquals(2, MarkdownEngine.parse(sources.last()).blocks.size)
    }

    @Test
    fun `thread local parsers safely populate cache concurrently`() {
        MarkdownEngine.clearCache()
        val sources = List(80) { index ->
            "### 并发文档 $index\n\n包含 **粗体** 和 [链接](https://example.com/$index)。"
        }
        val pool = Executors.newFixedThreadPool(4)

        try {
            val futures = sources.map { source ->
                pool.submit<MarkdownDocument> { MarkdownEngine.parse(source) }
            }
            val documents = futures.map { it.get(5, TimeUnit.SECONDS) }

            assertTrue(documents.all { it.blocks.size == 2 })
            assertTrue(sources.all(MarkdownEngine::isCached))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `parses commonmark structure and inline styles`() {
        val document = MarkdownEngine.parse(
            """
            # 标题

            这是 **粗体**、*斜体*、~~删除~~ 和 [链接](https://example.com)。

            > 引用

            1. 第一项
            2. 第二项
            """.trimIndent(),
        )

        assertTrue(document.blocks[0] is MarkdownBlock.Heading)
        val paragraph = document.blocks[1] as MarkdownBlock.Paragraph
        assertTrue(paragraph.content.any { it is MarkdownInline.Strong })
        assertTrue(paragraph.content.any { it is MarkdownInline.Emphasis })
        assertTrue(paragraph.content.any { it is MarkdownInline.Strike })
        assertTrue(paragraph.content.any { it is MarkdownInline.Link })
        assertTrue(document.blocks.any { it is MarkdownBlock.Quote })
        assertTrue(document.blocks.any { it is MarkdownBlock.ListBlock && it.ordered })
    }

    @Test
    fun `parses fenced code and gfm table`() {
        val document = MarkdownEngine.parse(
            """
            ```kotlin
            val answer = 42
            ```

            | 名称 | 数量 |
            | --- | ---: |
            | 苹果 | 2 |
            """.trimIndent(),
        )

        val code = document.blocks.filterIsInstance<MarkdownBlock.Code>().single()
        assertEquals("kotlin", code.language)
        assertTrue(code.literal.contains("answer"))
        val table = document.blocks.filterIsInstance<MarkdownBlock.Table>().single()
        assertEquals(2, table.header.size)
        assertEquals(1, table.rows.size)
    }

    @Test
    fun `autolinks plain urls`() {
        val paragraph = MarkdownEngine.parse("访问 https://example.com/path").blocks.single()
            as MarkdownBlock.Paragraph

        assertTrue(paragraph.content.any { it is MarkdownInline.Link })
    }

    @Test
    fun `parses inline and display math without touching fenced code`() {
        val document = MarkdownEngine.parse(
            """
            欧拉公式是 ${'$'}e^{i\\pi}+1=0${'$'}。

            ${'$'}${'$'}
            \\frac{a}{b} = c
            ${'$'}${'$'}

            ```text
            ${'$'}${'$'}not math${'$'}${'$'}
            ```
            """.trimIndent(),
        )

        val paragraph = document.blocks.first() as MarkdownBlock.Paragraph
        assertTrue(paragraph.content.any { it is MarkdownInline.Math })
        assertTrue(document.blocks.any { it is MarkdownBlock.Math })
        assertTrue(document.blocks.filterIsInstance<MarkdownBlock.Code>()
            .single().literal.contains("not math"))
    }

    @Test
    fun `formats common inline latex as readable unicode`() {
        assertEquals("x² + α ≤ 3", LatexUnicodeFormatter.format("x^{2} + \\alpha \\le 3"))
        assertEquals("a⁄b", LatexUnicodeFormatter.format("\\frac{a}{b}"))
    }

    @Test
    fun `keeps gfm task markers available to the renderer`() {
        val list = MarkdownEngine.parse("- [x] 已完成\n- [ ] 待处理")
            .blocks.single() as MarkdownBlock.ListBlock

        assertEquals(2, list.items.size)
        val first = list.items.first().first() as MarkdownBlock.Paragraph
        assertTrue((first.content.first() as MarkdownInline.Text).value.startsWith("[x]"))
    }

    @Test
    fun `parses footnote references and definitions outside code fences`() {
        val document = MarkdownEngine.parse(
            """
            结论来自研究[^source]。

            [^source]: 第一行说明
                第二行说明

            ```text
            [^raw]: 代码内容
            ```
            """.trimIndent(),
        )

        val paragraph = document.blocks.first() as MarkdownBlock.Paragraph
        assertTrue(paragraph.content.any { it is MarkdownInline.Footnote && it.label == "source" })
        val footnotes = document.blocks.filterIsInstance<MarkdownBlock.Footnotes>().single()
        assertEquals("source", footnotes.entries.single().label)
        assertTrue(document.blocks.filterIsInstance<MarkdownBlock.Code>()
            .single().literal.contains("[^raw]"))
    }
}
