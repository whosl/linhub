# 文件首屏图片后台预取审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

1. 全局 Coil `ImageLoader` 已正确实现同源 Bearer 注入与磁盘缓存；外部 URL 不附加令牌。原性能文档却把媒体 Room payload 预取等同于图片预取，源码没有任何 `ImageLoader.enqueue`，声明缺少实现证据。
2. 当前实现只在核心工作区刷新完成且在线时预取前 6 个唯一图片 URL，使用 512px / INEXACT 请求。导航到文件页不会取消进行中的请求；退出登录、离线或核心刷新会取消。
3. `BENCHMARK_ENABLED` 在预取组件内部硬禁用。最终 R8 22-surface smoke 在单独停止 Debug 包、清空日志后通过，期间无 OkHttp 或崩溃。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 鉴权图片加载 | 仅同源图片附加当前 Bearer | `LinHubApplication.kt`、`hasSameOrigin` | 既有 Origin 策略测试与真实媒体 E2E | complete | — |
| 首屏图片预取 | 文件页首次组合前启动前 6 张图片请求 | `MediaThumbnailPrefetch.kt`、`LinHubApp.kt` | 清 `image_cache` A/B：聊天页 0→13 个文件 | complete | 慢链路下 15 秒时体积仍增长，不宣称全部下载完成 |
| 缓存复用 | 导航文件页不创建另一批缓存键 | 相同解析 URL 与全局 ImageLoader | 新版进入文件页前后均为 13 个缓存文件 | complete | — |
| 请求选择 | 只取图片、去重、限制 6 项、正确解析 URL | `mediaThumbnailPrefetchUrls` | JVM 策略测试通过 | complete | — |
| 基准隔离 | 本地 fixture 不发起预取网络 | `BuildConfig.BENCHMARK_ENABLED` 门控 | R8 22-surface smoke 1/1，0 OkHttp / 0 crash | complete | — |

## A/B Evidence

| 版本与阶段 | 等待 | 缓存文件 | 大小 |
| --- | ---: | ---: | ---: |
| 旧实现聊天首页 | 8 秒 | 0 | 0 |
| 旧实现进入文件页后 | 6 秒 | 13 | 1,828 KiB |
| 最终实现聊天首页 | 15 秒 | 13 | 3,924 KiB |
| 最终实现进入文件页后 | 5 秒 | 13 | 5,660 KiB |

测试只删除 `com.linhub.android.debug/cache/image_cache`，没有清账号、Room、其他缓存或服务端数据。缓存大小增长说明请求仍在完成，文件数稳定只证明请求时机前移和缓存键复用。

## Verification

- `MediaThumbnailPrefetchTest`：选择、去重、上限与 URL 解析通过。
- `:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleDebugAndroidTest`、`:app:assembleBenchmark`、`:benchmark:assembleBenchmark` 全部通过。
- `WorkspaceSurfaceSmokeTest`：Pixel 9 AVD 1/1 通过，37.989 秒；目标期间无 OkHttp、FATAL 或 Crash Buffer。
- 最新 Debug APK 已恢复到前台，目标 PID 存在，Crash Buffer 为空。

## Progress Summary

当前未提交工作区中的文件首屏图片请求已从页面首次组合后前移到核心工作区完成后的后台阶段，并保留鉴权、缓存复用、生命周期取消和基准隔离。该证据证明请求时序改善，不替代固定真机上的可见缩略图时延与 Web/PWA 对照。
