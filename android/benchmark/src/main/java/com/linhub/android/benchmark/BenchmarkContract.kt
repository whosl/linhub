package com.linhub.android.benchmark

import android.content.Intent
import android.graphics.Point
import android.os.SystemClock
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until

internal const val TARGET_PACKAGE = "com.linhub.android.benchmark"
private const val TARGET_ACTIVITY = "com.linhub.android.MainActivity"
private const val SCENARIO_EXTRA = "com.linhub.android.extra.BENCHMARK_SCENARIO"
private const val LONG_CHAT_SCENARIO = "long-chat"
private const val LONG_CHAT_NO_RAIL_SCENARIO = "long-chat-no-rail"
private const val DRAWER_NAVIGATION_SCENARIO = "drawer-navigation"
private const val WORKSPACE_SMOKE_SCENARIO = "workspace-smoke"
private const val WORKSPACE_INTERACTION_SCENARIO = "workspace-interaction"
private const val STREAMING_CHAT_SCENARIO = "streaming-chat"
private const val STREAMING_TRIGGER_EXTRA =
    "com.linhub.android.extra.BENCHMARK_STREAMING_TRIGGER"
private const val STREAMING_DONE_MARKER = "STREAMING_BENCHMARK_DONE"
private const val UI_TIMEOUT_MILLIS = 15_000L

internal fun baselineProfileCompilationMode(): CompilationMode = CompilationMode.Partial(
    baselineProfileMode = BaselineProfileMode.Require,
)

/**
 * AndroidX 的 benchmark JSON context 在 Android 17 AVD 上可能仍记录安装前的 `verify`。
 * 直接读取 ART dexopt 状态，保证正式测量前目标 APK 已真正使用内嵌 Baseline Profile。
 */
internal fun MacrobenchmarkScope.assertTargetUsesBaselineProfile() {
    val status = targetDexoptStatus()
    check(status == "speed-profile") {
        "目标包未使用 Baseline Profile，当前 dexopt status=${status ?: "missing"}"
    }
}

internal fun MacrobenchmarkScope.assertTargetDoesNotUseBaselineProfile() {
    val status = targetDexoptStatus()
    check(status != null && status != "speed-profile") {
        "无 Profile 对照仍处于 speed-profile，当前 dexopt status=${status ?: "missing"}"
    }
}

private fun MacrobenchmarkScope.targetDexoptStatus(): String? {
    val dump = device.executeShellCommand("dumpsys package dexopt")
    val marker = "[$TARGET_PACKAGE]"
    val markerIndex = dump.indexOf(marker)
    if (markerIndex < 0) return null
    val sectionStart = markerIndex + marker.length
    val sectionEnd = dump.indexOf("\n  [", startIndex = sectionStart)
        .let { if (it < 0) dump.length else it }
    return Regex("\\[status=([^]]+)]")
        .find(dump.substring(sectionStart, sectionEnd))
        ?.groupValues
        ?.getOrNull(1)
}

internal fun benchmarkIntent(
    longChat: Boolean = false,
    messageRailEnabled: Boolean = true,
    drawerNavigation: Boolean = false,
    workspaceSmoke: Boolean = false,
    workspaceInteraction: Boolean = false,
    streamingChat: Boolean = false,
): Intent =
    Intent(Intent.ACTION_MAIN).apply {
        // Android 17 不再可靠解析 Macrobenchmark 仅带 package 的隐式 launcher Intent。
        // 显式组件同时兼容当前预览系统和既有 Android 版本。
        setClassName(TARGET_PACKAGE, TARGET_ACTIVITY)
        addCategory(Intent.CATEGORY_LAUNCHER)
        if (longChat) {
            putExtra(
                SCENARIO_EXTRA,
                if (messageRailEnabled) LONG_CHAT_SCENARIO else LONG_CHAT_NO_RAIL_SCENARIO,
            )
        } else if (streamingChat) {
            putExtra(SCENARIO_EXTRA, STREAMING_CHAT_SCENARIO)
        } else if (drawerNavigation) {
            putExtra(SCENARIO_EXTRA, DRAWER_NAVIGATION_SCENARIO)
        } else if (workspaceSmoke) {
            putExtra(SCENARIO_EXTRA, WORKSPACE_SMOKE_SCENARIO)
        } else if (workspaceInteraction) {
            putExtra(SCENARIO_EXTRA, WORKSPACE_INTERACTION_SCENARIO)
        }
    }

