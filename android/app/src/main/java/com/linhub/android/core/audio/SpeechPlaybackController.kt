package com.linhub.android.core.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class SpeechPlaybackController(context: Context) {
    private val cacheDir = context.applicationContext.cacheDir.resolve("speech").apply { mkdirs() }
    private var player: MediaPlayer? = null
    private var audioFile: File? = null

    suspend fun play(audio: ByteArray, onEnded: () -> Unit) {
        require(audio.isNotEmpty()) { "语音内容为空" }
        val file = withContext(Dispatchers.IO) {
            File.createTempFile("linhub-tts-", ".mp3", cacheDir).apply { writeBytes(audio) }
        }
        withContext(Dispatchers.Main.immediate) {
            stop()
            audioFile = file
            suspendCancellableCoroutine { continuation ->
                val next = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build(),
                    )
                    setDataSource(file.absolutePath)
                }
                player = next
                next.setOnPreparedListener {
                    it.start()
                    if (continuation.isActive) continuation.resume(Unit)
                }
                next.setOnCompletionListener {
                    release(it)
                    onEnded()
                }
                next.setOnErrorListener { mediaPlayer, what, extra ->
                    val error = IllegalStateException("音频播放失败（$what/$extra）")
                    release(mediaPlayer)
                    if (continuation.isActive) continuation.resumeWithException(error) else onEnded()
                    true
                }
                continuation.invokeOnCancellation { release(next) }
                next.prepareAsync()
            }
        }
    }

    fun stop() {
        player?.let(::release)
    }

    private fun release(target: MediaPlayer) {
        if (player === target) player = null
        runCatching { target.stop() }
        target.reset()
        target.release()
        audioFile?.delete()
        audioFile = null
    }
}
