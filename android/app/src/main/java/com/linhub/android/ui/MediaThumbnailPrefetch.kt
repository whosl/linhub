package com.linhub.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import coil.imageLoader
import coil.request.ImageRequest
import coil.size.Precision
import com.linhub.android.BuildConfig
import com.linhub.android.core.model.MediaAsset

@Composable
internal fun MediaThumbnailPrefetch(
    assets: List<MediaAsset>,
    enabled: Boolean,
) {
    val context = LocalContext.current
    val urls = remember(assets, enabled) {
        if (enabled && !BuildConfig.BENCHMARK_ENABLED) {
            mediaThumbnailPrefetchUrls(assets)
        } else {
            emptyList()
        }
    }
    DisposableEffect(context, urls) {
        val requests = urls.map { url ->
            context.imageLoader.enqueue(
                ImageRequest.Builder(context)
                    .data(resolvePrefetchMediaUrl(url))
                    .size(PREFETCH_THUMBNAIL_SIZE_PX)
                    .precision(Precision.INEXACT)
                    .build(),
            )
        }
        onDispose { requests.forEach { it.dispose() } }
    }
}

internal fun mediaThumbnailPrefetchUrls(
    assets: List<MediaAsset>,
    limit: Int = PREFETCH_MEDIA_LIMIT,
): List<String> {
    if (limit <= 0) return emptyList()
    return assets.asSequence()
        .filter { it.mimeType.startsWith("image/") && it.url.isNotBlank() }
        .map(MediaAsset::url)
        .distinct()
        .take(limit)
        .toList()
}

internal fun resolvePrefetchMediaUrl(
    url: String,
    baseUrl: String = BuildConfig.API_BASE_URL,
): String = if (url.startsWith('/')) baseUrl.trimEnd('/') + url else url

private const val PREFETCH_MEDIA_LIMIT = 6
private const val PREFETCH_THUMBNAIL_SIZE_PX = 512
