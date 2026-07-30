package com.linhub.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.linhub.android.core.model.User
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BillingRedeemUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun committedRedeem_clearsCodeOnlyAfterSuccessEvent() {
        var submittedCode: String? = null
        lateinit var publishSuccess: () -> Unit

        composeRule.setContent {
            var successEvent by remember { mutableLongStateOf(0L) }
            publishSuccess = { successEvent += 1 }
            MaterialTheme {
                BillingScreen(
                    user = User(
                        id = "billing-user",
                        email = "billing@example.com",
                        name = "账务测试",
                        createdAt = "2026-07-14T00:00:00Z",
                    ),
                    plans = emptyList(),
                    usageRecords = emptyList(),
                    ledgerEntries = emptyList(),
                    selectedSection = BillingSection.Recharge,
                    loadedResources = setOf(BillingResource.User),
                    loadingResources = emptySet(),
                    loading = false,
                    redeemSuccessEvent = successEvent,
                    onOpenMenu = {},
                    onRefresh = {},
                    onSelectSection = {},
                    onSubscribe = {},
                    onRecharge = {},
                    onRedeem = { submittedCode = it },
                )
            }
        }

        composeRule.onNodeWithText("输入兑换码")
            .performScrollTo()
            .performTextInput("  CODE-123  ")
        composeRule.onNodeWithText("兑换").performClick()
        assertEquals("CODE-123", submittedCode)
        composeRule.onNodeWithText("  CODE-123  ").assertExists()

        composeRule.runOnIdle { publishSuccess() }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("输入兑换码").assertExists()
    }
}
