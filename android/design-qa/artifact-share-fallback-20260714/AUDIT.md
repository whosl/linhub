# Artifact 系统分享失败回退审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`（本测试使用确定性 URL，不创建公开 token）

## Findings

1. Web Artifact 分享在公开 token 创建成功后复制 URL，浏览器剪贴板失败会打开手动复制窗口；Android 成功路径使用系统 Sharesheet，但旧实现对 `startActivity` 异常仅 `runCatching` 后丢弃，用户没有链接或错误反馈。
2. 当前实现把系统分享抽为 `launchArtifactShare`：标准分支构造 `ACTION_CHOOSER → ACTION_SEND / text/plain`；启动失败时将同一 URL 写入系统剪贴板并返回明确结果。
3. `LinHubApp` 根据结果仅在回退分支显示“无法打开系统分享，链接已复制”，随后一次性消费 URL。公开 token API 失败仍由既有 ViewModel 错误路径处理，两个失败阶段没有混淆。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 系统分享成功 | 打开包含公开 URL 的文本 Sharesheet | `ArtifactShareLauncher.kt` | 设备测试断言 chooser、内层 action、MIME、URL | complete | — |
| 系统分享失败恢复 | 无可用目标时仍让用户获得链接 | `ArtifactShareLauncher.kt`、`LinHubApp.kt` | 注入 `ActivityNotFoundException` 后读取系统剪贴板，URL/标签一致 | complete | — |
| 一次性消费与反馈 | 不重复打开，回退时明确提示 | `LinHubApp.kt`、`consumeShareUrl()` | 源码接线；消息状态使用既有 Snackbar 闭环 | complete | 未在真实“无任何分享 App”的系统镜像复验，注入异常已覆盖确定性分支 |
| 主应用稳定性 | 最新包可启动且无崩溃 | Debug APK | 冷启动 `MainActivity` 成功，目标 PID 存在，Crash Buffer 为空 | complete | — |

## Verification

- `ArtifactShareLauncherTest`：Pixel 9 AVD 2/2 通过，成功分支不污染剪贴板，失败分支精确复制 URL。
- 与 `ArtifactMarkdownClipboardTest`、`MediaPreviewClipboardTest` 合并运行：5/5 通过，耗时 7.184 秒。
- `:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleDebugAndroidTest` 全部通过。
- 最新 Debug APK 已重新安装到 `emulator-5554`，冷启动成功，Crash Buffer 为空。

## Progress Summary

当前未提交工作区中的 Artifact 分享已覆盖公开链接生成、标准系统 Sharesheet 和系统分享不可用时的可恢复回退，不再静默丢失用户操作。正式 Release 证书对应的 HTTPS 自动验证仍在总覆盖审计中单列。
