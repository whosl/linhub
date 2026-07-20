package com.linhub.android.core.cache

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object CachePayloadCodec {
    @PublishedApi
    internal val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    inline fun <reified T> encode(value: T): String = json.encodeToString(value)

    inline fun <reified T> decodeOrNull(value: String): T? =
        runCatching { json.decodeFromString<T>(value) }.getOrNull()
}
