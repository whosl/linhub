package com.linhub.android.ui.markdown

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MarkdownPresentationPolicyTest {
    @Test
    fun `message code runner matches web runnable languages`() {
        assertEquals("python", markdownRunnableLanguage("python"))
        assertEquals("python", markdownRunnableLanguage(" PY "))
        assertEquals("javascript", markdownRunnableLanguage("javascript"))
        assertEquals("javascript", markdownRunnableLanguage("JS"))
        assertEquals("html", markdownRunnableLanguage("html"))
        assertNull(markdownRunnableLanguage("kotlin"))
        assertNull(markdownRunnableLanguage(null))
    }

    @Test
    fun `code line count handles empty trailing and multi line input`() {
        assertEquals(1, markdownCodeLineCount(""))
        assertEquals(1, markdownCodeLineCount("println(1)"))
        assertEquals(3, markdownCodeLineCount("one\ntwo\nthree"))
        assertEquals(3, markdownCodeLineCount("one\ntwo\n"))
    }
}
