package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NetworkStatusPolicyTest {
    @Test
    fun `initial status does not show a transition message`() {
        assertNull(networkTransitionMessage(false, wasOffline = false, isOnline = false))
        assertNull(networkTransitionMessage(false, wasOffline = true, isOnline = true))
    }

    @Test
    fun `offline and recovery transitions use web parity messages`() {
        assertEquals(
            "网络已断开，部分功能不可用",
            networkTransitionMessage(true, wasOffline = false, isOnline = false),
        )
        assertEquals(
            "网络已恢复",
            networkTransitionMessage(true, wasOffline = true, isOnline = true),
        )
    }

    @Test
    fun `unchanged status does not replace another message`() {
        assertNull(networkTransitionMessage(true, wasOffline = false, isOnline = true))
        assertNull(networkTransitionMessage(true, wasOffline = true, isOnline = false))
    }

    @Test
    fun `offline attachment upload immediately offers retry`() {
        assertEquals(
            OFFLINE_ATTACHMENT_UPLOAD_MESSAGE,
            attachmentUploadOfflineMessage(isOffline = true),
        )
        assertNull(attachmentUploadOfflineMessage(isOffline = false))
    }

    @Test
    fun `foreground reconnect refreshes immediately`() {
        assertEquals(
            NetworkReconnectAction.RefreshNow,
            networkReconnectAction(
                initialized = true,
                wasOffline = true,
                isOnline = true,
                hasActiveSession = true,
                appInForeground = true,
            ),
        )
    }

    @Test
    fun `background reconnect defers refresh until foreground`() {
        assertEquals(
            NetworkReconnectAction.RefreshOnForeground,
            networkReconnectAction(
                initialized = true,
                wasOffline = true,
                isOnline = true,
                hasActiveSession = true,
                appInForeground = false,
            ),
        )
    }

    @Test
    fun `initial online state and inactive session do not refresh`() {
        assertEquals(
            NetworkReconnectAction.None,
            networkReconnectAction(false, true, true, true, true),
        )
        assertEquals(
            NetworkReconnectAction.None,
            networkReconnectAction(true, true, true, false, true),
        )
        assertEquals(
            NetworkReconnectAction.None,
            networkReconnectAction(true, false, true, true, true),
        )
    }
}
