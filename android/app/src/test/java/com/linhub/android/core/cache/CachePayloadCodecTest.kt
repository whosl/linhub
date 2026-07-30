package com.linhub.android.core.cache

import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.MediaPage
import com.linhub.android.core.model.SkillRunSnapshot
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

        val run = SkillRunSnapshot(
            id = "run-cache",
            conversationId = "conversation-cache",
            kind = "deep-research",
            skillName = "深度调研",
            status = "running",
            stageLabel = "正在整理来源",
            progress = 67,
            sourceCount = 12,
            createdAt = "2026-07-23T00:00:00Z",
            updatedAt = "2026-07-23T00:00:01Z",
        )
        assertEquals(
            run,
            CachePayloadCodec.decodeOrNull<SkillRunSnapshot>(CachePayloadCodec.encode(run)),
        )
    }
}
