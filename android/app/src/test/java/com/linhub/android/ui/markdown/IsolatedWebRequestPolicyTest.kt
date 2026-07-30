package com.linhub.android.ui.markdown

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IsolatedWebRequestPolicyTest {
    @Test
    fun `allows local inline document and resources`() {
        assertTrue(isAllowedIsolatedPreviewRequest("data", null))
        assertTrue(isAllowedIsolatedPreviewRequest("DATA", null))
        assertTrue(isAllowedIsolatedPreviewRequest("about", null))
    }

    @Test
    fun `allows only jsdelivr over https`() {
        assertTrue(isAllowedIsolatedPreviewRequest("https", "cdn.jsdelivr.net"))
        assertTrue(isAllowedIsolatedPreviewRequest("HTTPS", "CDN.JSDELIVR.NET"))
        assertFalse(isAllowedIsolatedPreviewRequest("http", "cdn.jsdelivr.net"))
        assertFalse(isAllowedIsolatedPreviewRequest("https", "example.com"))
    }

    @Test
    fun `blocks file content and unknown requests`() {
        assertFalse(isAllowedIsolatedPreviewRequest("file", null))
        assertFalse(isAllowedIsolatedPreviewRequest("content", null))
        assertFalse(isAllowedIsolatedPreviewRequest(null, null))
    }
}
