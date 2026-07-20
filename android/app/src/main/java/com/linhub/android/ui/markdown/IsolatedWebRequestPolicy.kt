package com.linhub.android.ui.markdown

/**
 * 公式和 Mermaid 预览只允许本地内联资源与固定 CDN。
 *
 * `loadDataWithBaseURL` 在新 WebView 上会把主文档暴露成 `data:` 请求；如果把它和
 * 普通外链一起拦成 403，整页会显示 `ERR_HTTP_RESPONSE_CODE_FAILURE`。
 */
internal fun isAllowedIsolatedPreviewRequest(
    scheme: String?,
    host: String?,
): Boolean = when {
    scheme.equals("data", ignoreCase = true) -> true
    scheme.equals("about", ignoreCase = true) && host.isNullOrEmpty() -> true
    scheme.equals("https", ignoreCase = true) &&
        host.equals("cdn.jsdelivr.net", ignoreCase = true) -> true
    else -> false
}
