package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class BillingPresentationTest {
    @Test
    fun `充值金额固定按三列分成两行`() {
        assertEquals(
            listOf(
                listOf(1_000, 3_000, 5_000),
                listOf(10_000, 20_000, 50_000),
            ),
            billingAmountRows(listOf(1_000, 3_000, 5_000, 10_000, 20_000, 50_000)),
        )
    }

    @Test
    fun `余额流水首中末位置稳定映射到分段卡片`() {
        assertEquals(BillingListPosition.First, billingListPosition(0, 4))
        assertEquals(BillingListPosition.Middle, billingListPosition(1, 4))
        assertEquals(BillingListPosition.Middle, billingListPosition(2, 4))
        assertEquals(BillingListPosition.Last, billingListPosition(3, 4))
        assertEquals(BillingListPosition.Single, billingListPosition(0, 1))
    }

    @Test
    fun `非法充值列数和流水索引立即失败`() {
        assertThrows(IllegalArgumentException::class.java) {
            billingAmountRows(listOf(1_000), columnCount = 0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            billingListPosition(index = 1, total = 1)
        }
    }
}
