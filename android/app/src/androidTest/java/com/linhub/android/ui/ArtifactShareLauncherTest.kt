package com.linhub.android.ui

import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ArtifactShareLauncherTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val clipboard
        get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    @Before
    fun clearClipboard() {
        composeRule.setContent { Text("Artifact 分享回归") }
        clipboard.clearPrimaryClip()
    }

    @Test
    fun availableShareTarget_launchesTextChooserWithoutTouchingClipboard() {
        var launched: Intent? = null

        val result = launchArtifactShare(context, SHARE_URL) { launched = it }

        assertEquals(ArtifactShareLaunchResult.Opened, result)
        val chooser = requireNotNull(launched)
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        @Suppress("DEPRECATION")
        val sendIntent = requireNotNull(chooser.getParcelableExtra<Intent>(Intent.EXTRA_INTENT))
        assertEquals(Intent.ACTION_SEND, sendIntent.action)
        assertEquals("text/plain", sendIntent.type)
        assertEquals(SHARE_URL, sendIntent.getStringExtra(Intent.EXTRA_TEXT))
        assertFalse(clipboard.hasPrimaryClip())
    }

    @Test
    fun unavailableShareTarget_copiesUrlAsRecoverableFallback() {
        val result = launchArtifactShare(context, SHARE_URL) {
            throw ActivityNotFoundException("没有可用的分享目标")
        }

        assertEquals(ArtifactShareLaunchResult.CopiedFallback, result)
        assertEquals(
            SHARE_URL,
            clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString(),
        )
        assertEquals("LinHub 分享链接", clipboard.primaryClipDescription?.label?.toString())
    }

    private companion object {
        const val SHARE_URL = "https://lin.wenzhuolin.xyz/share/artifact/share-e2e"
    }
}
