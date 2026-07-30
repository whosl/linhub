# Artifact Markdown 代码复制审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`（本测试不访问网络）

## Findings

1. Web Artifact Markdown 预览复用 `MarkdownRenderer` / `CodeBlock`，点击复制会调用剪贴板实现；Android 旧 `ArtifactDialog.kt` 传入的 `onCopyCode = {}` 只让渲染器切换为“已复制”，没有写入系统剪贴板。
2. 当前实现把 Markdown Artifact 预览抽成可设备测试的 `ArtifactMarkdownPreview`，并在复制回调中使用 Android `ClipboardManager` 写入完整代码原文。
3. 回归测试不以语义树或截图作为唯一证据：它点击真实 Compose 代码块按钮后读取目标 App 的系统剪贴板，逐字符断言包含结尾换行的 fenced code 内容，再验证按钮语义切换为“已复制代码”。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| Markdown Artifact 代码复制 | 点击代码块“复制”后系统剪贴板包含原文 | `ArtifactDialog.kt` 的 `ArtifactMarkdownPreview` | `ArtifactMarkdownClipboardTest` 在 AVD 1/1 通过 | complete | — |
| 复制反馈 | 成功点击后按钮显示勾选和“已复制” | `MarkdownRenderer.kt` 的代码块状态 | 设备测试断言“已复制代码”语义 | complete | — |
| 主应用稳定性 | 安装测试 APK 后恢复主应用且无崩溃 | Debug APK | `MainActivity` 启动成功，目标 PID 存在，Crash Buffer 为空 | complete | — |

## Verification

- `:app:testDebugUnitTest`：通过。
- `:app:lintDebug`：通过。
- `:app:assembleDebug`：通过。
- `:app:assembleDebugAndroidTest`：通过，测试已迁移到 Compose Test v2 API，无新增弃用警告。
- `ArtifactMarkdownClipboardTest`：Pixel 9 AVD 1/1 通过，耗时 3.193 秒。
- 最新 Debug APK 已重新安装到 `emulator-5554`，`MainActivity` 启动成功，Crash Buffer 为空。

## Progress Summary

当前未提交工作区中的 Artifact Markdown 代码复制路径已从视觉假状态修复为系统剪贴板真实闭环，并具备设备级自动回归证据。Artifact 其他正式发布缺口（Release 证书对应的 HTTPS 自动验证）仍在总覆盖审计中单列，不影响本交互项的 complete 结论。
