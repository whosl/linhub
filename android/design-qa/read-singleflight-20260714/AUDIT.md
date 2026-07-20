# 工作区读取 single-flight 与 loading 引用计数审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`

## Finding

计费、设置、后台和媒体分页已在创建协程前同步登记具体 loading resource 或 owner job；项目、知识库、技能和 Artifact 仍先检查 UI 状态，再创建协程，进入协程后才发布 loading。相同资源在这段窗口内可启动两次网络/缓存读取。知识库索引与文档又共用一个布尔式目标页 loading，任一请求先完成就会把另一个仍在运行的 loading 提前清除。

这既会浪费请求与解析成本，也会让慢链路上的页面反馈闪烁，不符合原生加载快于 Web 的目标。

## 修复

- 新增线程安全 `KeyedSingleFlightGate`：相同资源键只有一个 owner，不同键仍可并行。
- 覆盖项目索引、知识库索引、逐知识库文档、技能列表、逐技能详情和逐会话 Artifact；前台后台刷新共享相同索引键。
- 所有权均在创建协程前同步取得，在缓存命中、网络成功、失败和取消后的 `finally` 释放。
- 新增 `ReferenceCountedLoadingTracker`；知识库等页面有多个并行子资源时，只有最后一个完成才从 `loadingDestinations` 移除。
- 用户保存 gate 活跃时不启动同域索引刷新，避免保存响应与旧读取结果互相覆盖。

计费、设置、后台和文件媒体保留已有更细粒度的 resource set / owner job 方案，没有重复套用新 gate。

## 验证

| 验证项 | 结果 |
| --- | --- |
| 相同/不同资源键 | 同键重入拒绝，不同键可同时取得所有权，释放后可重试 |
| 32 路同键并发 | 只有 1 个 owner |
| loading 引用计数 | 两个子资源启动后计数 2；第一个完成仍 loading；最后一个完成才清除；多余 finish 不产生负数 |
| Android 完整六任务 | 单测、Lint、Debug/AndroidTest、R8 Benchmark App/测试 APK 全部通过 |
| R8 22-surface smoke | 1/1 通过，27.238 秒；清空日志后的测试时段 0 OkHttp、0 FATAL、空 Crash Buffer |
| 真实 Debug 冷启动 | 757ms；`me/models/conversations/projects/styles` 五类 GET 各 1 次，Crash Buffer 为空 |

真实登录态对项目、技能、知识库菜单执行快速双击时命中新鲜缓存，未发 GET；该轮只能证明导航与缓存没有退化，不把它冒充为慢网络 single-flight 运行证据。慢链路重复抑制由并发 gate 单测与调用点同步所有权共同证明。

本轮全部运行操作为读取，没有创建、编辑或删除生产数据。
