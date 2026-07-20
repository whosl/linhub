package com.linhub.android.core.audio

import java.nio.ByteBuffer
import java.nio.ByteOrder

internal fun encodePcm16Wav(
    pcm: ByteArray,
    sampleRate: Int = 16_000,
    channelCount: Int = 1,
): ByteArray {
    require(sampleRate > 0)
    require(channelCount > 0)
    val bitsPerSample = 16
    val byteRate = sampleRate * channelCount * bitsPerSample / 8
    val blockAlign = channelCount * bitsPerSample / 8
    return ByteBuffer.allocate(WAV_HEADER_BYTES + pcm.size)
        .order(ByteOrder.LITTLE_ENDIAN)
        .apply {
            put("RIFF".encodeToByteArray())
            putInt(36 + pcm.size)
            put("WAVE".encodeToByteArray())
            put("fmt ".encodeToByteArray())
            putInt(16)
            putShort(1)
            putShort(channelCount.toShort())
            putInt(sampleRate)
            putInt(byteRate)
            putShort(blockAlign.toShort())
            putShort(bitsPerSample.toShort())
            put("data".encodeToByteArray())
            putInt(pcm.size)
            put(pcm)
        }
        .array()
}

private const val WAV_HEADER_BYTES = 44
