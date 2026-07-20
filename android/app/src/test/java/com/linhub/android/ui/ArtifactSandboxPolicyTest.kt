package com.linhub.android.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ArtifactSandboxPolicyTest {
    @Test
    fun `javascript sandbox blocks network and escapes closing script tags`() {
        val document = buildSandboxDocument(
            code = "console.log('</script><script>bad()</script>')",
            language = "javascript",
            channel = "done-token",
        )

        assertTrue(document.contains("default-src 'none'"))
        assertFalse(document.contains("</script><script>bad()"))
        assertTrue(document.contains("done-token"))
    }

    @Test
    fun `python sandbox only declares pyodide cdn`() {
        val document = buildSandboxDocument("print('ok')", "python", "done-token")

        assertTrue(document.contains("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"))
        assertTrue(document.contains("'wasm-unsafe-eval'"))
        assertTrue(document.contains("Pyodide 运行时加载失败"))
        assertFalse(document.contains("allow-same-origin"))
    }

    @Test
    fun `svg preview preserves intrinsic ratio without webview viewport heights`() {
        val document = buildSvgPreviewDocument(
            "<svg width=\"800\" height=\"300\"><text>ok</text></svg>",
        )

        assertTrue(document.contains("max-width:100%"))
        assertTrue(document.contains("height:auto"))
        assertTrue(document.contains("viewBox=\"0 0 800 300\""))
        assertFalse(document.contains("100vh"))
        assertFalse(document.contains("height:100%"))
    }

    @Test
    fun `svg preview keeps existing viewbox unchanged`() {
        val source = "<svg viewBox=\"0 0 10 20\"><path /></svg>"

        assertTrue(buildSvgPreviewDocument(source).contains(source))
    }
}
