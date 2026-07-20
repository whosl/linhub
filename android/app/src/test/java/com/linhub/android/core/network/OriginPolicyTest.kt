package com.linhub.android.core.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OriginPolicyTest {
    private val server = "https://linhub.example:8443/".toHttpUrl()

    @Test
    fun `authorization is limited to the configured server origin`() {
        assertTrue("https://linhub.example:8443/api/media/one".toHttpUrl().hasSameOrigin(server))
        assertFalse("https://cdn.example/image.png".toHttpUrl().hasSameOrigin(server))
        assertFalse("http://linhub.example:8443/api/media/one".toHttpUrl().hasSameOrigin(server))
        assertFalse("https://linhub.example/api/media/one".toHttpUrl().hasSameOrigin(server))
    }
}
