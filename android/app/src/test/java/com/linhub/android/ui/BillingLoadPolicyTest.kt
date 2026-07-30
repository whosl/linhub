package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BillingLoadPolicyTest {
    @Test
    fun `套餐首屏复用已有用户且只请求套餐`() {
        assertEquals(
            setOf(BillingResource.Plans),
            billingResourcesToLoad(
                section = BillingSection.Plans,
                loadedResources = emptySet(),
                freshResources = emptySet(),
                userAvailable = true,
                force = false,
            ),
        )
    }

    @Test
    fun `用量与流水按标签独立请求`() {
        assertEquals(
            setOf(BillingResource.Usage),
            billingResourcesToLoad(
                BillingSection.Usage,
                emptySet(),
                emptySet(),
                userAvailable = true,
                force = false,
            ),
        )
        assertEquals(
            setOf(BillingResource.Ledger),
            billingResourcesToLoad(
                BillingSection.Ledger,
                emptySet(),
                emptySet(),
                userAvailable = true,
                force = false,
            ),
        )
    }

    @Test
    fun `过期快照可显示但仍需后台刷新`() {
        val loaded = setOf(BillingResource.User, BillingResource.Usage)

        assertTrue(isBillingSectionLoaded(BillingSection.Usage, loaded, userAvailable = true))
        assertEquals(
            setOf(BillingResource.Usage),
            billingResourcesToLoad(
                BillingSection.Usage,
                loaded,
                freshResources = setOf(BillingResource.User),
                userAvailable = true,
                force = false,
            ),
        )
    }

    @Test
    fun `新鲜资源与快速重进不重复请求`() {
        val loaded = BillingResource.entries.toSet()

        assertTrue(isBillingSectionLoaded(BillingSection.Ledger, loaded, userAvailable = true))
        assertFalse(
            isBillingSectionLoading(BillingSection.Ledger, setOf(BillingResource.Plans)),
        )
        assertEquals(
            emptySet<BillingResource>(),
            billingResourcesToLoad(
                BillingSection.Ledger,
                loaded,
                freshResources = loaded,
                userAvailable = true,
                force = false,
            ),
        )
    }

    @Test
    fun `显式刷新包含当前用户和当前标签资源`() {
        assertEquals(
            setOf(BillingResource.User, BillingResource.Plans),
            billingResourcesToLoad(
                BillingSection.Plans,
                BillingResource.entries.toSet(),
                BillingResource.entries.toSet(),
                userAvailable = true,
                force = true,
            ),
        )
    }

    @Test
    fun `整组缓存只有三个列表资源都新鲜时才能回写`() {
        val incomplete = mapOf(
            BillingResource.Plans to 10_000L,
            BillingResource.Usage to 10_000L,
        )
        val complete = incomplete + (BillingResource.Ledger to 10_000L)

        assertFalse(areBillingCacheResourcesFresh(incomplete, 20_000L, 30_000L))
        assertTrue(areBillingCacheResourcesFresh(complete, 39_999L, 30_000L))
        assertFalse(areBillingCacheResourcesFresh(complete, 40_000L, 30_000L))
    }

    @Test
    fun `有限额度显示用量比例并限制进度范围`() {
        val display = billingQuotaPresentation(12_000, 7_838) { it.toString() }
        val overused = billingQuotaPresentation(12_000, 20_000) { it.toString() }

        assertEquals("7838 / 12000", display.value)
        assertEquals(7_838f / 12_000f, display.progress)
        assertEquals(1f, overused.progress)
    }

    @Test
    fun `无限额度显示本月已用金额`() {
        assertEquals(
            BillingQuotaPresentation(
                value = "无限额度",
                supportingText = "本月已用 ¥31.42",
            ),
            billingQuotaPresentation(-1, 3_142) { cents ->
                "¥${cents / 100}.${(cents % 100).toString().padStart(2, '0')}"
            },
        )
    }
}
