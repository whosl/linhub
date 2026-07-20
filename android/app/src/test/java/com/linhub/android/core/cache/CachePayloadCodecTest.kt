package com.linhub.android.core.cache

import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.MediaPage
import org.junit.Assert.assertEquals
import org.junit.Test

class CachePayloadCodecTest {
    @Test
    fun `round trips workspace payloads`() {
        val styles = listOf(ChatStyle("style-one", "简洁", "少说", builtIn = true))
        val page = MediaPage(
            items = listOf(
                MediaAsset(
                    id = "media-one",
                    ownerId = "user-one",
                    kind = "upload",
                    name = "image.png",
                    mimeType = "image/png",
                    size = 10,
                    url = "/api/media/media-one",
                    createdAt = "2026-07-10T00:00:00Z",
                ),
            ),
            nextCursor = "cursor-two",
        )

        assertEquals(styles, CachePayloadCodec.decodeOrNull<List<ChatStyle>>(CachePayloadCodec.encode(styles)))
        assertEquals(page, CachePayloadCodec.decodeOrNull<MediaPage>(CachePayloadCodec.encode(page)))
    }
}
