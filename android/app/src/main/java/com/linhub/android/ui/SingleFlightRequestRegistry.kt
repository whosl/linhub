package com.linhub.android.ui

import java.util.concurrent.ConcurrentHashMap

/**
 * 按资源键同步占有读取请求，允许不同资源并行，同时拒绝同一资源在协程启动前被重复提交。
 */
internal class KeyedSingleFlightGate<K : Any> {
    private val activeKeys = ConcurrentHashMap.newKeySet<K>()

    fun tryAcquire(key: K): Boolean = activeKeys.add(key)

    fun release(key: K) {
        activeKeys.remove(key)
    }

    fun isActive(key: K): Boolean = key in activeKeys
}

/** 同一页面可并行加载多个子资源；只有最后一个完成时才应移除页面 loading。 */
internal class ReferenceCountedLoadingTracker<K : Any> {
    private val counts = mutableMapOf<K, Int>()

    @Synchronized
    fun update(key: K, loading: Boolean): Boolean {
        if (loading) {
            counts[key] = counts.getOrDefault(key, 0) + 1
            return true
        }
        val next = (counts[key] ?: 0) - 1
        if (next > 0) {
            counts[key] = next
            return true
        }
        counts.remove(key)
        return false
    }

    @Synchronized
    fun count(key: K): Int = counts[key] ?: 0
}
