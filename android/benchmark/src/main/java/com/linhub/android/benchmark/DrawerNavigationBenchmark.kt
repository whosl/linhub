package com.linhub.android.benchmark

import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DrawerNavigationBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun navigateAcrossWorkspaceDestinations() {
        var targets: DrawerNavigationTargets? = null
        benchmarkRule.measureRepeated(
            packageName = TARGET_PACKAGE,
            metrics = listOf(FrameTimingMetric()),
            compilationMode = baselineProfileCompilationMode(),
            iterations = 10,
            setupBlock = {
                assertTargetUsesBaselineProfile()
                killProcess()
                startActivityAndWait(benchmarkIntent(drawerNavigation = true))
                awaitStartupReady()
                targets = captureDrawerNavigationTargets()
            },
        ) {
            navigateDrawerDestinations(checkNotNull(targets))
        }
    }

    @Test
    fun navigateAcrossWorkspaceDestinationsWithoutProfile() {
        var targets: DrawerNavigationTargets? = null
        benchmarkRule.measureRepeated(
            packageName = TARGET_PACKAGE,
            metrics = listOf(FrameTimingMetric()),
            compilationMode = CompilationMode.None(),
            iterations = 10,
            setupBlock = {
                assertTargetDoesNotUseBaselineProfile()
                killProcess()
                startActivityAndWait(benchmarkIntent(drawerNavigation = true))
                awaitStartupReady()
                targets = captureDrawerNavigationTargets()
            },
        ) {
            navigateDrawerDestinations(checkNotNull(targets))
        }
    }
}
