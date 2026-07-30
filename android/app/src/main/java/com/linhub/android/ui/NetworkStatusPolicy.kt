package com.linhub.android.ui

internal const val OFFLINE_ATTACHMENT_UPLOAD_MESSAGE = "网络已断开，请联网后重试"

internal enum class NetworkReconnectAction {
    None,
    RefreshNow,
    RefreshOnForeground,
}

internal fun networkTransitionMessage(
    initialized: Boolean,
    wasOffline: Boolean,
    isOnline: Boolean,
): String? = when {
    !initialized -> null
    wasOffline && isOnline -> "网络已恢复"
    !wasOffline && !isOnline -> "网络已断开，部分功能不可用"
    else -> null
}

internal fun attachmentUploadOfflineMessage(isOffline: Boolean): String? =
    OFFLINE_ATTACHMENT_UPLOAD_MESSAGE.takeIf { isOffline }

internal fun networkReconnectAction(
    initialized: Boolean,
    wasOffline: Boolean,
    isOnline: Boolean,
    hasActiveSession: Boolean,
    appInForeground: Boolean,
): NetworkReconnectAction = when {
    !initialized || !wasOffline || !isOnline || !hasActiveSession ->
        NetworkReconnectAction.None
    appInForeground -> NetworkReconnectAction.RefreshNow
    else -> NetworkReconnectAction.RefreshOnForeground
}
