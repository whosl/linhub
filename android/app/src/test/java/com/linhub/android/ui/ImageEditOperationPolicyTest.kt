package com.linhub.android.ui

import com.linhub.android.core.cache.CachePayloadCodec
import com.linhub.android.core.network.ApiException
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageEditOperationPolicyTest {
    @Test
    fun `相同语义生成稳定操作键且输入变化会分离`() {
        val first = imageEditOperationKey(
            scope = "message:msg-1",
            oldUrl = "/api/media/original",
            prompt = "换成蓝色背景",
            maskPng = byteArrayOf(1, 2, 3),
        )
        val retry = imageEditOperationKey(
            scope = "message:msg-1",
            oldUrl = "/api/media/original",
            prompt = "  换成蓝色背景  ",
            maskPng = byteArrayOf(1, 2, 3),
        )

        assertEquals(first, retry)
        assertTrue(first.matches(Regex("^android-[a-f0-9]{48}$")))
        assertNotEquals(
            first,
            imageEditOperationKey(
                "message:msg-1",
                "/api/media/original",
                "换成蓝色背景",
                byteArrayOf(1, 2, 4),
            ),
        )
        assertNotEquals(
            first,
            imageEditOperationKey(
                "message:msg-1",
                "/api/media/original",
                "去掉背景",
                byteArrayOf(1, 2, 3),
            ),
        )
    }

    @Test
    fun `待提交记录可持久化并精确匹配原操作`() {
        val pending = PendingMessageImageEdit(
            messageId = "msg-1",
            oldUrl = "/api/media/old",
            prompt = "增加文字",
            operationKey = "android-123456789012345678901234567890123456789012345678",
            newUrl = "/api/media/new",
        )
        val restored = CachePayloadCodec.decodeOrNull<PendingMessageImageEdit>(
            CachePayloadCodec.encode(pending),
        )

        assertEquals(pending, restored)
        assertTrue(
            requireNotNull(restored).matches(
                "msg-1",
                "/api/media/old",
                " 增加文字 ",
                pending.operationKey,
            ),
        )
        assertFalse(restored.matches("msg-1", "/api/media/other", "增加文字", pending.operationKey))
    }

    @Test
    fun `只有未知网络结果与服务端错误保留恢复记录`() {
        assertTrue(shouldKeepPendingImageEdit(IOException("response lost")))
        assertTrue(shouldKeepPendingImageEdit(ApiException(502, "upstream timeout")))
        assertFalse(shouldKeepPendingImageEdit(ApiException(400, "invalid image")))
        assertFalse(shouldKeepPendingImageEdit(ApiException(402, "insufficient balance")))
    }
}
