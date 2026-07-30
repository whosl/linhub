package com.linhub.android.ui

internal fun mediaResultKey(kind: String, query: String): String =
    "$kind\u0000${query.trim()}"

internal fun isLoadedSnapshotFresh(
    loadedAtEpochMillis: Long?,
    nowEpochMillis: Long,
    ttlMillis: Long,
): Boolean = loadedAtEpochMillis != null &&
    nowEpochMillis >= loadedAtEpochMillis &&
    nowEpochMillis - loadedAtEpochMillis < ttlMillis

internal fun shouldReuseMediaResult(
    currentResultKey: String?,
    requestedResultKey: String,
    loadedAtEpochMillis: Long?,
    nowEpochMillis: Long,
    ttlMillis: Long,
    allowExpired: Boolean = false,
): Boolean {
    if (currentResultKey != requestedResultKey) return false
    if (allowExpired) return true
    return isLoadedSnapshotFresh(loadedAtEpochMillis, nowEpochMillis, ttlMillis)
}
