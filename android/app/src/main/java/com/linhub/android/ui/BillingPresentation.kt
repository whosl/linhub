package com.linhub.android.ui

internal enum class BillingListPosition {
    Single,
    First,
    Middle,
    Last,
}

internal fun billingAmountRows(amounts: List<Int>, columnCount: Int = 3): List<List<Int>> {
    require(columnCount > 0) { "每行金额数量必须大于 0" }
    return amounts.chunked(columnCount)
}

internal fun billingListPosition(index: Int, total: Int): BillingListPosition {
    require(total > 0) { "列表项数量必须大于 0" }
    require(index in 0 until total) { "列表项索引超出范围" }
    return when {
        total == 1 -> BillingListPosition.Single
        index == 0 -> BillingListPosition.First
        index == total - 1 -> BillingListPosition.Last
        else -> BillingListPosition.Middle
    }
}
