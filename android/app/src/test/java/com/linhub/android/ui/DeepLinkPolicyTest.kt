package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeepLinkPolicyTest {
    private val token = "0123456789abcdef0123456789abcdef"

    @Test
    fun `parses web artifact share link`() {
        assertEquals(token, parseSharedArtifactToken("https://linhub.example/share/artifact/$token"))
    }

    @Test
    fun `parses custom app scheme`() {
        assertEquals(token, parseSharedArtifactToken("linhub://share/artifact/$token"))
    }

    @Test
    fun `rejects unrelated paths and weak tokens`() {
        assertNull(parseSharedArtifactToken("https://linhub.example/admin/$token"))
        assertNull(parseSharedArtifactToken("linhub://share/artifact/short"))
    }
}
