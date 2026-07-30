package com.linhub.android.ui

import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.linhub.android.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ExternalLinkLauncherTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val clipboard
        get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    @Before
    fun prepareForegroundApp() {
        composeRule.setContent { Text("外部链接回归") }
        clipboard.clearPrimaryClip()
    }

    @Test
    fun httpsLink_launchesViewIntent() {
        var launched: Intent? = null

        val result = launchExternalLink(context, HTTPS_URL) { launched = it }

        assertEquals(ExternalLinkLaunchResult.Opened, result)
        assertEquals(Intent.ACTION_VIEW, launched?.action)
        assertEquals(HTTPS_URL, launched?.dataString)
        assertFalse(clipboard.hasPrimaryClip())
    }

    @Test
    fun mailtoLink_isSupported() {
        var launched: Intent? = null

        val result = launchExternalLink(context, MAILTO_URL) { launched = it }

        assertEquals(ExternalLinkLaunchResult.Opened, result)
        assertEquals(MAILTO_URL, launched?.dataString)
    }

    @Test
    fun rootRelativeLink_resolvesAgainstCurrentBackend() {
        var launched: Intent? = null

        val result = launchExternalLink(context, RELATIVE_URL) { launched = it }

        assertEquals(ExternalLinkLaunchResult.Opened, result)
        assertEquals(
            BuildConfig.API_BASE_URL.trimEnd('/') + RELATIVE_URL,
            launched?.dataString,
        )
    }

    @Test
    fun unsupportedOrMalformedLink_isRejectedWithoutLaunchOrClipboard() {
        var launchCount = 0

        listOf(
            "javascript:alert(1)",
            "https:///missing-host",
            "//untrusted.example/path",
            "not-a-link",
            "",
        ).forEach { url ->
            assertEquals(
                ExternalLinkLaunchResult.Rejected,
                launchExternalLink(context, url) { launchCount += 1 },
            )
        }

        assertEquals(0, launchCount)
        assertFalse(clipboard.hasPrimaryClip())
    }

    @Test
    fun unavailableHandler_copiesExactLinkAsFallback() {
        val result = launchExternalLink(context, HTTPS_URL) {
            throw ActivityNotFoundException("没有可用的浏览器")
        }

        assertEquals(ExternalLinkLaunchResult.CopiedFallback, result)
        assertEquals(
            HTTPS_URL,
            clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString(),
        )
        assertEquals("LinHub 链接", clipboard.primaryClipDescription?.label?.toString())
    }

    private companion object {
        const val HTTPS_URL = "https://example.com/source?id=42"
        const val MAILTO_URL = "mailto:hello@example.com"
        const val RELATIVE_URL = "/share/artifact/internal-link"
    }
}
