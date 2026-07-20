package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PaymentUrlPolicyTest {
    @Test
    fun `accepts only credential-free https payment urls`() {
        assertEquals(
            "https://pay.example.com/order/123",
            safeExternalPaymentUrl("https://pay.example.com/order/123"),
        )
        assertNull(safeExternalPaymentUrl("http://pay.example.com/order/123"))
        assertNull(safeExternalPaymentUrl("weixin://pay/order/123"))
        assertNull(safeExternalPaymentUrl("https://user:secret@pay.example.com/order/123"))
        assertNull(safeExternalPaymentUrl("not a url"))
    }
}
