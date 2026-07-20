package com.linhub.android.core.cache

import java.time.Instant

object EpochTime {
    fun now(): Long = System.currentTimeMillis()

    fun parseIso(value: String): Long = Instant.parse(value).toEpochMilli()

    fun formatIso(epochMillis: Long): String = Instant.ofEpochMilli(epochMillis).toString()

    fun addClamped(epochMillis: Long, durationMillis: Long): Long {
        require(durationMillis >= 0) { "durationMillis must not be negative" }
        return if (durationMillis > Long.MAX_VALUE - epochMillis) {
            Long.MAX_VALUE
        } else {
            epochMillis + durationMillis
        }
    }
}
