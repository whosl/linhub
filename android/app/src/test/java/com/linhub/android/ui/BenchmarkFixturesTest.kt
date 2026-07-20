package com.linhub.android.ui

import com.linhub.android.core.model.ChatEvent
import com.linhub.android.data.ChatTranscriptReducer
import com.linhub.android.data.string
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BenchmarkFixturesTest {
    @Test
    fun startupFixtureOpensAuthenticatedEmptyChat() {
        val state = benchmarkUiState(scenario = null)

        assertEquals(AppPhase.Chat, state.phase)
        assertEquals("性能测试", state.user?.name)
        assertNull(state.selectedConversationId)
        assertTrue(state.transcript.messages.isEmpty())
    }

    @Test
    fun workspaceSmokeFixturePreloadsEveryWebSurfaceWithoutNetwork() {
        val state = benchmarkUiState(BENCHMARK_SCENARIO_WORKSPACE_SMOKE)

        assertEquals("admin", state.user?.role)
        assertTrue(state.projectsLoaded)
        assertTrue(state.knowledgeBasesLoaded)
        assertTrue(state.skillsLoaded)
        assertEquals(BillingResource.entries.toSet(), state.billingLoadedResources)
        assertEquals(SettingsResource.entries.toSet(), state.settingsLoadedResources)
        assertEquals(AdminResource.entries.toSet(), state.admin.loadedResources)
        assertEquals("自动化套餐", state.plans.single().name)
        assertEquals("标准", state.styles.single().name)
        assertEquals("LinHub", state.admin.settings?.siteName)
    }

    @Test
    fun workspaceInteractionFixturePreloadsRepresentativeDetailBranches() {
        val state = benchmarkUiState(BENCHMARK_SCENARIO_WORKSPACE_INTERACTION)

        val project = state.projects.single()
        val knowledgeBase = state.knowledgeBases.single()
        assertEquals("admin", state.user?.role)
        assertEquals("自动化项目资料.txt", project.files.single().name)
        assertEquals("项目自动化会话", state.projectConversations.getValue(project.id).single().title)
        assertEquals(
            "自动化文档.txt",
            state.knowledgeDocuments.getValue(knowledgeBase.id).single().name,
        )
        assertEquals("自动化技能", state.mySkills.single().name)
        assertEquals("automation.kt", state.mediaAssets.single().name)
        assertTrue(state.mediaAssets.single().extractedTextAvailable)
        assertEquals(AdminResource.entries.toSet(), state.admin.loadedResources)
    }

    @Test
    fun longChatFixtureBuildsOneThousandMessageChain() {
        val state = benchmarkUiState(BENCHMARK_SCENARIO_LONG_CHAT)
        val conversation = state.conversations.single()
        val messages = state.transcript.messages

        assertEquals(1_000, messages.size)
        assertNull(messages.first().parentId)
        messages.zipWithNext().forEach { (parent, child) ->
            assertEquals(parent.id, child.parentId)
        }
        assertEquals(messages.last().id, conversation.currentLeafId)
    }

    @Test
    fun longChatNoRailFixtureDisablesOnlyTheNavigationRail() {
        val state = benchmarkUiState(BENCHMARK_SCENARIO_LONG_CHAT_NO_RAIL)

        assertEquals(1_000, state.transcript.messages.size)
        assertFalse(state.messageRailEnabled)
    }

    @Test
    fun streamingFixtureStartsWithAUserAndEmptyStreamingAssistant() {
        val state = benchmarkUiState(BENCHMARK_SCENARIO_STREAMING_CHAT)
        val messages = state.transcript.messages

        assertEquals("流式性能基准", state.conversations.single().title)
        assertEquals(2, messages.size)
        assertEquals("user", messages.first().role)
        assertEquals("assistant", messages.last().role)
        assertEquals("streaming", messages.last().status)
        assertTrue(messages.last().parts.isEmpty())
        assertEquals(messages.last().id, state.transcript.streamingMessageId)
    }

    @Test
    fun streamingEventsExerciseOneHundredTwentyFramesAndFinishWithMarker() {
        var transcript = benchmarkUiState(BENCHMARK_SCENARIO_STREAMING_CHAT).transcript
        val events = streamingBenchmarkEvents()

        events.forEach { event ->
            transcript = ChatTranscriptReducer.reduce(transcript, event)
        }

        assertEquals(
            BENCHMARK_STREAMING_FRAME_COUNT,
            events.count { it is ChatEvent.TextDelta },
        )
        assertFalse(transcript.isStreaming)
        assertEquals("complete", transcript.messages.last().status)
        assertTrue(
            transcript.messages.last().parts
                .joinToString(separator = "") { it.string("text").orEmpty() }
                .contains(BENCHMARK_STREAMING_DONE_MARKER),
        )
    }

    @Test
    fun streamingTriggerRequiresBenchmarkBuildAndExactScenario() {
        assertTrue(canRunStreamingBenchmark(true, BENCHMARK_SCENARIO_STREAMING_CHAT))
        assertFalse(canRunStreamingBenchmark(false, BENCHMARK_SCENARIO_STREAMING_CHAT))
        assertFalse(canRunStreamingBenchmark(true, BENCHMARK_SCENARIO_LONG_CHAT))
        assertFalse(canRunStreamingBenchmark(true, null))
    }
}
