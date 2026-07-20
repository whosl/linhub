# 网络重连自动恢复审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD，`emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

Web TanStack Query 在 `networkMode != always` 时默认 `refetchOnReconnect=true`，并在 `onlineManager` 恢复时通知活动查询。Android 原有网络观察器只更新 `isOffline`、取消附件上传并显示 Snackbar，没有重新执行当前页面失败或过期的读取，形成明确恢复语义差异。

## 实现

- `networkReconnectAction` 将 offline→online 分为 `RefreshNow`、`RefreshOnForeground` 和 `None`。
- 初始网络状态、重复在线事件、无活动会话不会刷新。
- 前台重连通过 `forceNetworkRefresh` 复用统一 `ForegroundRefreshDecision`，无视 5 秒会话阈值和 30 秒当前页面阈值。
- 后台重连只设置一次 `pendingNetworkRefresh`；首个 `ON_START` 消费并清零，后台阶段不发 HTTP。
- 当前会话恢复、支付返回、计费去重、聊天配置热刷新和各工作区当前标签继续走同一 `performRefresh`，没有复制第二套分发逻辑。
- 登出与 401 会话失效会清理待刷新状态，防止下一账号继承。

## 策略测试

- 前台有效会话重连 → `RefreshNow`。
- 后台有效会话重连 → `RefreshOnForeground`。
- 初始状态、无会话、非离线转在线 → `None`。
- `forceNetworkRefresh=true` 在后台时长 0ms 时仍刷新工作区和当前功能域。
- 既有支付一次性消费、5 秒/30 秒边界和模型失效回退测试继续通过。

## Pixel 9 AVD E2E

| 场景 | 后台阶段 | 返回/恢复后的请求 | 结果 |
| --- | --- | --- | --- |
| App 保持聊天首页前台，飞行模式开→关 | 不适用 | 模型、会话、风格、用户、知识库各 1 个 GET | 全部 200，约 1.5–2.1 秒；页面不重建 |
| 飞行模式开启后切到 Launcher，后台关闭飞行模式 | 等待 7 秒 HTTP=0 | 首次打开 App 后同五项各 1 个 GET | 全部 200，约 1.3–1.6 秒；只消费一次 |

两条路径的 Crash Buffer 均为空，设备最终飞行模式为 disabled，App 恢复前台。测试只读现有数据，没有上传、发送消息或产生计费。

## 区域网络判定

曾尝试要求 `NET_CAPABILITY_VALIDATED` 后再认定在线。设备实际可以稳定访问业务域名，Android 的 HTTP connectivitycheck 返回 204，但 HTTPS Google 探测在当前中国网络持续超时，系统将网络标记为 partial，导致 App 永久不接收在线状态。该方案依据设备证据撤回。

最终继续使用默认网络的 `NET_CAPABILITY_INTERNET`，与 Web 的 `navigator.onLine` 语义接近；真正恢复成功以业务 API 返回 200 为证据，而不是以 Google 探测为证据。

## 构建

最终 `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleBenchmark`、`:benchmark:assembleBenchmark` 同一命令通过，最新 Debug APK 已安装到 `emulator-5554`。
