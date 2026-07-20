package com.linhub.android.core.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChunkedUploadPolicyTest {
    @Test
    fun `小附件保持单请求快速路径`() {
        assertFalse(shouldUseChunkedUpload(4 * 1024 * 1024 - 1))
    }

    @Test
    fun `大附件使用分块路径规避边缘超时`() {
        assertTrue(shouldUseChunkedUpload(4 * 1024 * 1024))
        assertTrue(shouldUseChunkedUpload(20 * 1024 * 1024))
    }
}
