package com.linhub.android.ui

import com.linhub.android.core.model.Model

internal data class ThinkingRequestConfig(
    val extendedThinking: Boolean,
    val effort: String?,
)

internal fun supportedThinkingEfforts(model: Model?): List<String> {
    if (model?.capabilities?.contains("reasoning") != true) return emptyList()
    val key = "${model.slug} ${model.displayName}".lowercase()
    return when (model.providerKind) {
        "anthropic" -> if (Regex("sonnet[-\\s]?5|fable[-\\s]?5").containsMatchIn(key)) {
            listOf("low", "medium", "high", "xhigh", "max")
        } else {
            listOf("low", "medium", "high", "xhigh")
        }
        "google" -> listOf("minimal", "low", "medium", "high", "xhigh")
        else -> listOf("minimal", "low", "medium", "high")
    }
}

internal fun recommendedThinkingEffort(model: Model?): String {
    if (model?.capabilities?.contains("reasoning") != true) return "minimal"
    val key = "${model.slug} ${model.displayName}".lowercase()
    return when (model.providerKind) {
        "openai" -> when {
            Regex("nano|instant|spark").containsMatchIn(key) -> "minimal"
            "mini" in key -> "low"
            "chat" in key -> "medium"
            else -> "high"
        }
        "anthropic" -> when {
            "haiku" in key -> "low"
            Regex("sonnet[-\\s]?5|fable[-\\s]?5").containsMatchIn(key) -> "max"
            Regex("sonnet|opus|fable|mythos").containsMatchIn(key) -> "high"
            else -> "medium"
        }
        "google" -> when {
            "lite" in key -> "minimal"
            Regex("3\\.5.*flash").containsMatchIn(key) -> "medium"
            "flash" in key || "pro" in key -> "high"
            else -> "medium"
        }
        "deepseek" -> when {
            "flash" in key -> "medium"
            Regex("v4|reasoner|thinking|r1|pro").containsMatchIn(key) -> "high"
            else -> "medium"
        }
        "zhipu", "xiaomi", "xiaomi-token-plan" -> when {
            Regex("flash|fast|turbo|lite|air").containsMatchIn(key) -> "low"
            Regex("pro|max|plus").containsMatchIn(key) -> "high"
            else -> "medium"
        }
        else -> "medium"
    }
}

internal fun resolveThinkingEffort(model: Model?, requested: String?): String =
    requested?.takeIf { it in supportedThinkingEfforts(model) }
        ?: recommendedThinkingEffort(model)

internal fun thinkingRequestConfig(
    model: Model?,
    requestedEffort: String?,
): ThinkingRequestConfig {
    if (model?.capabilities?.contains("reasoning") != true) {
        return ThinkingRequestConfig(extendedThinking = false, effort = null)
    }
    return ThinkingRequestConfig(
        extendedThinking = true,
        effort = resolveThinkingEffort(model, requestedEffort),
    )
}