internal fun streamingBenchmarkTriggerIntent(): Intent =
    Intent(Intent.ACTION_MAIN).apply {
        setClassName(TARGET_PACKAGE, TARGET_ACTIVITY)
        addCategory(Intent.CATEGORY_LAUNCHER)
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra(SCENARIO_EXTRA, STREAMING_CHAT_SCENARIO)
        putExtra(STREAMING_TRIGGER_EXTRA, true)
    }

internal fun MacrobenchmarkScope.awaitStartupReady() {
    // 首页问候会随时段变化；基准只锚定专用用户名称，避免跨时段误报启动失败。
    check(device.wait(Until.hasObject(By.textContains("性能测试")), UI_TIMEOUT_MILLIS)) {
        "等待基准启动页超时"
    }
}

internal fun MacrobenchmarkScope.awaitLongChatReady() {
    check(device.wait(Until.hasObject(By.text("性能基准长会话")), UI_TIMEOUT_MILLIS)) {
        "等待 1,000 条消息基准会话超时"
    }
    check(device.wait(Until.hasObject(By.desc("聊天消息列表")), UI_TIMEOUT_MILLIS)) {
        "等待聊天消息列表超时"
    }
    device.waitForIdle()
}

internal fun MacrobenchmarkScope.awaitStreamingChatReady() {
    check(device.wait(Until.hasObject(By.text("流式性能基准")), UI_TIMEOUT_MILLIS)) {
        "等待流式基准会话超时"
    }
    check(device.wait(Until.hasObject(By.desc("聊天消息列表")), UI_TIMEOUT_MILLIS)) {
        "等待流式基准消息列表超时"
    }
    check(device.wait(Until.hasObject(By.text("生成中")), UI_TIMEOUT_MILLIS)) {
        "等待流式回复初始状态超时"
    }
    device.waitForIdle()
}

internal fun MacrobenchmarkScope.runStreamingChat() {
    startActivityAndWait(streamingBenchmarkTriggerIntent())
    check(device.wait(Until.hasObject(By.textContains(STREAMING_DONE_MARKER)), UI_TIMEOUT_MILLIS)) {
        "等待流式性能基准完成超时"
    }
}

internal fun MacrobenchmarkScope.scrollLongChat() {
    val x = device.displayWidth / 2
    val upperY = (device.displayHeight * 0.30f).toInt()
    val lowerY = (device.displayHeight * 0.72f).toInt()
    repeat(4) {
        check(device.swipe(x, upperY, x, lowerY, 18)) { "向历史消息滚动失败" }
    }
    repeat(4) {
        check(device.swipe(x, lowerY, x, upperY, 18)) { "向最新消息滚动失败" }
    }
    device.waitForIdle()
}

internal data class DrawerNavigationTargets(
    val menu: Point,
    val destinations: List<Point>,
)

/** 在不计入性能样本的 setup 阶段解析语义节点，测量区只注入真实触摸。 */
internal fun MacrobenchmarkScope.captureDrawerNavigationTargets(): DrawerNavigationTargets {
    val menu = device.wait(Until.findObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)
    checkNotNull(menu) { "等待侧栏入口超时" }
    val menuPoint = menu.visibleCenter
    check(device.click(menuPoint.x, menuPoint.y)) { "点击侧栏入口失败" }
    device.waitForIdle()
    SystemClock.sleep(700)

    val destinations = listOf("项目", "技能", "知识库", "文件", "新对话").map { label ->
        val item = device.wait(Until.findObject(By.text(label)), UI_TIMEOUT_MILLIS)
        checkNotNull(item) { "等待侧栏目的地「$label」超时" }
        item.visibleCenter
    }

    device.pressBack()
    check(device.wait(Until.hasObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)) {
        "准备侧栏导航基准时关闭抽屉超时"
    }
    device.waitForIdle()
    return DrawerNavigationTargets(menuPoint, destinations)
}

internal fun MacrobenchmarkScope.navigateDrawerDestinations(targets: DrawerNavigationTargets) {
    targets.destinations.forEachIndexed { index, destination ->
        check(device.click(targets.menu.x, targets.menu.y)) { "第 ${index + 1} 次打开侧栏失败" }
        SystemClock.sleep(700)
        check(device.click(destination.x, destination.y)) { "第 ${index + 1} 次选择目的地失败" }
        SystemClock.sleep(700)
    }
    device.waitForIdle()
    check(device.wait(Until.hasObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)) {
        "侧栏导航基准未回到新对话页"
    }
}
