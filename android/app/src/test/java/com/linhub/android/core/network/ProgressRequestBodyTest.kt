package com.linhub.android.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProgressRequestBodyTest {
    @Test
    fun `reports monotonic byte progress and preserves payload`() {
        val bytes = ByteArray(180_000) { (it % 251).toByte() }
        val reports = mutableListOf<Pair<Long, Long>>()
        val body = ProgressRequestBody(
            bytes.toRequestBody("application/octet-stream".toMediaType()),
        ) { written, total -> reports += written to total }
        val sink = Buffer()

        body.writeTo(sink)

        assertArrayEquals(bytes, sink.readByteArray())
        assertTrue(reports.zipWithNext().all { (first, second) -> first.first <= second.first })
        assertEquals(bytes.size.toLong(), reports.last().first)
        assertEquals(bytes.size.toLong(), reports.last().second)
    }
}
