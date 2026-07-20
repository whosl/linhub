package com.linhub.android.benchmark

import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LongChatScrollBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun scrollOneThousandMessages() = benchmarkRule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = baselineProfileCompilationMode(),
        iterations = 10,
        setupBlock = {
            assertTargetUsesBaselineProfile()
            killProcess()
            startActivityAndWait(benchmarkIntent(longChat = true))
            awaitLongChatReady()
        },
    ) {
        scrollLongChat()
    }

    @Test
    fun scrollOneThousandMessagesWithoutRail() = benchmarkRule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = baselineProfileCompilationMode(),
        iterations = 10,
        setupBlock = {
            assertTargetUsesBaselineProfile()
            killProcess()
            startActivityAndWait(benchmarkIntent(longChat = true, messageRailEnabled = false))
            awaitLongChatReady()
        },
    ) {
        scrollLongChat()
    }
}
