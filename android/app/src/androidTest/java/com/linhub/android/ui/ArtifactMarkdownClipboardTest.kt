package com.linhub.android.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ArtifactMarkdownClipboardTest {
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
    fun markdownCodeCopy_writesExactCodeAndShowsCopiedState() {
        composeRule.setContent {
            MaterialTheme {
                ArtifactMarkdownPreview(
                    content = """
                        # 回归验证

                        ```kotlin
                        val marker = "ARTIFACT-COPY-E2E"
                        ```
                    """.trimIndent(),
                )
            }
        }

        composeRule.onNodeWithContentDescription("复制代码").performClick()

        assertEquals(
            "val marker = \"ARTIFACT-COPY-E2E\"\n",
            clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString(),
        )
        composeRule.onNodeWithContentDescription("已复制代码")
            .assertContentDescriptionEquals("已复制代码")
    }

    @Test
    fun markdownLink_delegatesToExternalLinkLauncher() {
        var openedUrl: String? = null
        composeRule.setContent {
            MaterialTheme {
                ArtifactMarkdownPreview(
                    content = "[查看作品来源](https://example.com/artifact-source)",
                    onOpenLink = { openedUrl = it },
                )
            }
        }

        composeRule.onNodeWithText("查看作品来源").performClick()

        assertEquals("https://example.com/artifact-source", openedUrl)
    }
}
