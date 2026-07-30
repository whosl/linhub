package com.linhub.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.linhub.android.core.model.PptStudioBriefRequest
import com.linhub.android.core.model.SkillRunAttachment
import com.linhub.android.core.model.SkillRunSnapshot
import com.linhub.android.core.model.SkillRunStep
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SkillRunCardTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun pptWaitingInput_rendersMobileBriefAndSubmitsStructuredDraft() {
        var observed = false
        var submitted: PptStudioBriefRequest? = null
        composeRule.setContent {
            MaterialTheme {
                SkillRunPanel(
                    runId = "run-ppt",
                    fallbackSkillName = "PPT 工作室",
                    initialTopic = "初始主题",
                    snapshot = snapshot(
                        id = "run-ppt",
                        kind = "ppt-studio",
                        status = "waiting_input",
                        inputTopic = "季度经营复盘",
                    ),
                    loading = false,
                    mutating = false,
                    error = null,
                    onObserve = { observed = true },
                    onStopObserving = {},
                    onRefresh = {},
                    onCancel = {},
                    onRetry = {},
                    onSubmitPptBrief = { _, request -> submitted = request },
                    onDownload = { _, _ -> },
                )
            }
        }

        composeRule.onNodeWithText("PPT 工作室").assertExists()
        composeRule.onNodeWithText("季度经营复盘").assertExists()
        composeRule.onNodeWithText("提交并开始生成").performScrollTo().performClick()
        composeRule.runOnIdle {
            assertTrue(observed)
            assertEquals("季度经营复盘", submitted?.topic)
            assertEquals(10, submitted?.pageCount)
            assertEquals("theme01", submitted?.theme)
        }
    }

    @Test
    fun completedRun_expandsStepsAndDeliverables() {
        composeRule.setContent {
            MaterialTheme {
                SkillRunPanel(
                    runId = "run-report",
                    fallbackSkillName = "数据分析",
                    initialTopic = "",
                    snapshot = snapshot(
                        id = "run-report",
                        kind = "data-analysis",
                        status = "completed",
                    ).copy(
                        stageLabel = "报告已生成",
                        progress = 100,
                        sourceCount = 3,
                        steps = listOf(
                            SkillRunStep(
                                id = "step-1",
                                runId = "run-report",
                                kind = "subagent",
                                label = "分析数据",
                                status = "completed",
                            ),
                        ),
                        resultAttachments = listOf(
                            SkillRunAttachment(
                                id = "file-1",
                                name = "分析报告.xlsx",
                                url = "/api/media/file-1",
                                mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                sizeBytes = 4096,
                            ),
                        ),
                    ),
                    loading = false,
                    mutating = false,
                    error = null,
                    onObserve = {},
                    onStopObserving = {},
                    onRefresh = {},
                    onCancel = {},
                    onRetry = {},
                    onSubmitPptBrief = { _, _ -> },
                    onDownload = { _, _ -> },
                )
            }
        }

        composeRule.onNodeWithText("报告已生成").assertExists()
        composeRule.onNodeWithContentDescription("展开运行详情").performClick()
        composeRule.onNodeWithText("1. 分析数据").assertExists()
        composeRule.onNodeWithText("分析报告.xlsx").assertExists()
    }

    @Test
    fun unrelatedRunUpdateDoesNotRecomposeAnotherCardCollector() {
        val source = MutableStateFlow<Map<String, SkillRunCardUiState>>(emptyMap())
        val runOneCompositions = AtomicInteger()
        val runTwoCompositions = AtomicInteger()
        composeRule.setContent {
            MaterialTheme {
                RunStateProbe(source, "run-1", runOneCompositions)
                RunStateProbe(source, "run-2", runTwoCompositions)
            }
        }
        composeRule.waitForIdle()
        val runOneBefore = runOneCompositions.get()
        val runTwoBefore = runTwoCompositions.get()

        composeRule.runOnIdle {
            source.value = mapOf(
                "run-2" to SkillRunCardUiState(
                    snapshot = snapshot("run-2", "data-analysis", "running").copy(progress = 55),
                ),
            )
        }
        composeRule.waitForIdle()

        assertEquals(runOneBefore, runOneCompositions.get())
        assertTrue(runTwoCompositions.get() > runTwoBefore)
    }

    @Test
    fun streamingFramesDoNotRecomposeAppHostCollector() {
        val source = MutableStateFlow(LinHubUiState(phase = AppPhase.Chat))
        val compositions = AtomicInteger()
        composeRule.setContent {
            MaterialTheme {
                AppHostProbe(source, compositions)
            }
        }
        composeRule.waitForIdle()
        val initialCompositions = compositions.get()

        composeRule.runOnIdle {
            repeat(100) { frame ->
                source.value = source.value.copy(
                    draft = "流式帧 $frame",
                    quotedText = if (frame % 2 == 0) "引用" else null,
                )
            }
        }
        composeRule.waitForIdle()
        assertEquals(initialCompositions, compositions.get())

        composeRule.runOnIdle {
            source.value = source.value.copy(message = "生成完成")
        }
        composeRule.waitForIdle()
        assertTrue(compositions.get() > initialCompositions)
    }

    @Composable
    private fun RunStateProbe(
        source: Flow<Map<String, SkillRunCardUiState>>,
        id: String,
        compositions: AtomicInteger,
    ) {
        val stableFlow = remember(source, id) { source.selectSkillRunCardState(id) }
        val state by stableFlow.collectAsState(initial = SkillRunCardUiState())
        SideEffect { compositions.incrementAndGet() }
        Text("$id:${state.snapshot?.progress ?: 0}")
    }

    @Composable
    private fun AppHostProbe(
        source: Flow<LinHubUiState>,
        compositions: AtomicInteger,
    ) {
        val stableFlow = remember(source) {
            source.map(::appHostState).distinctUntilChanged()
        }
        val state by stableFlow.collectAsState(initial = AppHostState())
        SideEffect { compositions.incrementAndGet() }
        Text("host:${state.phase}:${state.message.orEmpty()}")
    }

    private fun snapshot(
        id: String,
        kind: String,
        status: String,
        inputTopic: String? = null,
    ) = SkillRunSnapshot(
        id = id,
        conversationId = "conversation",
        kind = kind,
        skillName = if (kind == "ppt-studio") "PPT 工作室" else "数据分析",
        status = status,
        stageLabel = if (status == "waiting_input") "等待填写需求" else "已完成",
        input = buildJsonObject { inputTopic?.let { put("topic", it) } },
        createdAt = "2026-07-21T00:00:00Z",
        updatedAt = "2026-07-21T00:00:01Z",
    )
}
