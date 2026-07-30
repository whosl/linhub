package com.linhub.android

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.linhub.android.core.cache.CacheDatabaseManager
import com.linhub.android.core.audio.SpeechPlaybackController
import com.linhub.android.core.network.LinHubApi
import com.linhub.android.core.network.NetworkMonitor
import com.linhub.android.core.network.SessionStore
import com.linhub.android.core.network.UiPreferenceStore
import java.io.ByteArrayOutputStream

data class PickedContent(
    val name: String,
    val mimeType: String,
    val bytes: ByteArray,
)

class AppContainer(context: Context) {
    private val applicationContext = context.applicationContext
    val sessionStore = SessionStore(applicationContext)
    val api = LinHubApi(applicationContext, sessionStore)
    val networkMonitor = NetworkMonitor(applicationContext)
    val cacheDatabaseManager = CacheDatabaseManager(applicationContext)
    val uiPreferenceStore = UiPreferenceStore(applicationContext)
    val speechPlaybackController = SpeechPlaybackController(applicationContext)

    fun writeContent(uri: Uri, bytes: ByteArray) {
        applicationContext.contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) }
            ?: error("无法写入所选位置")
    }

    fun readContent(uri: Uri, maxBytes: Int): PickedContent {
        var name = uri.lastPathSegment ?: "文件"
        var declaredSize = -1L
        applicationContext.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
            null,
            null,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) declaredSize = cursor.getLong(sizeIndex)
            }
        }
        require(declaredSize <= maxBytes || declaredSize < 0) {
            "「$name」不能超过 ${maxBytes / 1024 / 1024}MB"
        }
        val bytes = applicationContext.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream(
                declaredSize.coerceIn(0, maxBytes.toLong()).toInt(),
            )
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= maxBytes) {
                    "「$name」不能超过 ${maxBytes / 1024 / 1024}MB"
                }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("无法读取「$name」")
        return PickedContent(
            name = name,
            mimeType = applicationContext.contentResolver.getType(uri) ?: "application/octet-stream",
            bytes = bytes,
        )
    }
}
