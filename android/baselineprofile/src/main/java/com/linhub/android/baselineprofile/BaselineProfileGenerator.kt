package com.linhub.android.baselineprofile

import android.content.Intent
import android.graphics.Point
import android.os.SystemClock
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

private const val TARGET_PACKAGE = "com.linhub.android"
private const val TARGET_ACTIVITY = "com.linhub.android.MainActivity"
private const val SCENARIO_EXTRA = "com.linhub.android.extra.BENCHMARK_SCENARIO"
private const val STREAMING_TRIGGER_EXTRA =
    "com.linhub.android.extra.BENCHMARK_STREAMING_TRIGGER"
private const val LONG_CHAT_SCENARIO = "long-chat"
private const val DRAWER_NAVIGATION_SCENARIO = "drawer-navigation"
private const val STREAMING_CHAT_SCENARIO = "streaming-chat"
private const val STREAMING_DONE_MARKER = "STREAMING_BENCHMARK_DONE"
private const val UI_TIMEOUT_MILLIS = 15_000L

@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val baselineProfileRule = BaselineProfileRule()

    @Test
    fun generateStartup() = baselineProfileRule.collect(
        packageName = TARGET_PACKAGE,
        maxIterations = 15,
        stableIterations = 3,
        includeInStartupProfile = true,
    ) {
        pressHome()
        startActivityAndWait(benchmarkIntent())
        awaitStartupReady()
    }

    @Test
    fun generateCriticalUserJourneys() = baselineProfileRule.collect(
        packageName = TARGET_PACKAGE,
        maxIterations = 15,
        stableIterations = 3,
        includeInStartupProfile = false,
    ) {
        pressHome()
        startActivityAndWait(benchmarkIntent(longChat = true))
        awaitLongChatReady()
        scrollLongChat()
    }

    @Test
    fun generateWorkspaceNavigation() = baselineProfileRule.collect(
        packageName = TARGET_PACKAGE,
        maxIterations = 15,
        stableIterations = 3,
        includeInStartupProfile = false,
    ) {
        pressHome()
        startActivityAndWait(benchmarkIntent(drawerNavigation = true))
        awaitStartupReady()
        navigateWorkspaceDestinations(captureWorkspaceNavigationTargets())
    }

    @Test
    fun generateStreamingChat() = baselineProfileRule.collect(
        packageName = TARGET_PACKAGE,
        maxIterations = 15,
        stableIterations = 3,
        includeInStartupProfile = false,
    ) {
        pressHome()
        startActivityAndWait(benchmarkIntent(streamingChat = true))
        awaitStreamingChatReady()
        startActivityAndWait(streamingTriggerIntent())
        awaitStreamingChatDone()
    }
}

private fun benchmarkIntent(
    longChat: Boolean = false,
    drawerNavigation: Boolean = false,
    streamingChat: Boolean = false,
): Intent =
    Intent(Intent.ACTION_MAIN).apply {
        setClassName(TARGET_PACKAGE, TARGET_ACTIVITY)
        addCategory(Intent.CATEGORY_LAUNCHER)
        when {
            longChat -> putExtra(SCENARIO_EXTRA, LONG_CHAT_SCENARIO)
            drawerNavigation -> putExtra(SCENARIO_EXTRA, DRAWER_NAVIGATION_SCENARIO)
            streamingChat -> putExtra(SCENARIO_EXTRA, STREAMING_CHAT_SCENARIO)
        }
    }

private fun streamingTriggerIntent(): Intent = Intent(Intent.ACTION_MAIN).apply {
    setClassName(TARGET_PACKAGE, TARGET_ACTIVITY)
    addCategory(Intent.CATEGORY_LAUNCHER)
    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    putExtra(SCENARIO_EXTRA, STREAMING_CHAT_SCENARIO)
    putExtra(STREAMING_TRIGGER_EXTRA, true)
}

private fun MacrobenchmarkScope.awaitStartupReady() {
    check(device.wait(Until.hasObject(By.textContains("性能测试")), UI_TIMEOUT_MILLIS)) {
        "等待基准启动页超时"
    }
}

