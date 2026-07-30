# 外部链接安全启动与恢复审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`（本测试使用确定性 URL，不访问网络）

## Findings

1. Web 聊天 Markdown、搜索来源、Artifact Markdown 和文件预览 Markdown 都产生可打开的新窗口链接。Android 旧聊天/Artifact 会捕获并丢弃 `LocalUriHandler` 异常；旧文件预览未传 `onLink`，点击回调恒为空。
2. 当前实现新增统一安全启动器，放行有效 HTTP、HTTPS、mailto 和解析到当前后端的单斜杠站内路径；系统处理器不可用时复制地址并显示恢复提示，危险、协议相对或无效链接拒绝且不触发外部 Intent。
3. 同一回调从 `LinHubApp` 贯穿聊天消息/来源/工具卡、普通与公开 Artifact、文件中心 Markdown/Office/CSV。设备测试不仅覆盖启动器，还点击真实 Artifact 与文件 Markdown 链接验证 UI 接线。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| HTTPS 外链 | 使用系统 `ACTION_VIEW` 打开完整 URL | `ExternalLinkLauncher.kt`、`ChatScreen.kt` | 设备测试断言 action/data | complete | — |
| 邮件链接 | 支持非空 `mailto:` | `ExternalLinkLauncher.kt` | mailto 设备分支通过 | complete | — |
| 站内相对链接 | `/path` 与 Web 一样解析到当前应用后端 | `ExternalLinkLauncher.kt`、`BuildConfig.API_BASE_URL` | 设备测试断言完整解析 URL | complete | — |
| 无处理器恢复 | 复制地址并提示，不静默丢操作 | `ExternalLinkLauncher.kt`、`LinHubApp.kt` | 注入异常后读取系统剪贴板 URL/标签 | complete | — |
| 危险/无效链接 | 不启动 Intent、不写剪贴板 | scheme/host 校验 | javascript、缺 host、`//host`、无 scheme、空值设备测试通过 | complete | — |
| 文件/Artifact Markdown UI 接线 | 点击可见链接会进入统一启动器 | `MediaPreviewDialog.kt`、`ArtifactDialog.kt` | 两条真实 Compose 点击测试通过 | complete | — |
| 主应用稳定性 | 最新包可启动且无崩溃 | Debug APK | 冷启动成功，目标 PID 存在，Crash Buffer 为空 | complete | — |

## Verification

- `ExternalLinkLauncherTest`：Pixel 9 AVD 5/5 通过。
- `MediaPreviewClipboardTest`：复制、禁止运行、Markdown 链接共 3/3 通过。
- `ArtifactMarkdownClipboardTest`：代码复制与 Markdown 链接共 2/2 通过。
- 与 `ArtifactShareLauncherTest` 合并运行：12/12 通过，耗时 14.661 秒。
- `:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleDebugAndroidTest` 全部通过。
- 最新 Debug APK 已重新安装到 `emulator-5554`，冷启动成功，Crash Buffer 为空。

## Progress Summary

当前未提交工作区中的可见外部链接已覆盖 Web 的点击能力，并增加 Android 特有的安全 scheme 边界与无处理器恢复，不再出现文件 Markdown 假链接或静默失败。正式真机兼容性和总目标其他外部门槛仍在总覆盖审计中单列。
