package com.linhub.android.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.linhub.android.core.model.MediaAsset
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MediaPreviewClipboardTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val clipboard
        get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    @Before
    fun clearClipboard() {
        clipboard.clearPrimaryClip()
    }

    @Test
    fun rawCodeFile_showsNonRunnableCodeBlockAndCopiesExactText() {
        val source = "val marker = \"MEDIA-RAW-COPY-E2E\""
        composeRule.setContent {
            MaterialTheme {
                TextDocumentPreview(
                    asset = asset("Main.kt", "text/plain"),
                    text = source,
                    modifier = Modifier,
                )
            }
        }

        assertEquals(0, composeRule.onAllNodesWithText("运行").fetchSemanticsNodes().size)
        composeRule.onNodeWithContentDescription("复制代码").performClick()

        assertEquals(source, clipboardText())
    }

    @Test
    fun markdownFile_fencedCodeCopiesExactLiteral() {
        composeRule.setContent {
            MaterialTheme {
                TextDocumentPreview(
                    asset = asset("notes.md", "text/markdown"),
                    text = """
                        # 文件预览

                        ```kotlin
                        val marker = "MEDIA-MARKDOWN-COPY-E2E"
                        ```
                    """.trimIndent(),
                    modifier = Modifier,
                )
            }
        }

        composeRule.onNodeWithContentDescription("复制代码").performClick()

        assertEquals("val marker = \"MEDIA-MARKDOWN-COPY-E2E\"\n", clipboardText())
    }

    @Test
    fun markdownFile_linkDelegatesToExternalLinkLauncher() {
        var openedUrl: String? = null
        composeRule.setContent {
            MaterialTheme {
                TextDocumentPreview(
                    asset = asset("links.md", "text/markdown"),
                    text = "[来源](https://example.com/report)",
                    modifier = Modifier,
                    onOpenLink = { openedUrl = it },
                )
            }
        }

        composeRule.onNodeWithText("来源").performClick()

        assertEquals("https://example.com/report", openedUrl)
    }

    private fun clipboardText(): String? =
        clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()

    private fun asset(name: String, mimeType: String) = MediaAsset(
        id = "asset-clipboard-test",
        ownerId = "user-test",
        kind = "upload",
        name = name,
        mimeType = mimeType,
        size = 128,
        url = "/api/media/asset-clipboard-test",
        createdAt = "2026-07-14T00:00:00.000Z",
    )
}
