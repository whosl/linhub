package com.linhub.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent

internal enum class ArtifactShareLaunchResult {
    Opened,
    CopiedFallback,
}

internal fun launchArtifactShare(
    context: Context,
    url: String,
    launch: (Intent) -> Unit = context::startActivity,
): ArtifactShareLaunchResult {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
    }
    val chooser = Intent.createChooser(sendIntent, "分享作品")
    return runCatching { launch(chooser) }.fold(
        onSuccess = { ArtifactShareLaunchResult.Opened },
        onFailure = {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("LinHub 分享链接", url))
            ArtifactShareLaunchResult.CopiedFallback
        },
    )
}
