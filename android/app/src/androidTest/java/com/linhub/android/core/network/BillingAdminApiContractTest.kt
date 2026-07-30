package com.linhub.android.core.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.linhub.android.core.model.CreateOrderRequest
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 在设备 loopback 上验证真实 OkHttp 编解码和错误边界，不读取生产账号或网络。
 * ViewModel 的 commit/publish/reconcile 与 single-flight 另由纯单元测试覆盖。
 */
@RunWith(AndroidJUnit4::class)
class BillingAdminApiContractTest {
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
        api = LinHubApi(
            context = context,
            sessionStore = sessionStore,
            baseUrl = server.url("/").toString(),
            callTimeoutMillis = TEST_CALL_TIMEOUT_MILLIS,
        )
    }

    @After
    fun tearDown() {
        sessionStore.clear()
        server.close()
    }

    @Test
    fun billingOrder_successSendsAuthorizationBodyAndIdempotencyKey() = runBlocking {
        server.enqueue(MockResponse(body = ORDER_RESPONSE))

        val order = api.createOrder(
            CreateOrderRequest(kind = "recharge", amountCents = 5_000),
            IDEMPOTENCY_KEY,
        )

        assertEquals("order-contract", order.id)
        assertEquals(5_000, order.amountCents)
        assertEquals("pending", order.status)
        val request = server.takeRequest(1, TimeUnit.SECONDS)
        assertNotNull(request)
        requireNotNull(request)
        assertEquals("POST", request.method)
        assertEquals("/api/orders", request.target)
        assertEquals("Bearer $TEST_TOKEN", request.headers["Authorization"])
        assertEquals(IDEMPOTENCY_KEY, request.headers["Idempotency-Key"])
        val body = request.body?.utf8().orEmpty()
        assertTrue(body.contains("\"kind\":\"recharge\""))
        assertTrue(body.contains("\"amountCents\":5000"))
    }

    @Test
    fun billingOrder_unauthorizedPreservesHttpStatusForSessionInvalidation() {
        server.enqueue(MockResponse(code = 401, body = "{\"error\":\"expired\"}"))

        val error = assertThrows(ApiException::class.java) {
            runBlocking {
                api.createOrder(
                    CreateOrderRequest(kind = "recharge", amountCents = 5_000),
                    IDEMPOTENCY_KEY,
                )
            }
        }

        assertEquals(401, error.status)
        assertEquals("expired", error.message)
    }

    @Test
    fun billingOrder_timeoutReturnsUnknownIoFailureWithinBound() {
        server.enqueue(
            MockResponse.Builder()
                .headersDelay(2, TimeUnit.SECONDS)
                .body(ORDER_RESPONSE)
                .build(),
        )
        val startedAt = System.nanoTime()

        val error = assertThrows(IOException::class.java) {
            runBlocking {
                api.createOrder(
                    CreateOrderRequest(kind = "recharge", amountCents = 5_000),
                    IDEMPOTENCY_KEY,
                )
            }
        }
        val elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)

        assertTrue(error !is ApiException)
        assertTrue("调用应在测试超时边界内终止，实际 ${elapsedMillis}ms", elapsedMillis < 1_500L)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun adminWrites_successAndServerFailureKeepExactContracts() = runBlocking {
        server.enqueue(MockResponse(body = "{\"ok\":true}"))
        server.enqueue(MockResponse(body = "{\"codes\":[\"CODE-A\",\"CODE-B\"]}"))
        server.enqueue(MockResponse(code = 500, body = "{\"error\":\"ledger failed\"}"))

        api.grantAdminBalance("user-contract", 300, "自动化合同测试")
        val grantRequest = requireNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals("POST", grantRequest.method)
        assertEquals("/api/admin/users", grantRequest.target)
        assertEquals("Bearer $TEST_TOKEN", grantRequest.headers["Authorization"])
        val grantBody = grantRequest.body?.utf8().orEmpty()
        assertTrue(grantBody.contains("\"userId\":\"user-contract\""))
        assertTrue(grantBody.contains("\"amountCents\":300"))
        assertTrue(grantBody.contains("\"note\":\"自动化合同测试\""))

        assertEquals(
            listOf("CODE-A", "CODE-B"),
            api.generateAdminRedeemCodes(amountCents = 500, count = 2),
        )
        val codesRequest = requireNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals("/api/admin/redeem-codes", codesRequest.target)
        val codesBody = codesRequest.body?.utf8().orEmpty()
        assertTrue(codesBody.contains("\"amountCents\":500"))
        assertTrue(codesBody.contains("\"count\":2"))

        val failure = assertThrows(ApiException::class.java) {
            runBlocking { api.grantAdminBalance("user-contract", 300, null) }
        }
        assertEquals(500, failure.status)
        assertEquals("ledger failed", failure.message)
    }

    private companion object {
        const val TEST_TOKEN = "contract-test-token"
        const val TEST_CALL_TIMEOUT_MILLIS = 250L
        const val IDEMPOTENCY_KEY = "android-contract-idempotency-key"
        const val ORDER_RESPONSE =
            "{\"id\":\"order-contract\",\"userId\":\"user-contract\"," +
                "\"kind\":\"recharge\",\"amountCents\":5000,\"status\":\"pending\"," +
                "\"channel\":\"contract\",\"createdAt\":\"2026-07-15T00:00:00Z\"}"
    }
}
