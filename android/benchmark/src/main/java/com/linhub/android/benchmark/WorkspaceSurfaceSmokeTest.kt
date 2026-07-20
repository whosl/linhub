package com.linhub.android.benchmark

import android.content.Intent
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkspaceSurfaceSmokeTest {
    private lateinit var device: UiDevice

    @Before
    fun launchDeterministicWorkspace() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        device = UiDevice.getInstance(instrumentation)
        device.executeShellCommand("am force-stop $TARGET_PACKAGE")
        instrumentation.targetContext.startActivity(
            benchmarkIntent(workspaceSmoke = true).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            },
        )
        awaitDescription("打开侧栏")
        awaitTextContains("性能测试")
    }

    @After
    fun stopDeterministicWorkspace() {
        device.executeShellCommand("am force-stop $TARGET_PACKAGE")
    }

    @Test
    fun everyWebWorkspaceSurfaceAndTabIsReachableWithoutNetwork() {
        navigateDrawer("项目", "还没有项目")
        navigateDrawer("技能", "还没有自定义技能")
        navigateDrawer("知识库", "还没有知识库")
        navigateDrawer("文件", "还没有文件")
        navigateDrawer("新对话", "性能测试", contains = true)

        navigateAccount("设置", "导出数据")
        clickVisibleText("记忆")
        awaitText("还没有记忆")
        clickVisibleText("回复风格")
        awaitText("自定义风格")
        clickVisibleText("MCP 连接器")
        awaitTextContains("连接个人 MCP 服务器")
        clickVisibleText("账户")
        awaitText("聊天消息导航条")

        navigateAccount("用量与订阅", "自动化套餐")
        clickVisibleText("充值")
        awaitText("余额充值")
        clickVisibleText("用量明细")
        awaitText("还没有用量记录")
        clickVisibleText("余额流水")
        awaitText("还没有余额流水")

        navigateAccount("管理后台", "添加供应商")
        val adminTabY = awaitText("供应商").visibleCenter.y
        clickScrollableTab("模型与计价", adminTabY, "添加模型")
        clickScrollableTab("套餐", adminTabY, "添加套餐")
        clickScrollableTab("用户", adminTabY, "benchmark@linhub.invalid")
        clickScrollableTab("技能审核", adminTabY, "暂无待审核技能")
        clickScrollableTab("系统设置", adminTabY, "站点与默认模型")
        clickScrollableTab("全局 MCP", adminTabY, "还没有全局 MCP 服务器。")
        clickScrollableTab("兑换码", adminTabY, "生成兑换码")
        clickScrollableTab("用量", adminTabY, "0 条记录 · 总成本 ¥0.00")
    }

    private fun navigateDrawer(label: String, expected: String, contains: Boolean = false) {
        openDrawer()
        clickVisibleText(label)
        awaitDrawerClosed()
        if (contains) awaitTextContains(expected) else awaitText(expected)
    }

    private fun navigateAccount(label: String, expected: String) {
        openDrawer()
        clickVisibleText("性能测试")
        SystemClock.sleep(300)
        clickVisibleText(label)
        awaitDrawerClosed()
        awaitText(expected)
    }

    private fun openDrawer() {
        tap(awaitDescription("打开侧栏"))
        check(device.wait(Until.hasObject(By.desc("关闭侧栏")), UI_TIMEOUT_MILLIS)) {
            "打开侧栏超时"
        }
        device.waitForIdle()
        // Modal drawer 语义会在动画开始时立即出现；等待容器完全展开后再注入点击。
        SystemClock.sleep(500)
    }

    private fun awaitDrawerClosed() {
        check(device.wait(Until.gone(By.desc("关闭侧栏")), UI_TIMEOUT_MILLIS)) {
            "关闭侧栏超时"
        }
        device.waitForIdle()
    }

    private fun clickScrollableTab(label: String, rowY: Int, expected: String) {
        repeat(8) {
            if (visibleText(label) != null) {
                // 横向标签在滚动停止后仍可能继续做很短的选中位置校准；重新获取节点并
                // 最多补点一次，避免把一次丢失的注入误报成页面缺失。两次都必须等到
                // 目标内容真正出现，不能只凭标签可见就通过。
                repeat(2) { attempt ->
                    visibleText(label)?.let(::tap)
                    device.waitForIdle()
                    val timeout = if (attempt == 0) TAB_RETRY_TIMEOUT_MILLIS else UI_TIMEOUT_MILLIS
                    if (device.wait(Until.hasObject(By.text(expected)), timeout)) return
                }
                error("标签已点击但目标内容未出现：$label → $expected")
            }
            check(
                device.swipe(
                    (device.displayWidth * 0.82f).toInt(),
                    rowY,
                    (device.displayWidth * 0.18f).toInt(),
                    rowY,
                    18,
                ),
            ) { "滚动后台标签失败：$label" }
            SystemClock.sleep(180)
        }
        error("无法找到可见后台标签：$label")
    }

    private fun clickVisibleText(text: String) {
        val target = device.wait(Until.findObjects(By.text(text)), UI_TIMEOUT_MILLIS)
            ?.firstOrNull(::isVisibleOnScreen)
        checkNotNull(target) { "等待可点击文本超时：$text" }
        tap(target)
        device.waitForIdle()
    }

    private fun tap(node: UiObject2) {
        val center = node.visibleCenter
        check(device.click(center.x, center.y)) { "触摸语义节点失败" }
    }

    private fun visibleText(text: String): UiObject2? =
        device.findObjects(By.text(text)).firstOrNull(::isVisibleOnScreen)

    private fun isVisibleOnScreen(node: UiObject2): Boolean {
        val bounds = node.visibleBounds
        val centerX = bounds.centerX()
        val centerY = bounds.centerY()
        return bounds.width() > 0 && bounds.height() > 0 &&
            centerX in 1 until device.displayWidth &&
            centerY in 1 until device.displayHeight
    }

    private fun awaitText(text: String): UiObject2 =
        checkNotNull(device.wait(Until.findObject(By.text(text)), UI_TIMEOUT_MILLIS)) {
            "等待文本超时：$text"
        }

    private fun awaitTextContains(text: String): UiObject2 =
        checkNotNull(device.wait(Until.findObject(By.textContains(text)), UI_TIMEOUT_MILLIS)) {
            "等待包含文本超时：$text"
        }

    private fun awaitDescription(description: String): UiObject2 =
        checkNotNull(device.wait(Until.findObject(By.desc(description)), UI_TIMEOUT_MILLIS)) {
            "等待语义节点超时：$description"
        }

    private companion object {
        const val UI_TIMEOUT_MILLIS = 10_000L
        const val TAB_RETRY_TIMEOUT_MILLIS = 2_500L
    }
}
