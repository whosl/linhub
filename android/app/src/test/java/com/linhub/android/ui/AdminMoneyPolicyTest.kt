package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AdminMoneyPolicyTest {
    @Test
    fun `元金额精确换算为整数分`() {
        assertEquals(1, parseYuanToCents("0.01"))
        assertEquals(1_025, parseYuanToCents("10.25"))
        assertEquals(1_001, parseYuanToCents("10.005"))
    }

    @Test
    fun `拒绝零负数非法值与整数溢出`() {
        assertNull(parseYuanToCents("0"))
        assertNull(parseYuanToCents("-1"))
        assertNull(parseYuanToCents("abc"))
        assertNull(parseYuanToCents("999999999999999"))
    }
}
