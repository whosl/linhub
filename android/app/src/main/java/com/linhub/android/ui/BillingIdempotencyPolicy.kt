package com.linhub.android.ui

import com.linhub.android.core.model.CreateOrderRequest
import com.linhub.android.core.network.ApiException

internal fun billingOrderSignature(request: CreateOrderRequest): String = buildString {
    append(request.kind)
    append(':')
    append(request.amountCents ?: "-")
    append(':')
    append(request.planId ?: "-")
}

/** 4xx 表示服务端明确拒绝且没有未知结算结果；超时或 5xx 保留键供安全重试。 */
internal fun shouldDiscardBillingIdempotencyKey(error: Throwable): Boolean =
    error is ApiException && error.status in 400..499
