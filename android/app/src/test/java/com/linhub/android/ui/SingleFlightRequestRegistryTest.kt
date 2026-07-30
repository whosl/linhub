package com.linhub.android.ui

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SingleFlightRequestRegistryTest {
    @Test
    fun sameResourceIsRejectedWhileDifferentResourcesRemainParallel() {
        val gate = KeyedSingleFlightGate<String>()

        assertTrue(gate.tryAcquire("projects"))
        assertFalse(gate.tryAcquire("projects"))
        assertTrue(gate.tryAcquire("skills"))
        assertTrue(gate.isActive("projects"))

        gate.release("projects")

        assertFalse(gate.isActive("projects"))
        assertTrue(gate.tryAcquire("projects"))
    }

    @Test
    fun concurrentBurstForSameResourceHasExactlyOneOwner() {
        val gate = KeyedSingleFlightGate<String>()
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
                    if (gate.tryAcquire("knowledge:index")) owners.incrementAndGet()
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
    }

    @Test
    fun loadingRemainsActiveUntilLastParallelResourceFinishes() {
        val tracker = ReferenceCountedLoadingTracker<String>()

        assertTrue(tracker.update("knowledge", loading = true))
        assertTrue(tracker.update("knowledge", loading = true))
        assertEquals(2, tracker.count("knowledge"))
        assertTrue(tracker.update("knowledge", loading = false))
        assertEquals(1, tracker.count("knowledge"))
        assertFalse(tracker.update("knowledge", loading = false))
        assertEquals(0, tracker.count("knowledge"))
        assertFalse(tracker.update("knowledge", loading = false))
    }
}
