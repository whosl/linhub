package com.linhub.android.ui

import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.UsageRecord
import com.linhub.android.core.model.User
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExternalPaymentReturnPolicyTest {
    @Test
    fun `普通短暂后台不触发刷新`() {
        val decision = foregroundRefreshDecision(
            backgroundDurationMillis = 4_999,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )

        assertFalse(decision.refreshWorkspace)
        assertFalse(decision.refreshVisibleDestination)
        assertFalse(decision.refreshBillingSnapshot)
        assertFalse(decision.consumeExternalPaymentReturn)
    }

    @Test
    fun `普通长时间后台刷新工作区但不全量刷新计费`() {
        val decision = foregroundRefreshDecision(
            backgroundDurationMillis = 5_000,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )

        assertTrue(decision.refreshWorkspace)
        assertFalse(decision.refreshVisibleDestination)
        assertFalse(decision.refreshBillingSnapshot)
        assertFalse(decision.consumeExternalPaymentReturn)
    }

    @Test
    fun `支付返回即使很快也强制刷新并消费等待状态`() {
        val firstReturn = foregroundRefreshDecision(
            backgroundDurationMillis = 100,
            awaitingExternalPaymentReturn = true,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )
        val secondReturn = foregroundRefreshDecision(
            backgroundDurationMillis = 100,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )

        assertTrue(firstReturn.refreshBillingSnapshot)
        assertFalse(firstReturn.refreshVisibleDestination)
        assertTrue(firstReturn.consumeExternalPaymentReturn)
        assertFalse(secondReturn.refreshBillingSnapshot)
        assertFalse(secondReturn.consumeExternalPaymentReturn)
    }

    @Test
    fun `达到 Web 新鲜期后刷新当前可见功能域`() {
        val stillFresh = foregroundRefreshDecision(
            backgroundDurationMillis = 29_999,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )
        val stale = foregroundRefreshDecision(
            backgroundDurationMillis = 30_000,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
        )

        assertFalse(stillFresh.refreshVisibleDestination)
        assertTrue(stale.refreshVisibleDestination)
    }

    @Test
    fun `网络重连无视时间阈值刷新工作区和当前功能域`() {
        val decision = foregroundRefreshDecision(
            backgroundDurationMillis = 0,
            awaitingExternalPaymentReturn = false,
            refreshThresholdMillis = 5_000,
            visibleDestinationRefreshThresholdMillis = 30_000,
            forceNetworkRefresh = true,
        )

        assertTrue(decision.refreshWorkspace)
        assertTrue(decision.refreshVisibleDestination)
        assertFalse(decision.refreshBillingSnapshot)
    }

    @Test
    fun `支付返回在非计费页面也更新全局用户和完整计费快照`() {
        val oldUser = user(balance = 100)
        val refreshedUser = user(balance = 2_500)
        val plan = Plan(
            id = "pro",
            name = "Pro",
            description = "完整能力",
            priceCentsPerMonth = 1_900,
            monthlyQuotaCents = 10_000,
            modelTier = "pro",
        )
        val usage = UsageRecord(
            id = "usage-1",
            userId = refreshedUser.id,
            modelId = "model-1",
            modelName = "模型 1",
            costCents = 12,
            createdAt = "2026-07-14T00:00:00Z",
        )
        val ledger = LedgerEntry(
            id = "ledger-1",
            userId = refreshedUser.id,
            amountCents = 2_400,
            balanceAfterCents = 2_500,
            reason = "recharge",
            description = "充值",
            createdAt = "2026-07-14T00:00:00Z",
        )
        val initial = LinHubUiState(
            destination = WorkspaceDestination.Chat,
            user = oldUser,
        )

        val updated = initial.withBillingSnapshot(
            BillingSnapshot(refreshedUser, listOf(plan), listOf(usage), listOf(ledger)),
            loadedAtEpochMillis = 123_456,
        )

        assertEquals(WorkspaceDestination.Chat, updated.destination)
        assertEquals(2_500, updated.user?.balance)
        assertEquals(listOf(plan), updated.plans)
        assertEquals(listOf(usage), updated.usageRecords)
        assertEquals(listOf(ledger), updated.ledgerEntries)
        assertEquals(BillingResource.entries.toSet(), updated.billingLoadedResources)
        assertTrue(updated.billingLoadedAtEpochMillis.values.all { it == 123_456L })
    }

    private fun user(balance: Int) = User(
        id = "user-1",
        email = "user@linhub.invalid",
        name = "测试用户",
        createdAt = "2026-07-14T00:00:00Z",
        balance = balance,
    )
}
