package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class McpHeaderPolicyTest {
    @Test
    fun `parses header values containing colons`() {
        val headers = parseMcpHeaderLines("Authorization: Bearer abc:def\nX-Tenant: tenant-1")

        assertEquals("Bearer abc:def", headers["Authorization"])
        assertEquals("tenant-1", headers["X-Tenant"])
    }

    @Test
    fun `rejects duplicates and transport controlled headers`() {
        assertThrows(IllegalArgumentException::class.java) {
            parseMcpHeaderLines("X-Key: one\nx-key: two")
        }
        assertThrows(IllegalArgumentException::class.java) {
            parseMcpHeaderLines("Host: internal.example")
        }
    }
}
