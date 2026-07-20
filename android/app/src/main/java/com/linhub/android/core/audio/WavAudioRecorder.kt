package com.linhub.android.core.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.ByteArrayOutputStream
import kotlin.concurrent.thread

class WavAudioRecorder {
    @Volatile
    private var recording = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var pcmOutput: ByteArrayOutputStream? = null

    val isRecording: Boolean get() = recording

    @SuppressLint("MissingPermission")
    @Synchronized
    fun start() {
        check(!recording) { "录音已经开始" }
        val minimum = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        check(minimum > 0) { "设备不支持 16kHz 单声道录音" }
        val bufferSize = maxOf(minimum, SAMPLE_RATE)
        val recorder = AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(bufferSize * 2)
            .build()
        check(recorder.state == AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            "无法初始化麦克风"
        }

        val output = ByteArrayOutputStream()
        audioRecord = recorder
        pcmOutput = output
        recorder.startRecording()
        check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            recorder.release()
            audioRecord = null
            pcmOutput = null
            "无法开始录音"
        }
        recording = true
        recordingThread = thread(name = "linhub-voice-recorder", isDaemon = true) {
            val buffer = ByteArray(bufferSize)
            while (recording) {
                val count = recorder.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
                if (count > 0) output.write(buffer, 0, count)
            }
        }
    }

    fun stop(): ByteArray {
        val recorder: AudioRecord
        val worker: Thread?
        val output: ByteArrayOutputStream
        synchronized(this) {
            recorder = audioRecord ?: error("录音尚未开始")
            worker = recordingThread
            output = checkNotNull(pcmOutput)
            recording = false
        }
        runCatching { recorder.stop() }
        worker?.join(1_500)
        synchronized(this) {
            recorder.release()
            audioRecord = null
            recordingThread = null
            pcmOutput = null
        }
        val pcm = output.toByteArray()
        check(pcm.isNotEmpty()) { "没有录到声音" }
        return encodePcm16Wav(pcm, SAMPLE_RATE)
    }

    fun cancel() {
        val recorder = synchronized(this) {
            recording = false
            audioRecord
        } ?: return
        runCatching { recorder.stop() }
        recordingThread?.join(500)
        synchronized(this) {
            recorder.release()
            audioRecord = null
            recordingThread = null
            pcmOutput = null
        }
    }

    private companion object {
        const val SAMPLE_RATE = 16_000
    }
}
