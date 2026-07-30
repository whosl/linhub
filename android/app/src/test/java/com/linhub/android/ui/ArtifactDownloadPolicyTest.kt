package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ArtifactDownloadPolicyTest {
    @Test
    fun `code language extensions match web aliases`() {
        assertEquals("demo.js", artifactDownloadFileName("demo", "code", "javascript"))
        assertEquals("demo.ts", artifactDownloadFileName("demo", "code", "text/typescript"))
        assertEquals("demo.py", artifactDownloadFileName("demo", "code", "python"))
        assertEquals("demo.cpp", artifactDownloadFileName("demo", "code", "c++"))
        assertEquals("demo.cs", artifactDownloadFileName("demo", "code", "c#"))
    }

    @Test
    fun `known artifact kinds and unsafe title characters use stable names`() {
        assertEquals("作品_验收.html", artifactDownloadFileName("作品/验收", "html", null))
        assertEquals("artifact.mmd", artifactDownloadFileName("  ", "mermaid", null))
        assertEquals("code.txt", artifactDownloadFileName("code", "code", "..."))
    }
}
