package com.linhub.android.ui

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DrawerActionPolicyTest {
    @Test
    fun `动作只在抽屉完全关闭后执行`() = runBlocking {
        val closeStarted = CompletableDeferred<Unit>()
        val allowCloseToFinish = CompletableDeferred<Unit>()
        var actionExecuted = false

        val job = launch(start = CoroutineStart.UNDISPATCHED) {
            closeDrawerThenRun(
                closeDrawer = {
                    closeStarted.complete(Unit)
                    allowCloseToFinish.await()
                },
                action = { actionExecuted = true },
            )
        }

        closeStarted.await()
        assertFalse(actionExecuted)

        allowCloseToFinish.complete(Unit)
        job.join()
        assertTrue(actionExecuted)
    }

    @Test
    fun `抽屉关闭无需动画时动作仍会执行`() = runBlocking {
        var actionExecuted = false

        closeDrawerThenRun(
            closeDrawer = {},
            action = { actionExecuted = true },
        )

        assertTrue(actionExecuted)
    }
}
