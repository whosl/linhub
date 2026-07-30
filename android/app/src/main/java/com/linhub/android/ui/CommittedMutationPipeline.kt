package com.linhub.android.ui

import kotlinx.coroutines.CancellationException

/**
 * 区分服务端写入与写入后的读回校准。
 *
 * 一旦 [commit] 返回，业务写入已经有确定结果；此后 [reconcile] 失败只能表示界面数据暂未
 * 刷新，不能再把已成功的写操作报告为失败。[onCommitted] 会在校准开始前同步执行，保证
 * 支付跳转、成功反馈和可安全推导的本地状态不被额外网络请求延迟。
 */
internal sealed interface CommittedMutationOutcome<out T> {
    data class Rejected(val error: Throwable) : CommittedMutationOutcome<Nothing>

    data class Committed<T>(
        val value: T,
        val reconciliationError: Throwable? = null,
    ) : CommittedMutationOutcome<T>
}

internal suspend fun <T> commitThenReconcile(
    commit: suspend () -> T,
    onCommitted: (T) -> Unit,
    reconcile: suspend (T) -> Unit,
): CommittedMutationOutcome<T> {
    val value = try {
        commit()
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        return CommittedMutationOutcome.Rejected(error)
    }

    onCommitted(value)

    val reconciliationError = try {
        reconcile(value)
        null
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        error
    }
    return CommittedMutationOutcome.Committed(value, reconciliationError)
}
