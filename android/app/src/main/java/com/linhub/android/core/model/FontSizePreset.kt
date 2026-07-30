package com.linhub.android.core.model

enum class FontSizePreset(
    val storageValue: String,
    val scale: Float,
) {
    EXTRA_SMALL("extra-small", 0.9f),
    SMALL("small", 1f),
    MEDIUM("medium", 1.1f),
    LARGE("large", 1.2f),
    EXTRA_LARGE("extra-large", 1.3f),
}
