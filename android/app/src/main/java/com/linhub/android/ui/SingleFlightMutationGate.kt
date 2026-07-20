package com.linhub.android.ui

import java.util.concurrent.atomic.AtomicBoolean

/**
 * 为高风险写操作提供进程内 single-flight 所有权。UI 的 loading 状态负责反馈与禁用按钮，
 * 原子门负责堵住状态重组前同一帧内的重复点击，以及来自多个入口的并发提交。
 */
internal class SingleFlightMutationGate {
    private val active = AtomicBoolean(false)

    fun tryAcquire(): Boolean = active.compareAndSet(false, true)

    fun release() {
        active.set(false)
    }

    fun isActive(): Boolean = active.get()
}
