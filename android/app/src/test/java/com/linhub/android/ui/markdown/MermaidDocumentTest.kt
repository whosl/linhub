package com.linhub.android.ui.markdown

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MermaidDocumentTest {
    @Test
    fun `authorizes only the trusted bootstrap module`() {
        val document = mermaidDocument("flowchart LR\nA --> B", darkTheme = false)

        assertTrue(document.contains("script-src 'nonce-linhub-mermaid' https://cdn.jsdelivr.net"))
        assertTrue(document.contains("<script type=\"module\" nonce=\"linhub-mermaid\">"))
        assertTrue(document.contains("await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')"))
        assertFalse(document.contains("script-src 'unsafe-inline'"))
    }

    @Test
    fun `escapes diagram source before placing it in html`() {
        val document = mermaidDocument("A <script>alert(1)</script> B", darkTheme = true)

        assertTrue(document.contains("A &lt;script&gt;alert(1)&lt;/script&gt; B"))
        assertFalse(document.contains("<script>alert(1)</script>"))
    }
}
