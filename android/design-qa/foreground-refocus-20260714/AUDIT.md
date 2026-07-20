# 前台恢复与当前页面重新验证审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD，`emulator-5554`  
后端：`https://xiaolin.wenzhuolin.xyz/`

## Findings

当前 Web `DataService` 与全部 API Routes 均能在 Android `LinHubApi` 中找到对应能力。业务流反查发现一处恢复语义缺口：Web QueryClient 配置 30 秒 `staleTime`，窗口重新聚焦时会重新验证过期的挂载查询；Android 旧实现的 `onAppForegrounded()` 只刷新会话和当前计费标签，其余已加载页面会无限复用内存快照。

## 修复策略

- 5 秒：保留既有会话索引、当前会话和计费当前标签刷新。
- 30 秒：在不清空现有 UI 的前提下，后台刷新当前可见目的地。
- 项目：刷新项目索引及当前会话中已经打开过的项目对话。
- 知识库：单一加载周期并发刷新知识库索引与当前知识库文档，更新 Room 后继续处理中文档轮询。
- 文件：按当前媒体分类与搜索条件强制重新验证，取消旧请求并保持旧列表直到新结果成功。
- 技能、设置、管理后台：只刷新当前真实页面或标签；Settings Account 与 Billing 复用自身用户请求，其他页面静默刷新当前用户，避免重复 GET。
- 支付返回：继续优先执行无阈值的完整计费快照，不与普通计费标签刷新叠加。

## 自动化证据

`ExternalPaymentReturnPolicyTest` 新增 30 秒边界测试，并保留既有恢复测试：

- 4,999ms：不刷新普通工作区。
- 5,000ms：刷新会话工作区，不刷新当前重页面。
- 29,999ms：不刷新当前可见目的地。
- 30,000ms：刷新当前可见目的地。
- 支付返回 100ms：只执行一次完整计费刷新，不受普通阈值影响。

完整构建结果：

- `:app:testDebugUnitTest`：通过
- `:app:lintDebug`：通过
- `:app:assembleDebug`：通过
- `:app:assembleBenchmark`：通过
- `:benchmark:assembleBenchmark`：通过

## Pixel 9 AVD A/B

先进入真实文件页并等待首轮加载完成，再清空 Logcat：

| 后台时长 | 返回后的 OkHttp 请求 | 结果 |
| --- | --- | --- |
| 31 秒 | `GET /api/me`、`GET /api/conversations`、`GET /api/media?limit=60` | 三项 200；约 2.47 秒并发完成；文件页旧列表持续可见 |
| 6 秒 | `GET /api/conversations` | 200；没有用户或媒体额外请求 |

两轮前台 Activity 均为 `com.linhub.android.debug/com.linhub.android.MainActivity`，崩溃缓冲为空。测试只读现有数据，没有上传、删除、创建会话或产生计费。

## 结论与边界

当前原生恢复行为已经具备与 Web 30 秒窗口聚焦重新验证等价、且更细粒度的当前页面刷新；短后台仍保持更少网络请求。该证据覆盖 Pixel 9 AVD 与真实后端，固定真机的网络切换和厂商后台限制仍属于最终兼容性门槛。
