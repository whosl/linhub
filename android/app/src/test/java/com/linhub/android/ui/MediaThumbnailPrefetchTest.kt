package com.linhub.android.ui

import com.linhub.android.core.model.MediaAsset
import org.junit.Assert.assertEquals
import org.junit.Test

class MediaThumbnailPrefetchTest {
    @Test
    fun `prefetch selects first six unique images and skips non-images`() {
        val assets = listOf(
            asset("doc", "text/plain", "/api/media/doc"),
            asset("one", "image/png", "/api/media/one"),
            asset("duplicate", "image/png", "/api/media/one"),
            asset("two", "image/jpeg", "/api/media/two"),
            asset("three", "image/webp", "/api/media/three"),
            asset("four", "image/png", "/api/media/four"),
            asset("five", "image/png", "/api/media/five"),
            asset("six", "image/png", "/api/media/six"),
            asset("seven", "image/png", "/api/media/seven"),
        )

        assertEquals(
            listOf(
                "/api/media/one",
                "/api/media/two",
                "/api/media/three",
                "/api/media/four",
                "/api/media/five",
                "/api/media/six",
            ),
            mediaThumbnailPrefetchUrls(assets),
        )
    }

    @Test
    fun `prefetch respects disabled limit and resolves relative media URLs`() {
        assertEquals(emptyList<String>(), mediaThumbnailPrefetchUrls(listOf(
            asset("one", "image/png", "/api/media/one"),
        ), limit = 0))
        assertEquals(
            "https://linhub.example/api/media/one",
            resolvePrefetchMediaUrl("/api/media/one", "https://linhub.example/"),
        )
        assertEquals(
            "https://cdn.example/image.png",
            resolvePrefetchMediaUrl("https://cdn.example/image.png", "https://linhub.example/"),
        )
    }

    private fun asset(id: String, mimeType: String, url: String) = MediaAsset(
        id = id,
        ownerId = "user-test",
        kind = "upload",
        name = "$id.bin",
        mimeType = mimeType,
        size = 128,
        url = url,
        createdAt = "2026-07-14T00:00:00.000Z",
    )
}