private fun MacrobenchmarkScope.awaitLongChatReady() {
    check(device.wait(Until.hasObject(By.text("性能基准长会话")), UI_TIMEOUT_MILLIS)) {
        "等待 1,000 条消息基准会话超时"
    }
    check(device.wait(Until.hasObject(By.desc("聊天消息列表")), UI_TIMEOUT_MILLIS)) {
        "等待聊天消息列表超时"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.awaitStreamingChatReady() {
    check(device.wait(Until.hasObject(By.text("流式性能基准")), UI_TIMEOUT_MILLIS)) {
        "等待流式基准会话超时"
    }
    check(device.wait(Until.hasObject(By.text("生成中")), UI_TIMEOUT_MILLIS)) {
        "等待流式回复初始状态超时"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.awaitStreamingChatDone() {
    check(device.wait(Until.hasObject(By.textContains(STREAMING_DONE_MARKER)), UI_TIMEOUT_MILLIS)) {
        "等待流式性能基准完成超时"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.scrollLongChat() {
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

private data class WorkspaceNavigationTargets(
    val menu: Point,
    val destinations: List<Point>,
    val account: Point,
    val accountDestinations: List<Point>,
)

private fun MacrobenchmarkScope.captureWorkspaceNavigationTargets(): WorkspaceNavigationTargets {
    val menu = device.wait(Until.findObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)
    checkNotNull(menu) { "等待侧栏入口超时" }
    val menuPoint = menu.visibleCenter
    check(device.click(menuPoint.x, menuPoint.y)) { "打开侧栏失败" }
    device.waitForIdle()
    SystemClock.sleep(700)

    val destinations = listOf("项目", "技能", "知识库", "文件", "新对话").map { label ->
        val item = device.wait(Until.findObject(By.text(label)), UI_TIMEOUT_MILLIS)
        checkNotNull(item) { "等待侧栏目的地「$label」超时" }
        item.visibleCenter
    }

    val account = device.wait(Until.findObject(By.text("性能测试")), UI_TIMEOUT_MILLIS)
    checkNotNull(account) { "等待侧栏账户入口超时" }
    val accountPoint = account.visibleCenter
    check(device.click(accountPoint.x, accountPoint.y)) { "打开账户菜单失败" }
    device.waitForIdle()
    SystemClock.sleep(350)
    val accountDestinations = listOf("设置", "用量与订阅", "管理后台").map { label ->
        val item = device.wait(Until.findObject(By.text(label)), UI_TIMEOUT_MILLIS)
        checkNotNull(item) { "等待账户目的地「$label」超时" }
        item.visibleCenter
    }

    device.pressBack()
    check(device.wait(Until.gone(By.text("设置")), UI_TIMEOUT_MILLIS)) {
        "准备工作区导航 Profile 时关闭账户菜单超时"
    }
    device.pressBack()
    check(device.wait(Until.hasObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)) {
        "准备工作区导航 Profile 时关闭侧栏超时"
    }
    device.waitForIdle()
    return WorkspaceNavigationTargets(
        menu = menuPoint,
        destinations = destinations,
        account = accountPoint,
        accountDestinations = accountDestinations,
    )
}

private fun MacrobenchmarkScope.navigateWorkspaceDestinations(targets: WorkspaceNavigationTargets) {
    targets.accountDestinations.forEachIndexed { index, destination ->
        check(device.click(targets.menu.x, targets.menu.y)) {
            "第 ${index + 1} 次打开账户目的地侧栏失败"
        }
        SystemClock.sleep(700)
        check(device.click(targets.account.x, targets.account.y)) {
            "第 ${index + 1} 次打开账户菜单失败"
        }
        SystemClock.sleep(350)
        check(device.click(destination.x, destination.y)) {
            "第 ${index + 1} 次选择账户目的地失败"
        }
        SystemClock.sleep(700)
    }
    targets.destinations.forEachIndexed { index, destination ->
        check(device.click(targets.menu.x, targets.menu.y)) { "第 ${index + 1} 次打开侧栏失败" }
        SystemClock.sleep(700)
        check(device.click(destination.x, destination.y)) { "第 ${index + 1} 次选择目的地失败" }
        SystemClock.sleep(700)
    }
    device.waitForIdle()
    check(device.wait(Until.hasObject(By.desc("打开侧栏")), UI_TIMEOUT_MILLIS)) {
        "工作区导航 Profile 未回到新对话页"
    }
}
