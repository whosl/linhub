# 文件预览代码块与复制审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`（设备测试不访问网络）

## Findings

1. Web `MediaPreviewPanel` 对 Markdown、Office、CSV/TSV 使用 `MarkdownRenderer`，对其他文本/代码文件使用 `CodeBlock(showRunButton=false)`；两类代码块都可复制。
2. Android 旧 `TextDocumentPreview` 对富文本调用 `MarkdownText` 但未提供复制回调，对原始文本仅显示 `SelectionContainer + Text`，因此代码文件没有语言顶栏、高亮、折叠或一键复制。
3. 当前实现让文件预览复用 `MarkdownCodeBlock`：原始文件按扩展名映射语言并显式禁用运行，富文本代码块接入系统剪贴板；聊天与 Artifact 中默认允许的代码运行行为不受影响。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 原始代码文件预览 | 显示语言、高亮、折叠和复制，不提供运行 | `MediaPreviewDialog.kt`、`MarkdownRenderer.kt` | `.kt` 设备测试断言无“运行”节点并复制精确原文 | complete | — |
| 富文本文件代码复制 | Markdown/Office/CSV 中 fenced code 可复制 | `TextDocumentPreview` 的 `onCopyCode` | Markdown 设备测试逐字符比对 code literal | complete | — |
| 语言映射 | 常见扩展名与 Web 预览语言一致 | `MEDIA_PREVIEW_LANGUAGES` | JVM 测试覆盖 Kotlin、TypeScript、Python、无扩展名 | complete | — |
| 主应用稳定性 | 最新包可启动且无崩溃 | Debug APK | 冷启动 `MainActivity` 成功，目标 PID 存在，Crash Buffer 为空 | complete | — |

## Verification

- `MediaPreviewPolicyTest`：新增语言映射用例通过。
- `MediaPreviewClipboardTest`：Pixel 9 AVD 2/2 通过。
- 与 `ArtifactMarkdownClipboardTest` 合并运行：3/3 通过，耗时 5.765 秒。
- `:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleDebugAndroidTest` 全部通过。
- 最新 Debug APK 已重新安装到 `emulator-5554`，冷启动成功，Crash Buffer 为空。

## Progress Summary

当前未提交工作区中的文件中心文本/代码预览已覆盖 Web 的代码块与剪贴板交互，并用真实系统剪贴板设备测试证明，不再仅依赖可选择文本作为较窄替代。真机兼容性与总目标的其他外部门槛仍在总覆盖审计中单列。
