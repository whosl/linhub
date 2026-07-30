package com.linhub.android.ui

import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.UsageRecord
import com.linhub.android.core.model.User

internal data class ForegroundRefreshDecision(
    val refreshWorkspace: Boolean,
    val refreshVisibleDestination: Boolean,
    val refreshBillingSnapshot: Boolean,
    val consumeExternalPaymentReturn: Boolean,
)

/**
 * 外部支付返回不能复用普通后台恢复阈值：用户即使立刻返回，也必须刷新余额和套餐状态。
 */
internal fun foregroundRefreshDecision(
    backgroundDurationMillis: Long,
    awaitingExternalPaymentReturn: Boolean,
    refreshThresholdMillis: Long,
    visibleDestinationRefreshThresholdMillis: Long = refreshThresholdMillis,
    forceNetworkRefresh: Boolean = false,
): ForegroundRefreshDecision {
    val refreshWorkspace = forceNetworkRefresh ||
        backgroundDurationMillis >= refreshThresholdMillis
    return ForegroundRefreshDecision(
        refreshWorkspace = refreshWorkspace,
        refreshVisibleDestination = forceNetworkRefresh ||
            backgroundDurationMillis >= visibleDestinationRefreshThresholdMillis,
        refreshBillingSnapshot = awaitingExternalPaymentReturn,
        consumeExternalPaymentReturn = awaitingExternalPaymentReturn,
    )
}

internal data class BillingSnapshot(
    val user: User,
    val plans: List<Plan>,
    val usage: List<UsageRecord>,
    val ledger: List<LedgerEntry>,
)

internal fun LinHubUiState.withBillingSnapshot(
    snapshot: BillingSnapshot,
    loadedAtEpochMillis: Long,
): LinHubUiState = copy(
    user = snapshot.user,
    plans = snapshot.plans,
    usageRecords = snapshot.usage,
    ledgerEntries = snapshot.ledger,
    billingCacheRead = true,
    billingLoadedResources = billingLoadedResources + BillingResource.entries,
    billingLoadedAtEpochMillis = billingLoadedAtEpochMillis +
        BillingResource.entries.associateWith { loadedAtEpochMillis },
)
