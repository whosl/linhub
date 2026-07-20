package com.linhub.android.ui

import com.linhub.android.core.model.ModelsResponse

/** 保留仍可用的显式选择；模型被停用或删除时回退到服务端默认的可聊天模型。 */
internal fun LinHubUiState.withRefreshedModels(response: ModelsResponse): LinHubUiState {
    val resolvedDefaultModelId = resolveChatModelId(
        response.models,
        response.defaultModelId,
        user?.defaultModelId,
    )
    val resolvedSelectedModelId = resolveChatModelId(
        response.models,
        selectedModelId,
        resolvedDefaultModelId,
    )
    return copy(
        models = response.models,
        defaultModelId = resolvedDefaultModelId,
        selectedModelId = resolvedSelectedModelId,
        thinkingEffort = thinkingEffortAfterModelChange(
            this,
            resolvedSelectedModelId,
            response.models,
        ),
    )
}
