package com.linhub.android.core.audio

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class WavEncoderTest {
    @Test
    fun `encodes little endian pcm16 mono wav header`() {
        val pcm = byteArrayOf(1, 2, 3, 4)
        val wav = encodePcm16Wav(pcm, sampleRate = 16_000)
        val header = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)

        assertEquals("RIFF", wav.copyOfRange(0, 4).decodeToString())
        assertEquals(40, header.getInt(4))
        assertEquals("WAVE", wav.copyOfRange(8, 12).decodeToString())
        assertEquals(1, header.getShort(22).toInt())
        assertEquals(16_000, header.getInt(24))
        assertEquals(32_000, header.getInt(28))
        assertEquals(4, header.getInt(40))
        assertArrayEquals(pcm, wav.copyOfRange(44, wav.size))
    }
}
