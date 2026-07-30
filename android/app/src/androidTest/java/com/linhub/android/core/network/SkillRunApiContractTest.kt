package com.linhub.android.core.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.linhub.android.core.model.PptStudioBriefRequest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Headers
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SkillRunApiContractTest {
    private lateinit var server: MockWebServer
    private lateinit var sessionStore: SessionStore
    private lateinit var api: LinHubApi

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        server = MockWebServer().apply { start() }
        sessionStore = SessionStore(context).apply {
            clear()
            saveToken(TEST_TOKEN)
        }
        api = LinHubApi(context, sessionStore, server.url("/").toString())
    }

    @After
    fun tearDown() {
        sessionStore.clear()
        server.close()
    }

    @Test
    fun durableRun_readStopRetryAndPptInputUseExactRoutes() = runBlocking {
        server.enqueue(MockResponse(body = SNAPSHOT))
        server.enqueue(MockResponse(body = "{\"ok\":true}"))
        server.enqueue(MockResponse(body = "{\"ok\":true}"))
        server.enqueue(MockResponse(body = SNAPSHOT.replace("waiting_input", "queued")))

        val snapshot = api.skillRun("run/contract")
        assertEquals("run-contract", snapshot.id)
        assertEquals("pending", snapshot.completionReceiptStatus)
        assertEquals("回执", snapshot.completionMessage?.parts?.firstOrNull()?.get("text")?.toString()?.trim('"'))
        assertRequest("GET", "/api/skill-runs/run%2Fcontract")

        api.cancelSkillRun("run/contract")
        assertRequest("DELETE", "/api/skill-runs/run%2Fcontract")

        api.retrySkillRun("run/contract")
        assertRequest("POST", "/api/skill-runs/run%2Fcontract")

        api.submitPptStudioBrief(
            "run/contract",
            PptStudioBriefRequest(
                topic = "季度复盘",
                audience = "管理层",
                pageCount = 12,
                theme = "theme05",
                mediaPreference = "image-heavy",
                language = "zh",
                outputFormat = "pptx",
                additionalInstructions = "突出增长",
            ),
        )
        val inputRequest = requireNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals("POST", inputRequest.method)
        assertEquals("/api/skill-runs/run%2Fcontract/input", inputRequest.target)
        assertEquals("Bearer $TEST_TOKEN", inputRequest.headers["Authorization"])
        val body = inputRequest.body?.utf8().orEmpty()
        assertTrue(body.contains("\"topic\":\"季度复盘\""))
        assertTrue(body.contains("\"pageCount\":12"))
        assertTrue(body.contains("\"theme\":\"theme05\""))
    }

    @Test
    fun adminSkillImportUsesZipMultipartContract() = runBlocking {
        server.enqueue(
            MockResponse(
                body = "{\"ok\":true,\"skillId\":\"skill-imported\"," +
                    "\"name\":\"分析助手\",\"digest\":\"abc123\"," +
                    "\"message\":\"已导入\"}",
            ),
        )

        val result = api.importAdminSkillPackage("analysis.zip", byteArrayOf(1, 2, 3, 4))

        assertEquals("skill-imported", result.skillId)
        val request = requireNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals("POST", request.method)
        assertEquals("/api/admin/skills/import", request.target)
        assertEquals("Bearer $TEST_TOKEN", request.headers["Authorization"])
        val contentType = request.headers["Content-Type"].orEmpty()
        assertTrue(contentType.startsWith("multipart/form-data; boundary="))
        val body = request.body?.utf8().orEmpty()
        assertTrue(body.contains("name=\"file\"; filename=\"analysis.zip\""))
        assertTrue(body.contains("Content-Type: application/zip"))
    }

    @Test
    fun durableRunEventsParsesSnapshotsAndIgnoresOtherSseEvents() = runBlocking {
        val snapshotJson = api.json.parseToJsonElement(SNAPSHOT).toString()
        server.enqueue(
            MockResponse(
                headers = Headers.Builder()
                    .add("Content-Type", "text/event-stream")
                    .build(),
                body = "event: ping\ndata: {\"at\":1}\n\n" +
                    "event: run-event\ndata: {\"sequence\":1}\n\n" +
                    "event: snapshot\ndata: $snapshotJson\n\n",
            ),
        )

        val snapshots = api.skillRunEvents("run/contract").toList()

        assertEquals(listOf("run-contract"), snapshots.map { it.id })
        assertEquals("pending", snapshots.single().completionReceiptStatus)
        val request = requireNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals("GET", request.method)
        assertEquals("/api/skill-runs/run%2Fcontract/events", request.target)
        assertEquals("text/event-stream", request.headers["Accept"])
        assertEquals("Bearer $TEST_TOKEN", request.headers["Authorization"])
    }

    private fun assertRequest(method: String, target: String) {
        val request = server.takeRequest(1, TimeUnit.SECONDS)
        assertNotNull(request)
        requireNotNull(request)
        assertEquals(method, request.method)
        assertEquals(target, request.target)
        assertEquals("Bearer $TEST_TOKEN", request.headers["Authorization"])
    }

    private companion object {
        const val TEST_TOKEN = "skill-run-contract-token"
        const val SNAPSHOT = """
            {
              "id":"run-contract",
              "conversationId":"conversation-contract",
              "kind":"ppt-studio",
              "skillName":"PPT 工作室",
              "status":"waiting_input",
              "stageLabel":"等待填写需求",
              "progress":0,
              "input":{"topic":"季度复盘"},
              "steps":[],
              "resultAttachments":[],
              "sourceCount":0,
              "completionReceiptStatus":"pending",
              "completionMessageId":"message-receipt",
              "completionMessage":{
                "id":"message-receipt",
                "conversationId":"conversation-contract",
                "parentId":"message-parent",
                "role":"assistant",
                "parts":[{"type":"text","text":"回执"},{"type":"skill-run-receipt","runId":"run-contract","runAttempt":1}],
                "createdAt":"2026-07-21T00:00:01Z",
                "status":"complete"
              },
              "createdAt":"2026-07-21T00:00:00Z",
              "updatedAt":"2026-07-21T00:00:01Z"
            }
        """
    }
}
