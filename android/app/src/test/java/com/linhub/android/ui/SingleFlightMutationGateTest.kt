package com.linhub.android.ui

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SingleFlightMutationGateTest {
    @Test
    fun repeatedSubmissionIsRejectedUntilOwnerReleases() {
        val gate = SingleFlightMutationGate()

        assertTrue(gate.tryAcquire())
        assertTrue(gate.isActive())
        assertFalse(gate.tryAcquire())

        gate.release()

        assertFalse(gate.isActive())
        assertTrue(gate.tryAcquire())
    }

    @Test
    fun concurrentBurstHasExactlyOneOwner() {
        val gate = SingleFlightMutationGate()
        val workers = 32
        val ready = CountDownLatch(workers)
        val start = CountDownLatch(1)
        val done = CountDownLatch(workers)
        val owners = AtomicInteger(0)
        val executor = Executors.newFixedThreadPool(workers)
        try {
            repeat(workers) {
                executor.execute {
                    ready.countDown()
                    start.await()
                    if (gate.tryAcquire()) owners.incrementAndGet()
                    done.countDown()
                }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            assertTrue(done.await(5, TimeUnit.SECONDS))
        } finally {
            executor.shutdownNow()
        }

        assertEquals(1, owners.get())
        assertTrue(gate.isActive())
    }

    @Test
    fun mutationDomainsUseIndependentOwnership() {
        val domains = List(7) { SingleFlightMutationGate() }

        domains.forEach { gate -> assertTrue(gate.tryAcquire()) }
        domains.forEach { gate -> assertFalse(gate.tryAcquire()) }
    }
}
