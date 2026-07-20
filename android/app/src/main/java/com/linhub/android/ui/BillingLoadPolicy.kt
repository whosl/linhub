package com.linhub.android.ui

enum class BillingSection(val label: String) {
    Plans("订阅套餐"),
    Recharge("充值"),
    Usage("用量明细"),
    Ledger("余额流水"),
}

enum class BillingResource {
    User,
    Plans,
    Usage,
    Ledger,
}

internal val BILLING_CACHE_RESOURCES = setOf(
    BillingResource.Plans,
    BillingResource.Usage,
    BillingResource.Ledger,
)

internal fun billingResourcesForSection(section: BillingSection): Set<BillingResource> =
    when (section) {
        BillingSection.Plans -> setOf(BillingResource.User, BillingResource.Plans)
        BillingSection.Recharge -> setOf(BillingResource.User)
        BillingSection.Usage -> setOf(BillingResource.User, BillingResource.Usage)
        BillingSection.Ledger -> setOf(BillingResource.User, BillingResource.Ledger)
    }

internal fun billingResourcesToLoad(
    section: BillingSection,
    loadedResources: Set<BillingResource>,
    freshResources: Set<BillingResource>,
    userAvailable: Boolean,
    force: Boolean,
): Set<BillingResource> = billingResourcesForSection(section).filterTo(linkedSetOf()) { resource ->
    when {
        force -> true
        resource == BillingResource.User -> !userAvailable && resource !in loadedResources
        else -> resource !in loadedResources || resource !in freshResources
    }
}

internal fun isBillingSectionLoaded(
    section: BillingSection,
    loadedResources: Set<BillingResource>,
    userAvailable: Boolean,
): Boolean = billingResourcesForSection(section).all { resource ->
    resource in loadedResources || (resource == BillingResource.User && userAvailable)
}

internal fun isBillingSectionLoading(
    section: BillingSection,
    loadingResources: Set<BillingResource>,
): Boolean = billingResourcesForSection(section).any(loadingResources::contains)

internal fun areBillingCacheResourcesFresh(
    loadedAtEpochMillis: Map<BillingResource, Long>,
    nowEpochMillis: Long,
    ttlMillis: Long,
): Boolean = BILLING_CACHE_RESOURCES.all { resource ->
    isLoadedSnapshotFresh(
        loadedAtEpochMillis[resource],
        nowEpochMillis,
        ttlMillis,
    )
}

internal data class BillingQuotaPresentation(
    val value: String,
    val supportingText: String? = null,
    val progress: Float? = null,
)

internal fun billingQuotaPresentation(
    monthlyQuotaCents: Int?,
    usedQuotaCents: Int,
    formatMoney: (Int) -> String,
): BillingQuotaPresentation = when {
    monthlyQuotaCents == null || monthlyQuotaCents == 0 -> BillingQuotaPresentation("—")
    monthlyQuotaCents < 0 -> BillingQuotaPresentation(
        value = "无限额度",
        supportingText = "本月已用 ${formatMoney(usedQuotaCents)}",
    )
    else -> BillingQuotaPresentation(
        value = "${formatMoney(usedQuotaCents)} / ${formatMoney(monthlyQuotaCents)}",
        progress = (usedQuotaCents.toFloat() / monthlyQuotaCents.toFloat()).coerceIn(0f, 1f),
    )
}
