package com.linhub.android.benchmark

import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StreamingChatBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun renderOneHundredTwentyStreamingFrames() = benchmarkRule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = baselineProfileCompilationMode(),
        iterations = 10,
        setupBlock = {
            assertTargetUsesBaselineProfile()
            killProcess()
            startActivityAndWait(benchmarkIntent(streamingChat = true))
            awaitStreamingChatReady()
        },
    ) {
        runStreamingChat()
    }
}
