package com.linhub.android.benchmark

import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun coldStartup() = benchmarkRule.measureRepeated(
        packageName = TARGET_PACKAGE,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = baselineProfileCompilationMode(),
        startupMode = StartupMode.COLD,
        iterations = 10,
        setupBlock = {
            assertTargetUsesBaselineProfile()
            pressHome()
        },
    ) {
        startActivityAndWait(benchmarkIntent())
        awaitStartupReady()
    }
}
