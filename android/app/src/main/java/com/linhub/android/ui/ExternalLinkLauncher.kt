package com.linhub.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.linhub.android.BuildConfig

internal enum class ExternalLinkLaunchResult {
    Opened,
    CopiedFallback,
    Rejected,
}

internal fun launchExternalLink(
    context: Context,
    rawUrl: String,
    launch: (Intent) -> Unit = context::startActivity,
): ExternalLinkLaunchResult {
    val trimmed = rawUrl.trim()
    val url = if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
        BuildConfig.API_BASE_URL.trimEnd('/') + trimmed
    } else {
        trimmed
    }
    val uri = runCatching { Uri.parse(url) }.getOrNull()
        ?: return ExternalLinkLaunchResult.Rejected
    val supported = when (uri.scheme?.lowercase()) {
        "http", "https" -> !uri.host.isNullOrBlank()
        "mailto" -> uri.schemeSpecificPart.isNotBlank()
        else -> false
    }
    if (!supported) return ExternalLinkLaunchResult.Rejected

    return runCatching { launch(Intent(Intent.ACTION_VIEW, uri)) }.fold(
        onSuccess = { ExternalLinkLaunchResult.Opened },
        onFailure = {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("LinHub 链接", url))
            ExternalLinkLaunchResult.CopiedFallback
        },
    )
}
