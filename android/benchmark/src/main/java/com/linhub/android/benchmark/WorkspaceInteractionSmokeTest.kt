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

/**
 * 在 R8 App 上覆盖有数据后的代表性交互分支；只打开详情、切换标签并取消危险操作，
 * 不访问网络、不读写真实账号，也不确认任何服务端写操作。
 */
@RunWith(AndroidJUnit4::class)
class WorkspaceInteractionSmokeTest {
    private lateinit var device: UiDevice

    @Before
    fun launchDeterministicWorkspace() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        device = UiDevice.getInstance(instrumentation)
        device.executeShellCommand("am force-stop $TARGET_PACKAGE")
        instrumentation.targetContext.startActivity(
            benchmarkIntent(workspaceInteraction = true).apply {
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
    fun representativeDetailEditPreviewAndConfirmationBranchesWorkWithoutNetwork() {
        navigateDrawer("项目")
        tap(awaitDescription("打开项目「自动化项目」"))
        awaitText("项目自动化会话")
        clickVisibleText("项目文件")
        awaitText("自动化项目资料.txt")
        awaitText("已挂载")
        tap(awaitDescription("删除文件「自动化项目资料.txt」"))
        awaitText("删除文件")
        clickVisibleText("取消")
        clickVisibleText("项目设置")
        awaitTextContains("所有回复先给出结论")
        clickVisibleText("全部项目")
        awaitDescription("打开侧栏")

        navigateDrawer("知识库")
        tap(awaitDescription("选择知识库「自动化知识库」"))
        awaitText("自动化文档.txt")
        tap(awaitDescription("删除第 1 个文档「自动化文档.txt」"))
        awaitText("删除文档")
        clickVisibleText("取消")

        navigateDrawer("技能")
        awaitText("自动化技能")
        tap(awaitDescription("编辑技能"))
        awaitText("编辑技能")
        awaitText("只输出可复现的验证结果。")
        clickVisibleText("取消")

        navigateDrawer("文件")
        awaitText("automation.kt")
        clickVisibleText("automation.kt")
        awaitDescription("复制代码")
        awaitTextContains("WORKSPACE_INTERACTION_OK")
        tap(awaitDescription("关闭预览"))
        awaitText("automation.kt")
    }

    private fun navigateDrawer(label: String) {
        tap(awaitDescription("打开侧栏"))
        check(device.wait(Until.hasObject(By.desc("关闭侧栏")), UI_TIMEOUT_MILLIS)) {
            "打开侧栏超时"
        }
        device.waitForIdle()
        SystemClock.sleep(500)
        clickVisibleText(label)
        check(device.wait(Until.gone(By.desc("关闭侧栏")), UI_TIMEOUT_MILLIS)) {
            "关闭侧栏超时"
        }
        device.waitForIdle()
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
    }
}
