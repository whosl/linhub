package com.linhub.android.ui

import com.linhub.android.core.model.User
import com.linhub.android.core.network.ApiException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class CommittedMutationPipelineTest {
    @Test
    fun `确定提交后先发布本地结果再执行校准`() = runBlocking {
        val events = mutableListOf<String>()

        val outcome = commitThenReconcile(
            commit = {
                events += "commit"
                "server-value"
            },
            onCommitted = {
                events += "publish:$it"
            },
            reconcile = {
                events += "reconcile:$it"
            },
        )

        assertEquals(
            listOf("commit", "publish:server-value", "reconcile:server-value"),
            events,
        )
        val committed = outcome as CommittedMutationOutcome.Committed
        assertEquals("server-value", committed.value)
        assertEquals(null, committed.reconciliationError)
    }

    @Test
    fun `提交成功后校准失败仍保持 committed`() = runBlocking {
        val refreshError = IOException("refresh failed")
        var published = false

        val outcome = commitThenReconcile(
            commit = { 42 },
            onCommitted = { published = true },
            reconcile = { throw refreshError },
        )

        assertTrue(published)
        val committed = outcome as CommittedMutationOutcome.Committed
        assertEquals(42, committed.value)
        assertSame(refreshError, committed.reconciliationError)
    }

    @Test
    fun `提交失败不会发布或校准`() = runBlocking {
        val commitError = IOException("commit failed")
        var published = false
        var reconciled = false

        val outcome = commitThenReconcile(
            commit = { throw commitError },
            onCommitted = { published = true },
            reconcile = { reconciled = true },
        )

        assertEquals(false, published)
        assertEquals(false, reconciled)
        assertSame(commitError, (outcome as CommittedMutationOutcome.Rejected).error)
    }

    @Test(expected = CancellationException::class)
    fun `校准取消继续传播而不是伪装成刷新失败`() {
        runBlocking {
            commitThenReconcile(
                commit = { "written" },
                onCommitted = {},
                reconcile = { throw CancellationException("cancelled") },
            )
        }
    }

    @Test
    fun `本地余额即时增加并避免整数溢出`() {
        val user = User(
            id = "user-1",
            email = "user@example.com",
            name = "测试用户",
            createdAt = "2026-07-14T00:00:00Z",
            balance = 100,
        )

        assertEquals(350, user.withBalanceDelta(250).balance)
        assertEquals(Int.MAX_VALUE, user.copy(balance = Int.MAX_VALUE).withBalanceDelta(1).balance)
    }

    @Test
    fun `校准失败消息不把成功操作改写成失败`() {
        assertEquals("余额已赠送", adminReconciliationMessage("余额已赠送", null))
        assertEquals(
            "余额已赠送；列表刷新失败，请稍后重试",
            adminReconciliationMessage("余额已赠送", IOException("offline")),
        )
    }

    @Test(expected = ApiException::class)
    fun `提交后校准遇到未授权仍触发会话失效`() {
        adminReconciliationMessage("余额已赠送", ApiException(401, "expired"))
    }
}
