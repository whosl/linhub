package com.linhub.android.ui

import com.linhub.android.core.model.CreateOrderRequest
import com.linhub.android.core.model.Order
import com.linhub.android.core.network.ApiException
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BillingIdempotencyPolicyTest {
    @Test
    fun signatureSeparatesAmountPlanAndOrderKind() {
        assertEquals(
            "recharge:5000:-",
            billingOrderSignature(CreateOrderRequest(kind = "recharge", amountCents = 5_000)),
        )
        assertEquals(
            "subscription:-:plan-pro",
            billingOrderSignature(CreateOrderRequest(kind = "subscription", planId = "plan-pro")),
        )
    }

    @Test
    fun onlyDefinitiveClientRejectionDiscardsRetryKey() {
        assertTrue(shouldDiscardBillingIdempotencyKey(ApiException(400, "金额无效")))
        assertTrue(shouldDiscardBillingIdempotencyKey(ApiException(409, "订单已结束")))
        assertFalse(shouldDiscardBillingIdempotencyKey(ApiException(500, "未知结果")))
        assertFalse(shouldDiscardBillingIdempotencyKey(IOException("连接中断")))
    }

    @Test
    fun committedOrderRefreshFailureKeepsCommittedSemantics() {
        assertEquals(
            "操作已生效，账务数据暂未刷新，请稍后重试",
            billingReconciliationPendingMessage(
                Order(
                    id = "paid-order",
                    userId = "user-1",
                    kind = "recharge",
                    amountCents = 5_000,
                    status = "paid",
                    channel = "mock",
                    createdAt = "2026-07-14T00:00:00Z",
                ),
            ),
        )
        assertEquals(
            "订单已创建，账务数据暂未刷新；支付状态将在返回后更新",
            billingReconciliationPendingMessage(
                Order(
                    id = "pending-order",
                    userId = "user-1",
                    kind = "subscription",
                    amountCents = 0,
                    status = "pending",
                    channel = "external",
                    createdAt = "2026-07-14T00:00:00Z",
                ),
            ),
        )
    }
}
