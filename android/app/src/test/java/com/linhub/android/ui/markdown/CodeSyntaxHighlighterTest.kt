package com.linhub.android.ui.markdown

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CodeSyntaxHighlighterTest {
    @Test
    fun `highlights kotlin keywords strings numbers and comments`() {
        val source = "val answer = 42 // 结果\nprintln(\"ok\")"
        val tokens = CodeSyntaxHighlighter.highlight("kt", source)

        assertToken(tokens, source, "val", SyntaxTokenKind.Keyword)
        assertToken(tokens, source, "42", SyntaxTokenKind.Number)
        assertToken(tokens, source, "// 结果", SyntaxTokenKind.Comment)
        assertToken(tokens, source, "\"ok\"", SyntaxTokenKind.String)
    }

    @Test
    fun `normalizes language aliases and keeps token ranges valid`() {
        val source = "async function load() { return true }"
        val tokens = CodeSyntaxHighlighter.highlight("tsx", source)

        assertTrue(tokens.isNotEmpty())
        assertTrue(tokens.all { it.start >= 0 && it.endExclusive <= source.length })
        assertEquals("async", source.substring(tokens.first().start, tokens.first().endExclusive))
    }

    private fun assertToken(
        tokens: List<SyntaxToken>,
        source: String,
        expectedText: String,
        expectedKind: SyntaxTokenKind,
    ) {
        assertTrue(tokens.any { token ->
            token.kind == expectedKind &&
                source.substring(token.start, token.endExclusive) == expectedText
        })
    }
}
