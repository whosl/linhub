package com.linhub.android.ui

import com.linhub.android.core.network.ApiException
import java.nio.ByteBuffer
import java.security.MessageDigest
import kotlinx.serialization.Serializable

@Serializable
internal data class PendingMessageImageEdit(
    val messageId: String,
    val oldUrl: String,
    val prompt: String,
    val operationKey: String,
    val newUrl: String? = null,
)

/** 相同图片、描述和蒙版得到稳定操作键；改变任一输入会创建新语义操作。 */
internal fun imageEditOperationKey(
    scope: String,
    oldUrl: String,
    prompt: String,
    maskPng: ByteArray?,
): String {
    val digest = MessageDigest.getInstance("SHA-256")
    fun update(bytes: ByteArray) {
        digest.update(ByteBuffer.allocate(Int.SIZE_BYTES).putInt(bytes.size).array())
        digest.update(bytes)
    }
    update(scope.toByteArray(Charsets.UTF_8))
    update(oldUrl.toByteArray(Charsets.UTF_8))
    update(prompt.trim().toByteArray(Charsets.UTF_8))
    update(maskPng ?: ByteArray(0))
    return "android-${digest.digest().take(24).joinToString("") {
        "%02x".format(it.toInt() and 0xff)
    }}"
}

internal fun PendingMessageImageEdit.matches(
    messageId: String,
    oldUrl: String,
    prompt: String,
    operationKey: String,
): Boolean = this.messageId == messageId &&
    this.oldUrl == oldUrl &&
    this.prompt == prompt.trim() &&
    this.operationKey == operationKey

/** 网络中断或 5xx 可能发生在服务端已完成之后；明确 4xx 则无需查询恢复。 */
internal fun shouldKeepPendingImageEdit(error: Throwable): Boolean =
    error !is ApiException || error.status >= 500
